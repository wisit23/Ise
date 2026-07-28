# RE-LOOP

Second-hand fashion marketplace — a microservices monorepo.

Full plan: [`plan/00-master-plan.md`](./plan/00-master-plan.md) · Current DB tables:
[`database/schema.md`](./database/schema.md) · Schema decisions:
[`database/ER-changes.md`](./database/ER-changes.md) · Work log: [`log/`](./log/)

## Tech stack

- **Frontend:** Next.js 15 (App Router), JavaScript, Tailwind CSS
- **Backend:** Node.js / Express, JavaScript, MVC per service
- **Database:** PostgreSQL (one Postgres instance, one database per service) via Prisma
- **Inter-service:** REST + Redis (BullMQ for delayed jobs, pub/sub for events, Socket.IO for chat)
- **Infra:** Docker Compose

## Quick start

```bash
git clone https://github.com/wisit23/Ise.git
cd Ise
cp .env.example .env
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Gateway (API): http://localhost:8080
- Postgres: localhost:5432 (user/pass from `.env`)

Try it: open http://localhost:3000/register, create an account, you'll land on the home page
logged in.

Check everything is healthy:

```bash
docker compose ps
```

Frontend source is bind-mounted into its container, so edits hot-reload without a rebuild.
Backend services are **not** bind-mounted — after editing a service, rebuild just that one:

```bash
docker compose up -d --build auth-service
```

## Local dependency and quality baseline

Node version is pinned in `.nvmrc` / `package.json#engines` (`>=22.11.0 <23.0.0`, npm 10+),
matching the `node:22-alpine` base image used by every Dockerfile; `npm install` refuses to run
outside that range (`engine-strict=true` in `.npmrc`).

```bash
npm install        # installs all workspaces, writes package-lock.json
npm run lint        # ESLint across backend + frontend
npm run format:check # Prettier check (use `npm run format` to auto-fix)
```

`npm run lint` currently **exits 1** — it reports 7 pre-existing issues in application code
(unused catch-error bindings and unused imports) that predate this baseline — see `docs/progress.md` evidence
manifest for the tracked list; fixing them is separate feature/cleanup work, not part of the
tooling baseline itself.

Each service validates its own required environment variables at startup via
`requireEnv()` (`backend/shared/src/env.js`) and fails immediately with a clear error if one is
missing, instead of failing later with a confusing runtime error.

## Current status

| Service           | State                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| `gateway`         | ✅ routes to all 5 services, verifies JWT                                           |
| `auth-service`    | ✅ register / login / refresh / logout / me — KYC & seller onboarding not built yet |
| `product-service` | 🔲 skeleton only (`/health`)                                                        |
| `order-service`   | 🔲 skeleton only (`/health`)                                                        |
| `chat-service`    | 🔲 skeleton only (`/health`)                                                        |
| `review-service`  | 🔲 skeleton only (`/health`)                                                        |
| `frontend`        | ✅ home page, login, register — rest of the pages not built yet                     |

See `log/phase-*.md` for what was actually done in each phase, including bugs found and fixed.

## Project structure

```
ise/
├── plan/              master plan + phase notes
├── database/          Prisma schema copies + ER-changes.md (every DB decision, with reasons)
├── log/                one file per phase: what was built, decisions, bugs found & fixed
├── docker-compose.yml
├── .env.example        copy to .env before running
├── backend/
│   ├── gateway/            Express reverse proxy + JWT check (port 8080)
│   ├── services/
│   │   ├── auth-service/       port 3001, db: reloop_auth
│   │   ├── product-service/    port 3002, db: reloop_product
│   │   ├── order-service/      port 3003, db: reloop_order
│   │   ├── chat-service/       port 3004, db: reloop_chat
│   │   └── review-service/     port 3005, db: reloop_review
│   └── shared/              JWT helpers, auth middleware, error handling, event names
└── frontend/           Next.js app (port 3000)
```

Each service follows the same MVC layout: `src/routes → controllers → services → models`,
plus `events/` (Redis pub/sub) and `jobs/` (BullMQ) for services that need them.

`backend/shared` is a local package consumed via `file:` dependency (not published to npm) —
every backend service and the gateway depend on it for JWT signing/verification, auth
middleware, and standardized error handling.

## Auth API (implemented)

| Method | Path                 | Auth                | Notes                                            |
| ------ | -------------------- | ------------------- | ------------------------------------------------ |
| POST   | `/api/auth/register` | —                   | `{email, password, firstName, lastName, phone?}` |
| POST   | `/api/auth/login`    | —                   | `{email, password}`                              |
| POST   | `/api/auth/refresh`  | —                   | `{refreshToken}` → new access token              |
| POST   | `/api/auth/logout`   | —                   | `{refreshToken}` → revokes it                    |
| GET    | `/api/auth/me`       | Bearer access token | current user                                     |

## Database

Each service owns its own Postgres database — no service reads another's tables directly,
cross-service data flows through REST calls or Redis events. Schema is managed with Prisma;
`prisma db push` runs automatically on container start (no migration history yet — fine for
this stage, will move to `prisma migrate` once schemas stabilize).

Every table from the original ER diagram (`docs/erdatabase.png`) is created even before its
feature ships — see [`database/ER-changes.md`](./database/ER-changes.md) for the full mapping
and the reasoning behind every deviation from the ER.
