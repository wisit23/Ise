# Support / Chat ER alignment — read-only code review (Sonnet 5.5 sub-agent)

Scope: existing diff and new files for `backend/services/support-service`, `backend/services/chat-service`, `scripts/demo-cs-admin.js` and its test. No source edits, no commits, no `.env` reads, no database writes. Parent reviews independently.

## Guides actually read

- `C:\Users\nes\.pi\agent\skills\nes-mode\SKILL.md`
- `ref\harness.md` (full)
- `ref\senior-mentor.md` (full)
- `ref\software-playbooks.md` sections "Backend and API" and "Review" only (lines 7–15)
- Project logs: `log/loger/README.md`, `support-service/decisions.md` (partial, preview), `support-service/implementation.md`, `chat-service/implementation.md`, `chat-service/real-mongo-rehearsal.md`, `demo-consumers.md`
- Not read: `playbooks/*`, `wayfinder-unified.md`, `greatest-teacher.md`. I did not invoke the `code-review` skill; I applied the "Review" section of `software-playbooks.md` (rank by consequence, cite evidence, separate confirmed from cleared).

## Findings (most severe first)

### 1. HIGH — demo seed fails for the CLOSED ticket: assignment ends before it starts (`assignment_time_window`)

- `scripts/demo-cs-admin.js:555-573`: fixture creates ticket `NEW`, then `ticketModel.assign(...)`, then `ticketModel.transitionStatus({ at: daysAgo(0.5) })` for `CLOSED`.
- `assign` stamps `assignedAt = new Date()` (`ticketModel.js:324-345`, `const now = new Date()`). `transitionTx` on `CLOSED` runs `ticketAssignment.updateMany({ data: { endedAt: at } })` (`ticketModel.js:436-440`) with `at` = 12 hours in the past.
- Constraint still present after the contract migration: `20261007000000_normalize_customer_service/migration.sql:302` `CHECK(ended_at IS NULL OR ended_at>=assigned_at)`.
- Result by reasoning: `ended_at` (now − 12h) < `assigned_at` (now) → check violation → serializable transaction aborts → `transitionStatus` throws → `--apply` aborts after the ticket was created and partly seeded. The old code avoided this by creating the closed assignment with an explicit `endedAt`.
- Evidence level: source + constraint trace. **Not executed** (demo was never run with `--apply`; `demo-consumers.md` says so). Decisive check: run the demo against a disposable DB.
- Related lower issue (same lines): `ASSIGNED` history/assignment use real "now" while later transitions are back-dated, so the timeline shows assignment after escalation/closing for tickets 2–4.

### 2. HIGH — demo calls bypass the demo's rewritten Support client

- `scripts/demo-cs-admin.js:555` and `:564` call `ticketModel.assign` / `ticketModel.transitionStatus`. Neither accepts a client (`ticketModel.js:324`, `:455`); both use the module-level client `src/models/prismaClient.js`, which reads raw `process.env.DATABASE_URL_SUPPORT`.
- The demo deliberately rewrites host `postgres` → `localhost` only for its own `support` client (`localComposeUrl`, demo lines 153-171) and passes `support` explicitly to `create`, `setConversationId`, `recordChatMessage`. `.env.example:15` ships `@postgres:5432`.
- Result by reasoning: when run from the host as documented (file header), `assign` tries the unrewritten host and fails ("can't reach database server `postgres`"); if the host did resolve, it would write through a different client than the one that is reset/verified. Previous code used `support.supportTicket.update(...)` with the right client, so this is a regression.
- `scripts/demo-cs-admin.test.js:19-26` only greps the source text; it would not catch either #1 or #2. Not executed here.

### 3. MEDIUM — real-Mongo rehearsal "indexes exist" claim is circular

- `real-mongo-rehearsal.md` states `Conversation.contextKey` and `Message.idempotencyKey` "exist as unique Mongo indexes". In `chat-service/test/er-mongo-preservation.integration.test.js:49-61` the test itself runs `createIndexes` and then asserts them.
- `chat-service/Dockerfile` states runtime never creates indexes and there is no `db push` outside CI. So the rehearsal does not show the indexes exist in a real deployment; it shows Mongo enforces them when present.
- Impact on migration safety is limited: the importer's idempotency rests on deterministic `_id` (`keyedId`) and `P2002` on `_id`, which Mongo always enforces (concurrent 201/200 test is valid for that). Documentation should say the unique-index deploy step is required/unverified.

### 4. LOW/MEDIUM — new event types appear in the Admin audit API

- `audit/auditQuery.js:34-70` has no event-type filter. After the contract, `MESSAGE_MIGRATED` (one per legacy message, actor `migration:chat`), `QUEUE_CLASSIFIED`, `CHAT_RESPONDER_CHANGED`, `TICKET_OPENED/REOPENED` rows show up in lists/counts/exports, with `operationId = dedupeKey` (`legacy-chat:<id>`). No message body is returned (checked: only `reason/fromValue/toValue` from payload), so no privacy leak; but totals and pagination change and the feed is polluted. Product decision for parent whether to exclude projection events.
- Receipt payload carries `legacyFingerprint` = md5 over the row including `body` (`migrateMessagesToChat.js:11-14`). Not exposed by the API; short bodies are guessable by anyone with DB read. Minor.

