# Deploying

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
fly secrets set DATABASE_URL='postgresql://...' -a creator-marketplace-api
fly secrets set DATABASE_URL='postgresql://...' -a creator-marketplace-worker

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
