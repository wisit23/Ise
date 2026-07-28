# RE-LOOP Handoff

> Start here, then read `progress.md`, `decision.md`, `architecture.md`, and the canonical task card before changing anything. This handoff authorizes no implementation by itself.

## Project purpose

RE-LOOP is a coursework second-hand fashion marketplace. Release A prioritizes Buyer and Seller end-to-end behavior and the minimum Admin safety needed for a public demo. Payment and KYC are simulations; no real money or real identity data is allowed.

## Confirmed requirements

- Buyer/Seller Customer experience is primary; minimum safe Admin is required.
- One account may hold Buyer/Seller/Admin roles.
- Access token in memory; rotating HttpOnly refresh cookie; roles/status refreshed from DB.
- Test-file KYC only: `PENDING → APPROVED/REJECTED`; no OCR/provider/real PII.
- Mock payment only; explicit demo states/warnings.
- Recommendation strategy remains swappable and pending JIT Algorithm/AI choice.
- GCP primary; same-artifact, separate-data AWS demo only if time remains.
- Approximate target 20 September 2026.
- Six beginners, 5–10 hours/person/week; rotating task owner/reviewer/teach-back; AI assists, humans verify.

## Current state

- One Next.js 15 JavaScript/Tailwind frontend with home/login/register.
- Express gateway proxies five services and verifies bearer JWT.
- Auth implements register/login/refresh/logout/me.
- Product/Order/Chat/Review are health-only skeletons.
- One PostgreSQL container creates five logical databases; Auth schema only; no migration history.
- Redis/container upload volume exist without application use.
- No Admin UI, automated tests, CI/CD, IaC, cloud deployment, backup, monitoring, or alerting.
- Current session code stores both tokens in `localStorage`.

## Target state

Evidence-backed public GCP demo with secure multi-role sessions, complete Buyer/Seller lifecycle, minimum audited Admin operations, private synthetic KYC storage, mock transaction state, versioned migrations, tests/security gates, IaC/CI/CD, logs/metrics/alerts, backup/restore, rollback, and cost/incident ownership.

## Repository structure

```text
D:\ise
├─ frontend/                         Next.js application
├─ backend/gateway/                  Express edge proxy
├─ backend/services/auth-service/    only implemented domain service
├─ backend/services/{product,order,chat,review}-service/
├─ backend/shared/                   JWT/middleware/error/event helpers
├─ database/                         current schema documentation/copy
├─ infra/postgres/                   local DB init only
├─ docs/                             requirements, ER image, moved legacy plan
├─ log/                              historical phase evidence
├─ docker-compose.yml
└─ nine planning documents at root
```

## Architecture summary

- Temporary `ADR-001`: preserve gateway + five existing domain service deployables for Release A; add no new B/C services.
- Proposed `ADR-002`: Customer and `/admin` route groups in one Next.js deployment.
- `ADR-003`: multi-role RBAC and rotating cookie session; `AUTH-004`/`AUTH-005` add public-account lifecycle and privileged Admin assurance.
- `ADR-004`: managed PostgreSQL with logical DB/user per service and migrations.
- `ADR-006`: separate public product media and private test-KYC storage.
- `ADR-009`: local transaction/outbox/idempotent consumers for cross-service effects.

See `architecture.md` for diagrams and trust/data/deployment flows.

## Important decisions

- Accepted direction: `ADR-003`, `ADR-005`, `ADR-007`, `ADR-010`.
- Proposed/temporary: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-006`, `ADR-009`.
- Pending: `ADR-008` recommendation; `ADR-011` region/domain/budget/traffic/SLO/recovery/ownership; `ADR-012` public account privacy/lifecycle; `ADR-013` Admin strong authentication. Proposed `ADR-014`/`ADR-015` cover audit ownership and same-artifact frontend configuration.

## Completed work

No new Production-plan Task ID is complete. Existing prototype work is evidence listed in `progress.md`, not retroactively marked Done under stricter Production criteria. Planning baseline `DOC-001` is in progress.

## Remaining work

All implementation tasks in `planmain.md` and `planadminweb.md`, beginning with Discovery/Foundation and proceeding by `roadmap.md`. Do not start AWS Stretch while a GCP launch blocker remains.

## Current blockers and open questions

1. Course rubric: are independently deployable Microservices mandatory?
2. GCP project/budget owner, region, domain.
3. Traffic/SLO/RPO/RTO/retention/incident owner.
4. Which Admin bulk/import/export operations are Release A requirements?
5. JIT only: Algorithm or AI before `INT-003`.
6. Disposable pseudonymous or recoverable public accounts under `ADR-012`.
7. Admin SSO/MFA or restricted ingress under `ADR-013`.

## Known bugs/risks/technical debt

- localStorage tokens; refresh not rotated or role-fresh;
- single-role enum; plaintext stored refresh JWT;
- open CORS; no rate/secure-header/body controls;
- WebSocket upgrade auth gap;
- no migrations/tests/CI/IaC;
- no private upload flow/backup/monitoring;
- shared secrets and host-exposed local data services;
- distributed transaction/double-sale risk;
- documentation paths/current-target conflicts.

Full lists: `progress.md`, `architecture.md`, `decision.md`.

## Environment setup

Current local setup is documented in `README.md`, but links and Production claims are stale. Before running:

1. Inspect `.env.example`; never paste values into documentation or commit `.env`.
2. Ensure Docker and Docker Compose are available.
3. Use synthetic accounts/files only.

## Required tools

- Git
- Node.js/npm version: **22.x / npm 10+, pinned by `FOUND-001`** (`.nvmrc`, `package.json#engines`, `.npmrc engine-strict`) — pending reviewer sign-off
- Docker Engine and Docker Compose
- GCP CLI/IaC tools: **Proposed; exact tool pending `INFRA-001`**
- AWS CLI/IaC tools: **Stretch/Proposed only**

