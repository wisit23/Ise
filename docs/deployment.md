# RE-LOOP Production Deployment Plan

> Current deployment state is Docker Compose for local development. Everything in the target sections is **Proposed** until implemented and evidenced. GCP is primary; AWS is Stretch only.

## 1. Current deployment state

- `docker-compose.yml` starts PostgreSQL, Redis, gateway, five services, and Next.js.
- Frontend runs `next dev`; Auth starts with `prisma db push`.
- PostgreSQL and Redis ports are exposed to the host.
- One root `.env` is passed to all containers.
- There is no CI/CD, IaC, registry workflow, cloud environment, migration history, backup, restore, central logging, monitoring, alerting, DNS, or TLS configuration. A `package-lock.json` (generated, not yet committed) and a Node/npm version pin consistent with all 7 Dockerfiles (`node:22-alpine`) landed under `FOUND-001` (see `docs/progress.md`) — but the lockfile governs only the host workspace `npm install`; no Dockerfile copies it or uses `npm ci`, so container builds still resolve dependency versions fresh at build time, not from the lockfile. A CI pipeline is still `FOUND-002`.
- Historical logs claim prior local runtime verification; this planning round did not reproduce a full container run because no Production implementation was authorized.

## 2. Cloud selection criteria

| Criterion                 | GCP primary candidate                      | AWS stretch candidate                      | Required evidence                            |
| ------------------------- | ------------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| Coursework/learning fit   | Confirmed user preference                  | Optional learning                          | rubric and presentation needs                |
| Managed container support | Evaluate Cloud Run or approved alternative | Evaluate App Runner/ECS/Fargate equivalent | WebSocket, worker, min instances, health     |
| Managed PostgreSQL        | Cloud SQL candidate                        | RDS candidate                              | price, backup/PITR, connection limits        |
| Object storage            | GCS                                        | S3                                         | IAM, signed access, lifecycle, adapter tests |
| Cache/queue               | Memorystore/managed alternatives           | ElastiCache/managed alternatives           | actual need, cost, failure behavior          |
| Region/latency            | **Pending `ADR-011`**                      | only if Stretch approved                   | user location, service availability, cost    |
| Credits/budget            | **TBD**                                    | **TBD**                                    | named owner and spending cap                 |
| Operations                | one primary IAM/logging model              | duplicate minimal model                    | team capacity                                |

`ADR-005` chooses GCP as primary and only a Level-1 AWS portability demonstration after launch. It does not claim multi-cloud resilience.

## 3. Pending human launch inputs

`DISC-001` must confirm:

- GCP organization/project owner and available credits/budget;
- target region and data-residency expectation;
- domain/DNS owner or provider-generated URL acceptance;
- expected/peak traffic class and acceptable cold-start behavior;
- availability, RPO/RTO, retention, backup, and incident owner;
- course rubric requirements for service topology;
- whether external notification or shipping simulation is sufficient.
- public account privacy/recovery (`ADR-012`) and Admin strong-auth/bootstrap option (`ADR-013`).

Production resources remain parameterized until these are answered.

## 4. Accounts, projects, and environments

| Environment | Purpose                           | Data                                                             | Access             | Deployment                |
| ----------- | --------------------------------- | ---------------------------------------------------------------- | ------------------ | ------------------------- |
| Local       | developer feedback                | synthetic                                                        | individual machine | Docker Compose            |
| Test        | CI integration                    | disposable synthetic                                             | CI identity only   | ephemeral where practical |
| Development | shared integration if needed      | synthetic                                                        | team               | Proposed                  |
| Staging     | Production-like UAT/load/security | synthetic, resettable                                            | team/reviewers     | `DEPLOY-001`              |
| Production  | public coursework demo            | minimized account data under `ADR-012`; no real KYC/payment data | least privilege    | `DEPLOY-002`              |

Prefer separate GCP projects for Staging and Production. Development/Test may share a non-production project only if IAM, naming, quotas, and data isolation remain clear. Never copy Production user content to non-production.

## 5. Network, DNS, domain, and TLS

