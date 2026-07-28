# RE-LOOP Living Progress Tracker

> Status source: repository evidence inspected on 2026-07-28. A file, route name, UI, or historical claim alone is not completion. Update this file after every Task ID with linked test/review/deploy evidence.

## Overall status

- **Planning status:** In progress — nine-document Production plan baseline is being produced/reviewed.
- **Implementation status:** Prototype / partially implemented.
- **Current phase:** Phase 0 — Discovery and Requirement Validation.
- **Production readiness:** Not ready.
- **Target context:** coursework; approximate target 20 September 2026.
- **Team model:** six beginners, rotating task owner/reviewer/teach-back, 5–10 hours/person/week.

## Evidence-backed current capabilities

| Existing capability | Evidence-backed status | Evidence |
|---|---|---|
| Repository/Docker Compose scaffold | Prototype | `docker-compose.yml`, Dockerfiles, root workspaces |
| Gateway proxy and JWT verification | Implemented but untested in current automated suite | `backend/gateway/src/server.js` |
| Register/login/refresh/logout/me | Implemented but untested in current automated suite | Auth routes/controllers/services; historical `log/phase-1.md` |
| Home/login/register pages | Implemented but untested in current automated suite | `frontend/app/` |
| Auth database tables | Prototype | Auth Prisma schema; no migrations |
| Product/Order/Chat/Review domain behavior | Not started | health-only service code |
| Admin Web | Not started | no Admin routes/components |
| Automated tests/CI/CD/IaC/cloud/monitoring | Not started | none found |

Historical logs record prior local container and browser checks. They remain useful evidence of that historical run, but are not a substitute for current automated verification.

## Task status

### Completed tasks

None of the new Production-plan Task IDs are complete. The current prototype predates this task system and does not satisfy the broader acceptance/evidence requirements.

### In-progress tasks

| Task | State | Evidence | Next proof |
|---|---|---|---|
| `DOC-001` | In progress | nine-document baseline work | reviewer and consistency verification |

### Blocked tasks

| Task | Blocker | Decision |
|---|---|---|
| `INT-003` | user must choose Algorithm or AI immediately before implementation, after evidence is available | `ADR-008` |
| Production-final portion of `INFRA-001` | region/budget/domain/traffic/SLO/retention/owner unconfirmed | `ADR-011` |
| `DEPLOY-002` | all launch gates and `ADR-011` approval | `ADR-010`, `ADR-011` |
| `AUTH-004` | public account privacy/recovery model unconfirmed | `ADR-012` |
| `AUTH-005` | Admin MFA/SSO/restricted-ingress option unconfirmed | `ADR-013` |

### Not-started tasks

- Discovery/Foundation/Architecture: `DISC-001`, `FOUND-001`, `FOUND-002`, `ARCH-001`
- Database/API: `DB-001`–`DB-004`, `API-001`–`API-004`
- Auth/Customer: `AUTH-001`–`AUTH-005`, `CUST-001`–`CUST-005`
- Admin: `ADMIN-001`–`ADMIN-004`
- Integration/Quality: `INT-001`, `INT-002`, `INT-004`, `TEST-001`, `TEST-002`, `SEC-001`
- Cloud/Operations: `INFRA-001`, `DEPLOY-001`, `DEPLOY-002`, `OPS-001`, `INFRA-002`

## Pending decisions

| Decision | Status | Required before |
|---|---|---|
| `ADR-001` course requires five deployable services? | Temporary assumption | destructive topology change or final IaC |
| `ADR-002` one shared Next.js deployment | Proposed | Admin implementation |
| `ADR-004` managed PostgreSQL logical DBs | Proposed | Production data IaC |
| `ADR-006` separate storage | Proposed | upload implementation |
| `ADR-008` Algorithm vs AI | Pending JIT | `INT-003` implementation |
| `ADR-009` outbox/idempotent consumer | Proposed | `DB-003`, `INT-002` |
| `ADR-011` region/domain/budget/traffic/SLO/RPO/RTO/retention/owner | Pending | Production finalization/launch |
| `ADR-012` public account privacy/recovery | Pending | `AUTH-004`, public registration |
| `ADR-013` Admin strong authentication/bootstrap | Pending | `AUTH-005`, Admin Production |
| `ADR-014` service-local audit + Review projection | Proposed | `DB-004`, Admin case/audit APIs |
| `ADR-015` same-origin/runtime frontend configuration | Proposed | `FOUND-001`, `DEPLOY-001` |

## Open questions

Priority Critical:

