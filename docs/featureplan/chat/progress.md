# Chat Platform Feature Progress

> Owner: อชิรวินท์ จรูญกีรติโรจน์ · Reviewer: สิรดนัย กันหา · Updated: 2026-09-04

**Status:** `CHAT-001`–`CHAT-006` implemented and verified — the full confirmed scope of that
round is done. Backend against a real MongoDB replica set + Redis, frontend against the full
Docker stack in a live browser (two separately-authenticated sessions), cross-service Internal
API and realtime delivery both verified live end-to-end, including a genuine 2-instance scale
test of the Redis adapter. **`CHAT-007` is now partially done as well**: file/image attachments
(its Steps 1–2) were requested separately and are complete and verified; Steps 3–6 (rate limit,
`chat:read:any`, report wiring, soft delete) remain untouched, as does `CHAT-008`.

**Scope this round (confirmed 2026-09-03):** `CHAT-001`–`CHAT-006` only — the chat system itself
end-to-end (rooms, messages, authorization, realtime). `CHAT-007` (attachments/rate-limit/Admin
moderation) and `CHAT-008` (migrate CS ticket messages) are deliberately deferred past this round;
see `plan.md`'s "การตัดสินใจที่ยืนยันแล้ว".

## `CHAT-001`: MongoDB replica set, Redis wiring, CI — Done

**Implementation evidence (2026-09-03):**

- `docker-compose.yml`: new `mongo` service (`mongo:7`, `--replSet rs0 --bind_ip_all`, healthcheck
  that requires `rs.status().ok` — not just "process is listening") and a one-shot `mongo-init`
  service that calls `rs.initiate()` exactly once and is idempotent on rerun; `chat-service` now
  `depends_on` both plus `redis`, and gets `REDIS_URL`/`PRODUCT_SERVICE_URL`/
  `INTERNAL_SERVICE_TOKEN` env vars it will need from `CHAT-002` onward
- `infra/mongo/init-replica.sh`: the replica-set bootstrap script `mongo-init` runs
- `.env.example` / `infra/postgres/init-databases.sql`: `DATABASE_URL_CHAT` now points at Mongo;
  `CREATE DATABASE reloop_chat;` removed from the Postgres init script with a comment explaining why
- `backend/services/chat-service/prisma/schema.prisma`: `Conversation`/`Participant`/`Message`
  models per `plan.md`'s Data Model section (this was pulled forward from `CHAT-002` since
  `CHAT-001`'s acceptance — proving `db push` and a real connection work — needed an actual schema
  to push; `CHAT-002` builds the domain logic — routes/services/authorization — on top of it)
- `backend/services/chat-service/src/app.js`: `/health` now pings Mongo for real via
  `prisma.$runCommandRaw({ping:1})` and returns `503`/`db:"unreachable"` on failure, instead of
  answering `{status:"ok"}` unconditionally like the other services' health checks
- `scripts/ensurePrismaClients.js`: `chat-service` added to the generated-clients list
- `.github/workflows/ci.yml`: Mongo runs as its own `docker run` step (not a `services:` entry —
  GitHub Actions service containers can't run a post-start command, and rs.initiate() has to run
  once after the node is up), waits for a primary election, then a `prisma db push` step syncs the
  chat schema against it alongside the existing Postgres schema-push steps
- `backend/services/chat-service/test/health.integration.test.js`: two tests — `db:"ok"` against a
  real reachable replica set, and `503`/`db:"unreachable"` against a deliberately broken URL —
  following the skip-if-unreachable + `REQUIRE_INTEGRATION=1` pattern from
  `support-service/test/ticket-lifecycle.integration.test.js`

**Verification performed (local Docker, not just unit tests):**

1. `docker compose up -d mongo redis` → `docker compose up mongo-init` — confirmed `rs.initiate()`
   ran, `mongo` healthcheck flipped to `healthy`, and rerunning `mongo-init` correctly detected
   "already-initiated" and no-opped instead of erroring
2. `npx prisma generate` + `npx prisma db push` against `localhost:27017` with
   `directConnection=true` — created `Conversation`/`Message` collections and all four indexes
   (including the `contextKey` unique index) on a real replica set
3. `node --test backend/services/chat-service/test/health.integration.test.js` — both tests pass
   against the live replica set; re-ran with `DATABASE_URL_CHAT` unset — the reachable-DB test
   skips cleanly, the unreachable-DB test still passes (it manufactures its own bad URL)
4. `docker compose build chat-service` then `docker compose up -d chat-service` — full dependency
   chain (`mongo` healthy → `mongo-init` completed → `redis` healthy) resolved correctly, container
   reports `healthy`; container logs show `prisma db push` ran automatically on boot via the
   Dockerfile's `CMD` and synced the same collections/indexes against `mongo:27017` from inside the
   Docker network
