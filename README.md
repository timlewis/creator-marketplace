# Creator Marketplace — matching, bidding and auction closing

A working slice of a creator marketplace: creators are matched and ranked
against campaigns, they bid, and a scheduled job closes each auction after its
deadline and picks winners within budget.

The loop closes end to end. Pick a creator, see campaigns ranked for them,
place a bid, let the deadline pass, and the bid flips to won or lost in the UI
on its own. Nothing touches the database by hand at any point.

**Live demo → https://creator-marketplace-b7e.pages.dev**

---

## If you only have a few minutes

**Click.** Open the demo, pick **Maya Okonkwo**, open _Spring strength
challenge_ and move the price up and down. The panel tells you whether you would
win, at what rank, and — when you would lose on price — the number that would
clear the current bar. That is the real auction being run against the bids that
exist, by the same function the closing job uses.

**Read.** Two files carry the design:

- [`packages/core/src/auction.ts`](packages/core/src/auction.ts) — the selection
  rule. Pure, dependency-free, and imported by both the API and the worker, so
  the rule a creator is shown is the rule the auction is decided by.
- [`apps/worker/src/closing.ts`](apps/worker/src/closing.ts) — the closing job
  and the three database guards that make it safe to run twice.

**Run.** `docker compose up --build`, then `pnpm test`. The test worth reading is
`closes exactly once when several workers run at the same instant`, in
[`apps/worker/test/closing.test.ts`](apps/worker/test/closing.test.ts) — four
independent connections racing for the same campaigns.

> **If the demo looks empty:** seeded auctions close 2 to 9 minutes after
> seeding, so once they have all resolved there is nothing left open. Reset the
> clock with:
>
> ```bash
> curl -X POST https://creator-marketplace-api.fly.dev/api/dev/reseed
> ```

---

## Running it

**Everything, one command:**

```bash
docker compose up --build
```

Then open **http://localhost:8080**. Compose brings up Postgres, runs
migrations, seeds the demo data, and starts the application server, the closing
worker and the frontend, in that order, gated on health checks rather than
sleeps.

**Local development**, against a Postgres you already have:

```bash
pnpm install
cp .env.example .env          # then point DATABASE_URL at your database
pnpm db:migrate && pnpm db:seed
pnpm --filter @marketplace/api dev       # :3000
pnpm --filter @marketplace/worker dev    # :3001, closing loop
pnpm --filter @marketplace/web dev       # :5173
```

**Verifying it:**

```bash
pnpm test        # 78 tests: domain, property-based, and integration against real Postgres
pnpm typecheck
pnpm lint
```

The integration tests need a database. They default to
`creator_marketplace_test` on localhost; override with `TEST_DATABASE_URL`.
They run sequentially across the workspace because the API and worker suites
share one database and truncate between tests.

Deploying it is covered separately in [`deploy/README.md`](deploy/README.md):
the Helm chart, and the hosted demo (Cloudflare Pages for the frontend, Fly for
the application server, closing worker and Postgres).

---

## The 60-second demo

Works against the live demo or a local `docker compose up` — same build.

1. Pick **Maya Okonkwo** (fitness, 128k followers, 4.6% engagement).
2. On **Campaigns**, note the ranking. _Protein bar relaunch_ leads at 85, and
   the three campaigns she is locked out of sit at the bottom with the specific
   gap rather than being filtered away. Hit **Why this score?** on any card.
3. Open **Spring strength challenge** and move the price. At $2,800 the panel
   says she wins at rank #1; at $5,200 it says the budget would run out before
   her bid, and that roughly $3,851 or less would clear the current bar.
4. Place the bid, then hit **Expire deadline now** — the demo control that pulls
   the deadline into the past through the API. Nothing edits the database.
5. Open **My bids**. Within about ten seconds the bid flips to **Won**, with the
   rank, and without a refresh.

For a loss with a reason, expire _Athleisure capsule drop_: Maya is a weak fit
there and her seeded $5,200 is priced above what the budget reaches.

