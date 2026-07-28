# RE-LOOP Production Roadmap

> Ordering is relative. No daily or weekly promise is inferred from the September target because effective capacity is reduced by learning, review, integration, and coursework. Canonical task fields are defined in `planmain.md` and `planadminweb.md`; every Task reference below inherits that exact Task ID/card and cannot be redefined here.

## Roadmap rules

- Each task has one rotating owner, another reviewer, and a team teach-back.
- Security (`SEC-001`), functional tests (`TEST-001`), and documentation (`DOC-001`) travel with every phase.
- “Parallel” means contracts are stable and people do not edit the same state blindly.
- Exit criteria require evidence, not file/UI presence.
- Release B/C remains out of Release A.

## Phase 0 — Discovery and Requirement Validation

- **Goal:** Confirm the facts that control architecture and launch.
- **Why this phase exists:** Course rubric, region, budget, traffic, retention, recovery, and ownership cannot be invented.
- **Inputs:** source/config/schema, Discovery, user answers, requirements document.
- **Tasks:** `DISC-001`, begin `DOC-001`.
- **Dependencies:** none.
- **Deliverables:** approved Release A boundary, question/answer record, updated `ADR-001`, `ADR-008`, `ADR-011`.
- **Exit criteria:** every Critical unknown is answered or explicitly blocks a named later task.
- **Risks:** instructor/owner answers arrive late.
- **Responsible role:** rotating analyst owner + architecture reviewer + human product/instructor approver.
- **Complexity:** M.
- **Parallel work:** `FOUND-001` can start using current evidence.
- **Blockers:** unavailable decision authority.
- **Production impact:** prevents incorrect topology, cost, compliance, and SLO claims.

## Phase 1 — Architecture and Project Foundation

- **Goal:** Create reproducible development, quality gates, and frozen service contracts.
- **Why this phase exists:** Six beginners and AI agents need one deterministic definition of correct.
- **Inputs:** Phase 0 decisions, current workspaces, Docker Compose.
- **Tasks:** `FOUND-001`, `FOUND-002`, `ARCH-001`, continue `SEC-001`, `TEST-001`, `DOC-001`.
- **Dependencies:** Phase 0 only for rubric-sensitive decisions.
- **Deliverables:** lockfile/tooling, CI baseline, ownership/API/event/state contracts.
- **Exit criteria:** clean setup/check path works; contracts and trust boundaries reviewed; no unexplained gate bypass.
- **Risks:** over-tooling or premature contract detail.
- **Responsible role:** foundation owner, architecture reviewer, security reviewer.
- **Complexity:** L.
- **Parallel work:** CI wiring and contract drafting.
- **Blockers:** unresolved `ADR-001` if rubric contradicts topology.
- **Production impact:** makes all later evidence reproducible.

## Phase 2 — UX/UI and Design System

- **Goal:** Establish accessible shared Customer/Admin UI foundations.
- **Why this phase exists:** Feature teams need consistent session, navigation, form, error, and responsive behavior.
- **Inputs:** frontend/session/API contracts.
- **Tasks:** UI/session/permission contract portion of `ARCH-001`, design/evidence portion of `DOC-001`; prepare tests under `TEST-001`. `CUST-001` and `ADMIN-001` do not complete in this phase.
- **Dependencies:** `FOUND-002`, `ARCH-001`.
- **Deliverables:** reviewed design tokens/primitives specification, responsive prototypes, demo-banner copy, Customer/Admin route and session-state contract.
- **Exit criteria:** design/contract/accessibility review passes; implementation dependencies are explicit.
- **Risks:** visual work outruns API/security design.
- **Responsible role:** rotating frontend owner, accessibility reviewer.
- **Complexity:** L.
- **Parallel work:** Customer shell and Admin layout share reviewed primitives.
- **Blockers:** unresolved session contract.
- **Production impact:** reduces user/Admin mistakes and accessibility defects early.

