# Customer Service production remediation plan

Status: **implementation in progress; not production approved** (2026-10-03). Source conflicts in the CS/Chat JavaScript files were resolved; unrelated Admin/Buyer/Marketing documentation conflicts remain in the Git index. Docker is unavailable on this host, so database and browser E2E acceptance remain unverified. Final checks: backend 325 passed, 52 skipped, 0 failed; frontend 45 suites and 238 tests passed; ESLint on changed code, Compose config, and a production frontend build passed.

## Implemented in this pass

- Added deterministic `DISPUTE:<disputeId>` Chat context and an authenticated Order endpoint that authorizes buyer, seller, assigned CS and Admin/T&S before opening or joining the room. Repeated opens return the same room; a decided dispute attempts to lock the room.
- Wired dispute chat in the CS drawer, buyer dispute case page and seller order tracker. The case page keeps history available after decision.
- Wired Admin Inbox ticket selection to a full ticket read and authorized join of the existing Support room. Admin can now filter and paginate all historical tickets, including closed and escalated cases, separately from reports. Added the missing REVIEWED report filter and an ALL filter contract.
- Repaired ticket conversation links using a conditional update, retained requester access after escalation, and let verified secondary staff roles work at Support endpoints. Bounded the internal transcript endpoint with cursor pagination.
- Preserved composer drafts after send/upload failures and deduplicated optimistic messages against socket deliveries in both embedded and live support chat. Corrected the socket join/leave/typing payload from an object to the string ID expected by the server.
- Chat now checks case access with the owning Order or Support service on read, write, inbox listing and live broadcasts; stale room participants cannot read or receive messages after reassignment or escalation. Case sockets no longer retain conversation-room membership.

## Remaining release blockers

1. Run real PostgreSQL + Mongo replica set + Redis integration and role-based browser E2E. Docker daemon is unavailable here, and 52 backend tests are skipped; unit tests and a successful frontend build cannot replace these checks.
2. Make dispute-room locking after a decision durable across Chat outages. The API currently reports `chatLockError` and retries on a later room open, but a background reconciliation/outbox is needed to close the gap without relying on a user visit.
3. Resolve the unrelated documentation merge conflicts without discarding either side. Do not treat this checkout as mergeable until `git diff --check` and the unmerged index are clean.

## Goal and scope

Make the customer-service workflow usable end to end for requester, CS agent, Admin and Trust & Safety: ticket intake, assignment, live chat, async replies, dispute evidence and decision, escalation, historical review, SLA, FAQ, audit, and recovery after partial service failure. Payment/refund state remains simulated as the current architecture specifies.

## Findings verified in source

| Priority | Finding | Evidence | Completion condition |
| --- | --- | --- | --- |
| P0 | Initial checkout did not run: unresolved conflict markers were present in CS/Chat source and documentation. | Initial `git status --short`; initial `node --check` failed on `ticketService.js` and `messageService.js`. | Source conflicts resolved and parsed; unrelated documentation conflicts remain. |
| P0 | Dispute chat drawer never receives a conversation ID. | `DisputesSection.js` renders `DisputeChatPanel` without `conversationId`; `DisputeChatPanel.js` passes it to `EmbeddedChat`. | Authorized open/join endpoint returns stable room ID, drawer passes it, buyer/seller/agent can exchange messages and reload history. |
| P0 | Order dispute flow does not create or locate a dispute-specific room for staff. | `disputeService.js` opens a case without Chat integration; Order chat client handles status notifications in `ORDER` context only. | Define `DISPUTE` chat context and server-side participant policy, or explicitly reuse `ORDER` with a documented privacy policy; no client-supplied participant IDs. |
| P1 | Admin Inbox ticket drawer has a disabled chat button. | `TicketCasePanel.js` displays `แชท (Soon)`; `AdminInboxSection.js` does not join a room or render its transcript. | Admin/T&S can open the authorized ticket room, read paginated old messages, and continue an escalated conversation. |
| P1 | Inbox silently turns ticket/report API failures into empty lists. | `AdminInboxSection.js` catches both fetch failures and returns empty `items`. | Show source-specific errors and retry; never claim an empty queue when one source failed. |
| P1 | Admin Inbox paginates two sources separately and merges one page in the browser. | `AdminInboxSection.js` merges paginated ticket and report results and uses maximum page count. | Stable unified ordering and pagination (server aggregation or separate tabs with separate cursors). |
| P1 | Staff may view an unassigned support ticket before accepting it, but Chat access is participant-only. | `ticketService.assertAccess` permits unassigned tickets; Chat `getForParticipant` requires active participant. | Join via support-service before transcript access; do not broaden Chat's public read policy. |
| P1 | Historical transcript internal endpoint returns an unbounded result. | `internalController.getTranscript` uses `findMany` without limit. | Paginate by stable `(createdAt,id)` cursor; authorize through owning service and keep internal notes invisible to customers. |

## Implementation sequence

### 0. Restore a runnable baseline

1. Inventory and resolve every unmerged file, including conflicts outside CS that block frontend build or global tests. Compare stage 2 and stage 3 for each conflict; retain behavioral changes from both sides. Do not reset unrelated user changes.
2. Align the Node version used by package engines, Docker, `.nvmrc` and CI, then run clean install and Prisma generation.
3. Establish baseline outputs for syntax, lint, backend unit tests, frontend tests, frontend production build and Compose health. Record failing cases before changing features.

**Gate:** no conflict markers or unmerged paths; the whole repository parses. If this gate fails, downstream test results are not release evidence.

### 1. Define conversation ownership and data contract