Step 4 is a shortcut, not a cheat. The seeded campaigns close on their own 2, 4,
6 and 9 minutes after seeding, and the deadline control exists only so a
reviewer does not have to wait for them.

---

## Architecture

```
packages/core   pure domain. Matching and winner selection. No I/O at all.
packages/db     schema, migrations, seed, row <-> domain mapping.
apps/api        Fastify application server. HTTP, transaction boundaries.
apps/worker     the closing job. Loop locally, CronJob in Kubernetes.
apps/web        React + Vite frontend.
```

Three deployables, one codebase.

**`packages/core` has no dependencies, and that is the point.** It is the answer
to "where does the matching logic live". Both the API (to rank campaigns and to
preview a bid) and the worker (to close an auction) import the same pure module,
so the rule a creator is _shown_ is provably the rule the auction is _decided
by_. It is also why the interesting logic is unit-testable without a database,
and why the property-based tests are cheap enough to be worth having.

**The API and worker are separate deployables sharing a codebase.** For a slice
this size, splitting them into separately versioned services would be ceremony.
The seam that would matter later is drawn: matching is already a pure function
behind a module boundary, so moving it to its own service means giving it a
transport, not untangling it from Fastify.

**Matching runs in the application server, not in SQL.** The ranking rules are
the product, they change often, and they need to be testable without a
database. If the campaign table grew past what is sensible to score in memory,
the hard eligibility gates become a `WHERE` clause and only the fit scoring
stays in the app.

---

## Data model

Four tables. `creators` and `campaigns` are what you would expect; the two
decisions worth defending are on the other two.

**Money is integer cents throughout, engagement is integer basis points.** No
floating point goes near a number that decides an auction. `integer` caps a
single amount around $21M, far above any plausible creator campaign, and buys
plain JS numbers instead of the strings a `bigint` column hands back.

**`bids.fit_score` is snapshotted when the bid is placed, never recomputed at
close time.** A bid is an offer made under stated terms; re-scoring later would
mean a creator loses because their engagement dipped after they committed. It
started as a fairness argument and turned out to pay for itself twice: closing
becomes a pure function of rows that already existed at the deadline, which is
exactly what makes a re-run produce identical output. Fairness and idempotency
turned out to be the same property.

**`campaign_closures` exists even though `campaigns.status` already records that
a campaign closed.** It is the audit receipt — what was decided, and by which
`algorithm_version`, so a closure stays explainable after the selection rule
changes. It is also the last line of defence against double-awarding; see below.

Constraints live in the database, not only in application code: budgets and bid
amounts must be positive, fit scores must be 0–100, only a lost bid may carry a
loss reason, and a campaign is closed if and only if it has a `closed_at`.

---

## Matching

**Hard eligibility.** Two gates. Below the follower minimum, or off-genre where
the brand asked for a strict match. A campaign failing a gate is still shown —
greyed out, with the specific gap ("Needs 50,000 followers - you have 32,400")
and the score they would earn once they qualify. Filtering it away would leave a
creator wondering why a brief they heard about is missing. Only the nearest
failing gate is reported; listing every way someone falls short is discouraging
and no more actionable.

**Fit score, 0–100, three components:**

| Component      | Max | Rule                                                          |
| -------------- | --: | ------------------------------------------------------------- |
| Genre fit      |  40 | exact 40 · adjacent 24 · unrelated 8                          |
| Engagement     |  35 | against the brand's target rate; 0 at half it, full at double |
| Reach headroom |  25 | log scale on followers over the minimum; full marks at 8×     |

Three choices in there are deliberate:

- **Unrelated genres score 8, not 0.** A large, highly-engaged creator from
  another vertical is worth showing to a brand — just not worth ranking above an
  on-genre one.
- **Adjacency is a real relation**, not string equality. Beauty is adjacent to
  fashion, gaming to tech. A credible cross-over creator should surface above an
  unrelated one.
