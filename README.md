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

Both commands pass on a clean checkout. If `format:check` reports every file on Windows, the
cause is `core.autocrlf=true` rewriting the checkout to CRLF; `.prettierrc` pins
`endOfLine: "auto"` so the check reads the same locally and in CI.

Frontend conventions — design tokens, the shared UI primitives in `frontend/components/ui/`,
the stacking order, and the accessibility rules every screen is expected to follow — are
documented in `docs/ui-conventions.md`.

Each service validates its own required environment variables at startup via
`requireEnv()` (`backend/shared/src/env.js`) and fails immediately with a clear error if one is
missing, instead of failing later with a confusing runtime error.

## Current status

| Service           | State                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gateway`         | ✅ routes to all 5 services, verifies JWT, allowlists public read paths                                                                                          |
| `auth-service`    | ✅ register / login / refresh / logout / `me` (get + patch) / public seller profile — KYC submission & multi-role not built yet                                  |
| `product-service` | ✅ CRUD listings, feed/search, categories/conditions, media upload, seller video clips (swipe feed) — reservation/lock hardening still pending                   |
| `order-service`   | ✅ create/pay/cancel order, buyer/seller order lists, mock checkout — real cart table, disputes, outbox not built yet                                            |
| `chat-service`    | 🔲 skeleton only (`/health`) — no routes, no Socket.IO, no schema                                                                                                |
| `review-service`  | ✅ one review per completed order, seller rating summary/list — moderation & seller replies not built yet                                                        |
| `frontend`        | ✅ home, login/register, product feed/detail, cart, orders, profile, sell, seller dashboard + video upload, seller storefront, swipe feed — Admin UI not started |

`product-service`, `order-service`, and `review-service` are implemented well beyond a health
check — see the API tables below for the current surface of each. `chat-service` is the only
backend service still unstarted. See `log/phase-*.md` for what was actually done in each phase,
including bugs found and fixed.

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

| Method | Path                         | Auth                | Notes                                            |
| ------ | ---------------------------- | ------------------- | ------------------------------------------------ |
| POST   | `/api/auth/register`         | —                   | `{email, password, firstName, lastName, phone?}` |
| POST   | `/api/auth/login`            | —                   | `{email, password}`                              |
| POST   | `/api/auth/refresh`          | —                   | `{refreshToken}` → new access token              |
| POST   | `/api/auth/logout`           | —                   | `{refreshToken}` → revokes it                    |
| GET    | `/api/auth/me`               | Bearer access token | current user                                     |
| PATCH  | `/api/auth/me`               | Bearer access token | update own profile                               |
| GET    | `/api/auth/users/:id/public` | — (public)          | public seller profile card                       |

Not built yet: KYC document submission/review, seller onboarding endpoint, `reports` submission,
multi-role-per-user.

## Product API (implemented)

| Method | Path                                | Auth                   | Notes                                                           |
| ------ | ----------------------------------- | ---------------------- | --------------------------------------------------------------- |
| GET    | `/api/products/feed`                | — (public)             | paginated available listings, optional `category`               |
| GET    | `/api/products/search`              | — (public)             | paginated search, `q` + optional `category`                     |
| GET    | `/api/products/videos/feed`         | — (public)             | swipe-style video feed                                          |
| POST   | `/api/products/videos`              | Bearer, owner          | attach a video clip to one of the seller's own products         |
| GET    | `/api/products/mine`                | Bearer                 | current seller's own listings, any status                       |
| GET    | `/api/products/by-seller/:id`       | — (public)             | one seller's available listings                                 |
| GET    | `/api/products/categories`          | — (public)             | known category names                                            |
| GET    | `/api/products/conditions`          | — (public)             | valid condition values + Thai labels                            |
| GET    | `/api/products/:id`                 | — (public)             | single listing                                                  |
| POST   | `/api/products`                     | Bearer, SELLER/ADMIN   | create listing                                                  |
| PATCH  | `/api/products/:id`                 | Bearer, owner          | edit own listing                                                |
| DELETE | `/api/products/:id`                 | Bearer, owner          | remove own listing                                              |
| PATCH  | `/api/products/:id/internal-status` | internal service token | called by `order-service` to flip `available`/`reserved`/`sold` |
| POST   | `/uploads`                          | Bearer, SELLER/ADMIN   | upload up to 8 media files (photos/video source)                |

Not built yet: explicit reservation-expiry job, listing moderation/reports.

## Order API (implemented)

| Method | Path                       | Auth                   | Notes                                                            |
| ------ | -------------------------- | ---------------------- | ---------------------------------------------------------------- |
| POST   | `/api/orders`              | Bearer                 | lock a listing (`pending`), rejects self-purchase                |
| GET    | `/api/orders/mine`         | Bearer                 | paginated orders as buyer, optional `status`                     |
| GET    | `/api/orders/selling`      | Bearer                 | paginated orders as seller, optional `status`                    |
| GET    | `/api/orders/:id`          | Bearer, buyer/seller   | single order                                                     |
| GET    | `/api/orders/:id/internal` | internal service token | called by `review-service` to check order eligibility for review |
| PATCH  | `/api/orders/:id/status`   | Bearer, buyer/seller   | `pending → completed \| cancelled`; releases/sells the product   |
| PATCH  | `/api/orders/:id/pay`      | Bearer, buyer          | mock checkout: `pending → completed`, marks product `sold`       |

No real cart table yet — a "cart" is `orders` rows with `status='pending'`. No real payment
provider, dispute flow, or transactional outbox.

## Review API (implemented)

| Method | Path                                       | Auth          | Notes                                                     |
| ------ | ------------------------------------------ | ------------- | --------------------------------------------------------- |
| POST   | `/api/reviews`                             | Bearer, buyer | one review per completed order (`orderId` must be unique) |
| GET    | `/api/reviews/by-seller/:sellerId`         | — (public)    | paginated reviews + `averageRating` for a seller          |
| GET    | `/api/reviews/by-seller/:sellerId/summary` | — (public)    | `{total, averageRating}` only                             |
| GET    | `/api/reviews/by-order/:orderId`           | Bearer        | the review for one order, if any                          |
| GET    | `/api/reviews/mine`                        | Bearer, buyer | paginated reviews the current buyer has written           |

Reviews rate the **seller**, not the product (one-off listings sell exactly once). No moderation,
reporting, or seller-reply feature yet.

## Chat service (not built)

`chat-service` only exposes `/health`. No routes, no Socket.IO server, no Prisma schema, and
`reloop_chat` has no tables. This is the one backend service still at the skeleton stage.

## Database

Each service owns its own Postgres database — no service reads another's tables directly,
cross-service data flows through REST calls or Redis events. Schema is managed with Prisma;
`prisma db push` runs automatically on container start (no migration history yet — fine for
this stage, will move to `prisma migrate` once schemas stabilize).

Every table from the original ER diagram (`docs/erdatabase.png`) is created even before its
feature ships — see [`database/ER-changes.md`](./database/ER-changes.md) for the full mapping
and the reasoning behind every deviation from the ER.