## Environment variables

Verified names exist in `.env.example`: PostgreSQL settings and five DB URLs, Redis URL, JWT secrets/expiry, internal-service token, service ports, frontend public API URL. Values and future cloud-secret mapping are not documented here. `FOUND-001` added a `requireEnv()` startup check (`backend/shared/src/env.js`), wired so far into `gateway` (`JWT_ACCESS_SECRET`) and `auth-service` (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) — the other four services do not yet consume any required variable, so nothing was added there. `INFRA-001` must still split secrets per identity/environment.

## Important commands

Verified from repository definitions, not necessarily executed in this planning round:

```powershell
npm install
npm run dev
npm run down
npm run lint
npm run format:check
docker compose config --quiet
docker compose up --build
docker compose ps
npm --workspace frontend run build
```

- Root `dev`/`down`/`lint`/`format`/`format:check` come from `package.json` (`FOUND-001`).
- Frontend `build` comes from `frontend/package.json`.
- Test/type/CI/migration/deployment commands are **Not available yet** and must not be invented.

## Testing commands

No repository test script exists. Use only commands created and verified by `FOUND-002`; then update this section with exact evidence. Discovery previously ran syntax checks and Compose config validation, which is narrower than application tests.

## Deployment commands

None verified because no cloud/IaC/CI/CD implementation exists. `deployment.md` describes the Proposed workflow. Do not copy imagined `gcloud`, migration, or rollback commands into an execution session.

## Files to read first

1. `progress.md`
2. `decision.md`
3. `architecture.md`
4. `planmain.md` or `planadminweb.md` canonical task card
5. `deployment.md`
6. `roadmap.md`
7. `tasklessons.md` for lessons from Tasks that are actually verified
8. source files touched by the chosen Task ID
9. `docs/S2G5_RE-LOOP_ISE.md`
10. `log/phase-0.md`, `log/phase-1.md` as historical evidence only

## Current Task ID

`DOC-001` — planning/evidence baseline in progress.

## Next Task ID

`DISC-001` — validate course and launch inputs. This matches `progress.md`.

## Things not to change without review

- Task ID or Decision ID meaning.
- Release A/B/C boundary.
- Mock-only payment and synthetic-only KYC boundaries.
- Auth session/RBAC model in `ADR-003`.
- Service/data ownership or cross-service contracts.
- Production migration, backup, retention, IAM, public ingress, DNS/TLS.
- Admin dangerous actions or audit semantics.
- Recommendation strategy before JIT user decision.
- User-owned moved/untracked requirements/legacy-plan files currently visible in Git status.

## Definition of Done

For any Task ID: acceptance criteria pass; tests and security/privacy/performance/observability concerns are handled; reviewer signs; evidence is linked; rollback/recovery is tested or justified; progress/handoff/decision/architecture/deployment/teachme are updated where affected; a detailed evidence-based lesson is appended to `tasklessons.md`; team teach-back is recorded.

## Evidence requirements

- exact command and exit status;
- test/scan/build/migration/deploy report;
- relevant screenshots only with synthetic/redacted data;
- commit/artifact/migration/revision identifier when implemented;
- reviewer and human approval where required;
- current/proposed status update;
- no secret, real KYC, card, bank, or private chat content.

## Safe starting procedure

1. Read `DISC-001` card.
2. Ask only questions not answerable from repository/current confirmed answers.
3. Record human evidence and update pending ADR status.
4. If rubric inputs are delayed, start `FOUND-001` only; do not finalize Production topology.
5. Stop after one task for review/teach-back before rotating ownership.