- Public ingress: web and gateway only.
- Service ingress: private/internal or provider-authenticated, with public direct service access disabled.
- Database/cache: no public IP unless a temporary documented exception is approved; use controlled private connectivity.
- DNS/domain: Pending owner/choice. Provider URL is an acceptable temporary staging endpoint; Production domain must be approved.
- TLS: managed certificate and HTTPS-only redirect; secure-cookie/domain settings tested per environment.
- Edge controls: request-size limits, allow-listed methods/origins, provider DDoS baseline, upload/rate limits.

Validation: external port scan, TLS/header test, negative direct-service/DB/storage access, cookie/CORS/CSRF E2E.

## 6. Compute and container image management

**Proposed selection process:** compare managed serverless containers versus a managed container platform using WebSocket duration, worker execution, minimum instances/cold starts, scaling controls, network connectivity, log/metric integration, and cost. Do not choose a product only from familiarity.

Container requirements:

- reproducible locked install and production build;
- non-root runtime, minimal base, health/readiness, graceful shutdown;
- immutable image tagged by commit and referenced by digest;
- SBOM, dependency/container vulnerability scan, provenance/signature where platform supports it;
- same artifact promoted Staging → Production;
- frontend uses relative same-origin `/api` or runtime bootstrap (`ADR-015`), so build-time `NEXT_PUBLIC_API_URL` does not force environment-specific image contents;
- secrets injected at runtime, never baked into image;
- separate worker entry point may reuse the same image if clear and supportable.

## 7. Managed database

- One managed PostgreSQL platform per environment under `ADR-004`.
- Separate logical DB and least-privilege user per service.
- Private connectivity, encrypted transport, encryption at rest.
- Automated backup/PITR based on confirmed RPO; deletion protection for Production.
- Connection pooling and per-service connection budget.
- Query/index monitoring; no direct Admin UI DB access.
- Versioned Prisma migrations only; `db push` prohibited in Staging/Production.

## 8. Object storage and CDN

- Product media and private test-KYC use separate resources/IAM/lifecycle under `ADR-006`.
- Product delivery may use CDN only after cache/privacy behavior is tested.
- KYC bucket has no public ACL/CDN; short-lived authorized access only.
- Upload uses randomized keys, byte-based type checks, size/count limits, quarantine/scanning policy, and orphan cleanup.
- Reject SVG/HTML/unsupported active formats; decode/re-encode images, strip EXIF/geolocation, enforce pixel/decompression limits, use safe `Content-Disposition`, and sandbox PDF rendering or reject PDF until approved.
- Storage adapter targets GCS; S3 compatibility belongs to `INFRA-002`.
- Backup/versioning and deletion follow confirmed retention; no indefinite default.

## 9. Cache, queue, and background jobs

- Redis is not automatically promoted merely because Compose contains it.
- `INT-002` justifies each use: rate limiting, WebSocket scale-out, worker queue, or short-lived coordination.
- PostgreSQL remains the source of truth; outbox records survive queue outage.
- Worker deployment defines concurrency, timeout, retry, dead letter, idempotency, graceful shutdown, lag metrics, and replay authorization.
- Queue/cache loss must degrade safely and trigger reconciliation rather than corrupt transactions.

## 10. Secrets and IAM

- Environment-specific secrets in managed Secret Manager; no shared all-service `.env`.
- One runtime identity per deployable or minimum coherent trust group, each with least privilege.
- CI uses short-lived federation/workload identity where available, not long-lived service-account keys.
- Separate human roles for view, deploy, secret, database, and break-glass access.
- Break-glass access is time-bounded, reviewed, and audited.
- Rotation and revocation runbook covers JWT/session keys, DB credentials, internal service identity, and storage access.
- Secret/credential values must never appear in plans, CI logs, screenshots, or evidence.

## 11. CI/CD and Infrastructure as Code

### Pull request gate

1. deterministic install;
2. format/lint/static check;
3. unit/integration/API/contract/component tests;
4. build;
5. dependency, secret, SAST, and container/IaC scans;
6. IaC validate/plan for affected environments;
7. evidence artifact and reviewer approval.

