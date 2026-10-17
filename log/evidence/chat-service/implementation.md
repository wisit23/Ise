# Chat changes for approved Support ER alignment — 2026-10-14

Scope: necessary Chat changes only, shared checkout, approved implementation; no commit, `.env`, real DB or shared/root-script edits. Read Chat/Support decisions, loger README and actual source consumers. Chat is intentionally **MongoDB**, not PostgreSQL; ER SQL snake_case alignment does not justify converting it to PostgreSQL or renaming all Mongo properties.

## Delivered

- `backend/services/chat-service/src/features/internal/supportMessages.js`: historical import verifies sender role as well as conversation/ticket, sender and visibility. Legacy Support flattened ADMIN/T&S into AGENT; matched original mirrored records retain richer original Chat roles, edited bodies and attachment payloads. Unmirrored imports require exact body/time and deterministic source ID. Missing mirrored originals fail instead of creating text substitutes. Historical import remains token-gated, works on locked rooms, does not broadcast or touch current preview.
- Added `src/features/internal/supportImport.test.js`: concurrent import/retry creates one record, conflicting source content/sender rejects, INTERNAL/time preserved, no notification/preview writes; existing original ADMIN FILE record remains original; missing mirror rejects.
- No Mongo schema change needed: existing `visibility=INTERNAL`, unique idempotency key, deterministic IDs and persisted sync retry metadata already provide the approved message-owner/retry foundation. Existing case access, list/cursor filtering, INTERNAL preview exclusion and per-authorized-user broadcast were preserved and tested, not replaced with a second message store.
- Support contract migration removes `ticket_messages` only after verified receipt for every legacy row. Support receipt includes fingerprint/IDs, never message body/attachments. Existing Support reply APIs continue through Chat with the same caller-supplied eventKey; repeated keys dedupe and changed reply content rejects.

## Actual checks

- Chat `prisma validate`: pass; separately generated Chat client in its configured service-local output (no workspace-hoisted client overwrite).
- **39 focused tests passed, 0 failed, 0 skipped**, with isolated storage, sequential test files:

```text
node --test --test-concurrency=1 --test-reporter=tap
  src/features/internal/supportMessages.test.js src/features/internal/supportImport.test.js
  src/features/internal/internalController.test.js src/features/internal/awaitingReply.test.js
  src/features/messages/messageModel.test.js src/features/messages/cursor.test.js
  src/features/conversations/conversationAccess.test.js src/realtime/broadcast.test.js
  src/services/caseAccessClient.test.js test/sync-and-continuity.test.js
```

Coverage: role-derived support replies, buyer INTERNAL denial, Admin public-write denial, locked-room writes, same key vs changed content, historical locked-room import, concurrent duplicate import, no body/attachment metadata delivered to Support, current-case authorization/revocation, INTERNAL message pagination/unread exclusion, private preview/broadcast audiences, failure-closed owner outage and retry/continuity contracts. Raw final output is locally retained in ignored `backend/services/chat-service/test/er-focused-results.log`.

- Real PostgreSQL populated Support upgrade test also exercised the actual Chat import HTTP route/token boundary with isolated Chat storage. Public/INTERNAL legacy imports, complete source timestamps, retry counts and contract drop guards passed. That test is real SQL preserving-data evidence but **not real Mongo persistence evidence**.
- Scoped `git diff --check`: exit 0 (line-ending warnings only).

## Luna-owned continuation verification

Ran Chat `prisma validate` and generated only the service-local Chat client with a deliberately non-live local test URL; no `@prisma/client` generation. The focused Chat suite then passed **39 tests, 0 failed, 0 skipped** across the 10 files listed above. Support's populated PostgreSQL preserving-upgrade rehearsal ran in the separately created `chat_luna_er` DB and exercised the actual internal Chat HTTP controller/token boundary with isolated in-memory Chat storage; this does not claim Mongo persistence.

## Deployment and uncovered work

Deploy/verify Chat import path and existing idempotency indexes before Support import/contract deployment. Keep old writers stopped for migration. Run Support importer dry-run and apply, check complete receipts/history; missing originals and Chat outages block, not fake empty success. Final Support runtime must not start against pre-contract identifiers.

The supplied rehearsal container is PostgreSQL. Separate `chat_worker_er` PostgreSQL DB was created as requested and used for the populated Support upgrade fixture, **not** represented as a Mongo Chat database. No PostgreSQL Chat migration was invented. The only Mongo URL used for unit-client generation/testing was a deliberately non-live local test URL on `127.0.0.1:55540`; tests stub storage and do not prove its availability.

**Caller scope blocker:** the internal-note caller at `frontend/components/support/sections/LiveSupportSection.js:237–241` sends no idempotency key. Backend keyed retries are tested; legacy keyless input remains compatible but cannot offer end-user retry dedupe without an outside-scope frontend change retaining a key for each submission/retry. No fake body-based key was introduced.

**Blocked/uncovered:** authorize/provide a disposable Mongo replica set and Redis to run actual Mongo unique-index races, transaction durability, Support↔Chat transport/worker restart, Redis fanout, live socket/attachment/API integration. No real history was imported; existing full cross-service integration suites requiring live dependencies were not claimed passed. No broad npm test ran concurrently.

See `../support-service/implementation.md` for complete field mappings, event formats, real SQL migration results and Customer ER amendments.

Skills used: nes-mode, context-mode | References: Harness, Senior Mentor | Playbook: Refactoring.
