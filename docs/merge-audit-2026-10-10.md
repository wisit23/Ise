# Merge audit and integration plan — 2026-10-10

Execution plan: [แผนรวมระบบและ acceptance gates](merge-execution-plan-2026-10-10.md). User decisions confirmed after this audit: use Buyer Order schema as the foundation and extend it for all other features; preserve all legacy data and block cutover until mappings are complete. The execution plan supersedes provisional choices in the proposed plan below.

## Scope and verification status

Read-only pre-merge audit of committed main and seven remote branch tips, plus inventory of the current dirty workspace. Reviewed Git ancestry, changed-file ownership, gateway routing, runtime topology, schema changes, selected controllers/services/callers, migration instructions and CI gates. This is not an exhaustive line-by-line review or a runtime certification. No merge, deployment or database modification was performed.

Node is v24.14.1 and npm is 11.18.0. Docker server inspection was denied by local pipe permissions; database integration and live E2E checks were not run. Existing branch documents describing successful tests are historical evidence, not tests rerun for this integration.

## Pinned inputs

Main: `d263e44`; previous integration merge: `8fe8c22` (2026-09-22).

| Remote branch | Pinned tip | Commits outside main |
| --- | --- | ---: |
| buyer | 942d7d0897010783c2708d653eafdaaf3b0bec67 | 2 |
| ceo | 5767886d1ec413ac8562f9fd62c55d7721207d8f | 1 |
| chat | a74320f2610cb217251ec3cf8fa7e7094f4f3989 | 3 |
| customer-service | cb62a9a6326106eece428766154e0b0b6d61516d | 2 |
| marketing | 25aeb5fee9519fbf92fba1c81f465207782121e5 | 3 |
| seller | cc08206453d73c47d9441bd5c403b0e4622f71c3 | 5 (includes two merges) |
| trust-safety | 43bccda46fc457126b7f8b05e03347629d0d53fc | 1 |

No new commits outside main: banUser, feature-admin, feature/trust-safety-search, tsr-02-complete. Re-fetch and compare pinned SHAs before execution; any movement requires reviewing the additional delta.

## System map

Main is a Node/npm workspace monorepo: Next.js frontend, Express gateway, shared auth/permissions helpers and six backend services.

| Owner | Main responsibility | Storage / integration |
| --- | --- | --- |
| Auth :3001 | Identity, roles, KYC, reports, admin/executive audit and metrics | PostgreSQL auth database; internal moderation calls |
| Product :3002 | Catalog, media, reservations, auctions, campaigns, vouchers, articles | PostgreSQL product database; Redis/jobs; Order calls |
| Order :3003 | Checkout, payment simulation, shipping/status, disputes and holds | PostgreSQL order database; Product/Auth/Chat calls |
| Chat :3004 | Conversations, messages, private attachments, realtime | MongoDB replica set; Redis; case-access/internal APIs |
| Review :3005 | Reviews and review uploads on main | PostgreSQL review database; Order eligibility |
| Support :3006 | Tickets, assignment, SLA, FAQ, case audit | PostgreSQL support database; Order/Chat/Auth integrations |

Gateway :8080 proxies frontend/API and public media; services enforce authorization too. Cross-service references have no cross-database FK or transaction. Review ownership moves into Product in buyer; ticket messages move into Chat in customer-service. Preserve the public `/api/reviews/*` and `/review-uploads/*` routes while changing their destination.

## Confirmed findings and integration risks

### F01 — Dirty workspace is a separate integration input

At audit time `git status --porcelain` had 346 entries, including 166 tracked modified entries; untracked directory entries may contain multiple files. Both staged and unstaged work exists. Most runtime changes concern CS/Chat/Order/Admin; unrelated generated documents, mockups and temporary tooling also exist.

`git diff origin/chat` alone cannot identify missing work: tracked comparisons display files existing only as untracked files as deletions. Compare committed trees, index, working files AND untracked contents. Preserve all user files and the staged/unstaged distinction before any checkout. Do not reset, clean, blindly stash everything or commit all files indiscriminately.

### F02 — Buyer changes the Order domain, not just adds fields

Evidence: buyer `backend/services/order-service/prisma/schema.prisma` and `prisma/ER_MIGRATION.md`.

Buyer replaces CheckoutSession/OrderHold/ProductSyncEvent/AdminDisputeEvidence/DisputeAudit concepts with Basket, Checkout, Payment, Shipping, Hold, OrderLog and evidence-specific safety/audit models. Amounts become Decimal(18,2), holds attach to payments, and evidence deadlines move to individual evidence. Legacy delegate/column names therefore cannot survive by accepting all incoming code unchanged.

The migration document explicitly says migration is pending missing legacy values, including address IDs, payment history and dispute type. Its October 7 database inspection is historical, not a current database count. Block deployment against existing data until a preserving mapping and rehearsed migration exist. Do not infer historical values or use destructive db push.

### F03 — Buyer frontend/API contract mismatch

