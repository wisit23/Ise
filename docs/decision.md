# RE-LOOP Architecture Decision Records

> These records distinguish confirmed user choices from proposed technical choices. “Accepted” means approved for planning; it does not mean implemented. “Pending” decisions must not be smuggled into production code.

## Decision governance

- **Decision owner:** TBD human role until `DISC-001` assigns it.
- **Accepted-by/source evidence:** `ADR-003`, `ADR-005`, `ADR-007`, and the public-demo direction of `ADR-010` come from the project user’s confirmed answers in this Codex conversation on 2026-07-28. `DOC-001` must preserve a durable redacted answer record before implementation completion.
- **Proposed/Pending approval:** `ARCH-001` cannot complete until `ADR-002`, `ADR-004`, `ADR-006`, `ADR-009`, `ADR-012`–`ADR-015` are accepted, rejected, or explicitly block their dependent task.
- **Last reviewed:** 2026-07-28.
- **Review rule:** Every future status change records owner, approver, source/evidence, date, affected tasks, and reconsideration trigger.

## ADR-001 — Preserve the existing service boundaries for Release A

- **Decision ID:** `ADR-001`
- **Title:** Course-aligned five-service backend topology
- **Status:** Temporary working assumption
- **Date:** 2026-07-28
- **Context:** The repository already has a gateway plus Auth, Product, Order, Chat, and Review services. Only Auth has working domain behavior. The team is six beginners with 5–10 hours/person/week and a target around 20 September 2026.
- **Problem:** Choose whether to retain the scaffolded microservices or consolidate before implementation.
- **Constraints:** Coursework context; rubric is not yet verified; no production code in this planning round; avoid unnecessary architecture.
- **Options considered:**
  1. Retain five service deployables and harden their contracts.
  2. Consolidate into a modular monolith while keeping domain modules.
  3. Keep Auth separate and consolidate the other four services.
- **Comparison:**

| Option | Benefits | Trade-offs | Complexity/cost | Security/operations |
|---|---|---|---|---|
| Five services | Matches current code and likely course narrative; clear domain ownership | More deployments, contracts, failure modes | High relative to project size | More IAM, secrets, logs, networking |
| Modular monolith | Simplest transactions and local operations | May conflict with rubric; migration work | Lower runtime cost | Smaller attack/ops surface |
| Hybrid | Reduces deployables while preserving Auth boundary | Creates a new topology with migration ambiguity | Medium | Still needs distributed auth/contracts |

- **Decision:** Retain the current five service boundaries for Release A, introduce no additional services, and use strict ownership/contracts.
- **Reason:** It minimizes destructive restructuring and preserves the demonstrated course architecture while the rubric remains unconfirmed.
- **Benefits:** Reuses scaffold; makes current/target comparison clear; preserves future extension seams.
- **Trade-offs:** Greater operational burden and cross-service consistency work than the product currently needs.
- **Risks:** Team time may be consumed by infrastructure rather than customer value.
- **Consequences:** `ARCH-001`, IaC, CI/CD, observability, and outbox work must handle six backend deployables including the gateway.
- **Reconsideration triggers:** Instructor confirms microservices are not required; critical path misses milestones; cloud credits are insufficient; distributed consistency dominates work.
- **Related Task IDs:** `DISC-001`, `ARCH-001`, `INFRA-001`, `DEPLOY-001`, `OPS-001`
- **Related Architecture sections:** 3, 4, 6, 13

## ADR-002 — Use one Next.js deployment for Customer and Admin

- **Decision ID:** `ADR-002`
- **Title:** Shared frontend deployable with separated Customer and Admin route groups
- **Status:** Proposed
- **Date:** 2026-07-28
- **Context:** Only one small Next.js application exists. Customer is the priority; Admin is desirable and minimum safety functions are required for a public demo.
- **Problem:** Decide between a separate Admin app and one app with authorization-separated routes.
- **Constraints:** Small beginner team; shared components; deadline; Admin must not be confused with merely hiding links.
- **Options considered:**
  1. One Next.js app with `/admin` route group.
  2. Separate Customer and Admin Next.js applications.