## Phase 3 — Database and Core Backend

- **Goal:** Establish migration-safe sources of truth and shared API safety.
- **Why this phase exists:** Four service databases are empty and current Auth data is not production-ready.
- **Inputs:** contracts/state machines/data classification.
- **Tasks:** `DB-001`, `DB-002`, `DB-003`, `DB-004`, `API-001`, start `INT-001`, `INT-002`.
- **Dependencies:** Phase 1; retention input for final interaction policy.
- **Deliverables:** reviewed migrations, schemas, indexes, fixtures, validation/error/idempotency foundation, outbox/storage contracts.
- **Exit criteria:** disposable upgrade/rollback tests, constraints, contract and negative-security tests pass.
- **Risks:** schema scope creep and cross-service inconsistency.
- **Responsible role:** rotating data/API owners; cross-service architecture reviewer.
- **Complexity:** XL.
- **Parallel work:** four schema tasks after identifier/event contract freeze.
- **Blockers:** unresolved ownership or migration path.
- **Production impact:** controls data integrity, restore, and deploy safety.

## Phase 4 — Authentication and Authorization

- **Goal:** Replace the current single-role/localStorage model with secure multi-role sessions.
- **Why this phase exists:** Customer/Admin safety depends on identity, permission, and role freshness.
- **Inputs:** `ADR-003`, Auth migration, API foundation, storage contract.
- **Tasks:** `AUTH-001`, `AUTH-002`, `AUTH-003`, `AUTH-004`, `AUTH-005`, `CUST-001`, `ADMIN-001`.
- **Dependencies:** `DB-001`, `API-001`, `INT-001`.
- **Deliverables:** RBAC matrix enforcement, rotating cookie sessions, test-KYC state/API, permission-negative suite.
- **Exit criteria:** refresh token is not JS-readable; multi-role and suspended/stale-role tests pass; KYC objects are private/audited.
- **Risks:** lockout, CSRF/CORS error, privilege escalation, sensitive upload.
- **Responsible role:** auth owner, separate security reviewer, Admin reviewer.
- **Complexity:** XL.
- **Parallel work:** RBAC policy and client session work after contract freeze.
- **Blockers:** domain/cookie settings and storage IAM.
- **Production impact:** direct public-launch blocker.

## Phase 5 — Customer Web

- **Goal:** Deliver Buyer and Seller Release A lifecycle.
- **Why this phase exists:** Customer value is the primary project goal.
- **Inputs:** Customer shell, Auth, schemas/APIs.
- **Tasks:** `API-002`, `API-003`, `API-004`, `CUST-002`, `CUST-003`, `CUST-004`, `CUST-005`, continue `INT-001`, `INT-002`.
- **Dependencies:** Phases 3–4.
- **Deliverables:** catalog/search, Seller listing, reservation/mock order/shipping, chat/review/report.
- **Exit criteria:** vertical Buyer/Seller E2E passes with synthetic data; no real payment/KYC; double-sale and authorization negatives pass.
- **Risks:** transactional complexity delays customer UI.
- **Responsible role:** rotating vertical-slice owners with API/frontend reviewer pairs.
- **Complexity:** XL.
- **Parallel work:** catalog and Seller; transaction and interaction after contracts.
- **Blockers:** `API-003` concurrency/reconciliation or `AUTH-003`.
- **Production impact:** main user-facing release capability.

## Phase 6 — Admin Web