5. `curl`'d `chat-service:3004/health` from inside the Docker network — `{"status":"ok",
"service":"chat-service","db":"ok"}`
6. Brought up `gateway` too — `GET /api/chat/health` correctly returns gateway's own `401` for a
   missing bearer token (proves the existing auth gate still applies to the new route; not a
   negative result)
7. Full repo `npm run lint`, `npm run format:check`, `npm run secret-scan`: clean
8. Full repo `npm test`: 85 pass / 2 fail / 26 skip — the 2 failures
   (`order-service/src/checkout-reservation.test.js`) were confirmed to fail identically on
   unmodified `main` (verified via `git stash`), so they predate and are unrelated to this work
9. `docker compose down` — clean teardown, no orphaned state

**Not yet done (at the time `CHAT-001` landed):** `CHAT-002`–`CHAT-006`. See below — `CHAT-002` is
now also done.

## `CHAT-002`: Conversation, participant authorization, create-or-open — Done

**Implementation evidence (2026-09-03):**

- `contextKey.js`: pure function computing a deterministic dedupe key per `contextType`
  (`PRODUCT`/`ORDER`/`SUPPORT`/`DIRECT`); 7 unit tests, all passing (determinism, uniqueness
  across different inputs, `DIRECT`'s order-independence via sorting, and rejecting missing
  required fields)
- `productClient.js`: thin fetch wrapper toward product-service's public `GET /:id`, mirroring
  `order-service/src/services/productClient.js`'s pattern
- `conversationService.js`: `createOrOpenProductConversation` resolves `sellerId` **server-side**
  from product-service — a client-supplied `sellerId` in the request body is never read at all;
  on a `contextKey` unique-index collision (`P2002`) it fetches and returns the existing
  conversation instead of erroring — this is the create-or-open semantics, not a failure path
- `conversationController.js`/`conversationRoutes.js`: `POST /conversations` (only `contextType:
"PRODUCT"` accepted this round — `ORDER`/`SUPPORT`/`DIRECT` are opened via the Internal API in
  `CHAT-005`), `GET /conversations` (inbox), `GET /conversations/:id` (403 if not a participant)
- Authorization is decided by reading `participants` back from the database on every request, not
  from a JWT claim — `conversationService.getForParticipant()` is the single choke point both the
  direct-read endpoint and (later) the messages feature will share

**Verification performed (real MongoDB replica set, not mocks):**

21 tests in `test/conversation.integration.test.js`, all passing against a live `mongo:7`
replica set (product-service itself is not run — `global.fetch` is mocked, the same isolation
choice `review-service`'s integration test makes toward `order-service`; only the cross-service
HTTP call is faked, the Conversation writes and unique-index race handling are real):

- guest (no bearer token) → `401`
- creates a conversation; server-resolved `sellerId` is correct even when the request body sends
  a forged `sellerId` (it's silently ignored)
- calling create-or-open twice sequentially with the same context → same conversation `id`
- **two simultaneous `POST /conversations` requests** (`Promise.all`, not sequential) with the
  same context still yield exactly one conversation — verified both by the API response
  (`resA.body.id === resB.body.id`) and by a direct MongoDB count query
  (`prisma.conversation.count(...) === 1`) — this proves the unique-index race handling, not
  just an application-level check
- cannot open a conversation about your own listing (`400`)
- `404` when the product doesn't exist
- only `contextType: "PRODUCT"` is accepted on this endpoint (`400` for others)
- a stranger gets `403` reading a conversation they're not part of; the actual participant gets
  `200`; guest gets `401` (not `403` — auth vs. authorization distinguished correctly); a
  nonexistent conversation id is `404` (not `403`, which would leak existence)
- inbox lists the buyer's own conversation and correctly excludes it for a stranger

**Bug found and fixed during test-writing (not a production bug):** the first draft of the
concurrency test swapped `global.fetch` to a narrower mock just for that one case and never
restored the original — silently broke every test that ran after it in the same file. Fixed by
using one stable combined mock for the whole suite instead of swapping mid-test.

Re-ran with `DATABASE_URL_CHAT` unset: skips cleanly (1 skipped, 0 failed). `npm run lint`: clean.
`npx prettier --write` applied then re-verified tests still pass after formatting.

## `CHAT-003`: Message send/read, cursor pagination, unread count — Done

**Implementation evidence (2026-09-03):**

- `cursor.js`: pure functions — `buildPageQuery` (Prisma `where`/`orderBy`/`take` for one page)
  and `paginate` (slices the over-fetched extra row into `{items, nextCursor}`). Cursoring on the
  message `id` (MongoDB ObjectId, lexicographically sortable by creation time) rather than
  offset/page-number — the whole point being that new messages inserted at the top mid-pagination
  can't shift already-fetched pages, unlike `shared/pagination.js`'s offset scheme used elsewhere
  in the repo. 7 unit tests, all passing
- `messageService.sendMessage`: writes the `Message` and updates
  `Conversation.lastMessageAt`/`lastMessagePreview` in one `$transaction` — a reader can never see
  an inbox preview that doesn't correspond to a real message. Rejects on a `LOCKED` conversation
  (`409`) and an empty/whitespace-only body (`400`). Authorization goes through the same
  `conversationService.getForParticipant` choke point `CHAT-002` established — not a second copy
  of the participant check
- `messageService.markRead`/`unreadCount`: `lastReadAt` lives on the embedded `Participant`, which
  Prisma's MongoDB connector can only update by replacing the whole embedded array (`set`), not a
  single element — documented in the code since it's a real gotcha
- `GET /conversations/:id/messages`, `POST .../messages`, `POST .../read`, `GET /unread-count`
  wired into `app.js`

**A real production bug was found and fixed during test-writing:** the first implementation
omitted `deletedAt` when creating a Message (relying on the Prisma schema default). Every read
path filters `deletedAt: null` to exclude soft-deleted messages — but Prisma's MongoDB connector
stores an omitted optional field as genuinely **absent** (no key in the document at all), and a
`deletedAt: null` filter only matches a field that is **present** with a null value, not a missing
one. Result: every message was invisible to its own list/count queries immediately after being
created — confirmed by writing a small reproduction script against the real replica set (raw
`$runCommandRaw` showed the stored document had no `deletedAt` key at all, and
`findMany({where:{deletedAt:null}})` returned zero rows). Fixed by writing `deletedAt: null`
explicitly at create time. This is now called out in a code comment so it isn't silently
reintroduced by a future edit that drops the explicit field.

**A second, unrelated issue was hit and resolved during verification** (test-environment gap, not
an app bug): running the Conversation test suite against a brand-new MongoDB database that had
never had `npx prisma db push` run against it let two concurrent `POST /conversations` requests
both succeed and create two separate documents with the same `contextKey` — because the unique
index that makes the race-handling logic work didn't exist yet in that database. This is exactly
why `CHAT-001`'s Dockerfile `CMD` and the CI workflow both run `prisma db push` before the server
starts / before tests run; it does not affect a properly-provisioned environment. Re-ran after
pushing the schema to a clean database and the concurrency test passed correctly.

**Verification performed (real MongoDB replica set, not mocks):**

20 tests in `test/message.integration.test.js`, all passing against a live `mongo:7` replica set
after `prisma db push`:

- send then read back a message (including Thai-language body text)
- sending atomically updates `lastMessageAt`/`lastMessagePreview`
- empty/whitespace body → `400`
- a non-participant can't send (`403`) or list (`403`); guest gets `401` (not `403`)
- a `LOCKED` conversation rejects new messages with `409`
- **cursor pagination across a real 65-message history**: paged at limit 30 takes exactly 3
  pages, every one of the 65 message ids appears exactly once across all pages (`Set` size check),
  and the newest-first ordering is verified against the actual send order
- **cursor pagination under a genuine interleaved insert**: page 1 is fetched, then a NEW message
  is sent by a different user, then page 2 is fetched using the cursor captured before that new
  message existed — the new message correctly does not leak into page 2, and nothing from page 1
  reappears
- an invalid (non-ObjectId) cursor is rejected with `400`, not silently ignored
- mark-read updates `lastReadAt` and `GET /unread-count` reflects it correctly, including that a
  sender's own messages never inflate their own unread count
- messages are re-read successfully through a **brand-new `PrismaClient` connection** (not the
  app's cached instance) — the closest in-test proxy for "survives a process restart" without
  actually restarting the process

Full chat-service suite re-run together (`contextKey`, `cursor`, `health`, `conversation`,
`message`): **43/43 passing**. Skip-check with `DATABASE_URL_CHAT` unset: clean skip. `npm run
lint`: clean. `npx prettier --write` applied, tests re-verified green afterward.

## `CHAT-004`: Frontend — inbox, chat room, Contact Seller button — Done

**Implementation evidence (2026-09-03):**

- `lib/chat.js`: thin wrappers over `apiFetch` for every chat endpoint, plus two pure helpers —
  `hasUnread(conversation, userId)` (compares the embedded participant's `lastReadAt` against
  `lastMessageAt`, no extra API call) and `otherParticipant(conversation, userId)`
- `ContactSellerButton`: guest click → `/login` (same pattern as the existing
  `addToCart()`/`handleBuyNow()` guest-redirect in the product page, not a new convention);
  authenticated click → `POST /api/chat/conversations` → `router.push` into the room. Wired into
  **three** places: product detail (next to "ดูร้านค้า"), store page (next to "รายงานร้านค้านี้" —
  see the "not in scope" note below), and the orders list (via `OrderLine`'s existing unused
  `actions` slot) — this is what unblocks `buyer/plan.md`'s `BUY-004` Step 3
- `/chat` (inbox): guest → `/login`; loading/empty/error states; `ConversationRow` resolves the
  _other_ participant's display name via auth-service's public profile endpoint (the same
  cross-service lookup the product page already does for a seller card) and shows an unread dot
  computed from `lib/chat.js`'s `hasUnread`
- `/chat/[id]` (room): loads the conversation + first page of messages, resolves the other
  party's name, renders via `MessageList`, sends via `MessageComposer` with **optimistic append**
  (a temporary bubble appears immediately; on failure it's rolled back and the composer's draft
  text is preserved — not silently discarded), marks read on open and on every successful poll,
  and disables the composer (showing a "locked" notice instead) when `conversation.status ===