- **Comparison:**

| Option | Benefits | Trade-offs | Cost | Security implication |
|---|---|---|---|---|
| One app | Reuses auth/design/API client; one deployment | Larger blast radius; requires disciplined route separation | Lower | Backend authorization remains mandatory |
| Separate apps | Independent releases and bundles | Duplicate setup, deployments, session integration | Higher | Smaller UI blast radius, same API authorization need |

- **Decision:** Use one Next.js deployable for Release A, with distinct layouts, navigation, route guards, tests, and permission-aware Admin controls.
- **Reason:** Best fit for current code and capacity without duplicating frontend infrastructure.
- **Benefits:** Faster customer-first delivery and shared accessibility/design work.
- **Trade-offs:** Admin and Customer releases are coupled.
- **Risks:** Developers may mistake route guards for authorization.
- **Consequences:** Backend permissions are the source of truth; Admin E2E and negative authorization tests are required.
- **Reconsideration triggers:** Independent Admin release cadence, separate admin domain/network requirement, bundle/security isolation requirement, or sustained separate team.
- **Related Task IDs:** `CUST-001`, `ADMIN-001`, `ADMIN-002`
- **Related Architecture sections:** 4, 5, 7

## ADR-003 — Multi-role RBAC and secure browser session model

- **Decision ID:** `ADR-003`
- **Title:** Multi-role authorization with in-memory access token and rotating HttpOnly refresh cookie
- **Status:** Accepted — confirmed user direction
- **Date:** 2026-07-28
- **Context:** Current code has one role enum and stores access/refresh tokens in `localStorage`. The user confirmed that one account may hold multiple roles.
- **Problem:** Define identity/session boundaries for Customer and Admin.
- **Constraints:** Public registration; Admin safety; browser client; role changes must become effective without waiting for a long-lived stale token.
- **Options considered:**
  1. Access token in memory + refresh token in HttpOnly Secure SameSite cookie.
  2. Both tokens in `localStorage`.
  3. Server-side opaque session cookie only.
- **Comparison:**

| Option | Benefits | Trade-offs | Security |
|---|---|---|---|
| Memory + refresh cookie | Limits token theft persistence; API-friendly | Requires refresh/CSRF design | Recommended working direction |
| localStorage | Simple | XSS can steal both long-lived credentials | Rejected |
| Opaque session | Simple revocation and role freshness | Requires shared session store/gateway pattern change | Viable alternative |

- **Decision:** Use short-lived access tokens held in memory; rotate a hashed refresh-token/session record via HttpOnly, Secure, SameSite cookie; reload user status/roles on refresh. Model roles through assignments and permissions.
- **Reason:** Explicitly confirmed by the user and reduces the current XSS/session risk while retaining the API topology.
- **Benefits:** Multi-role support, role freshness, revocation, safer browser storage.
- **Trade-offs:** CSRF protection, cookie configuration, refresh coordination, and rotation/reuse detection are required.
- **Risks:** Incorrect cookie scope or CORS can break sessions or create CSRF exposure.
- **Consequences:** Auth API and frontend session code must be replaced under `AUTH-001` and `AUTH-002`; all sensitive endpoints require permission and resource checks.
- **Reconsideration triggers:** Native client requirement, cross-site embedding, or move to an identity provider.
- **Related Task IDs:** `DB-001`, `AUTH-001`, `AUTH-002`, `ADMIN-001`, `SEC-001`
- **Related Architecture sections:** 7, 10

## ADR-004 — Managed PostgreSQL with database ownership and migrations

- **Decision ID:** `ADR-004`
- **Title:** Preserve database-per-service ownership on one managed PostgreSQL platform
- **Status:** Proposed
- **Date:** 2026-07-28
- **Context:** Docker Compose creates five logical databases on one PostgreSQL instance. Only Auth has a Prisma schema and it uses `prisma db push`.
- **Problem:** Select a production data topology and change-management method.
- **Constraints:** Current service ownership, budget unknown, small team, need backup/restore.
- **Options considered:**
  1. One managed PostgreSQL instance/cluster with logical DB and user per service.
  2. Separate managed instance per service.
  3. One shared database/schema for all services.