Evidence: buyer checkoutSessionController/Service require `addressId`; `frontend/app/checkout/page.js` sends orderIds and shippingAddress without addressId. Buyer disputeController/Service require `disputeType`; no addressId/disputeType matches were found in buyer frontend. Check both orders-page and OrderDisputeForm callers.

Fix these callers with real selected address identifiers and a supported dispute-type choice; verify HTTP contracts together, not only mock-based component tests. Shipping callers also need checking against company/trackingNumber requirements. Do not fill required values with invented defaults.

### F04 — CS and Chat are divergent overlapping branches

101 changed paths overlap. Neither tip contains all commits of the other: customer-service-only commits are ac74b97/cb62a9a; chat-only commits are 63faf47/eae8745/a74320f. Chat also carries support normalization and shared policy/dashboard files, so branch name is not an ownership boundary.

Compare each shared path's actual contents. Keep normalized Support reference/status/assignment/SLA/audit/history data, archive legacy ticket messages until transfer verification, and retain newer Chat access/composer/dashboard behavior. Dispute priority/SLA fields and CS assignment operations must be ported onto the chosen Order domain.

### F05 — Trust & Safety consumes removed Order models

Evidence: trust-safety `adminDisputes/adminDisputeService.js` uses prisma.disputeAudit, prisma.adminDisputeEvidence, paymentSimulationStatus and payoutHeld. These do not match buyer's new domain.

Port hold/release, evidence verification, sanctions and audit to the reconciled Payment/Hold/evidence model. Preserve independent hold reasons: a dispute resolution must not release a T&S/account hold. Test permission, concurrency and idempotent retries. Product moderation overlay and durable ProductModerationCommand must coexist with reservation/auction transitions.

### F06 — Marketing attribution needs money/model reconciliation

Marketing adds AttributionOutboxEvent with Int gross/discount/net amounts; buyer stores Decimal amounts and replaces older Order fields. attributionOutboxService requires the generated attributionOutboxEvent delegate and sends order.completed.v1.

Define exact amount units and serialization across Order -> Product. Preserve a durable retryable attribution record committed with completion; avoid duplicate attribution after retries. Reconcile Product schema so campaigns, reviews and moderation commands all remain. Inspect auction winner-order creation and cancellation against buyer's new checkout/payment/hold semantics.

### F07 — Seller payment-to-chat hook must survive the rewrite

Seller adds chatClient.notifyOrderPaid after checkout confirmation. Port this behavior into the new payment confirmation path, preserving multi-order behavior and retry safety. Test shipping required inputs, status rendering and paid-order chat continuity.

### F08 — Deployment / migration / CI cannot simply use one branch version

Buyer reroutes reviews to Product, mounts existing review media there and removes review schema setup from CI. CEO changes production Compose and frontend production Dockerfile. CS introduces baseline/deploy migration handling and PostgreSQL-specific functions/partial indexes; CI currently pushes Support schema instead of executing this migration chain.

Use an isolated test DB to verify both new-install and legacy-upgrade paths. Ensure CI uses migration/seed setup needed by support ticket-number functions and partial uniqueness. Keep legacy review DB credentials available until copying/count verification completes. Check Compose, production Compose, Kubernetes, env examples, startup commands and lockfiles against one final topology.

### F09 — Repository artifacts require review

trust-safety changes include output/, outputs/, tmp/ and .codex_tmp_review_comments paths. Inventory whether each belongs in the deliverable before integration; do not silently omit committed branch work. Existing docs/merge-plan.md and architecture.md still cite the September 9 baseline; update integration documentation to the actual final tree.

## Changed-path overlap (risk indicator, not conflict count)

| Pair | Shared changed paths |
| --- | ---: |
| chat / customer-service | 101 |
| marketing / trust-safety | 38 |
| customer-service / trust-safety | 37 |
| chat / trust-safety | 36 |
| buyer / trust-safety | 26 |
| chat / marketing | 22 |
| customer-service / marketing | 17 |
| buyer / marketing | 15 |
| buyer / chat | 13 |
| buyer / customer-service | 12 |

Read-only three-tree merge simulation of each branch against committed main produced textual conflict markers for CEO in docker-compose.prod.yml and frontend/Dockerfile.prod. Other individual branches had no markers. This does NOT simulate the cumulative seven-branch merge, include dirty work, or establish semantic compatibility. Sequential conflict lists must be regenerated against each resulting integration tree.

## Proposed execution plan

Chosen approach: isolated integration checkout with pinned inputs and a manually reconciled domain model. Sequential blind merging or wholesale ours/theirs resolution would lose behavior. Ordering reduces rework but does not resolve the semantic conflicts above.