"LOCKED"`
- Polling every 4s while `conversation` is loaded, paused via `document.hidden` when the tab isn't
  visible — every tick re-fetches the latest page and merges by id (`mergeById`), so a single
  missed tick self-heals on the next one instead of needing an "after" cursor
- NavBar: added a chat icon + unread badge, mirroring the existing cart-count badge pattern
  exactly (same fetch-on-mount, same badge styling)
- `/chat` and `/chat/[id]` use `gray-*` (Storefront world per `ui-conventions.md`), consistent
  with `/products`, `/cart`, `/orders`

**Deliberate simplification vs. the plan wording:** Step 4 says "infinite scroll ขึ้นด้วย cursor".
Implemented instead as an explicit **"โหลดข้อความเก่ากว่านี้" (load older) button** using the same
cursor mechanic (`before=<nextCursor>`), rather than a scroll-position-triggered fetch. This
satisfies the functional requirement (paging arbitrarily far back through history via cursor,
verified in `CHAT-003`'s 65-message/3-page test) while being simpler and far more reliably
testable than scroll-position detection in jsdom. Scroll-triggered auto-load can be swapped in
later without touching the cursor logic itself if a reviewer wants that exact interaction.

**Known limitation, not a bug:** `ConversationRow`/the room header show a generic "ผู้ใช้"
fallback instead of a name when the _other_ participant is a Buyer, not a Seller. Root cause:
auth-service's `GET /users/:id/public` (`getPublicSellerProfile`) explicitly
`throw notFound("seller not found")` for any non-`SELLER` account — this is an existing
auth-service design constraint, not something introduced by or in scope for this Chat work. The
graceful `.catch(() => setOtherName("ผู้ใช้"))` fallback is the correct handling of that
constraint, confirmed live (see verification below) rather than a crash or a stuck "กำลังโหลด...".
A future task (owned by whoever owns auth-service's public-profile contract, not Chat) could add a
role-agnostic minimal public name lookup if this UX gap needs closing.

**Bugs found and fixed during test-writing (not production bugs — both were in the test/mock
code):**

1. The `next/navigation` router mock in `chat.test.js` returned a **new object literal on every
   call** (`useRouter: () => ({push: mockPush})`). The room page's data-loading effect depends on
   `router` in its dependency array; an unstable mock reference made the effect re-run on every
   render, silently consuming the single queued `apiFetch.mockResolvedValueOnce(...)` value twice
   and crashing on the second (real) call with `undefined.then`. Fixed by hoisting a single stable
   `mockRouter` object, matching the pattern already used in `executive.test.js`. Confirmed this
   cannot happen in the real app: Next's actual `useRouter()` returns a memoized, stable reference.
2. `MessageComposer.submit()` didn't catch a rejecting `onSend` — a real defensive gap in the
   component itself (not just the test), since a reusable composer should never let a caller's
   promise rejection escape as an unhandled exception. Fixed by catching and swallowing the error
   there (the draft text is deliberately preserved rather than cleared, and any user-facing error
   message is the room page's responsibility, which it already shows via its own `error` state).

**Verification performed:**

- `frontend/app/chat/chat.test.js` (5 tests) and `frontend/components/chat/MessageComposer.test.js`
  (5 tests): all passing — guest redirect without ever calling the API, empty state, API-error
  display, conversation row rendering + linking, unread-dot logic, empty/whitespace rejection,
  trim-and-clear on send, Enter-vs-Shift+Enter, draft preservation on send failure, disabled state
- Full frontend suite re-run: **47/47 passing** (was 37 before this round — no regressions)
- `npm run lint`: clean on every new/modified file. `npx prettier --write` applied, tests
  re-verified green afterward
- `npm --workspace frontend run build`: production build succeeds; `/chat` (2.1 kB) and `/chat/[id]`
  (3.22 kB, dynamic) both appear in the route table
- **Live end-to-end verification against the full Docker stack** (not just component tests) —
  driven through an actual browser, not curl/supertest:
  1. Logged in as the seeded demo buyer (`buyer.demo@example.com`), opened a real product listed
     by a different seller, clicked "ติดต่อผู้ขาย" — `POST /api/chat/conversations` fired, page
     navigated to `/chat/<id>`, room loaded with the resolved seller name and empty state
  2. Sent a Thai-language message — appeared immediately (optimistic), persisted correctly
     (confirmed by a full page reload showing the same message)
  3. Logged in as the seeded demo seller (`shop.denim@example.com`) in a second tab — NavBar chat
     badge showed **"1"** unread, inbox listed the conversation with the buyer's message preview
  4. Opened the room as the seller, replied — message appeared in the seller's view
  5. **Switched back to the buyer's already-open room tab without any manual reload — the
     seller's reply appeared automatically within one polling interval**, proving the 4-second
     polling mechanism genuinely delivers cross-account messages, not just same-session state
  6. Verified `ContactSellerButton` correctly does **not** render on a seller's own store page
     (self-conversation guard), and correctly **does** render on a different seller's store page
  7. Checked browser console: the only errors were the two expected `404`s from the
     buyer-is-not-a-seller public-profile lookup described above — nothing else

## `CHAT-005`: Internal API, SYSTEM message, event contract — Done

**Implementation evidence (2026-09-03):**

- `internalContext.js`: maps a single `contextId` onto `contextKey.js`'s per-type param shape,
  scoped to `ORDER`/`SUPPORT` only — the two contexts that naturally have one foreign id.
  `PRODUCT` (needs `productId`+`buyerId`) stays public-only; `DIRECT` isn't wired up at all this
  round. Attempting `PRODUCT`/anything else through the Internal API's creation route is a `400`,
  not silently accepted
- `internalController.js` implements all 6 endpoints from the plan's API Contract table:
  create-or-open (`201`/`200` on the create-or-open distinction, same semantics as the public
  path), by-context lookup, SYSTEM-message send, idempotent participant-add, status update
  (`ACTIVE`/`ARCHIVED`/`LOCKED`), and an unpaginated transcript dump for evidence-gathering
- **Refactored the message-write path** (`messageModel.createAndTouch`) out of
  `messageService.sendMessage` so the public and Internal API send paths share the exact same
  Message-create + Conversation-touch `$transaction`, rather than the Internal path duplicating
  that logic with its own copy that could drift
- Internal sends deliberately skip the participant/LOCKED checks the public path enforces — a
  SYSTEM notification must still land in a room an Admin has locked for moderation; only
  human-to-human replies are blocked by `LOCKED`. Verified directly (see below)
- `shared/src/events.js` gained `CHAT_CONVERSATION_OPENED`/`CHAT_MESSAGE_CREATED` — documented,
  not yet published anywhere (that's `CHAT-006`'s job once there's a Redis layer to publish to)
- `order-service/src/services/chatClient.js`: the first real Internal API consumer.
  `orderController.updateStatus` now calls `chatClient.notifyOrderStatusChanged(order, status)`
  after every status change — best-effort (the client swallows its own errors and logs instead of
  throwing, so a chat-service outage can never fail an order status transition), awaited (not
  fire-and-forget) since this is a low-traffic path and awaiting makes "the SYSTEM message exists"
  an actual guarantee rather than a race
- `docs/featureplan/integration.md` gained a full "Chat contract" section (Public API, Internal
  API, the `chatClient.js` consumer example, event names) so another Feature owner can build
  against Chat without reading `chat-service`'s source — and the stale "Customer Service/Chat"
  ownership row was corrected to reflect that `chat-service` itself now owns this, with Order as
  an additional real consumer

**Verification performed:**

14 tests in `test/internal-api.integration.test.js` against a real MongoDB replica set: missing/
wrong `x-internal-token` → `403`; ORDER create-or-open (`201` then `200` on repeat, matching ids);
by-context lookup (found and 404-not-found); SYSTEM message send updates the conversation preview;
idempotent participant-add (re-adding the same active participant doesn't duplicate) and a
genuine new participant add; **`updateStatus` to `LOCKED` cross-checked against the PUBLIC
send path** — a buyer's `POST /conversations/:id/messages` correctly gets `409` after the
Internal API locks the room, while an Internal SYSTEM send to the same now-locked room still
succeeds with `201`, proving the two APIs' authorization rules are actually connected through the
same underlying data, not just independently plausible; transcript returns full unpaginated
history in order; SUPPORT context works identically to ORDER; PRODUCT context creation is
rejected with `400`

Full chat-service suite re-run together: **57/57 passing**. Full repo `npm test`: 99 pass / 2 fail
(the same pre-existing `order-service` failures, unrelated) / 29 skip. `npm run lint`: clean.
`npx prettier --write` applied, tests re-verified green afterward.

**Live cross-service verification against the full Docker stack** (not just integration tests) —
rebuilt `chat-service` and `order-service`, then, using the seeded demo buyer's real JWT obtained
via `POST /api/auth/login`:

1. `PATCH /api/orders/<id>/status` with `{"status":"completed"}` on a real seeded order — `200`
2. Queried chat-service's Internal API directly
   (`GET /internal/conversations/by-context/ORDER/<orderId>`) from inside the Docker network —
   found a freshly-created `ORDER`-context conversation with the correct buyer/seller
   participants and `lastMessagePreview: "คำสั่งซื้อเสร็จสมบูรณ์แล้ว"`
3. Read the same conversation back through the **normal public API** the frontend uses
   (`GET /api/chat/conversations/<id>/messages` with the buyer's bearer token) — the SYSTEM
   message was there, with the correct `payload: {event: "order.completed", orderId}`
4. Confirmed the Internal API is unreachable through the public gateway
   (`POST http://localhost:8080/internal/conversations` → `401`, no proxy route registered for
   `/internal/*` at all) — defense in depth, not just relying on the token check