- **Goal:** Provide minimum safe public-demo administration.
- **Why this phase exists:** Public registration/content/transactions cannot launch without moderation and recovery controls.
- **Inputs:** Admin shell, RBAC, KYC, Order/Interaction APIs.
- **Tasks:** `ADMIN-002`, `ADMIN-003`. `ADMIN-004` stays Deferred/feature-flagged unless Release A approval is recorded.
- **Dependencies:** Phases 4–5 shared APIs; single-item actions before bulk.
- **Deliverables:** safety dashboard/KYC, moderation/dispute actions, audited search/filter; approved bounded data tools.
- **Exit criteria:** permission-negative tests, dangerous-action confirmation, audit, recovery, accessibility, UAT pass; unproven bulk/import/export stays disabled.
- **Risks:** mass-action or sensitive-data leakage.
- **Responsible role:** rotating Admin owner, security/operations reviewer.
- **Complexity:** XL.
- **Parallel work:** KYC Admin with Customer catalog; moderation with transaction/interaction UI.
- **Blockers:** permission model, evidence APIs, moderation policy.
- **Production impact:** minimum scope is a launch blocker.

## Phase 7 — External Integration

- **Goal:** Finalize provider seams without expanding scope.
- **Why this phase exists:** Storage/jobs are required; recommendation choice is deliberately deferred.
- **Inputs:** stable domain flows and representative synthetic data.
- **Tasks:** finish provider-neutral `INT-001` and `INT-002`; execute `INT-003` only after its one user decision. Cloud proof `INT-004` waits for Staging.
- **Dependencies:** core API/data; `DISC-001` inputs.
- **Deliverables:** GCS-backed storage, reliable workers/notifications, one selected recommendation strategy plus fallback.
- **Exit criteria:** adapter/failure/replay tests pass; recommendation is honestly labelled and measurable.
- **Risks:** speculative AI or external-provider distraction.
- **Responsible role:** integration owner, privacy/cost reviewer.
- **Complexity:** L–XL depending on selected recommendation.
- **Parallel work:** storage/jobs with feature vertical slices; strategy spike after catalog.
- **Blockers:** `ADR-008`, dataset/metric, provider credentials.
- **Production impact:** storage/jobs are blockers; recommendation personalization can fall back.

## Phase 8 — Testing and Security Hardening

- **Goal:** Prepare and run all pre-Staging quality/security work; reserve environment-dependent completion for Phase 10.
- **Why this phase exists:** Passing unit tests does not prove public or Admin safety.
- **Inputs:** deployable Release A candidate and threat model.
- **Tasks:** complete feature-level `TEST-001`; prepare/run local portions of `TEST-002` and `SEC-001`; security portions of every feature.
- **Dependencies:** critical workflows available; Staging follows Phase 9/10 ordering iteratively.
- **Deliverables:** traceability, E2E/a11y/load/security reports, residual risk register.
- **Exit criteria:** pre-Staging suites/threat remediation are ready and green; remaining environment-dependent tests are explicitly listed, not called complete.
- **Risks:** late discovery of architecture-level defect.
- **Responsible role:** independent test/security reviewers plus feature owners.
- **Complexity:** XL distributed.
- **Parallel work:** suites by independent risk area.
- **Blockers:** unstable Staging or unconfirmed targets.
- **Production impact:** direct launch gate.

## Phase 9 — Cloud Infrastructure

- **Goal:** Provision secure isolated GCP environments through IaC.
- **Why this phase exists:** Cloud resources, IAM, secrets, network, data, and budgets must be repeatable.
- **Inputs:** `ADR-005`, approved parts of `ADR-011`, architecture and deployment plan.
- **Tasks:** `INFRA-001`, infrastructure portions of `OPS-001`.
- **Dependencies:** Phase 0 inputs and stable container/data/storage needs.
- **Deliverables:** GCP projects, registry, compute, DB, storage, secrets, network, baseline observability/budgets.
- **Exit criteria:** reviewed IaC recreates Staging; IAM/network/storage negative tests pass; cost estimate approved.
- **Risks:** cost, public exposure, provider-product mismatch.
- **Responsible role:** infrastructure owner, security reviewer, budget owner.
- **Complexity:** XL.
- **Parallel work:** non-prod IaC starts after Phase 1 inputs and runs alongside later feature work; Phase number is a readiness grouping, not a reason to postpone Staging feedback.
- **Blockers:** account/credits/region/IAM authority.
- **Production impact:** establishes release platform.