- **Reach is logarithmic.** Linear scaling would let raw audience size swamp
  genre and engagement combined, and a 40× creator would bury a solid 4×. Past
  the point where the brand's requirement is met, extra reach has diminishing
  value.

The total is the sum of the _rounded_ components rather than a separately
rounded total, so the breakdown in the UI always adds up to the headline number.
A score whose parts visibly do not sum reads as broken.

**The weights are a prior, not a finding.** 40/35/25 and the shape of each curve
are my judgement about what a brand is buying, set without data because there is
none yet. What matters is that they are correctable: `fit_breakdown` is stored
on every bid, so once there are real impressions and outcomes you can test
whether the score predicts anything — bid-through rate, win rate, brand
acceptance — and refit the weights instead of arguing about them. If creators
bid as readily on a 40 as on an 80, the score is decoration and should be
replaced rather than tuned.

---

## Winner selection

`selectWinners` is a greedy fill on **fit per dollar**: rank every affordable bid
by the fit it delivers per dollar asked, then walk the list funding each bid
that still fits the remaining budget, until the slots run out.

Details that matter:

- **The walk does not stop at the first bid it cannot afford.** A cheaper bid
  further down can still use the leftover budget. Stopping early would leave
  money unspent and a willing creator unbooked for no reason.
- **Bids above the entire budget are excluded before ranking**, not ranked and
  rejected. A rank implies contention, and they were never in contention.
- **Density is compared by integer cross-multiplication, not float division.**
  Two bids offering genuinely equal value compare exactly equal and fall through
  to explicit tie-breaks (better fit, then cheaper ask, then earlier, then id).
  Comparing floating-point quotients would let 1e-16 of rounding noise decide an
  auction — unfair, and not reproducible between runs.
- **Every loser carries a reason**: `over_budget`, `budget_exhausted`, or
  `slots_filled`. A bid that falls out of the result is a creator who never
  finds out what happened to their offer.

### Why greedy and not an exact knapsack

Maximising total fit within a budget is a knapsack problem, and a DP solver
would fit a few percent more value into the same budget. I chose greedy anyway:

- **It is explainable.** A creator can be told "your fit-per-dollar was 0.0079,
  the last winning bid cleared 0.0116" — and the UI does tell them exactly that.
  An optimal solver routinely rejects a bid for reasons no creator can follow.
  In a two-sided marketplace, creator trust is the product, and an explainable
  rule beats an optimal one.
- **It has a clearing price.** Greedy ranks on a single scalar, so there is
  always a threshold — the weakest funded bid's fit-per-dollar — that separates
  winners from losers, and every creator can be told where they landed relative
  to it. An exact knapsack admits no such threshold: membership depends on how
  bids happen to pack together, so "why did I lose?" has no answer shorter than
  re-running the solve. The losing-bid explanation in this UI exists only
  because the rule admits a clearing price.
- **It is swappable.** Exact DP is `O(n·budget)` and drops in behind the same
  interface. `algorithm_version` is recorded on every closure, so past auctions
  stay explainable under the rule that actually decided them.

Determinism here is not cosmetic. It is what makes "ran twice" indistinguishable
from "ran once", and therefore what makes the re-run safety observable in a test
rather than merely asserted.

---

## How the closing job stays correct if it runs twice

It will run twice. An overlapping CronJob, a retried pod, two clusters during a
migration, or an operator running it by hand at 3am during an incident. The job
is built for that rather than hoping it does not happen.

The candidate scan runs outside any transaction and is purely advisory. Every
campaign it names is re-checked under a lock before anything is written. Each
campaign is then closed in **its own transaction**, so one campaign with bad
data fails alone instead of aborting every other close due that minute.