1. Does the course rubric explicitly require independently deployable Microservices?
2. Who owns the GCP project/budget and which region/domain may be used?
3. What public-demo data retention and deletion rules are approved?
4. Which availability, RPO/RTO, monitoring, and incident-response commitments are actually required?
5. Will public accounts be disposable pseudonymous accounts or recoverable accounts with a full privacy lifecycle?
6. Will Admin use managed SSO/MFA, application MFA, or restricted ingress?

Priority Important:

7. Which requirements-document load figures are grading targets versus real launch targets?
8. Is in-app/manual shipping notification sufficient for Release A?
9. Which Admin bulk/import/export operations are genuinely required for the coursework demo?

Deferred JIT:

10. Algorithm or AI recommendation under `ADR-008`.

## Risks

| Risk | Severity | Current mitigation | Owner |
|---|---|---|---|
| Public demo abuse/uploads/cost | High | `ADR-010`, `SEC-001`, `OPS-001`, minimum Admin | TBD human |
| Current token/session model | High | `AUTH-002` planned | Auth task owner |
| Privilege/data leakage | High | `AUTH-001`, Admin negative tests, audit | Security reviewer |
| Double sale/cross-service partial failure | High | `DB-003`, `API-003`, `INT-002` | Order owner |
| No tests/CI/deploy evidence | High | `FOUND-002`, `TEST-*`, `DEPLOY-001` | Quality owner |
| Beginner capacity/deadline | High | customer-first critical path, rotating ownership, Stretch excluded | Team lead |
| Microservice operational load | Medium/High | `ADR-001` reconsideration trigger | Architecture reviewer |
| Real data accidentally uploaded | High | prominent warning, validation, private storage, cleanup | Privacy/security owner |

## Technical debt

- localStorage access and refresh tokens;
- single-role schema and stale role claim;
- plaintext refresh JWT storage/no rotation;
- `prisma db push`, no migrations/seed;
- empty Product/Order/Chat/Review databases and health-only services;
- open CORS, no secure headers/rate limits/body limits;
- WebSocket upgrade bypasses normal gateway auth;
- shared `.env` and broad service secret exposure;
- host-exposed DB/cache in local Compose;
- no lockfile/lint/static/test/CI;
- no structured logging/metrics/alerts/backups/restore;
- README/legacy plan/current schema documentation conflicts and stale paths.

## Test status

- Unit: Not started.
- Integration: Not started.
- API/contract: Not started.
- Component: Not started.
- E2E: historical manual checks only; no current suite.
- Security/accessibility/performance/load/UAT/smoke: Not started.
- Current syntax evidence from Discovery: tracked JavaScript syntax check passed 30/30.
- Current configuration evidence from Discovery: `docker compose config --quiet` passed.
- Evidence limitation: the syntax/config results above came from the Discovery session stream and do not yet have a durable repository artifact; `DOC-001` must create an evidence manifest before relying on them for release.
- Runtime/build evidence this planning round: not performed; no Production code work was authorized and Docker engine availability was previously unavailable.

## Security status

Not ready. Material current risks are listed above. No formal threat model, scan suite, permission matrix enforcement, upload protection, incident runbook, or residual-risk approval exists.

## Deployment status

- Local Compose: configuration exists; current runtime not re-proven in this planning round.
- GCP Dev/Test/Staging/Production: Not started.
- CI/CD/IaC/registry/DNS/TLS: Not started.
- Backup/restore/rollback/monitoring/alerting: Not started.
- AWS: Stretch, Not started.

## Evidence links

- Current source map: `README.md`, `backend/`, `frontend/`, `database/`, `docker-compose.yml`
- Historical work evidence: `log/phase-0.md`, `log/phase-1.md`
- Current requirements: `docs/S2G5_RE-LOOP_ISE.md`
- Architecture/decisions: `architecture.md`, `decision.md`
- Canonical tasks: `planmain.md`, `planadminweb.md`
- Deployment/ordering: `deployment.md`, `roadmap.md`

### Evidence manifest baseline

| Timestamp | Worktree/commit | Command or source | Result | Durable artifact |
|---|---|---|---|---|
| 2026-07-28 | dirty worktree; commit not captured in this document | Repository structural inspection | current-state paths verified | exact paths in Architecture section 2 |
| 2026-07-28 | dirty worktree | tracked JavaScript syntax check from Discovery | 30/30 passed | **Missing; must be created before release use** |
| 2026-07-28 | dirty worktree | `docker compose config --quiet` from Discovery | exit 0 | **Missing; must be created before release use** |

## Next recommended task

`DISC-001` — validate the course topology requirement and launch inputs. In parallel, `FOUND-001` may begin using current evidence.

## Last updated

2026-07-28 (Asia/Bangkok)

## Changelog

- 2026-07-28: Created evidence-based baseline; no Production Task marked complete; identified `DISC-001` as next task and `DOC-001` as in progress.
