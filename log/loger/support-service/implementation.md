# Support ER alignment implementation — 2026-10-14

Scope/authorization: implementation sub-agent, approved whole scope (“เริ่มได้ bro make no mistake”), shared checkout `C:/ise/Ise`. No commits; no auth/product/order/shared-script/root-log edits. No real DB or `.env` changes. Sources inspected: this service's decisions, Chat decisions, loger README, archived audit Customer section, actual editable Customer ER ข้อ 1 and runtime callers.

## Delivered files and behavior

- `backend/services/support-service/prisma/schema.prisma`: mapped physical keys to `ticket_id`, `target_user_id`, `audit_event_id`, `article_id`; public Prisma properties/API identifiers remain unchanged. Removed `TicketMessage`, queue/risk/responder scalar fields and target `cycle`. Retained composite Help revision PK and `published_at` because its callers remain active.
- `prisma/migrations/20261014000000_approved_er_event_ownership/migration.sql`: transactional preserving contract upgrade. Guards verify every legacy message's fingerprint/receipt/current conversation link and exact ordered legacy SLA rounds before removing storage. Keeps actual target IDs/due/achieved/breached values and policy references. Missing, ambiguous or incomplete reopen history blocks instead of guessing. Removes obsolete pre-normalization projections/duplicate logs and triggers after preserving normalized history. Existing baseline files and `prisma/migrate.js` guards remain unchanged. No db-push or fake resolve-applied.
- `prisma/migrateMessagesToChat.js`: reads the pre-contract archive via raw SQL so the final generated client does not need a removed model. Dry-run is read-only; apply imports/validates each message through Chat, then writes only a fingerprint/IDs/verification receipt. Checks source again inside a transaction. Rerunnable deterministic source IDs; missing mirrored originals and outages fail without dropping history. Imports do not broadcast history. Richer original Chat staff roles/edited attachments are preserved rather than recreated from flattened Support mirrors.
- `src/features/tickets/ticketEvents.js`: centralized event projections and SQL selectors. `QUEUE_CLASSIFIED` stores score/risk/classification snapshot; `CHAT_RESPONDER_CHANGED` records explicit responsibility independently of assignments. `TICKET_OPENED`/`TICKET_REOPENED` store startedAt, sourceHistoryId, exact target references and policy snapshot. Round number is in payload only; unique round index is SQL-enforced. Target ticket/policy FKs remain SQL-enforced; JSON reference writes are service-transactional, not a claimed JSON FK.
- `ticketModel.js`, `ticketShape.js`, `agentDashboard.js`, `ticketTrend.js`, `sla/slaMonitor.js`: updated all active field/SQL consumers to events and mapped identifiers. Reopen creates a fresh resolution target using recorded policy, preserving earlier targets/outcomes. Completion/monitor update only effective targets. Claims/escalations explicitly record responders; takeover preserves responder instead of equating it with the new owner. API scores/counts/responder and `sla.cycle` remain projections.
- `ticketService.js`: missing room is explicitly unavailable rather than successful empty history; existing outage flag/error handling and Chat-only replies remain. Public INTERNAL double-filter remains.
- `help-content/helpModel.js`: mapped key SQL reads; revision/publication behavior retained. `audit/auditQuery.js`: existing export fields derive from structured payload without exposing payload internals.
- Customer `ข้อ 1/customer-service-คน-er.drawio` and `approved-amendments.md`: canonical snake_case table labels, explicit revision composite PK, retained publication timestamp, ownership/event notes. Adjacent PDF is explicitly identified as original archive, not regenerated.
- Tests updated for removed persistence fields; added `test/er-event-state.integration.test.js`, `test/er-preserving-upgrade.integration.test.js`. Chat import implementation/tests are detailed in the Chat implementation log.

## Event data preservation

New classifications retain supplied scoreCase result, riskLookupAvailable and policy ID. Existing queue rules consume the stored report count, never a current risk lookup for history. Legacy migration preserves the already stored score/count and available CLASSIFY payload; unavailable historical inputs are explicitly unknown. Existing responder is recorded as observed at migration; earlier responsibility times are not fabricated.

Legacy policy snapshots are explicitly marked `snapshotSource=policy-row-at-migration`: actual target policy ID/effective window and available policy row values are retained, alongside unchanged target due/outcome timestamps. A historically overwritten policy duration that was never recorded cannot be reconstructed; this is not presented as a recovered historical snapshot. New rounds have exact creation-time policy snapshots and are stable under later policy-row edits.