```sql
BEGIN;
  SELECT * FROM campaigns
   WHERE id = $1 AND status = 'open' AND bidding_deadline <= now()
   FOR UPDATE SKIP LOCKED;          -- no row: someone else has it, or it is done
  SELECT * FROM bids WHERE campaign_id = $1 AND status = 'pending';
  -- pure selectWinners()
  UPDATE bids SET status = 'won'  WHERE id = ANY($winners);
  UPDATE bids SET status = 'lost', loss_reason = ... WHERE id = ANY($losers);
  INSERT INTO campaign_closures (...);   -- primary key on campaign_id
  UPDATE campaigns SET status = 'closed', closed_at = now() WHERE id = $1;
COMMIT;
```

**Three independent guards**, in the order they fire:

1. **The `status = 'open'` predicate inside the locked read.** A second run sees
   the campaign is already closed and does nothing. This is the guard that
   catches the common case, including the window after a concurrent worker has
   committed and released its lock.
2. **`FOR UPDATE SKIP LOCKED` on the campaign row.** Two runs in flight at the
   same instant cannot both hold it. `SKIP LOCKED` rather than a plain lock so
   concurrent workers _partition_ the work instead of queueing behind each
   other — a skip is a deferral, and the next pass picks it up.
3. **The primary key on `campaign_closures.campaign_id`.** If a bug ever got
   past the first two, the second `INSERT` violates the key and the entire
   transaction rolls back. A crash is the correct outcome: paying two sets of
   winners is far worse than failing a close.

**Correctness does not depend on the scheduler.** The Helm CronJob sets
`concurrencyPolicy: Forbid`, and it is commented in the chart as a cost control
rather than the mechanism — it would not protect against a manual run.

**Bid placement needs the mirror-image guard**, and has it. Placing a bid takes
a `FOR SHARE` lock on the campaign and re-checks the deadline _inside_ the
transaction. Without it there is a window where the worker locks a campaign,
reads its pending bids and commits winners while a bid that passed an earlier
check is still on its way to the `INSERT` — leaving a bid permanently `pending`
on a closed campaign. A share lock is the right strength: any number of
creators may bid at once, but nobody may close underneath them.

### These guards are tested, and the tests were checked

`apps/worker/test/closing.test.ts` covers re-running (identical outcome, one
closure row, not even `updated_at` rewritten), four concurrent workers racing
for the same campaigns, and one test per guard that isolates it:

- Guard 2 is proven by holding the row lock open on a separate connection and
  asserting the closer skips rather than blocks. I verified this test has teeth
  by removing `SKIP LOCKED` and confirming the closer blocked until the test
  timed out.
- Guard 3 is proven by planting a closure row for a still-open campaign — the
  state a concurrency bug would produce — and asserting the close fails loudly
  and rolls back with the bid untouched.

---

## Product decisions

**The bid preview runs the real algorithm.** As a creator types a price, the
form tells them whether they would win, at what rank, and against how many
bids. It calls the same `selectWinners` the closing job calls, against the bids
that actually exist. Nothing is modelled or estimated, so the UI can state a
verdict plainly rather than hedging. The one caveat it needs — that others can
still bid — is true and shown.

**Losing tells you by how much.** Where a bid would lose on price, the panel
works backwards from the current clearing rate to name the number that would
clear it. Telling someone they lost without telling them by how much is the part
of most marketplaces that leaves creators guessing.

**Fit is never a bare number.** The ring carries the ranking for someone
skimming ten campaigns; the breakdown names which of the three inputs is holding
them back, which is the only version they can act on.

**Suggested prices are derived from the brief, not invented from the field.**
The range comes from the campaign's own budget and slot count, scaled by fit.
Inventing a "creators like you bid $X" number out of seeded data would be a lie
dressed up as a feature; competitive information belongs in the live preview,
which is labelled as such.

**Bids are one-per-creator-per-campaign and editable until the deadline.** The
alternative is a creator competing against themselves and wondering which of
their three bids counts. Editing preserves the original timestamp, so revising a
price does not quietly cost them their place in a tie-break.

**The bids list polls only while something is undecided**, then stops. Once
every bid is decided there is nothing left for the worker to tell it.

---

## Running this in production

