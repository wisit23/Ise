# Chat Support-import real MongoDB rehearsal

## Boundary and setup

- Ran only against the parent-owned disposable `ise-er-mongo-rehearsal-20261014` MongoDB 4.4 single-node replica set.
- Database URL: `mongodb://127.0.0.1:55441/chat_er_real?replicaSet=er-rehearsal&directConnection=true`. The integration test refuses to load Prisma/app modules unless the host, port, database, and replica-set query values match this target.
- Test-created data uses randomized IDs in `chat_er_real`; cleanup deletes only the test conversation and its messages. No Prisma generate/db push/reset, container restart, production or compose database access, secrets, env files, or schema changes.
- Runtime observed: Node 24 and generated Prisma client 5.22.0; Mongo image `mongo:4.4`.

## Executed check

```sh
DATABASE_URL='mongodb://127.0.0.1:55441/chat_er_real?replicaSet=er-rehearsal&directConnection=true' node --test backend/services/chat-service/test/er-mongo-preservation.integration.test.js
```

Result: **1 integration test passed, 0 failed, 0 skipped** (about 0.9 seconds). The test uses actual Prisma/Mongo for all persistence and actual HTTP routes for migration and message-history reads. Only external auth and Support case-access are fixture adapters; no Mongo operation is mocked.

Observed assertions:

- `Conversation.contextKey` and `Message.idempotencyKey` indexes exist as unique Mongo indexes; duplicate inserts for each reject with Prisma `P2002`.
- Import HTTP path requires the internal token (missing token received 403); wrong ticket correlation received 400.
- Historical public REQUESTER becomes BUYER / ALL; historical staff note remains AGENT / INTERNAL; both preserve exact timestamps.
- Two concurrent HTTP imports of one absent source/event returned 201 and 200, with one Mongo message. A subsequent retry was idempotent; changed body or author was rejected with 409.
- Missing mirrored originals were rejected (409). Existing rich mirrored ADMIN FILE record retained ADMIN role, type, payload, edited timestamp, and original body.
- Requester history HTTP response contained no INTERNAL messages; current staff history contained both internal records.
- Historical imports emitted no broadcast, performed no synchronous Support delivery, and left the conversation preview and preview timestamp unchanged.
- After Prisma disconnect/reconnect and a fresh Node subprocess read, imported body/timestamp and rich attachment payload/role/timestamp matched the original persisted records.

## Worker replay regression and fix

- Before the fix, the real-Mongo test inserted two new legacy imports with `syncStatus: PENDING`, then ran the actual `processPendingMessages()` worker batch against their persisted records. The batch selected both records and the HTTP adapter captured both Support metadata events (with the imported Chat message IDs). This confirms the delayed replay, unlike the earlier inline-delivery assertion. The initial baseline run then failed later in the newly expanded normal-reply assertions because concurrently imported fixtures were also pending; the capture and prior assertions had already observed the replay.
- Fixed the migration boundary in `src/features/internal/supportMessages.js`: newly-created legacy-import records now start `SYNCED` with `syncedAt` set to the import acknowledgement time. Their provenance remains `payload.legacySupportMessageId`. This acknowledges that the source event already exists in Support; it does not represent an invented historical timestamp or additional Support event. Import retries remain idempotent and do not alter existing records.
- Existing mirrored Chat records remain untouched by import verification. The real-Mongo test seeds a mirrored file message with `PENDING`, two attempts, a future retry time, and an error string, and verifies those values and its original body/attachment payload persist unchanged.
- After the fix, the same real-Mongo worker batch processed 0 imported messages and captured 0 Support deliveries. The test also created a normal new AGENT reply as PENDING, forced a 503 delivery, observed it remain PENDING with one attempt and a retry time, then made it retry-eligible; the second batch delivered it and marked it SYNCED. Two captures for that new reply confirm failure/retry behavior remains active.
- Focused verification after the fix: real Mongo preservation integration plus internal import/reply tests passed (9/9); Chat sync/continuity tests passed (10/10). Command details: `DATABASE_URL='mongodb://127.0.0.1:55441/chat_er_real?replicaSet=er-rehearsal&directConnection=true' node --test backend/services/chat-service/test/er-mongo-preservation.integration.test.js backend/services/chat-service/src/features/internal/supportMessages.test.js backend/services/chat-service/src/features/internal/supportImport.test.js`; and `node --test backend/services/chat-service/test/sync-and-continuity.test.js`.

## Limits

- The worker's external Support endpoint is an HTTP capture/failure adapter; no Support-service persistence or ticket SLA effect was exercised in this Chat-owned task. The test proves Chat does not replay these imported records after migration and that normal Chat deliveries still retry; it does **not** independently establish every Support SLA invariant.
- This rehearsal proves durability across client reconnect and a new process, **not** Mongo process restart, replica failover, or multi-node resilience. No container restart was performed.
- External broadcast and Support-sync effects were adapter-stubbed; the test proves the import path does not call broadcast or replay metadata, not end-to-end Redis or Support-service behavior. Requester/staff auth and Support ACL decisions were fixture adapters, not production identity/ACL services.
