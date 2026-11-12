# RE-LOOP

Second-hand fashion marketplace — a microservices monorepo.

Documentation: [database schema](database/schema.md) | [schema decisions](database/ER-changes.md) | [work log](log/) | [CI](docs/ci.md).
Readable reference IDs: [design and rollout](docs/uuid-and-reference-id-design.md) |
[validation](docs/uuid-reference-id-validation.md).

## Project overview

The Next.js frontend talks to an Express gateway and five services: auth, product,
order, chat, and support. The services cover accounts and KYC, listings and media,
orders and disputes, conversations and notifications, and customer support. Chat
also uses Socket.IO through the gateway. See the service route files for the full
current API; the tables below give selected endpoints.

Auth, product, order, and support use separate PostgreSQL databases via Prisma;
chat uses MongoDB. Redis supports jobs and inter-service events. Media storage
supports local Docker storage and S3. The existing production path runs on a
single-node K3s cloud VM; see [VM CI/CD](deploy/cicd/README.md). A separate
[AWS staging deployment](deploy/aws/EKS.md) uses direct EKS Auto Mode, ECR and
CloudFront, with the frontend hosted separately on Amplify. Backend image builds
and ECR pushes have passed on AWS; EKS runtime deployment is not yet verified.

## Local start

Install Node 22 (>=22.11.0 <23.0.0), npm 10+, and Docker with Compose. Copy
`.env.example` to `.env` and configure it for local development, then run:

```bash
npm ci
npm run dev
```

`npm run dev` starts local data services, builds the apps, runs guarded PostgreSQL
migrations and MongoDB schema setup, seeds local data, and starts the apps. It
retains existing volumes; resolve a migration error rather than deleting volumes
to bypass it. Frontend: http://localhost:3000; gateway: http://localhost:8080.
See [local Kubernetes](deploy/README.md) and
[production-like local deployment](deploy/production-local/README.md) for other
paths. Do not use local development settings for production.

The Node version is selected by `.nvmrc` and the root engine range; `.npmrc`
enforces the engine requirement. Docker images use Node 22. Useful checks:

```bash
npm run lint
npm run format:check
```

Frontend conventions are documented in [UI conventions](docs/ui-conventions.md).
Existing installations migrating review data should follow the
[review migration steps](backend/services/product-service/REVIEW_MIGRATION.md).

## Project structure

- `backend/gateway/`: API gateway.
- `backend/services/`: auth, product, order, chat, and support services.
- `backend/shared/`: shared backend package.
- `frontend/`: Next.js application.
- `deploy/`: local Kubernetes, existing VM, CI/CD, and AWS staging deployment material.
- `database/` and `log/`: schema documentation and historical work logs.

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

## Order API (implemented)

| Method | Path                       | Auth                   | Notes                                                                        |
| ------ | -------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| POST   | `/api/orders`              | Bearer                 | lock a listing (`pending_payment`), rejects self-purchase                    |
| GET    | `/api/orders/mine`         | Bearer                 | paginated orders as buyer, optional `status`                                 |
| GET    | `/api/orders/selling`      | Bearer                 | paginated orders as seller, optional `status`                                |
| GET    | `/api/orders/:id`          | Bearer, buyer/seller   | single order                                                                 |
| GET    | `/api/orders/:id/internal` | internal service token | called by the review feature in `product-service` to check order eligibility |
| PATCH  | `/api/orders/:id/status`   | Bearer, buyer/seller   | role-checked order transitions; expiry states are system-only                |
| PATCH  | `/api/orders/:id/pay`      | Bearer, buyer          | mock checkout: unpaid order → `paid`, marks product `sold`                   |

Cart reservations live in `Basket`; new orders start at `pending_payment` (รอชำระเงิน).
Forward migration `20261024000000_order_payment_and_expiry_states` maps existing
Order `inbasket` to `pending_payment` (including pre-dispute snapshots). Deploy all
pending migrations with the updated API and frontend; do not rewrite migration history or logs.
Unpaid timeouts use `payment_expired`; seller confirmation timeouts use
`seller_confirmation_expired` and record a simulated refund. `cancelled` means an
explicit buyer/seller cancellation; historical cancellations are not reclassified.
Checkout, Shipping and Payment retain their own `pending` states. Payments remain simulated.

## Review API (implemented)

| Method | Path                                       | Auth          | Notes                                                     |
| ------ | ------------------------------------------ | ------------- | --------------------------------------------------------- |
| POST   | `/api/reviews`                             | Bearer, buyer | one review per completed order (`orderId` must be unique) |
| GET    | `/api/reviews/by-seller/:sellerId`         | — (public)    | paginated reviews + `averageRating` for a seller          |
| GET    | `/api/reviews/by-seller/:sellerId/summary` | — (public)    | `{total, averageRating}` only                             |
| GET    | `/api/reviews/by-order/:orderId`           | Bearer        | the review for one order, if any                          |
| GET    | `/api/reviews/mine`                        | Bearer, buyer | paginated reviews the current buyer has written           |

Reviews rate the **seller**, not the product (one-off listings sell exactly once).

## Chat and database details

Chat provides conversation, message, notification, and attachment routes, with
Socket.IO for realtime communication. Its Prisma schema targets MongoDB. The
other four services use PostgreSQL migrations; the local bootstrap applies those
migrations and pushes the chat schema. Cross-service communication uses REST and
Redis where needed. Consult the service sources for the current API and schema.