### 5. LOW — strict SLA reference check makes one bad ticket fail whole pages; reopen behaviour changed

- `ticketEvents.js:26-39` `effectiveTargets` throws 503 if any target is unreferenced by a round event. `toTicket` runs on every row of `listQueue` (`ticketModel.js:305-307`), so one inconsistent ticket yields 503 for the entire queue page, `findById`, and `markAchieved`. Reachable only via direct DB edits/partial data (create and reopen write target+event atomically; migration covers legacy targets). Design-risk, not reproduced.
- `ticketModel.js:422-424`: reopen now throws 503 when no RESOLUTION target exists; old code silently skipped creating one. Unlikely in normalized data (targets always created).

### 6. LOW — importer can hard-block rare real data (blocks, never corrupts)

- `supportMessages.js:77-81` / `migrateMessagesToChat.js:56-58`: a mirrored message of a requester who is also staff (Support labels `REQUESTER` because `authorId === requesterId`, Chat original role `AGENT`/`ADMIN`) fails the role check with 409; the guard rightly stops the contract but there is no repair path other than editing history.
- Contract guard `20261014000000…/migration.sql` (SLA rounds): any legacy ticket with RESOLVED→IN_PROGRESS history but only cycle 1 targets raises and blocks the migration. Safe but needs a pre-flight query before deployment.

## Checked and cleared (with evidence level)

- **SLA/responder/queue projections** (`ticketEvents.js`, `ticketModel.js`, `ticketShape.js`, `slaMonitor.js`, `agentDashboard.js`, `ticketTrend.js`): SQL ordering (`ticketVersion`, `created_at`, id) matches the in-memory `state()` ordering; `activeTarget` alias `st` and `stateJoins` aliases `q`/`cr` are present everywhere `queueFilter`/ordering use them (trend, queue, dashboard); migration round `dedupe_key` format equals runtime `sla-round:<ticket>:<cycle>`; reopen creates round event + target in one transaction. Source-traced; DB behaviour relies on the logs' reported runs (not re-run by me).
- **Removed-field callers**: grep over `*.js` outside generated code/node_modules for `ticketMessage`, `supportTicket.update/create`, `chatResponderId:`, `priority_score`, `risk_report_count`, `ticket_messages`, `cycle`, raw `t.id`: only the demo script (fixed apart from #1/#2), `ticketService` (uses API projections) and shared dashboard (own alias `priority_score`, independent) remain. `scripts/generate_customer_service_current_er_drawio.js` and `database/schema.md` still mention old names (already declared by the implementer).
- **Privacy**: `getTicket` INTERNAL double filter intact (`ticketService.js:156-184`); import path is token-gated; import does not broadcast, touch preview, or replay to Support (SYNCED fix in `supportMessages.js:94-98`); receipts hold fingerprint/IDs, no body. Pre-existing (unchanged) observation: `toRequesterView` spreads the ticket, so requesters receive `priorityScore`, `riskReportCount`, `chatResponderId` as before.
- **Import receipt/idempotency**: fingerprint in the importer and in the contract guard use identical expressions; guard recomputes from current row (post-receipt edits block); receipt upsert `ON CONFLICT(dedupe_key)` is rerunnable; Chat outage throws before receipt; missing mirrored original → 409 (no fabrication).
- **Migration SQL**: ordered drops (4 child triggers, functions), constraint rename name matches `20261007…:295`, partial unique index on `payload->>'cycle'` + shape CHECK are consistent with `recordRound`; `timestamptz AT TIME ZONE 'UTC'` fingerprint is valid because `ticket_messages.created_at` was converted to `timestamptz(3)` (`20261007…:156`).
- `getTicket` missing link → `AppError(503)` is caught (`AppError.status`, `shared/src/errors.js`), returning `chatAvailable:false` rather than an empty-success history.

## Commands I actually ran

- `node --check` on every modified/new `.js` in these areas: no syntax errors.
- `node --test scripts/demo-cs-admin.test.js`: 3 passed.
- `node --test --test-concurrency=1` Chat `supportImport.test.js` + `supportMessages.test.js`: 8 passed (isolated storage, no Mongo).
- `node --test --test-concurrency=1` Support `chatOwnership.test.js`, `ticketModel.test.js`, `ticketService.test.js`: 21 passed (no DB).
- `docker ps` (read-only) to see rehearsal containers exist.

## Not done / limitations

- Did not run any DB-backed test (Support PostgreSQL integration/upgrade tests, Chat real-Mongo test) or the migration; the rehearsal numbers (63/39 passed, empty `migrate diff`, 13 ER manifest matches) are from the implementer's logs, not independently verified.
- Findings #1 and #2 are source/constraint reasoning, not executed reproductions.
- Did not review frontend, Auth/Order/Product diffs, or the drawio/PDF; no check of `supportMessages.test.js` assertions beyond running them.
- Rehearsal still lacks an end-to-end run of the Support importer script against real Chat HTTP + real Mongo + the populated Postgres fixture together (the two halves are tested separately).

Skills used: nes-mode | References: Harness, Senior Mentor, software-playbooks (Backend and API, Review) | Playbooks: none.