1. Preserve and classify local work. Save recoverable tracked/index/untracked snapshots, exclude credentials from published artifacts, and record local-only runtime deltas separately from docs/mockups/tool outputs. Use a separate checkout based on d263e44, named codex/integration-20261010, without changing the current dirty checkout. Review suitable existing worktrees before creating one.
2. Establish clean-main baseline. Install pinned dependencies in the isolated checkout, generate clients and run existing backend/frontend/build checks against disposable DBs. Record failures/skips before integration; do not use dirty-workspace results as main baseline.
3. Reconcile database/API contracts first. Write target model and old-to-new mapping for Order/Payment/Hold/Dispute, Support normalization, Product Review/Campaign/Moderation, and Auth roles/audit. Decide which information must remain accessible historically. Buyer schema is a proposed foundation, not an automatic winner; extend or adapt it where other required features need data. Unresolved legacy mappings block data cutover, while code integration can continue with fresh disposable DBs.
4. Integrate buyer as the commerce foundation. Close F03; preserve reviews migration/media routes; add preserving Order migration work. Pass checkout, voucher, reservation expiry, Decimal totals, shipping, review eligibility and dispute-open tests.
5. Integrate customer-service, then chat as one coordinated batch. Reconcile shared paths explicitly and adapt disputes to step 3. Verify Support baseline/normalization, message transfer, assignment/SLA and case authorization before accepting the combined tree.
6. Integrate trust-safety. Port legacy model usage to the reconciled schema; preserve multi-source holds, evidence audit, roles/sanctions and product moderation overlay. Run negative-permission, replay and concurrency scenarios.
7. Integrate marketing. Reconcile Product and Order schemas, durable attribution and decimal amounts. Verify auction winner-order callbacks, cancellation compensation, voucher reservation/redeem/release and campaign budgets.
8. Integrate seller. Preserve payment-to-chat notification, tracking/company requirements and status UI on the finalized commerce contracts.
9. Integrate ceo. Reconcile complaint/report projections with normalized Support and Auth data. Resolve production Docker/Compose conflicts from final runtime requirements. Verify search, detail visibility, filters and role permissions.
10. Apply verified local-only deltas once. Recompare local snapshot against the integrated tree; apply missing runtime behavior with focused commits, not a replay of already integrated files. Report unrelated local artifacts separately.
11. Run final validation and migration rehearsal. Fix integration regressions, record baseline debt and update docs. Review cumulative diff and input ancestry. Main merge/push/cutover are separate execution stages; this audit performs none of them.

Each branch addition should have a traceable merge record and focused integration-fix commits. Stop at the current stage if its gate fails; do not accumulate further unresolved schema changes. Roll back integration code by discarding/reverting isolated commits; database rehearsal uses disposable copies. Live rollback must include schema/data compatibility and preserved media, not just a Git revert.

## Required acceptance gates

- All seven pinned tips represented in integration ancestry; every intended feature retained or explicitly dispositioned. No untracked local feature lost.
- npm ci reproducible; one coherent lockfile/dependency set; Prisma clients generated independently per service; lint, formatting and secret scan; backend tests; frontend tests; production build.
- REQUIRE_INTEGRATION=1 in an isolated PostgreSQL + Mongo replica set + Redis environment; zero silently skipped required integration scenarios.
- Fresh database startup AND preserving legacy upgrade tested. Check row counts, key mappings, orphan references, monetary totals, statuses, message IDs/order/timestamps and attachment access. Rerunning interrupted migrations must be safe.
- Buyer purchase -> checkout/voucher -> confirm -> seller ship -> complete -> review. Duplicate confirm and auction callbacks, cancellation, reservation expiry, address changes and fractional amounts included.
- Ticket -> assignment -> customer/agent chat -> internal note isolation -> escalation -> resolution. Message migration does not duplicate or expose internal notes; reconnect and unauthorized room/attachment requests covered.
- Dispute -> evidence -> manual deadline -> safety review -> decision, with independent overlapping T&S/account holds. Releasing one source preserves the others; parallel claims/decisions cannot double-apply.
- Auction/campaign budget changes and cancellation -> Order compensation -> durable marketing attribution with retry and deduplication.
- Ban/session revoke, multi-role access, complaint detail/search, moderation remove/restore during reserved/sold transitions, audit attribution and staff dashboards.
- Compose and production Compose agree on service URLs, DB/migration order, private/public storage and health dependencies. Kubernetes configuration validated for the selected final topology; no live deployment in this phase.

## Evidence sources

Git ancestry and three-dot diffs against the pinned refs; main gateway/src/app.js, docker-compose.yml, .github/workflows/ci.yml and package manifests; buyer order schema/controllers/services, ER_MIGRATION.md and Product REVIEW_MIGRATION.md; CS/Chat schemas and migrate/migrateMessagesToChat; marketing Order schema and attributionOutboxService; seller checkout confirmation diff; trust-safety Auth migration, Product schema and adminDisputeService. Branch-specific file references above must be read at their pinned Git ref, not assumed to match the dirty workspace.


## Execution update — 2026-10-11

All seven branch tips are integrated and core validation passed. See [validation results and remaining cutover gates](merge-validation-2026-10-11.md). Git merge and database cutover are separate; legacy mappings remain a cutover blocker.