## `CHAT-006`: Socket.IO + Redis pub/sub, presence, typing — Done

**Implementation evidence:**

- `socketAuth.js`: Socket.IO `io.use()` middleware — verifies the JWT at handshake (the ONLY place
  a WebSocket connection is authenticated; the gateway's upgrade proxy forwards the raw upgrade
  request through without running its normal Bearer-token middleware, exactly as
  `architecture.md` warns). 6 unit tests: no token, empty token, malformed/tampered token, expired
  token, wrong-secret token all rejected; a valid token attaches `socket.data.userId`/`role`
- `socketServer.js`: `io.on("connection")` re-checks participant membership against the database
  on every `join` — the JWT proves _who_ you are, never _which rooms_ you're allowed into, so this
  re-runs the same `conversationService.isParticipant` check the REST API uses, not a second copy
  of that logic. Deliberately **no** `message:send` socket event — sending only ever goes through
  the REST endpoints (`messageController.js`/`internalController.js`), so there is exactly one
  code path responsible for the write+transaction+broadcast sequence, not a REST path and a socket
  path that could drift out of sync with each other's validation
- `broadcast.js`: fired only _after_ `messageModel.createAndTouch`'s MongoDB transaction commits —
  never before. `presence.js`: online/typing state lives in Redis keys with TTL (30s/5s), never
  touches MongoDB