- **Comparison:**

| Option | Benefits | Trade-offs | Cost/ops | Security |
|---|---|---|---|---|
| Logical DB per service | Keeps ownership at reasonable cost | Shared instance failure domain | Medium-low | Distinct least-privilege users |
| Instance per service | Strong isolation | Excessive cost/ops | High | Strongest infrastructure isolation |
| Shared DB | Easy reporting/transactions | Violates current ownership, tight coupling | Low | Broad privileges likely |

- **Decision:** Use one managed PostgreSQL platform per environment, logical database and least-privilege credential per service, versioned migrations, no cross-service foreign keys.
- **Reason:** Matches current topology while remaining affordable and operable.
- **Benefits:** Service ownership, shared backup tooling, controlled cost.
- **Trade-offs:** Instance-wide capacity and outage affect all services.
- **Risks:** Cross-service references can drift without contracts/reconciliation.
- **Consequences:** `DB-001`–`DB-004` must create migration histories and restore evidence; reporting requires APIs/events or a future read model.
- **Reconsideration triggers:** provider limits, independent scaling/compliance, confirmed analytics architecture, or service consolidation.
- **Related Task IDs:** `DB-001`, `DB-002`, `DB-003`, `DB-004`, `INFRA-001`, `OPS-001`
- **Related Architecture sections:** 6, 8, 15

## ADR-005 — GCP primary, AWS portability stretch

- **Decision ID:** `ADR-005`
- **Title:** Primary deployment on Google Cloud with optional Level-1 AWS demonstration
- **Status:** Accepted — confirmed user direction
- **Date:** 2026-07-28
- **Context:** The user named Google Cloud and AWS, prefers Google Cloud, and wants multi-cloud only if time remains.
- **Problem:** Define cloud scope without creating an unfinishable active-active design.
- **Constraints:** Coursework, capacity, budget/credits unknown, public URL.
- **Options considered:**
  1. GCP primary only.
  2. GCP primary plus same-artifact independent AWS demo.
  3. Active-active or failover multi-cloud.
- **Comparison:**

| Option | Benefits | Trade-offs | Cost/ops | Security |
|---|---|---|---|---|
| GCP only | Lowest burden | No portability demonstration | Lowest | One IAM model |
| GCP + AWS demo | Shows portability | Duplicate minimal infra, drift risk | Medium | Two IAM/secrets surfaces |
| Active multi-cloud | Resilience narrative | Disproportionate complexity | Very high | Complex identity/data boundaries |

- **Decision:** Build and launch on GCP. If Release A gates pass and time remains, deploy the same immutable container artifact to AWS with independent demo DB/seed. No replication, global routing, shared sessions, or automatic failover.
- **Reason:** Matches the explicit priority and stretch definition.
- **Benefits:** Focused production path with credible portability evidence.
- **Trade-offs:** AWS environment is not a resilience mechanism.
- **Risks:** Stretch work may distract from GCP hardening.
- **Consequences:** `INFRA-002` is blocked by production readiness and is never on the critical path.
- **Reconsideration triggers:** course rubric requires AWS, GCP credits unavailable, or a real multi-cloud availability requirement appears.
- **Related Task IDs:** `INFRA-001`, `DEPLOY-001`, `DEPLOY-002`, `INFRA-002`
- **Related Architecture sections:** 13

## ADR-006 — Separate public product media and private test-KYC storage

- **Decision ID:** `ADR-006`
- **Title:** Storage separation by sensitivity
- **Status:** Proposed
- **Date:** 2026-07-28
- **Context:** Docker Compose declares a product upload volume but no upload code. The user confirmed real file storage behavior for synthetic/test KYC documents, not real identity documents.
- **Problem:** Prevent KYC test files from inheriting public product-media access.
- **Constraints:** Public demo, upload abuse risk, GCP primary/AWS stretch.
- **Options considered:**
  1. Separate buckets/containers and identities.
  2. One bucket with prefixes and ACL policies.
  3. Local container volume.