Initial creation is an atomic READ COMMITTED transaction: immutable initial rows, database unique keys/sequence, no shared read-check-write invariant. Keeping SERIALIZABLE for independent inserts produced measured cross-ticket SSI false conflicts on small audit indexes. Claims/transitions/correlation/delivery still use existing serializable retry/version gates; no shared retry policy was changed. Four parallel ticket creates now pass, as do parallel claims, duplicate event delivery and reopen.

## Executed evidence

Environment: parent-owned `ise-er-rehearsal-20261014`, `127.0.0.1:55439`, role/password `er_test`. Created separate `support_worker_er` and `chat_worker_er` using `docker exec ... psql -U er_test -d postgres`; `er_test` is the role, not an existing database. Reset only these owned disposable schemas during repeated rehearsals. `chat_worker_er` is the **PostgreSQL populated Support upgrade fixture**, not a claimed Mongo Chat database.

- Support and Chat `prisma validate`: pass. Generated clients independently in each service's configured `src/generated/prisma-client`; no hoisted client overwrite.
- Full fresh Support `node prisma/migrate.js`: all five migrations applied successfully on empty `support_worker_er`; `node prisma/seed.js`: pass.
- Populated upgrade test: four previous migrations deployed first, then fixtures with public/INTERNAL history, separate owner/responder, preserved score/risk, old Help revision and two SLA rounds. Unverified messages blocked contract; rollback retained source rows. Chat outage wrote no receipt. Import through real Chat HTTP controller with isolated storage verified both records; rerun kept exactly two Chat messages. Changing source body after receipt blocked contract. Missing real reopen correlation blocked contract. After repair, contract deployed; original target IDs/policy IDs/due/achieved values and Help body remained exact. Responder differed from assignee after upgrade. This is real PostgreSQL preserving-upgrade execution, but not real Mongo persistence.
- Final focused Support run: **63 passed, 0 failed, 0 skipped**, `--test-concurrency=1`, 15 selected files (below). Coverage includes API requester/staff/stranger checks, INTERNAL filtering, unavailable history, retry/correlation, claim/version/rollback, takeover without responder substitution, four simultaneous creates, concurrent reopen, metadata delivery dedupe, previous SLA results unchanged, recorded policy unaffected by later edits, duplicate round constraint, one-shot monitor, Help search/publication/FK and concurrent revisions, trend over 50 cases.
- `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --script`: empty migrations against both fresh and upgraded disposable schemas. This does not replace checks of custom partial indexes/checks which Prisma does not model.
- XML/scalar manifest check: **13 model/table attribute sets match**, zero differences/duplicate XML IDs; revision version is underlined. This is XML/schema evidence, not a PDF export/visual certification.
- Scoped `git diff --check`: exit 0; only Git line-ending conversion warnings.

Final run (service cwd, environment set only on child process):

```text
DATABASE_URL=postgresql://er_test:er_test@127.0.0.1:55439/support_worker_er
DATABASE_URL_DASHBOARD=same disposable URL
SUPPORT_ER_UPGRADE_URL=postgresql://er_test:er_test@127.0.0.1:55439/chat_worker_er
REQUIRE_INTEGRATION=1
node --test --test-concurrency=1 --test-reporter=tap
  src/features/tickets/chatOwnership.test.js src/features/tickets/ticketService.test.js
  src/features/tickets/ticketModel.test.js src/features/tickets/workspacePolicy.test.js
  src/features/internal/internalRoutes.test.js src/services/chatClient.test.js
  test/audit-query.test.js test/chat-continuity.test.js test/ticket-trend.integration.test.js
  test/help-content.integration.test.js test/er-preserving-upgrade.integration.test.js
  test/er-event-state.integration.test.js test/normalization.integration.test.js
  test/ticket-lifecycle.integration.test.js test/sla-escalation.integration.test.js
```

Raw final output is locally retained in ignored `backend/services/support-service/test/er-focused-results.log`. The preserving test requires the explicit rehearsal DB allowlist and an empty upgrade database; it must not be pointed at production. In the test only, genuinely failed atomic contract migrations are marked rolled-back to retry after fixing fixtures, never resolved-applied to evade guards.

## Luna-owned rehearsal (continuation verification)

To honor the implementation task's database isolation, created separate databases `support_luna_er` and `chat_luna_er` in the supplied disposable PostgreSQL container (`127.0.0.1:55439`, role `er_test`). No worker-owned database was modified. Changed only the preserving-upgrade test's explicit allowlist/diagnostic database and the dashboard trend test's explicit allowlist so those tests can target the Luna-named databases.