- `@socket.io/redis-adapter` wired with the existing `REDIS_URL` — this is what makes pub/sub work
  across more than one chat-service instance (see the 2-instance test below)
- Frontend (`frontend/lib/chat.js`'s `connectSocket`, `frontend/app/chat/[id]/page.js`): the room
  page now connects a socket, joins the conversation, and receives `message:new`/`typing`/
  `presence` events live. REST polling (`CHAT-004`) is now the **fallback**, not the primary path
  — the polling effect is gated on `!realtime`, so it only runs while no socket is currently
  joined, and resumes automatically if the socket disconnects. `MessageComposer.js` gained an
  optional `onTyping` callback (debounced — fires once per typing burst, not per keystroke) wired
  to `typing:start`/`typing:stop`

**A significant bug was found and fixed in the GATEWAY, not chat-service** — see "Major finding"
below.

**A real scope gap was found and closed:** `CHAT-004`'s frontend was still polling-only —
`frontend/lib/chat.js` had no socket code at all, despite the backend realtime layer
(`socketServer.js`, `broadcast.js`, `presence.js`, `socketAuth.js`, the Redis adapter) already
being built and passing 74 backend tests. `CHAT-006`'s Step 6 (swap polling for sockets with REST
fallback) had not actually been done. Closed by adding `connectSocket` to `lib/chat.js`, wiring
the room page to it, and adding the typing-indicator UI — verified in a real browser (below), not
just assumed complete because the backend tests passed.

### Major finding: the gateway's WebSocket proxy corrupted the response under concurrency

Manual two-client testing against the real Docker stack (`socket.io-client` connecting through
`http://gateway:8080`, not `chat-service` directly) reliably failed: both clients got
`ECONNRESET`, even though nothing in chat-service's own code was wrong. Isolated step by step:

1. Two clients connecting **directly to chat-service**, bypassing the gateway entirely — worked
   perfectly, every time. This ruled out `socketServer.js`/Socket.IO/the Redis adapter.
2. Two clients through the gateway, **sequential** (one connects, waits, then the second) —
   sometimes worked, sometimes didn't, and once it failed once it kept failing for **every**
   subsequent connection attempt until the gateway process was restarted.
3. Added a temporary log to chat-service's `io.on("connection")` handler and confirmed: chat-service's
   own Socket.IO server successfully completed **both** WebSocket handshakes even during a
   "failed" concurrent attempt. The corruption was specifically in the gateway's proxying of the
   _response_ back to the client, not anywhere in chat-service.

The original implementation used `http-proxy-middleware`'s `ws: true` + `.upgrade()` — first as a
fresh `createProxyMiddleware()` instance per upgrade event, then as one shared instance (neither
fixed it; the shared instance was actually worse, since one failure poisoned every later
connection). Switching to the lower-level `http-proxy` library directly
(`httpProxy.createProxyServer({...}).ws(...)`) didn't fix it either — same corruption. Root-caused
to some interaction with `http-proxy`'s internal connection-pooling/agent handling for concurrent
WebSocket upgrades to the same target, which neither library's public API gives a way to fully
disable.

**Fix:** replaced both libraries with a hand-rolled raw TCP pipe in `backend/gateway/src/server.js`
— on each `upgrade` event, open a fresh `net.connect()` to chat-service, replay the original
request line/headers onto it, forward the buffered `head` bytes, then `socket.pipe(target)` /
`target.pipe(socket)` in both directions. Each upgrade gets its own independent TCP connection with
no shared pool to corrupt. `backend/gateway/src/app.js`'s regular HTTP proxy for `/api/chat/*` REST
endpoints is unaffected — only the WebSocket upgrade path changed. `http-proxy` was removed from
`package.json` again after confirming it wasn't the fix.

**Verified after the fix — all in the real Docker stack, not mocked:**

- 4 consecutive concurrent two-client runs through the gateway: all `MATCH: true` (message sent by
  one socket delivered live to the other)
- Two genuinely separate OS processes/containers (not `Promise.all` in one process) connecting
  concurrently through the gateway: both connect successfully
- **`docker compose up --scale chat-service=2`**, then 6 more concurrent runs — a temporary
  per-instance log confirmed BOTH `chat-service-1` and `chat-service-2` independently accepted
  connections for both the buyer and seller user ids across the 6 runs (i.e., the two clients
  genuinely landed on different instances some of the time, not just by coincidence), and every
  single run still delivered the message live — proving the Redis adapter's cross-instance pub/sub
  actually works, not just same-instance delivery
- Stopped the `redis` container entirely and sent a message via REST while it was down — the
  write still succeeded (`201`, message persisted in MongoDB) — confirming Redis really is a
  delivery-only layer, not a dependency of the write path, per the acceptance criteria's second
  half ("ปิด Redis แล้วข้อความยังไม่หาย")
- **Real browser verification** (not just `socket.io-client` test scripts): logged into two
  separate authenticated sessions (buyer, then seller — tabs share `localStorage` per-origin, so
  this required logging out/in between them rather than two simultaneous tabs), opened the same
  chat room as the seller, then sent a message as the buyer via a direct API call while the
  seller's tab stayed open with no reload — the message appeared live in the actual rendered
  React UI. Checked `read_console_messages` afterward: no new errors from the live update