- **Comparison:**

| Option | Benefits | Trade-offs | Security |
|---|---|---|---|
| Separate storage | Clear IAM/lifecycle boundary | More resources/config | Strong default separation |
| One bucket/prefix | Fewer resources | Policy mistakes cross boundary | Higher misconfiguration risk |
| Local volume | Simple locally | Not durable/scalable; hard backup | Not suitable for public production |

- **Decision:** Separate product media and private test-KYC storage, each with dedicated IAM/lifecycle. Access through an `ObjectStorage` adapter.
- **Reason:** Sensitivity and access patterns differ materially.
- **Benefits:** Least privilege, safer cleanup, GCS/S3 portability.
- **Trade-offs:** Two policies and test matrices.
- **Risks:** Signed URLs or logs may leak object references.
- **Consequences:** Upload validation, audit, short-lived access, and cleanup are required.
- **Reconsideration triggers:** provider limitation or removal of file upload scope.
- **Related Task IDs:** `AUTH-003`, `CUST-003`, `INT-001`, `SEC-001`, `OPS-001`
- **Related Architecture sections:** 8.3, 9, 10

## ADR-007 — Mock payment only

- **Decision ID:** `ADR-007`
- **Title:** PaymentGateway interface backed only by a deterministic simulator
- **Status:** Accepted — confirmed user requirement
- **Date:** 2026-07-28
- **Context:** Coursework needs payment/order state demonstration, but the user explicitly rejected real money handling.
- **Problem:** Model transaction behavior without creating financial or PCI scope.
- **Constraints:** No real card, bank, payout, or refund; public demo.
- **Options considered:**
  1. Internal deterministic mock adapter.
  2. External provider sandbox.
  3. Real payment provider.
- **Comparison:**

| Option | Benefits | Trade-offs | Security/compliance |
|---|---|---|---|
| Internal mock | Predictable, no credentials/real data | Less integration realism | Avoids card scope |
| Provider sandbox | Real API practice | Credentials/webhooks/provider complexity | Still must prevent real data entry |
| Real provider | Production realism | Not needed and high risk | Rejected |

- **Decision:** Implement only a mock adapter with explicit simulated approve/decline/refund/hold/release states and persistent audit.
- **Reason:** Explicit user scope and safest coursework boundary.
- **Benefits:** Testable state machine, no financial dependency.
- **Trade-offs:** Not evidence of real payment readiness.
- **Risks:** Users may mistake simulation for real payment.
- **Consequences:** UI and API must show “DEMO / NO REAL PAYMENT”; payment fields must not resemble or accept card secrets.
- **Reconsideration triggers:** A new separately approved requirement for provider sandbox or real commerce.
- **Related Task IDs:** `DB-003`, `API-003`, `CUST-004`, `ADMIN-003`, `TEST-002`
- **Related Architecture sections:** 4, 8.2

## ADR-008 — Defer Algorithm versus AI recommendation selection

- **Decision ID:** `ADR-008`
- **Title:** RecommendationStrategy seam with just-in-time selection
- **Status:** Pending
- **Date:** 2026-07-28
- **Context:** Requirements mention AI, but the user is unsure whether to use AI or an algorithm and asked to design both options before implementation.
- **Problem:** Preserve a realistic choice without implementing two production systems.
- **Constraints:** No labelled dataset or model budget confirmed; deadline and team capacity limited.
- **Options considered:**
  1. Deterministic/rule-based scoring.
  2. Hosted or trained AI/ML recommendation.
  3. Popular/recent fallback only.
- **Comparison:**

| Option | Suitable when | Benefits | Trade-offs/cost | Security/privacy |
|---|---|---|---|---|
| Algorithm | Sparse data, explainability, short deadline | Cheap, deterministic, testable | May be less personalized | Minimal data exposure |
| AI/ML | Adequate interaction data, evaluation metric, budget | Can model richer patterns | Data/MLOps/cost/latency | Profiling and provider-data concerns |
| Fallback | Cold start or outage | Always available | Limited personalization | Lowest risk |