- Fresh `support_luna_er`: Support `prisma validate`, isolated Support `prisma generate`, all five migrations, and seed completed successfully.
- Populated `chat_luna_er`: full preserving-upgrade test completed successfully. It verified expected guard failures/atomic rollback, Chat outage with no receipt, real Chat HTTP import endpoint/token boundary with isolated storage, public and INTERNAL history retention, retries (two source rows remained two Chat records), source mutation protection, missing-reopen guard, final contract deployment, source ticket/help/SLA preservation and deletion of `ticket_messages` only after both receipts verified.
- Scoped Support/Chat focused run: **63 passed, 0 failed, 0 skipped** across 15 Support files; **39 passed, 0 failed, 0 skipped** across 10 Chat files. Support cases include public reply and reopen, claim/queue/responder projections, SLA rounds/snapshots, Help draft/publish and revision concurrency, privacy filtering, and importer history guards.
- `prisma migrate diff --from-url ... --to-schema-datamodel ... --script`: empty on both fresh `support_luna_er` and fully upgraded `chat_luna_er`.
- Scoped `git diff --check`: exit 0 (only Windows line-ending warnings).

The populated-upgrade fixture is intentionally destructive to its own disposable database and requires a fresh `chat_luna_er` before rerun. No real Mongo/Redis or customer history was involved; see limitations below.

## Parent demo-script adaptation note (not edited here)

` scripts/demo-cs-admin.js` is outside this worker's allowed scope and has not been changed. The generated Support Prisma client has no `supportTicket.update({data:{chatResponderId}})` field (the field is now a virtual event-backed projection), and the demo's `include: { messages: true }` is invalid because Support no longer owns a message relation. Parent adaptation should set responder through the Support ticket service/event API (or omit it when not needed) and obtain chat transcripts from Chat with proper requester/staff visibility, not Prisma's removed Support relation. Existing `ticketModel.create` remains the API for virtual classification/SLA fields; do not pass those virtuals directly to raw Prisma writes. Recheck demo seed + verification after the parent adapts it.

## Deployment order / blocked and uncovered work

1. Stop pre-normalization/legacy Support writers; back up both stores. Complete the existing migrations through `20261010120000_ticket_chat_responder` first. Existing full deploy intentionally stops at the new guard if history is not migrated.
2. Deploy Chat's token-gated historical import path/idempotency indexes and confirm Mongo replica-set health. Generate the isolated final Support client for raw migration tooling; do not start final Support runtime against pre-contract identifiers.
3. Run Support `node prisma/migrateMessagesToChat.js` dry-run, then `--apply` with real internal Chat connectivity. Verify receipts/import count/history; restore missing originals or explicit reopen correlations if guards report gaps. Do not fabricate them.
4. Run the existing `node prisma/migrate.js` helper to apply the contract, then start final Support runtime. No baseline/resolve-applied bypass.

**Uncovered / blocked:** the approved rehearsal container is PostgreSQL while Chat uses MongoDB and Redis. No new Mongo/Redis infrastructure was created outside the supplied scope. Chat tests/import HTTP paths use isolated storage; real Mongo indexes, Mongo transaction durability, actual Support↔Chat HTTP/worker restart/Redis fanout and live socket/attachment integration remain to be rehearsed on an authorized disposable replica set. No real history was migrated. PDF export was not regenerated. Full repository/broad npm suites were deliberately not run concurrently.

**Scope blocker for end-user retry parity:** `frontend/components/support/sections/LiveSupportSection.js:237–241` sends internal notes without `eventKey`/`Idempotency-Key`. Backend preserves this legacy input contract and guarantees dedupe when the caller retains the same key; it cannot distinguish a keyless retry from an intentional second identical note. Fixing that caller/retry state requires frontend scope, not a body-derived fake key or silently breaking the API. It was inspected but not edited; parent must resolve this before claiming every UI retry is duplicate-free.

Outside owned scope: `scripts/generate_customer_service_current_er_drawio.js` still mentions legacy `ticket_messages`, and `database/schema.md` remains an older generated snapshot. Neither was edited; parent must account for them before claiming repo-wide documentation/regeneration parity. No active shared runtime SQL consumer of the removed columns was found; shared dashboard fixture SQL is an independent TEMP-table test and was left untouched.

Skills used: nes-mode, context-mode | References: Harness, Senior Mentor | Playbook: Refactoring.