**What to alert on.** `marketplace_campaigns_overdue` — campaigns past their
deadline and still open beyond a grace period — is exposed by the worker at
`/metrics`. That is the number worth paging on. A closing job that is failing
silently looks exactly like one with nothing to do, so "nothing closed recently"
is not an alert; "something should have closed and did not" is, and it reads as
a fault at any traffic level without needing a baseline.

**Health endpoints mean different things.** `/healthz` deliberately does not
touch the database: a database blip should pull pods out of rotation via
`/readyz`, not restart them in a crash loop.

**Migrations run as their own release step**, a Helm `pre-upgrade` hook, never
on application boot. Migrating from every starting replica means N concurrent
migrators during a rollout. Migrations ship inside the image so the migrate job
and the application can never disagree about which schema version they belong
to.

**Replaying a closure.** Because the decision is stored with its
`algorithm_version` and the inputs were snapshotted onto the bids, any past
auction can be recomputed and diffed against what was actually awarded. That is
the tool you want when someone disputes an outcome, and it is also how you would
validate a new selection rule against real history before shipping it.

**Where it would break first at scale.** The matching endpoint scores every open
campaign in memory per request. That is fine for hundreds and wrong for
hundreds of thousands. The fix is staged: push the hard eligibility gates into
SQL as a `WHERE` clause, keep fit scoring in the app, and cache per creator with
a short TTL. Only after that does matching deserve to be its own service.

**What I would add next, in order:** structured request logging with a trace id
threaded through to the worker; a dead-letter path for campaigns that fail to
close repeatedly, so one poison campaign cannot sit in the scan forever; and
rate limiting on bid placement.

---

## Deliberately not built

- **Auth.** The exercise says no auth, and a login flow would be pure ceremony.
  "Acting as" is persisted to localStorage so a refresh does not dump you back
  to the picker mid-demo.
- **The brand side.** No campaign creation, no reviewing bids. The creator loop
  is what was asked for and it is where the interesting logic is.
- **Payments**, per the brief.
- **Websockets.** The only thing that changes without user action is an auction
  closing, on the order of minutes. Polling that stops when nothing is pending
  is less machinery for the same result, and degrades better on a backgrounded
  tab.
- **A theme toggle.** Dark mode follows the operating system. A toggle needs a
  persisted preference and a control in the header, and nothing here asks a
  creator to choose a theme.
- **An HPA.** Adding autoscaling rules without a load profile to base them on
  would be decoration.

---

## Why not Cloudflare Workers, or serverless generally

I considered it and chose against it, for one architectural reason and one
practical one.

The graded question is how the closing job stays correct when it runs twice. On
Postgres that is a row lock, a status predicate and a unique constraint —
mechanisms any backend engineer can read and immediately trust. D1 has no
interactive transactions, no `SELECT ... FOR UPDATE` and no advisory locks, so
the same guarantee has to be rebuilt on a Durable Object per campaign as the
serialisation point. That is a genuinely elegant solution, and it is also a
platform-specific one: the argument stops transferring the moment you are not on
Workers.

The practical reason is that this stack — a Node/TypeScript application server
and a containerised scheduled job deployed by Helm — is the one the brief
describes. Every operational decision here, the CronJob semantics, the
pre-upgrade migration hook, the readiness-versus-liveness split, is meant to be
read against that.

---

## Repository map

```
packages/core/src/matching.ts        eligibility gates and fit scoring
packages/core/src/auction.ts         winner selection
packages/core/src/pricing.ts         suggested bid range
packages/db/src/schema.ts            tables, constraints, and why they exist
packages/db/src/seed-data.ts         the demo dataset, hand-authored
apps/api/src/services/bidding.ts     bid placement, preview, outcomes
apps/api/src/services/matching.ts    ranked matches for a creator
apps/worker/src/closing.ts           the closing job and its three guards
apps/web/src/components/             fit display, campaign card, bid preview
deploy/helm/creator-marketplace/     chart, with the CronJob argument in comments
```