- **Decision:** Do not select or build both now. Define `RecommendationStrategy` input/output, fallback behavior, and evaluation dataset/metrics. Ask the user immediately before `INT-003` implementation.
- **Reason:** This directly follows the confirmed answer and avoids speculative AI.
- **Benefits:** Stable UI/API and reversible choice.
- **Trade-offs:** Final feed behavior remains undecided.
- **Risks:** Calling a rule “AI” would misrepresent the project.
- **Consequences:** `CUST-002` may integrate a labelled placeholder/fallback, while `INT-003` is a decision spike before real strategy implementation.
- **Reconsideration triggers:** dataset, rubric, budget, privacy, latency, and measurable success criteria become known.
- **Related Task IDs:** `DISC-001`, `CUST-002`, `INT-003`
- **Related Architecture sections:** 3, 4, 9

## ADR-009 — Transactional outbox for cross-service state changes

- **Decision ID:** `ADR-009`
- **Title:** Local transaction plus outbox and idempotent consumer
- **Status:** Proposed
- **Date:** 2026-07-28
- **Context:** Reservation, order, notification, moderation, and seller aggregates cross database boundaries. Redis exists but no job/event implementation exists.
- **Problem:** Prevent lost events and unsafe dual writes.
- **Constraints:** PostgreSQL source of truth; no distributed transactions; beginner team.
- **Options considered:**
  1. Transactional outbox with worker delivery.
  2. Direct API call then database write.
  3. Distributed transaction/two-phase commit.
- **Comparison:**

| Option | Benefits | Trade-offs | Operations |
|---|---|---|---|
| Outbox | Durable intent, retry/replay | Eventual consistency, worker needed | Monitor lag/dead letters |
| Direct dual write | Simple happy path | Partial failure/lost updates | Manual reconciliation |
| Distributed transaction | Strong atomicity | Unsupported/complex across services | Excessive |

- **Decision:** Persist domain change and outbox record atomically; deliver asynchronously with idempotent consumer and reconciliation.
- **Reason:** Standard reliable pattern that fits current database ownership.
- **Benefits:** Recoverable failures and auditable retries.
- **Trade-offs:** Eventual consistency and operational tooling.
- **Risks:** Poison messages or non-idempotent handlers.
- **Consequences:** `INT-002`, `OPS-001`, contract tests, and runbooks are mandatory.
- **Reconsideration triggers:** topology consolidates to one database transaction or an approved managed event platform provides equivalent guarantees.
- **Related Task IDs:** `ARCH-001`, `DB-003`, `DB-004`, `INT-002`, `OPS-001`
- **Related Architecture sections:** 8.2, 9.3, 11

## ADR-010 — Public coursework demo safety boundary

- **Decision ID:** `ADR-010`
- **Title:** Public registration with demo labelling and disposable non-real data
- **Status:** Accepted direction; retention details pending
- **Date:** 2026-07-28
- **Context:** The user wants a public Cloud URL where anyone can register. Payment and KYC are simulations.
- **Problem:** Make public access safe enough for coursework without pretending the platform handles real identity or money.
- **Constraints:** No real KYC document/card/bank data; public account data may still be personal under `ADR-012`; unknown traffic; Admin safety is required.
- **Options considered:**
  1. Public registration with abuse controls and automatic cleanup.
  2. Invite-only demo.
  3. Local-only demonstration.
- **Comparison:**

| Option | Benefits | Trade-offs | Risk |
|---|---|---|---|
| Public controlled demo | Easy presentation and testing | Abuse/ops burden | Highest, mitigated by controls |
| Invite-only | Lower abuse | Less accessible | Medium |
| Local-only | Lowest exposure | Fails public-cloud goal | Low |

