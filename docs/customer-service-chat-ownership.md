# Customer Service / Chat: message ownership

Chat owns all ticket messages, attachments and internal notes (`Message.visibility` ALL/INTERNAL).
CS owns tickets, assignments, statuses, SLA, audit metadata and `ticket_chat_links`.
No new message-link table. No CS runtime message-body persistence.

## Active CS tables

- Setup: TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS, SLA_POLICY, HELP_CATEGORY
- Master: HELP_ARTICLE, HELP_ARTICLE_REVISION
- Transaction: SUPPORT_TICKET, TICKET_ASSIGNMENT, TICKET_STATUS_HISTORY, TICKET_SLA_TARGET,
  TICKET_AUDIT_EVENT, TICKET_CHAT_LINK

`TicketMessage` remains mapped in Prisma **only as an immutable legacy archive for migration**.
It is not part of the 13 active domain tables. No destructive SQL migration is shipped here.
Do not run Prisma db push/reset to remove it. Original design diagrams are not rewritten in this change.

## Runtime changes

- Existing POST `/tickets/:id/messages` authorizes against CS, joins/repairs its room, sends via
  Chat `/internal/conversations/:id/replies`; response maps to legacy ticket message shape.
- Chat rechecks participation/current CS case permission; derives sender role, enforces room locks,
  staff-only internal notes and Admin public-reply restriction. Internal notes never update public previews.
- Optional `Idempotency-Key` header or `eventKey` body is scoped to conversation/sender;
  replay returns the same Chat message, changed content rejects with 409.
- GET `/tickets/:id` reads latest 100 Chat messages; `messagesNextCursor` supports
  `?before=<cursor>&limit=<1..100>`. Internal inclusion is server-selected after authorization.
  A requester with a staff role still cannot read internal notes on their own ticket.
- Chat 502/503/504 returns ticket details with `chatAvailable=false`, `chatError` and no messages;
  no local write fallback. Frontend distinguishes unavailable history from empty history.
- Chat sends message ID, ticket/conversation IDs, author, visibility, type and timestamp only.
  Retry worker retains durable PENDING delivery across CS downtime. No body/file payload sent to CS.
- CS stores metadata in audit `dedupeKey=chat:<messageId>`, updates FIRST_RESPONSE only for public
  agent replies, atomically and idempotently. Out-of-order deliveries preserve earliest response time.
- History pagination uses createdAt + ID tie-breaker, not ObjectId timestamp assumptions,
  because historical imports and deterministic idempotency IDs are not chronologically ordered IDs.

## Safe rollout / legacy migration

1. Back up both PostgreSQL and MongoDB. Run on staging first with a Mongo replica set.
2. Deploy Chat routes compatible with old/new CS. Stop old CS instances (including the chat-events receiver)
   and drain requests; Chat queues metadata while CS is offline. Do not leave an old receiver creating mirrors during migration.
3. Run existing CS normalization migrations/seed if not applied. Do NOT delete ticket_messages.
4. From `backend/services/support-service`, configure DATABASE_URL, CHAT_SERVICE_URL and
   INTERNAL_SERVICE_TOKEN; `npm run db:migrate-messages` only counts rows, writes nothing.
5. `npm run db:migrate-messages -- --apply` imports/verifies each archive row in bounded pages.
   Original author, timestamp, visibility/body preserved for CS-only messages; deterministic IDs
   permit restart. Existing Chat mirrors reuse original ID and verify correlation/author/visibility.
   Missing original mirrored messages stop migration (cannot reconstruct attachment evidence from a text mirror).
6. Require `verified` to equal archive row count, no errors, inspect oldest/newest/internal samples
   and attachment mirrors, rerun successfully. Archive is never deleted or updated.
7. Deploy new CS and frontend; verify reply/history, internal privacy, locked rooms and metadata retry.
   New CS deliberately does not read old archive: finish migration before switching traffic.
8. Archive removal is a later separately approved contract migration after retention/rollback planning.

Historical imports do not broadcast old messages, reopen rooms, or overwrite current room previews.
New imported messages are PENDING for event retry; migration also records metadata immediately.
Keep old app rollback disabled until its local-message behavior is reconsidered: projection triggers
cannot copy new Chat-owned messages back into the legacy table.

Live data migration is not performed by editing these files. Deployment requires configured services.

## Verification in this workspace

CS/Chat unit and HTTP contract suites: 119 passed; additional Support/demo suite: 25 passed,
11 integration cases skipped because PostgreSQL/live Auth/Chat were not available.
These runs overlap; do not sum them as distinct tests. ESLint passed for affected runtime/test/UI files.
Actual PostgreSQL -> Mongo migration and real replica-set integration remain deployment checks.
