# syntax=docker/dockerfile:1

# One Dockerfile, three targets. The Node services share every layer up to the
# build, so the api and worker images differ only in their final command - which
# is the honest representation: they are one codebase deployed twice.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Manifests first, so a source-only change does not reinstall dependencies.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @marketplace/core --filter @marketplace/db \
         --filter @marketplace/api --filter @marketplace/worker build

# Production dependency tree only: reinstalled rather than pruned, because pnpm
# has no prune and copying the dev tree would roughly double the image.
FROM base AS runtime-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS node-runtime
ENV NODE_ENV=production
COPY --from=runtime-deps /app /app
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/db/dist packages/db/dist
# Migrations ship with the image so the migrate job and the app can never
# disagree about which schema version they belong to.
COPY --from=build /app/packages/db/drizzle packages/db/drizzle
USER node

FROM node-runtime AS api
COPY --from=build /app/apps/api/dist apps/api/dist
EXPOSE 3000
# Exec form so the process gets PID 1 and receives SIGTERM directly, which is
# what makes the graceful shutdown in main.ts actually run on a rollout.
CMD ["node", "apps/api/dist/main.js"]

FROM node-runtime AS worker
COPY --from=build /app/apps/worker/dist apps/worker/dist
EXPOSE 3001
# Long-lived loop by default. The Kubernetes CronJob overrides this with
# `--once`; both call the same closeDueCampaigns.
CMD ["node", "apps/worker/dist/main.js"]

# The frontend is static files, so it needs a web server rather than Node.
FROM base AS web-build
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @marketplace/core --filter @marketplace/db --filter @marketplace/api build \
 && pnpm --filter @marketplace/web build

FROM nginx:1.29-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
