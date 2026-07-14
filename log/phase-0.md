# Phase 0 — Scaffold + Infra

**Status:** Infra scaffold complete and verified running. Full Phase 0 checklist from the
master plan (`plan/00-master-plan.md`) is done for the pieces needed to run auth + frontend;
product/order/chat/review services exist only as health-check skeletons (their real MVC logic
comes in later phases, per user's explicit scope narrowing this session).

## What was built
- `git init` on `D:\ise` (repo did not exist before this session).
- npm workspaces monorepo: `shared/`, `gateway/`, `services/*`, `frontend/`.
- `shared/` package: JWT sign/verify helpers, `requireAuth`/`requireRole`/`fromGatewayHeaders`/
  `requireInternalToken` middleware, Redis pub/sub event-name constants, `AppError` +
  `errorHandler` for consistent error responses.
- `gateway/`: Express reverse proxy → 5 services by path prefix, verifies the JWT itself and
  forwards `x-user-id`/`x-user-role` headers downstream, WS upgrade passthrough for `/api/chat`.
- 5 services scaffolded with the same MVC folder layout
  (`routes/controllers/services/models/events/jobs`) and a `/health` endpoint each.
- `docker-compose.yml`: 1 Postgres container (init script creates 5 databases — one per service),
  1 Redis container, gateway, 5 services, frontend — 9 containers total.
- `frontend/`: Next.js 15 App Router + Tailwind, bare layout + home page placeholder.

## Decisions
- **Database-per-service on one Postgres instance** (not 5 separate containers) — per plan,
  balances isolation vs. resource use for local dev.
- **`env_file: .env` shared across all containers** — every service reads the one root `.env`;
  simplest way to keep `JWT_ACCESS_SECRET` etc. consistent across services without duplicating
  values in `docker-compose.yml`.

## Issues found + fixed
- **Missing `dotenv` dependency**: every service's `server.js` calls `require('dotenv').config()`
  but the package wasn't listed in any `package.json` (gateway + all 5 services). Would have
  crashed every container on boot. Fixed by adding `dotenv` as a dependency everywhere.
- **Frontend has no dev bind-mount**: the `frontend/Dockerfile` does `COPY frontend ./` at build
  time only, so host edits to frontend source never reached the running container — `next dev`'s
  hot reload was reloading a stale bundle from build time. Fixed by bind-mounting
  `./frontend:/app/frontend` in `docker-compose.yml` (with anonymous volumes over
  `node_modules`/`.next` so the container's own installs aren't clobbered by the host's,
  which is empty). Backend services were left as build-time-copy (rebuild-per-change) since
  their rebuild is fast (~10s) and they weren't being iterated on this session — worth
  revisiting if that changes.
- **Gateway healthcheck always failed (`unhealthy`)**: the blanket JWT-check middleware
  (`app.use((req,res,next)=>{...})`) was registered *before* the `/health` route, so it applied
  to `/health` too — Docker's unauthenticated `wget --spider` probe got a 401 every time.
  Confirmed via `docker compose ps` showing `unhealthy` even though the gateway was otherwise
  working (curl through it succeeded). Fixed by moving the `/health` route above the auth
  middleware so it's exempt regardless of the `PUBLIC_PATHS` regex list.

## Verification performed
- `docker compose up -d --build` → all 9 containers reached `healthy` (or running, for
  frontend/postgres/redis which don't need an app-level healthcheck).
- `curl http://localhost:8080/health` reachable through the gateway.

## Update — split `backend/` from `frontend/`

Moved `gateway/`, `services/`, `shared/` under a new `backend/` folder (previously all sat at
repo root next to `frontend/`, which didn't read as a clear frontend/backend split). Root
`package.json` workspaces, `docker-compose.yml` dockerfile paths, and every Dockerfile's `COPY`
source paths were updated to match. `infra/`, `plan/`, `database/`, `log/`, `docs/` stayed at
root — they're project-level, not backend application code.

### Issue found + fixed: `@reloop/shared` dependency was never really valid
Every service/gateway `package.json` declared `"@reloop/shared": "*"` — a bare semver range,
which npm resolves against the public registry. `@reloop/shared` was never published there, so
this should have 404'd on every build. It happened to succeed in the original Phase 0 build
(unclear why — possibly a Docker layer-cache artifact); rebuilding after the folder move
(which invalidated the `COPY` cache layer, forcing a fresh `npm install`) reproduced the 404
reliably for every backend service.

Fixed by declaring it as a local file dependency instead —
`"@reloop/shared": "file:../../shared"` (`file:../shared` for the gateway, one level up) — which
npm resolves without touching the registry.

That surfaced a second, related bug: after switching to `file:`, the containers built but
`auth-service` and `gateway` **crashed on start** with `Cannot find module 'jsonwebtoken'`
(thrown from `shared/src/jwt.js`). Reason: `npm install --prefix ./shared` (which installs
`shared`'s own dependency, `jsonwebtoken`, into `shared/node_modules`) had been dropped as
"redundant" when the `file:` fix went in — it looked redundant because linking `@reloop/shared`
itself now succeeded without it, but it was never redundant: Node resolves `require()`s inside
`shared/src/*.js` relative to `shared`'s own real path, so `jsonwebtoken` has to live in
`shared/node_modules` (or be hoisted to `/app/node_modules`, which wasn't happening either).
Restored `RUN npm install --prefix ./shared` in every Dockerfile (gateway + all 5 services),
run once at `/app` before switching `WORKDIR` into the service folder.

Verified with `docker compose build --no-cache` (not just a normal build, to rule out any more
cache-related false positives) followed by the same register/login/me/health curl sequence from
Phase 1 — all passed, and `docker compose ps` showed all 9 containers `healthy`.