Supply-chain controls include protected branches/CODEOWNERS for sensitive areas, least-privilege workflow permissions, SHA-pinned third-party actions, and protected Production approval.

### Staging release

1. build once and record digest/SBOM;
2. scan and push registry;
3. review migration compatibility and backup requirement;
4. deploy database expand migration;
5. deploy services/web/workers;
6. run smoke/E2E;
7. monitor and publish evidence;
8. test rollback.

### Production release

Manual go/no-go after `TEST-002`, `SEC-001`, `OPS-001`, Admin safety, and `ADR-011` approval. Production applies reviewed IaC/migrations and promotes the same immutable digest.

IaC state must be remote, encrypted, access-controlled, locked, backed up, and separated by environment. Plans are reviewed before apply; drift is detected.

## 12. Database migration and seed strategy

- `DB-001` establishes a baseline without losing current Auth users.
- Use expand → backfill → compatible deploy → contract pattern.
- Migration job is single-run/locked and has timeout, logs, and failure stop.
- Production is backed up and restore point recorded before risky migration.
- Rollback means traffic rollback plus compatible schema or forward repair; destructive down-migration is not assumed safe.
- Local/Test/Staging seed is deterministic synthetic data.
- Production seed creates only minimal controlled Admin/demo fixtures through an approved one-time path; no default passwords in source.
- Seed is idempotent and reports exactly what it created.

## 13. Environment configuration

Configuration is validated on startup and classified:

- public build-time values, such as public API origin;
- non-secret runtime values, such as environment name and feature flags;
- secrets from Secret Manager;
- pending parameters, such as region/SLO/retention, which block Production if unset.

Missing security-critical values must fail closed. Frontend build must not accidentally bundle server secrets. Feature flags default off for unfinished Admin bulk operations, recommendation experiments, and AWS Stretch.

## 14. Deployment strategy and rollback

Use rolling or canary traffic shifting if the selected managed compute supports it without disproportionate complexity. Required behavior:

- previous healthy revision remains available;
- new revision receives no/limited traffic until health and smoke pass;
- automatic/manual rollback threshold uses error/latency/critical-journey failures;
- schema changes remain backward compatible during rollback window;
- jobs are version-compatible or paused/drained;
- rollback is rehearsed in Staging;
- state reconciliation runs after rollback.

Emergency feature stops: registration, upload, checkout, message sending, Admin bulk actions, and recommendation strategy can be independently disabled where designed. Read-only status remains where safe.

## 15. Health checks and post-deployment verification

- Liveness: process can respond.
- Readiness: instance can serve its supported dependencies without exposing secrets.
- Deep dependency diagnostics are private/operator-only and do not make every transient downstream failure restart all services.
- External smoke: home, TLS/headers, register/login/refresh, role permission denial, catalog, synthetic KYC, listing, reservation/mock order, Admin safety.
- Verify commit/image digest, revision, migration version, health, logs, metrics, alerts, DNS/TLS, cookie attributes, storage privacy, and budget state.

## 16. Testing, performance, load, and vulnerability gates

- `TEST-001`: functional layers in CI.
- `TEST-002`: staging E2E, accessibility, responsive, UAT, smoke, performance/load/failure.
- `SEC-001`: threat model, authz/session/upload/OWASP negatives, scans, residual risk.
- Load scenarios prioritize reservation contention, public auth abuse, search/filter, upload limits, WebSocket connections, worker backlog, and Admin bounded queries.
- Test targets come from confirmed inputs; course NFRs are labelled candidate targets.
- Critical/High exploitable findings block release. Medium findings need an owner/date/mitigation or explicit human acceptance.

## 17. Logging, monitoring, alerting, and tracing