## Phase 10 — Staging and UAT

- **Goal:** Rehearse the real release and operating model.
- **Why this phase exists:** Cookie, network, migration, storage, concurrency, alert, and rollback behavior differs from local.
- **Inputs:** GCP Staging, release candidate, tests/runbooks.
- **Tasks:** `DEPLOY-001`, `INT-004`, complete `TEST-002`, `SEC-001`, `OPS-001`.
- **Dependencies:** Phases 5–9 minimum slices.
- **Deliverables:** immutable staging pipeline, UAT, load/failure tests, restore and rollback drills.
- **Exit criteria:** two repeat deployments, rollback, restore, alerts, critical E2E and human UAT pass.
- **Risks:** environment drift or missing operational owner.
- **Responsible role:** release owner, tester, security reviewer, human approver.
- **Complexity:** XL.
- **Parallel work:** independent UAT/security/load/restore scenarios within bounded environment.
- **Blockers:** failed gates or unresolved `ADR-011`.
- **Production impact:** final evidence rehearsal.

## Phase 11 — Production Launch

- **Goal:** Open the public GCP demo safely around the confirmed course deadline.
- **Why this phase exists:** Production needs explicit go/no-go and rollback authority.
- **Inputs:** signed Staging evidence, approved launch checklist, immutable digest.
- **Tasks:** `DEPLOY-002`, final `DOC-001`.
- **Dependencies:** all launch blockers closed; Admin minimum scope and `OPS-001` complete.
- **Deliverables:** public TLS URL, release record, external smoke, monitoring window, rollback-ready revision.
- **Exit criteria:** checklist signed, smoke/metrics/alerts healthy, demo warnings visible, no unresolved blocker.
- **Risks:** launch incident, abuse, unexpected cost.
- **Responsible role:** human release owner and incident team; AI assists but does not approve.
- **Complexity:** L.
- **Parallel work:** none on traffic/migration critical step.
- **Blockers:** any failed release criterion.
- **Production impact:** public availability.

## Phase 12 — Monitoring and Continuous Improvement

- **Goal:** Keep the demo stable and learn from evidence.
- **Why this phase exists:** Production is an operating state, not the end of coding.
- **Inputs:** real logs/metrics/incidents/UAT feedback.
- **Tasks:** recurring `OPS-001`, `DOC-001`; optional `INFRA-002` only after approval; new tasks require new IDs.
- **Dependencies:** Phase 11 stable.
- **Deliverables:** tuned alerts/cost/capacity, incident improvements, restore schedule, prioritized evidence-based backlog, optional AWS portability report.
- **Exit criteria:** owners review signals and close actions; AWS resources are capped/torn down.
- **Risks:** feature expansion before stability.
- **Responsible role:** rotating operations owner, human budget/incident owner.
- **Complexity:** M recurring; `INFRA-002` L.
- **Parallel work:** monitoring improvements and documentation; Stretch isolated.
- **Blockers:** unresolved Production issue blocks Stretch.
- **Production impact:** sustained reliability and honest future planning.

## Critical path summary

`DISC-001` → `FOUND-001`/`ARCH-001` → `FOUND-002`/`DB-*`/`API-001` → `AUTH-*` + Product/Order/Interaction APIs, while `INFRA-001` creates non-prod → `CUST-*` + minimum `ADMIN-001`–`ADMIN-003` → `DEPLOY-001`/`INT-004` → complete `TEST-002`/`SEC-001`/`OPS-001` → `DEPLOY-002`.

## Task traceability

All Task IDs appearing here are defined exactly once in:

- Customer/Shared/Infrastructure: `planmain.md`
- Admin-specific: `planadminweb.md`

Status is tracked only in `progress.md`; Decision rationale is in `decision.md`; architecture and deployment references are in `architecture.md` and `deployment.md`.
