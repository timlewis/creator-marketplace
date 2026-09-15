# Deploying

**Live demo:** https://creator-marketplace-b7e.pages.dev

Two targets are configured. They deliberately differ, and the difference is the
point: the same code runs under both, because nothing about correctness depends
on how the closing job is scheduled.

|             | Kubernetes (`helm/`)             | Hosted demo (`fly/` + Pages)                 |
| ----------- | -------------------------------- | -------------------------------------------- |
| API         | Deployment, 2 replicas           | Fly app, 1 machine kept warm                 |
| Closing job | CronJob, `--once`, `Forbid`      | long-lived loop                              |
| Migrations  | Helm `pre-upgrade` hook          | Fly `release_command`                        |
| Frontend    | nginx Deployment, proxies `/api` | Cloudflare Pages, calls the API cross-origin |

---

## Hosted demo

### 1. A database

Any Postgres reachable from Fly. Neon's free tier is enough; so is Fly's own
managed Postgres if you would rather stay on one account.

```bash
# Option A - Fly managed Postgres, one account, one login
fly postgres create --name creator-marketplace-db --region ams

# Option B - Neon, then copy the pooled connection string
#   https://console.neon.tech  ->  new project  ->  connection string
```

### 2. API and worker

```bash
fly auth login

fly apps create creator-marketplace-api
fly apps create creator-marketplace-worker

# Both processes talk to the same database.
# `postgres attach` creates a user per app and sets DATABASE_URL on each.
# Pass the same --database-name so both point at one database.
fly postgres attach creator-marketplace-db --app creator-marketplace-api \
  --database-name creator_marketplace --database-user marketplace_api
fly postgres attach creator-marketplace-db --app creator-marketplace-worker \
  --database-name creator_marketplace --database-user marketplace_worker

# The API must accept the frontend's origin, since Pages serves it from a
# different host than Fly serves the API.
fly secrets set CORS_ORIGIN='https://creator-marketplace.pages.dev' -a creator-marketplace-api

fly deploy --config deploy/fly/api.toml      # runs migrations as its release command
fly deploy --config deploy/fly/worker.toml
```

Seed the demo data once the schema is in place:

```bash
fly ssh console -a creator-marketplace-api -C 'node packages/db/dist/seed.js'
```

### 3. Frontend

The API lives on another origin here, so the base URL is baked in at build time.

```bash
VITE_API_BASE_URL='https://creator-marketplace-api.fly.dev' \
  pnpm --filter @marketplace/web build

wrangler pages deploy apps/web/dist --project-name creator-marketplace
```

### Checks

```bash
curl https://creator-marketplace-api.fly.dev/readyz     # {"status":"ready"}
curl https://creator-marketplace-worker.fly.dev/metrics # marketplace_campaigns_overdue 0
```

`marketplace_campaigns_overdue` is the one to watch. Anything above zero for
more than a couple of minutes means the closing job is not running.

### Two things about this deployment that would be wrong in production

**`fly postgres attach` creates superusers.** The two roles above look like
least privilege and are not: both come out with `rolsuper = true`, so the
separation is cosmetic. A real install would create the roles by hand, grant
the worker only `SELECT, INSERT, UPDATE` on the relevant tables, and set
`ALTER DEFAULT PRIVILEGES` so later migrations stay covered.

**`ENABLE_DEV_ROUTES` is on.** The demo needs the deadline control. Nothing
else should have it.

### The worker runs two machines, and that is the interesting part

Fly creates a second machine for availability by default, so this deployment
runs **two independent closing loops against one database**, every ten seconds.
That is unusual for a scheduled job and it is left in place deliberately,
because it exercises the concurrency guards continuously rather than only under
test. After the first four auctions closed:

```
duplicate closures:                  0
closed campaigns with pending bids:  0
any award over budget:               0
overdue and still open:              0
```

Scale it to one with `fly scale count 1 -a creator-marketplace-worker` if you
would rather not pay for the demonstration.

### Re-seeding

Deadlines are relative to seed time, so the demo campaigns go stale once they
have all closed. Re-seed to reset the clock:

```bash
fly ssh console -a creator-marketplace-api -C 'node packages/db/dist/seed.js'
```

---

## Kubernetes

```bash
kubectl create secret generic marketplace-db \
  --from-literal=DATABASE_URL='postgresql://...'

helm upgrade --install marketplace deploy/helm/creator-marketplace \
  --set image.repository=your-org/creator-marketplace \
  --set image.tag=1.0.0 \
  --set database.existingSecret=marketplace-db \
  --set ingress.enabled=true \
  --set ingress.host=marketplace.example.com
```

The chart expects three images tagged `api-<version>`, `worker-<version>` and
`web-<version>`, all built from the root `Dockerfile`:

```bash
for target in api worker web; do
  docker build --target "$target" -t "your-org/creator-marketplace:$target-1.0.0" .
  docker push "your-org/creator-marketplace:$target-1.0.0"
done
```

`api.enableDevRoutes` defaults to false and should stay that way: those routes
pull campaign deadlines forward. The chart prints a warning if it is on.