- A real, non-blocking gap was found during this same browser check and is being left open
  deliberately: `GET /api/auth/users/:id/public` (`auth-service`, used to resolve the _other_
  participant's display name) is scoped to sellers only (`getPublicSellerProfile`) — so a
  **seller** viewing a chat with a **buyer** gets a `404` resolving the buyer's name and falls back
  to the generic label "ผู้ใช้" instead of a real name. The existing `.catch()` already handles
  this gracefully (no crash, no console error surfaced to the user), so it's a cosmetic gap, not a
  functional one. Fixing it means changing `auth-service`'s public-profile endpoint, which is
  outside chat's ownership — left as a known follow-up rather than fixed in this round
- Full chat-service suite re-run one final time after all changes: **74/74 passing**
- `npm run lint`: clean. `npx prettier --write` applied to all touched files, re-verified green.
- Frontend: all 47 tests still pass (`socket.io-client` imports cleanly in the jsdom test
  environment without needing to be mocked); production build succeeds including `/chat` and
  `/chat/[id]` routes
- A separate Docker gotcha surfaced and was worked around during this verification: after adding
  `socket.io-client` to `frontend/package.json`, a plain `docker compose up -d --build frontend`
  did NOT pick it up — the anonymous `node_modules` volume from `docker-compose.yml`
  (`- /app/frontend/node_modules`, there to stop the bind mount from shadowing the image's
  installed dependencies) persisted across the rebuild and kept serving the OLD `node_modules`
  layer. Fixed with `docker compose up -d --build --force-recreate -V frontend` (`-V` renews
  anonymous volumes on recreated containers)

## Post-`CHAT-006` bugfixes from live user testing

Two real issues surfaced from actual use after the round above was marked done — both fixed,
tested, and deployed:

1. **Duplicate own-message bubble under a realtime race.** `frontend/app/chat/[id]/page.js`
   reconciled the REST response for a just-sent message by `.map`-replacing the optimistic
   placeholder — but the server also broadcasts that same message to the sender's own socket (see
   `broadcast.js`), and that Socket.IO push routinely arrives before the awaited REST response
   does. When it did, the socket handler's id-based merge had already inserted the real message,
   and the REST handler's `.map` then created a second copy with the same id. Root-caused directly
   from a user screenshot showing the exact symptom (own messages doubled, other side saw only
   one — consistent with the race being visible only on the sender's own two-path reconciliation).
   Fixed by having the REST response path also merge by id (after dropping the optimistic
   placeholder) instead of `.map`-replacing — idempotent regardless of arrival order. A dedicated
   regression test (`chat-room.test.js`) forces the exact ordering that causes the race; confirmed
   it fails against the pre-fix code (`Received length: 2`) and passes after the fix.
2. **Inbox list and NavBar unread badge never updated live.** Both `frontend/app/chat/page.js` and
   `frontend/components/NavBar.js` fetched once on mount and never again — `CHAT-006`'s socket
   only ever attaches to an open `/chat/[id]` room, so a new message arriving while the user was
   anywhere else (including the inbox itself) stayed invisible until a manual page reload. Neither
   surface can reasonably join a Socket.IO room per conversation just to keep one list/badge
   current, so both now poll their existing REST endpoints every 15s (paused while
   `document.hidden`) — the same fallback mechanism the room page already relies on, just used as
   the only delivery mechanism here since there's no primary socket path for these surfaces.

Verified: frontend suite 49/49 (2 new tests), `npm run lint`, `format:check`, production build all
clean; the actual deployed `frontend` container was rebuilt (`--force-recreate -V`, since a plain
`--build` reuses the stale anonymous `node_modules` volume — see the Docker gotcha noted above).

## App-wide realtime (follow-up to the two bugfixes above)

Reported by the user: the `/chat` inbox and the NavBar unread badge still needed a manual reload
to reflect a new message — `CHAT-006` had only ever attached a socket to an open `/chat/[id]`
room, and the polling added in the previous fix was a 15s stopgap rather than real delivery.
Rather than leave two surfaces on a different mechanism from the room page, the socket was
hoisted to cover the whole app:

- **Server**: every authenticated socket now auto-joins its own `user:<userId>` room on connect
  (no extra authorization — the handshake already proved identity), and `broadcastMessage` emits
  a lightweight `conversation:activity` nudge to every participant's own room alongside the
  existing full-message broadcast to the conversation room. The nudge deliberately carries no
  unread total: a server-computed number would race the client's own concurrent mark-read calls,
  so the client re-reads the authoritative value itself. A `leave` event was added too, now that
  one socket outlives any single page — without it, a user who opens room A then room B stays
  joined to A on the server.
- **Client**: a new `ChatSocketProvider` in `app/layout.js` owns ONE connection per session; the
  room page, the inbox and the NavBar all subscribe through `useChatSocketEvent`, which handles
  unsubscribe-on-unmount — a leak that only becomes possible once the socket outlives the
  component that subscribed. REST polling survives strictly as the socket-is-down fallback,
  gated on `connected` so push and poll never run at once, plus a resync on every reconnect
  since that is exactly when events were missed.

**A test that had silently become vacuous was caught and fixed:** `chat-room.test.js` mocked
`lib/chat`'s `connectSocket`, so once the page started reading its socket from the provider
instead, the test's simulated "socket echo" went to a socket nobody was listening to — the
duplicate-message race assertion was passing for the wrong reason. Re-pointed at the provider
seam, added an assertion that a `message:new` listener actually exists to stop it regressing to
vacuous again, and re-confirmed the test still catches the original bug by reverting the fix and
watching it fail (`Received length: 2`).

**Verified live on the Docker stack, in a real browser:** a seller sitting on `/chat` saw the row
preview change and the badge go 4→5 with no reload when the buyer posted via the API; after
navigating to `/products` (nothing to do with chat at all) the badge still went 5→6 live.
Backend 77/77 (3 new), frontend 64/64 (15 new), lint/format/production build all clean.

## `CHAT-007` (partial): file/image attachments — code complete, integration run PENDING

Requested by the user after the round above. Only `CHAT-007`'s Steps 1–2 (attachments) were
built; Steps 3–6 (rate limit, `chat:read:any`, report wiring, soft delete) remain untouched.

**Design decision — private, not public.** Chat attachments follow `order-service`'s
`private-evidence` pattern (own directory, every read through `requireAuth` + a participant
check), NOT `product-service`'s `uploads/` tree, which the gateway serves statically to guests.
A photo sent inside a private conversation must not be readable by anyone holding the URL.

- `attachmentStorage.js`: multer with a narrow allow-list (`image/*`, mp4, quicktime, pdf), a
  10 MB cap, stored filenames that are always our own `randomUUID` (never the client's, which
  could carry path separators or a misleading double extension), and an `absolutePath()` guard
  against traversal.
- `attachmentService.js`: reuses `getForParticipant` — the exact same authorization as sending
  text, so the two paths can't drift. Download scopes `messageId` by `conversationId`;
  without that, a participant of conversation A could read B's attachment by passing B's id.
- The file never enters MongoDB (plan.md's Global Constraint): `Message.payload` holds only
  `{ storageKey, filename, mimeType, size }`, and the client derives the URL from ids it has.
- `messageModel.createAndTouch` gained an optional `preview` override so an uncaptioned
  attachment shows "📷 รูปภาพ" / "📎 filename" in the inbox instead of leaking the raw `[IMAGE]`
  enum into the UI.
- A rejected upload deletes the file multer had already written — otherwise every 403 would
  leave bytes orphaned on the volume permanently.
- Frontend: a paperclip in `MessageComposer` (text already typed becomes the caption rather
  than being discarded) and `MessageAttachment`, which must load bytes via `fetchAuthedBlobUrl`
  — a plain `<img src>` carries no bearer token and would 401, the same constraint the
  dispute-evidence viewer hit. Object URLs are revoked on unmount; non-images are fetched only
  on click rather than eagerly.

**A real API defect was found by running the integration suite and fixed:** an oversized upload
returned **500**, not `413`. multer rejects by throwing a `MulterError`, which carries no
`status`, so the shared `errorHandler` defaulted it to 500 — a client mistake presenting as a
server fault. Fixed with an `uploadErrorHandler` that maps `LIMIT_FILE_SIZE` → 413 and the
file-count errors → 400. Worth noting _why_ this nearly escaped: the test had been written to
accept `413 || 400 || 500`, so it passed against the broken behaviour. Tightened to assert `413`
exactly.

**Verified — backend unit + integration:** 9 unit tests (allow-list, size cap, path-traversal
guard, type/preview mapping) and **16 integration tests against a live MongoDB replica set and
real on-disk storage**, all passing: upload stores bytes on disk with only a reference in the
document (asserted, not assumed), download round-trips byte-for-byte, caption becomes body and
preview, `403` for a stranger uploading or downloading, `404` for a cross-conversation message
id, `409` on a locked room, `400` for a disallowed MIME type and for no file, `413` for
oversize, and a rejected upload leaves no orphaned file on disk. Full chat-service suite:
**102/102**. Full repo `npm test`: 186 pass / 2 fail / 25 skip, the 2 being the pre-existing
`order-service/checkout-reservation.test.js` failures confirmed earlier via `git stash`.

**Verified — live through the real gateway:** uploaded a real PNG as the buyer
(`POST /api/chat/conversations/:id/attachments`, multipart) and downloaded it as the seller —
`200 image/png`, bytes identical to the source file. A guest got `401`; a CS-staff account with
a valid token but no participation in the room got `403`. Oversize through the gateway returned
`413` and a `.sh` upload `400`, with the storage directory still holding exactly one file
afterwards (no orphans). Confirmed inside the container that the bytes live on the
`chat_private_attachments` volume under a UUID filename, and that MongoDB holds only
`{filename, mimeType, size, storageKey}`.

**Verified — live in a real browser:** the seller's chat room rendered the attachment as an
`<img>` whose `src` is a `blob:` URL (never a bare API URL) with `naturalWidth` decoding
correctly — proving the authenticated-fetch path works end to end — and the caption displayed
alongside it. Then uploaded a second image _through the UI itself_ by handing a `File` to the
composer's hidden input exactly as an OS file dialog would; it uploaded, appeared in the thread,
and rendered back as a decoded blob image. Frontend suite 75/75 (11 new), `npm run lint`,
`format:check` and the production build all clean.

**Next action:** None blocking — this round's confirmed scope (`CHAT-001`–`CHAT-006`) is complete.
`CHAT-007` (attachments, rate-limit, `chat:read:any` for CS/Admin — report-gated) and `CHAT-008`
(migrate CS ticket messages into this same Conversation/Message model) remain as the agreed
Roadmap, not started. The `auth-service` public-profile gap noted above is a good candidate for a
small follow-up task, separate from Chat's own scope.

---

## Counterparty display names — closing a user-enumeration hole

**Why this came up.** A seller opening a chat saw only "ผู้ใช้", so the user asked how the name
should be resolved. Tracing it exposed a real problem in the _existing_ code rather than a
missing feature: `ConversationRow` and the chat room each called
`GET /api/auth/users/:id/public` **from the browser**, once per row. That endpoint takes any
`userId` and returns `firstName` + `lastName`, so a single logged-in account could walk the id
space and rebuild the user directory — and it leaked full legal names while doing it. The user
raised exactly this ("แค่ login บัญชีเดียวแล้วสุ่มกู call ... ทุกคนเลยก็ได้อยู่ดีรึเปล่า"), which is
what made me abandon my first proposal (a slimmer _public_ `/users/:id/display` endpoint) — a
narrower leak is still a leak.

**The fix is architectural, not a filter.** The browser now has no user-lookup endpoint to call
at all. chat-service resolves names server-side and ships `participant.displayName` down with
the conversation itself. The ids it resolves are never chosen by the client: they are the
participants of a room the caller has _already_ passed `getForParticipant` for, so nothing
outside the caller's own conversations is reachable by construction.

| Layer        | Change                                                                                          | Evidence                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| auth-service | `POST /internal/users/display-names` behind `requireInternalToken`; batch capped at 100 ids     | `internal.test.js`: no token → 403, a user's own bearer token → **403** (the enumeration guard), non-array → 400, 101 ids → 400 |
| auth-service | Returns **first name only** (`NFR-SP-02`); an account with a shop resolves to the shop name     | DB-backed subtests assert the surname never appears in the payload, and that the shop name wins                                 |
| chat-service | `authClient.js` + `withDisplayNames()` enrich `GET /conversations` and `GET /conversations/:id` | 5 unit tests incl. auth-service down and 5xx → empty Map, request still succeeds                                                |
| frontend     | `ConversationRow` / chat room read the provided name; per-row `useEffect` lookup deleted        | `chat.test.js` asserts `apiFetch` is **never** called with `/api/auth/users/` while rendering the inbox                         |

**Deliberate design notes.**

- Shop-name-vs-first-name is decided by _"does this account have a shop name"_, **not** by a role
  check. This keeps the promise made in `CHAT-002`: chat contains zero role-based authorization,
  so any future role can use it unchanged.
- The lookup is **best-effort**. `authClient` swallows its own errors, so an auth-service outage
  degrades the header to "ผู้ใช้" instead of making a user unable to read their own messages.
  Chat's core function must not depend on another service being up.
- Unknown ids are omitted rather than throwing, so one deleted account can't break a whole room.
- Side benefit: the inbox went from N+1 requests (one per row) to zero extra round trips.

**Cross-feature note (flagged to the user).** `auth-service` belongs to the Admin owner
(สิรดนัย) in the ownership table, not to CS who owns chat. The change there is additive — a new
`/internal` route and one new service function; no existing auth behaviour was modified. The
pre-existing `GET /users/:id/public` endpoint is left as-is because the product/store pages still
use it legitimately for seller storefronts; narrowing _that_ is a separate Admin-owned task.

**Test status:** frontend 75/75, auth-service internal 5/5 (3 DB subtests skip without Postgres),
chat-service authClient 5/5, lint and format clean. The two `order-service/checkout-reservation`
failures in a full `npm test` are the same pre-existing, database-dependent ones recorded above.

---

## Role badges — "who am I talking to?"

Follow-up requested by the user right after the display-name work: show a small status under the
name saying what the other side is (a shop, customer support). Chose the role badge only; the
`contextType` variant ("about a product" / "about an order") was offered and declined.

**Cost: zero backend changes.** `Participant.role` has existed in `schema.prisma` since
`CHAT-002` (`BUYER | SELLER | AGENT | ADMIN | SYSTEM`) and was already being serialized to the
browser — confirmed in the live payload captured during the display-name verification. The whole
feature is one lookup table plus two render sites.

**This is not the role coupling the plan warns about.** Two different things share the word
"role":

|            | account role (auth-service)               | `Participant.role` (chat-service)           |
| ---------- | ----------------------------------------- | ------------------------------------------- |
| Means      | "this person is a seller on the platform" | "in _this room_, this person is the seller" |
| Owner      | auth-service                              | chat-service's own document                 |
| Chat's use | **never read**                            | its own data, read for display only         |

Nothing is authorized on the badge — `getForParticipant` remains the single choke point and still
checks membership, not role. The per-room value is also strictly more expressive: the same person
is the seller in one conversation and the buyer in another, which a single account-level role
cannot represent. `lib/chat.test.js` encodes exactly that case.

- `participantRoleLabel()` returns `null` for an unrecognised role, so a role introduced
  elsewhere later renders **no badge** rather than leaking a raw enum like `MODERATOR` into a
  Thai UI.
- The badge always describes the _other_ participant. A test asserts "ผู้ซื้อ" never appears
  while a buyer is the viewer.

**Test integrity check.** After the tests passed I disabled the feature (made
`participantRoleLabel` return `null` unconditionally) and re-ran: **4 tests failed**, then
restored. Without that step a badge test can pass because the text happens to appear elsewhere on
the page. Also replaced `chat-room.test.js`'s hand-copied `otherParticipant` mock with
`jest.requireActual` — a mock that reimplements logic can drift from the real thing and quietly
stop testing it.

**Verified live in the browser:** the inbox showed both rooms at once — "น่าน · ฝ่ายบริการลูกค้า"
and "Retro & Vintage House · ร้านค้า" — distinguishable without opening either, which was the
point of the request. Both room headers rendered the correct badge. Pushed a message from the CS
side through the Internal API and it arrived in the open room with no refresh, confirming this
change didn't disturb the socket path. Frontend suite **81/81**, lint and format clean.

_(A batch of `401` and WebSocket errors seen in the console mid-session turned out to be an
expired 15-minute access token from the earlier verification run, not a regression: after
re-login every request in the network log was `200` and realtime delivery worked.)_

---

## `CHAT-007` Step 3: rate limiting + a message length cap

Found while auditing readiness before handing the system over, not from the plan: **nothing
limited how long a message could be.** Verified against the running service — a 30,000-character
message returned `201` and was stored. The only ceiling was `express.json()`'s 100 KB default, an
artifact of the framework rather than a decision. No rate limiting existed either (`CHAT-007`
Step 3, never started).

### Message length

| Decision                                  | Reason                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4,000 **characters**, not bytes           | Thai is 3 bytes/char in UTF-8; a byte cap would silently give Thai users a third of the room English users get                                                                                                                                                                                              |
| Enforced in `messageModel.createAndTouch` | The one function every write path shares — same reasoning as `getForParticipant` being the one authorization point. A controller-level check would need repeating in the user path, the Internal API path, the attachment-caption path, and every path added later; whichever is forgotten becomes the hole |
| Internal API is **not** exempt            | A 4,000+ character SYSTEM message is equally unrenderable. A test asserts service-to-service callers are held to it                                                                                                                                                                                         |

### Rate limiting

| Decision                         | Reason                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis, **not** in-memory         | chat-service runs as multiple instances (`CHAT-006`'s 2-instance scale test). A per-process counter gives each instance its own budget, making the real ceiling N× the documented one — silently |
| One Lua script for INCR + EXPIRE | Two round trips leave a window where a crash produces a key with no TTL, i.e. a permanently locked-out user                                                                                      |
| **Fails open** on a Redis outage | Chat's core job is letting people read and send their own messages. Redis being down already degrades presence and cross-instance delivery; it must not also become an outage                    |
| Keyed by `userId`, never IP      | Behind the gateway every request shares one address — an IP limit would throttle the entire user base together                                                                                   |
| `/internal` unlimited            | order-service legitimately bursts SYSTEM messages; it authenticates with the internal token, not a user budget                                                                                   |

Budgets: send 30/10s, attach 10/min (sized by the 10 MB-per-file disk cost, not chattiness),
open-conversation 20/min.

### Bugs I introduced and caught by running the tests

1. **The limit broke 4 existing tests.** `message.integration.test.js` posts 65 messages in under
   a second to exercise pagination and started getting `429`. Fixed by making the budgets
   env-overridable (`CHAT_RATE_LIMIT_*`) so the _test_ raises its own ceiling — **not** by
   softening the production number, which is unchanged.
2. **Two test files hung for 300s.** The limiter opens its Redis connection lazily on the first
   limited request and nothing closed it, so the test process never exited. Added
   `closeRateLimitClient()` to each file's `after()`.
3. **The unit tests hung too, at first.** Mocking `ioredis.prototype.eval` still constructs a real
   client whose reconnect loop keeps the loop alive. Replaced with injecting a fake client through
   an argument — the logic is now testable with no Redis at all.

### Evidence

- chat-service **123/123** (5 new unit, 11 new integration against real MongoDB + real Redis).
  Full repo: only the 2 pre-existing Postgres-dependent `order-service` failures remain.
- **Test-integrity check:** disabled both features and re-ran — 5 tests failed, then restored.
  (Caveat worth recording: the attachment-caption subtest still passed while disabled, because its
  input length is derived from the same constant being disabled. The other four are the real
  guards.)
- **Through the real gateway:** 4,000 chars → `201`; 4,001 → `400` with a readable Thai message;
  30,000 → `400` (was `201` before this change). 40 rapid sends → 27 through, 13 blocked with
  `Retry-After: 10`.
- **In the browser:** typing 3,970 characters showed "เหลือ 30 ตัวอักษร"; pasting 10,000 clamped
  to exactly 4,000 with the counter turning red at "เหลือ 0 ตัวอักษร".

**Still open for CS work:** `CHAT-007` Steps 4–5 (`chat:read:any`, report-gated CS reads) and
`CHAT-008` (support-service → Internal API). Neither is started; both cross into other owners'
services.