- **Decision:** Public controlled demo with prominent warnings, rate/size/count limits, private KYC storage, minimum Admin moderation, no real-data fields, and an approved cleanup policy.
- **Reason:** Matches the explicit public-URL goal.
- **Benefits:** Demonstrable end-to-end system.
- **Trade-offs:** Security and operations move onto the critical path.
- **Risks:** Spam, abusive uploads, accidental real-data entry, cost spikes.
- **Consequences:** `SEC-001`, `ADMIN-002`, `ADMIN-003`, `OPS-001`, and launch checklist are blockers. `ADMIN-004` remains feature-flagged/Deferred until its Release A operations are explicitly approved.
- **Reconsideration triggers:** budget/abuse controls insufficient or institution requires access restriction.
- **Related Task IDs:** `DISC-001`, `AUTH-003`, `ADMIN-002`, `SEC-001`, `DEPLOY-002`, `OPS-001`
- **Related Architecture sections:** 1, 10, 13

## ADR-011 — Region, domain, capacity and recovery objectives

- **Decision ID:** `ADR-011`
- **Title:** Launch parameters requiring human confirmation
- **Status:** Pending
- **Date:** 2026-07-28
- **Context:** GCP is primary, but region, credits/budget, domain, traffic, availability, data retention, RPO/RTO, and operational owner are not confirmed.
- **Problem:** Prevent invented settings from becoming architecture facts.
- **Constraints:** Public launch around 20 September 2026; coursework values exist but are not confirmed operational commitments.
- **Options considered:**
  1. Choose settings from measured latency/cost and confirmed recovery needs.
  2. Copy all NFR values from the requirements document.
  3. Use provider defaults without review.
- **Comparison:**

| Option | Benefits | Trade-offs | Risk |
|---|---|---|---|
| Evidence-based selection | Defensible and affordable | Requires early discovery | Lowest |
| Copy course NFRs | Fast | May be infeasible/unfunded | High |
| Provider defaults | Fastest | Hidden cost/residency/recovery assumptions | High |

- **Decision:** Keep parameters pending. `DISC-001` must obtain rubric/owner/budget/traffic/data answers and record them before `INFRA-001` finalizes production resources.
- **Reason:** The user prohibited inventing traffic, budget, compliance, or cloud choices.
- **Benefits:** Honest plan and reviewable trade-offs.
- **Trade-offs:** Some IaC details remain parameterized.
- **Risks:** Late answers can block launch.
- **Consequences:** Staging may use explicitly labelled low-cost temporary values; production cannot launch without human approval.
- **Reconsideration triggers:** Required inputs are confirmed.
- **Related Task IDs:** `DISC-001`, `INFRA-001`, `DEPLOY-002`, `OPS-001`
- **Related Architecture sections:** 12, 13, 15, 17

## Decision status summary

| ID | Status | Blocking scope |
|---|---|---|
| `ADR-001` | Temporary working assumption | Backend/IaC topology |
| `ADR-002` | Proposed | Frontend organization |
| `ADR-003` | Accepted | Auth/RBAC |
| `ADR-004` | Proposed | Data/IaC |
| `ADR-005` | Accepted | Cloud scope |
| `ADR-006` | Proposed | Upload/storage |
| `ADR-007` | Accepted | Order/payment simulation |
| `ADR-008` | Pending | Recommendation implementation only |
| `ADR-009` | Proposed | Async consistency |
| `ADR-010` | Accepted direction | Public launch safety |
| `ADR-011` | Pending | Production resource and launch approval |
| `ADR-012` | Pending | Public registration/privacy/account lifecycle |
| `ADR-013` | Pending | Admin Production access |
| `ADR-014` | Proposed | Audit/case ownership |
| `ADR-015` | Proposed | Frontend runtime configuration |

## ADR-012 — Public account data and recovery model