1. Add a dedicated `DISPUTE` context keyed by dispute ID. Chat owns room/messages; Order owns dispute and participants (buyer, seller, assigned agent, Admin/T&S). Support owns ticket room and staff join. The browser never chooses participants or reads internal routes.
2. Add authenticated Order endpoints to open/join dispute chat and read its room metadata. Authorize buyer/seller against the order; authorize staff by role and case assignment/escalation policy. Make open/join idempotent under concurrent requests.
3. Store a durable dispute-to-conversation reference in Order (nullable `conversationId` with unique index, or a separate 1:1 link table with `disputeId` unique and `conversationId` unique). Backfill old cases lazily and in a resumable batch. Never erase an existing room or transcript.
4. Keep support ticket `conversationId` repair idempotent. On Admin/T&S escalation, add the new staff member to the existing room, retain prior members and history, and lock customer sending only when the ticket state explicitly requires it.
5. Specify failure responses: Chat unavailable = actionable 503 with retry, not a fake empty room; missing room = repair path; inaccessible room = 403; stale decision/assignment version = 409.

**Gate:** contract tests cover duplicate open/join, concurrent open, unauthorized IDs and service timeout. PostgreSQL/Mongo consistency recovery is verified after a failure between writes.

### 2. Make every visible chat control work

1. Dispute drawer calls the authorized join endpoint, handles loading/error/retry, passes the returned `conversationId` to `DisputeChatPanel`, and refreshes messages after reopen.
2. Admin Inbox resolves full ticket detail, calls support join/continue, and renders the same chat/history component used in live support. Remove `Soon` and all inactive chat actions.
3. Add a read-only historical view for closed/decided cases. Provide “older messages” pagination, timestamps, sender identity, attachments via authorized download, and clear distinction for staff-only notes.
4. Preserve composer text on transient send failure; surface upload/send errors and retry without creating duplicate messages. Reconnect WebSocket and reconcile by message ID with REST pagination.
5. Replace silent partial failure in Admin Inbox with per-source status and retry. Make pagination stable: either separate ticket/report queues or a backend unified feed; do not merge unrelated pages locally.

**Gate:** buyer, seller, CS, Admin and T&S can follow the role-specific flow in a browser; unauthorized users cannot open rooms, attachments or internal notes.

### 3. Close lifecycle and data-integrity gaps

1. Ticket state machine: create, claim, reply, internal note, resolve, reopen if policy allows, escalate, continue and close. Confirm that room status follows state without losing history.
2. Dispute state machine: open, upload/view evidence, claim/reassign, escalate, decide once, and inspect after decision. Preserve optimistic locking and audit all staff actions.
3. Keep Admin hold/release and CS dispute decision coherent when operations race. Test payoutHeld and refund simulation with PostgreSQL transactions; expose a clear conflict to the second actor.
4. Validate all free-form identifiers server side. Remove manual arbitrary target-user moderation in the UI unless the target is verified against the ticket/order or explicitly entered through an audited admin lookup.
5. Confirm SLA escalation is idempotent across multiple job instances, FAQ publish/revision is durable, and queue filters/search return accurate totals.

**Gate:** isolated PostgreSQL integration tests for ticket/dispute transitions and Mongo replica-set integration for messages; no skipped mandatory integration tests.

### 4. Production hardening and release verification

1. Schema migration: additive migration first; index context/link IDs and message `(conversationId, createdAt, id)`; deploy readers compatible with null legacy links; run resumable backfill; enforce constraints only after verification. Include rollback procedure that preserves transcripts.
2. Access matrix: requester, buyer, seller, assigned CS, unassigned CS, unrelated CS, Admin, T&S and guest against ticket, dispute, transcript, internal note, evidence and attachment endpoints. Test primary-role and multi-role tokens.
3. Observability: request/correlation ID across gateway, Support, Order and Chat; metrics for room-create failures, sync lag, send failure, SLA breaches and decision conflicts; structured audit without message bodies or tokens in logs.
4. Run clean install, lint, unit, contract, integration, frontend build and browser E2E in a fresh environment. Test restart/reconnect, retries, concurrent staff action, large history and partial service outage. Record command, environment, commit and result.
5. Manual acceptance on seeded roles and real Docker services. Inspect database rows and Mongo messages after reload. Reviewer signs off only after all required checks pass.

## Required acceptance scenarios

- Buyer opens a completed-order dispute; buyer and seller see the right room. Assigned CS opens the same room, sends a message, and sees it after reload. An unrelated user receives 403.
- Two staff members open the same dispute concurrently and obtain one room; a retry after a Chat timeout does not duplicate it.
- Admin opens an escalated ticket from Inbox, reads the complete earlier transcript and attachments, continues chat where allowed, and sees staff-only notes while requester cannot.
- Closed ticket and decided dispute retain read-only history; pagination reaches the oldest message without duplication or gaps.
- Chat outage leaves ticket/dispute state consistent and presents retry; recovery links the original room. WebSocket disconnect does not lose a persisted REST message.
- Two agents claiming or deciding the same case produce one winner and a visible 409 for the other; hold/release and decision cannot create contradictory payout state.
- Queue and Inbox show correct search, filters, totals and ordering; one failed source is shown as an error rather than “no cases.”
- Private evidence and chat attachments reject guest/unrelated users, and internal notes never appear in requester responses or socket events.

## Release criterion

Do not label CS production ready until all P0/P1 findings are fixed, migration/backfill succeeds on a copy of existing data, mandatory automated and browser tests pass without skips, and cross-role manual acceptance is recorded. “Zero errors” cannot be guaranteed; these gates make remaining failures visible and actionable.