- Structured JSON logs with environment/service/revision/request ID/severity/event.
- Redact password, JWT/cookie, KYC URL/content, private chat content, secrets, and sensitive import/export data.
- Metrics: rate/error/latency/saturation; auth failures/reuse; DB/queue/storage; reservation/order states; worker lag/dead letters; upload failures; privileged actions.
- Dashboards: public journey, service health, transaction safety, Admin queues, infrastructure/cost.
- Alerts have symptom, threshold rationale, owner, escalation, runbook, and test.
- Tracing is added only if correlation IDs/metrics cannot diagnose cross-service latency/failure; sampling/retention must protect privacy/cost.

## 18. Backup, restore, and disaster recovery

- Managed DB automated backup and PITR configured to confirmed objectives.
- Storage retention/versioning aligned to data policy; private files are not kept merely “because storage is cheap.”
- Backup access is separate and audited.
- Restore into an isolated environment; validate schema, counts, auth/session policy, object references, outbox/reconciliation, and smoke.
- Record actual RPO/RTO timing. If confirmed targets fail, Production is blocked or objectives are renegotiated explicitly.
- Disaster recovery recreates infrastructure from IaC and application from immutable images, then restores/reconciles data.
- Course values RTO 4h/RPO 15m remain unconfirmed until `ADR-011` is accepted.

## 19. Incident response and operational ownership

Required before launch:

- named incident lead, technical responder, communications owner, and decision authority;
- severity definitions and public-demo response hours that match team capacity;
- runbooks for auth abuse, token/secret leak, KYC exposure, malicious upload, double-sale/stuck order, DB outage, queue backlog, cost spike, bad deploy, and data restore;
- evidence preservation and audit-log handling;
- post-incident review with action owners;
- no invented 24/7 promise.

## 20. Cost monitoring and scaling

- Budget and anomaly alerts in Staging/Production with named recipients.
- Per-service labels/tags and dashboard.
- Min/max instances, DB size, cache/queue tier, log retention, and egress selected from measured staging tests and budget.
- Scale stateless components horizontally; protect DB with connection pool/concurrency caps.
- WebSocket/chat scale-out requires shared pub/sub only when multiple instances are proven necessary.
- Cost is a release constraint; AWS resources are capped and torn down unless explicitly retained.

## 21. Production launch checklist

- [ ] `ADR-011` and human owners approved
- [ ] GCP project/IAM/network/DNS/TLS reviewed
- [ ] immutable scanned artifact and SBOM recorded
- [ ] all migrations reviewed; backup/restore point verified
- [ ] synthetic seed and Admin access procedure verified
- [ ] Customer and Admin critical UAT pass
- [ ] no Critical/High security blocker
- [ ] public demo/no-real-payment/no-real-KYC warnings visible
- [ ] public account privacy/recovery and retention owner approved (`ADR-012`)
- [ ] Admin bootstrap, MFA/SSO or restricted ingress, recovery and break-glass verified (`ADR-013`)
- [ ] rates/upload/storage/session/RBAC controls pass
- [ ] dashboards, alerts, runbooks, on-call window, cost guard tested
- [ ] rollback and restore drill evidence linked
- [ ] incident and go/no-go owners present
- [ ] post-deploy external smoke and monitoring window complete

## 22. AWS portability Stretch

`INFRA-002` may start only after GCP launch criteria pass and time/budget remain. It deploys the same artifact to minimal AWS equivalents with separate synthetic seed and no Production data. Documentation must say it is a portability demo, not failover or disaster recovery. Teardown/cost evidence is part of Done.

## 23. Deployment section mapping

| Task                             | Sections             |
| -------------------------------- | -------------------- |
| `DISC-001`                       | 2–4, 16, 18–20       |
| `FOUND-001`, `FOUND-002`         | 6, 11, 13, 16        |
| `DB-001`–`DB-004`                | 7, 12, 18            |
| `AUTH-001`–`AUTH-003`, `SEC-001` | 5, 8, 10, 13, 16, 19 |
| `INT-001`, `INT-002`             | 8–9, 17–18           |
| `INFRA-001`                      | 4–11, 13, 17, 20     |
| `DEPLOY-001`                     | 11–16                |
| `DEPLOY-002`                     | 14–21                |
| `OPS-001`                        | 15, 17–20            |
| `INFRA-002`                      | 22                   |