- **Decision ID / Title / Status / Date:** `ADR-012` / Public account privacy and lifecycle / Pending / 2026-07-28
- **Context / Problem:** Anyone may register. Even with synthetic KYC, email, name, phone, IP, chat, and order data may be personal data; warnings cannot make them synthetic.
- **Constraints:** No real KYC document or payment data; privacy/legal requirements and retention are unconfirmed.
- **Options considered / Comparison:** (1) disposable pseudonymous accounts with generated KYC templates—least data, no recovery; (2) recoverable public accounts—realistic but needs notice, minimization, deletion/export, retention, breach/processor/residency work; (3) invite-only generated accounts—lowest abuse but conflicts with public registration.
- **Decision / Reason:** Pending `DISC-001`. Production registration is blocked until one model is accepted. Remove phone/name/government-ID fields unless a confirmed workflow needs them.
- **Benefits / Trade-offs / Risks / Consequences:** Makes the data boundary honest but may change Auth schema/UX; accidental real upload still needs purge/incident handling.
- **Reconsideration triggers:** access model or institutional/legal guidance changes.
- **Related Task IDs / Architecture:** `DISC-001`, `DB-001`, `AUTH-004`, `SEC-001`, `DEPLOY-002` / Architecture 1, 7–10, 17.

## ADR-013 — Strong Admin authentication and bootstrap

- **Decision ID / Title / Status / Date:** `ADR-013` / Admin MFA or restricted managed access / Pending / 2026-07-28
- **Context / Problem:** Public Admin actions have high impact; ordinary password/session assurance is insufficient.
- **Constraints:** provider/budget pending; no default or source-controlled Admin credential.
- **Options considered / Comparison:** (1) managed SSO with MFA—strongest and lowest custom auth, provider-dependent; (2) app MFA plus non-self-service provisioning—portable but more recovery work; (3) restricted Admin ingress—simple for coursework but less accessible.
- **Decision / Reason:** `DISC-001` chooses one. Every option requires bootstrap, recovery, break-glass, revocation, audit, and test.
- **Benefits / Trade-offs / Risks / Consequences:** Reduces takeover risk but adds setup; `AUTH-005` and Admin launch are blocked until accepted.
- **Reconsideration triggers:** identity/provider or access requirements change.
- **Related Task IDs / Architecture:** `DISC-001`, `AUTH-005`, `ADMIN-001`, `SEC-001`, `DEPLOY-002` / Architecture 7, 10, 13.

## ADR-014 — Service-local audit with central read projection

- **Decision ID / Title / Status / Date:** `ADR-014` / Auditable owner commands / Proposed / 2026-07-28
- **Context / Problem:** Admin needs one case/audit view while Auth/Product/Order/Review own different state.
- **Constraints:** database-per-service, least privilege, no direct Admin DB access.
- **Options considered / Comparison:** (1) owner-local append-only audit plus Review projection—preserves ownership, eventually consistent; (2) new central audit service—extra deployable; (3) debug logs—insufficient integrity.
- **Decision / Reason:** Use option 1. Owner state/audit is authoritative; Review projection is read-only and rebuildable.
- **Benefits / Trade-offs / Risks / Consequences:** Unified search without cross-DB writes; projection lag/replay/retention/trusted time/writer roles/integrity monitoring must be visible and tested.
- **Reconsideration triggers:** topology consolidation or formal audit platform requirement.
- **Related Task IDs / Architecture:** `ARCH-001`, `AUTH-001`, `API-002`–`API-004`, `DB-004`, `INT-002`, `ADMIN-003`, `ADMIN-004` / Architecture 6, 8, 11, 14.

## ADR-015 — Same-origin runtime web configuration

- **Decision ID / Title / Status / Date:** `ADR-015` / Preserve one immutable frontend artifact / Proposed / 2026-07-28
- **Context / Problem:** Current `NEXT_PUBLIC_API_URL` is embedded at build time, conflicting with same-digest promotion.
- **Constraints:** environment origins differ; same-site refresh cookie is preferred.
- **Options considered / Comparison:** (1) relative same-origin `/api`—simplest CORS/cookie model; (2) runtime bootstrap—supports split origin with more code; (3) rebuild per environment—abandons identical digest.
- **Decision / Reason:** Prefer same-origin `/api`; use runtime bootstrap only if platform routing cannot support it.
- **Benefits / Trade-offs / Risks / Consequences:** One digest and simpler cookies, but edge routing is required.
- **Reconsideration triggers:** separate API domain becomes confirmed.
- **Related Task IDs / Architecture:** `FOUND-001`, `CUST-001`, `INFRA-001`, `DEPLOY-001` / Architecture 5, 7, 13.
