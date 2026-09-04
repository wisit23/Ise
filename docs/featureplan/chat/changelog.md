# Chat Platform Feature Changelog

## 2026-09-03 — Planning: MongoDB + Redis polyglot decision

- ตัดสินใจร่วมกับผู้ใช้: `chat-service` เก็บข้อความใน MongoDB (ไม่ใช่ Postgres เดิม) ส่วน Redis
  เป็น delivery/presence layer เท่านั้น — เหตุผลเต็มอยู่ใน `plan.md`
- Owner ยืนยันเป็น CS (อชิรวินท์), Reviewer สิรดนัย — Chat ออกแบบให้ Feature อื่นดึงไปใช้ได้ผ่าน
  `contextType`/Internal API ตั้งแต่แรก แม้ Owner จะเป็น CS
- ขอบเขตรอบนี้ยืนยันเป็น `CHAT-001`–`CHAT-006` เท่านั้น; `CHAT-007`/`CHAT-008` เลื่อนออกไป
- CS/Admin จะอ่านห้องอื่นได้เฉพาะห้องที่ถูก report แล้ว (ยัง implement ใน `CHAT-007`)
- เขียน `plan.md` ฉบับเต็ม 8 Task 5 Phase — ยังไม่มี application code ถูกเปลี่ยนในรายการนี้

## 2026-09-03 — `CHAT-001`: MongoDB replica set, Redis wiring, CI

- เพิ่ม `mongo` + `mongo-init` service ใน `docker-compose.yml` — replica set เดี่ยว (`rs0`) พร้อม
  healthcheck ที่รอ `rs.status().ok` จริง ไม่ใช่แค่ process listening
- เพิ่ม `infra/mongo/init-replica.sh` — bootstrap script ที่ idempotent (rerun แล้ว no-op)
- ย้าย `DATABASE_URL_CHAT` จาก Postgres เป็น MongoDB URL ใน `.env.example`; ลบ
  `CREATE DATABASE reloop_chat;` ออกจาก `infra/postgres/init-databases.sql`
- สร้าง `backend/services/chat-service/prisma/schema.prisma` — `Conversation`/`Participant`
  (embedded)/`Message` ตาม Data Model ใน `plan.md` (ดึงมาจาก `CHAT-002` มาทำพร้อมกันเพื่อพิสูจน์
  `db push` ใช้ได้จริงกับ replica set — งาน domain logic ของ `CHAT-002` ยังไม่เริ่ม)
- `chat-service`'s `/health` เปลี่ยนจากตอบ `ok` ลอย ๆ เป็น ping MongoDB จริงผ่าน
  `$runCommandRaw({ping:1})`, คืน `503` เมื่อต่อไม่ได้
- เพิ่ม `chat-service` เข้า `scripts/ensurePrismaClients.js` และ CI (`.github/workflows/ci.yml`) —
  Mongo รันเป็น `docker run` แยกใน CI step ไม่ใช่ `services:` เพราะ GitHub Actions service container
  สั่ง post-start command ไม่ได้
- เขียน `test/health.integration.test.js` — สอง test (`db:ok` ตอนต่อได้จริง, `503` ตอนต่อไม่ได้)
  ตาม skip-if-unreachable + `REQUIRE_INTEGRATION=1` pattern เดิมของ repo
- ตรวจสอบแล้วด้วย Docker จริง: replica set init, `db push` สร้าง collection/index ครบ, container
  build+up ผ่าน dependency chain ทั้งหมด, `/health` ตอบ `db:"ok"` ข้าม network จริง, gateway proxy
  ยัง auth-gate `/api/chat/*` เหมือนเดิม, `npm test`/`lint`/`format:check`/`secret-scan` ผ่านหมด
  (2 test ที่ fail ใน `order-service` เป็นของเดิมก่อนหน้านี้ ยืนยันด้วย `git stash` แล้ว)
- ไม่มี Chat feature (route/auth/realtime) ในรายการนี้ — เป็นงาน infra ล้วน

## 2026-09-03 — `CHAT-002`: Conversation, participant authorization, create-or-open

- `contextKey.js` — pure function สร้าง dedupe key ต่อ `contextType`; 7 unit test ผ่านหมด
- `conversationService.js` — `createOrOpenProductConversation` resolve `sellerId` จาก
  product-service ฝั่ง server เท่านั้น (ไม่อ่าน `sellerId` จาก client เลย); duplicate-key error
  (`P2002`) จับแล้วคืนห้องเดิม แทนการ error
- `POST /conversations` (เฉพาะ `contextType: "PRODUCT"` รอบนี้), `GET /conversations` (inbox),
  `GET /conversations/:id` (403 ถ้าไม่ใช่คู่สนทนา) — authorization เช็คจากฐานข้อมูลจริงทุก request
- ตรวจสอบด้วย 21 integration test บน MongoDB replica set จริง รวม concurrency race test (ยิงสอง
  request พร้อมกัน ยืนยันด้วย MongoDB count query ว่าได้ document เดียว ไม่ใช่แค่เช็ค response)
- เจอบั๊กใน test เอง (ไม่ใช่ production code) ระหว่างเขียน: mock `global.fetch` ถูกสลับแล้วไม่คืนค่า
  เดิม ทำให้ test หลังจากนั้น fail เงียบ ๆ — แก้โดยรวม mock เป็นตัวเดียวที่ handle ทุก case
- `npm run lint`, `npx prettier --write` แล้วรัน test ซ้ำยืนยันว่ายังผ่าน

## 2026-09-03 — `CHAT-003`: Message ส่ง/อ่าน, cursor pagination, unread count

- `cursor.js` — cursor บน message id (MongoDB ObjectId) ไม่ใช่ offset/page เหมือน
  `shared/pagination.js`; 7 unit test ผ่านหมด
- `sendMessage` เขียน Message + อัปเดต `lastMessageAt`/`lastMessagePreview` ใน `$transaction`
  เดียว; ปฏิเสธห้อง `LOCKED` (`409`) และ body ว่าง (`400`)
- **เจอบั๊กจริงในโค้ด production ระหว่างเขียน test**: ไม่ได้เขียน `deletedAt: null` ตอนสร้าง
  Message ทำให้ Mongo เก็บ field แบบไม่มีอยู่เลย แล้ว filter `deletedAt: null` (ที่ใช้ทุก read
  path) ไม่ match field ที่ไม่มีอยู่ — ข้อความทุกอันมองไม่เห็นตัวเองทันทีหลังสร้าง ยืนยันด้วย
  script ทดสอบตรงกับ replica set จริง แก้โดยเขียน `deletedAt: null` ชัดเจนตอน create
- เจอปัญหาที่สอง (test-environment ไม่ใช่ app bug): รัน test กับฐานข้อมูลใหม่ที่ยังไม่ได้
  `prisma db push` ทำให้ unique index ไม่มี concurrency race handling เลยพังเงียบ ๆ — ยืนยันว่า
  ทำไม Dockerfile/CI ต้อง `db push` ก่อนรันเสมอ
- ตรวจสอบด้วย 20 integration test บน MongoDB replica set จริง รวม cursor pagination กับ
  ประวัติ 65 ข้อความจริง (3 หน้า ไม่ซ้ำไม่ขาด) และ interleaved insert ระหว่าง paging
- รวม chat-service suite ทั้งหมด (contextKey, cursor, health, conversation, message): 43/43 ผ่าน
- `npm run lint`, `npx prettier --write` แล้วรัน test ซ้ำยืนยันว่ายังผ่าน

## 2026-09-03 — `CHAT-004`: Frontend — กล่องข้อความ, ห้องแชท, ปุ่มติดต่อผู้ขาย

- `lib/chat.js` + `ContactSellerButton`/`ConversationRow`/`MessageList`/`MessageComposer`
- ปุ่มติดต่อผู้ขายต่อเข้า 3 จุด: หน้าสินค้า, หน้าร้านค้า, หน้าคำสั่งซื้อ — ปลด dependency ที่
  `buyer/plan.md` `BUY-004` Step 3 ค้างอยู่
- `/chat` (inbox) และ `/chat/[id]` (ห้อง) — optimistic append, mark-read, ปุ่ม
  "โหลดข้อความเก่ากว่านี้" (แทน scroll-trigger ตาม plan.md เดิม — ใช้ cursor mechanic เดียวกัน
  แต่ทดสอบง่ายกว่า), polling ทุก 4 วิ หยุดเมื่อ tab ไม่ active
- NavBar เพิ่ม badge unread ตาม pattern เดียวกับ cart count
- เจอบั๊ก 2 จุดระหว่างเขียน test (ทั้งคู่เป็นบั๊กใน test/mock ไม่ใช่ production code): mock
  `useRouter` คืน object ใหม่ทุกครั้งทำให้ effect loop; `MessageComposer` ไม่ catch onSend ที่
  reject (แก้จริงในตัว component เพราะเป็นช่องโหว่จริงของ reusable component)
- ตรวจสอบ **จริงผ่าน browser กับ Docker stack เต็มระบบ**: buyer คุยกับ seller คนละ tab, seller
  เห็น badge unread, ตอบกลับ, buyer เห็นข้อความใหม่ผ่าน polling โดยไม่ต้อง reload
- 10 frontend test ใหม่ผ่านหมด; รวม suite ทั้งหมด 47/47 (เดิม 37) — ไม่มี regression
- `npm run lint`, production build (`next build`) ผ่าน — `/chat`, `/chat/[id]` อยู่ใน route table

## 2026-09-03 — `CHAT-005`: Internal API, SYSTEM message, event contract

- `internalContext.js` + `internalController.js` — 6 endpoint ตาม API Contract ใน plan.md
  (create-or-open, by-context lookup, ส่ง SYSTEM message, เพิ่ม participant แบบ idempotent,
  เปลี่ยน status, ดึง transcript เต็ม) จำกัดเฉพาะ `ORDER`/`SUPPORT` context (PRODUCT ยังทำผ่าน
  Public API เท่านั้น)
- Refactor `messageModel.createAndTouch` ออกจาก `messageService.sendMessage` ให้ Public/Internal
  send path ใช้ transaction เดียวกัน ไม่ก็อปปี้ logic ซ้ำ
- Internal send ข้าม participant/LOCKED check โดยตั้งใจ — SYSTEM message ต้องส่งเข้าห้องที่ Admin
  ล็อกไว้ได้ ส่วน human reply ยังโดนบล็อกเหมือนเดิม (พิสูจน์ด้วย cross-check test จริง)
- เพิ่ม `CHAT_CONVERSATION_OPENED`/`CHAT_MESSAGE_CREATED` ใน `shared/src/events.js` (ยังไม่
  publish จริง รอ `CHAT-006`)
- `order-service/src/services/chatClient.js` — Consumer จริงตัวแรก ต่อเข้า
  `orderController.updateStatus` แบบ best-effort + await
- เขียน Chat contract เต็มลง `docs/featureplan/integration.md` พร้อมแก้ ownership table row เดิม
  ที่ล้าสมัย
- 14 integration test ใหม่ผ่านหมด รวม chat-service suite ทั้งหมด 57/57
- **ตรวจสอบจริงผ่าน Docker stack**: PATCH order status จริง → เห็น ORDER conversation ถูกสร้าง
  อัตโนมัติใน chat-service พร้อม SYSTEM message → buyer อ่านได้ผ่าน Public API ปกติ → ยืนยัน
  Internal API เข้าผ่าน gateway สาธารณะไม่ได้ (401, ไม่มี proxy route)
- `npm test` ทั้ง repo: 99 pass / 2 fail (เดิม, ไม่เกี่ยวข้อง) / 29 skip; `npm run lint` ผ่าน

## 2026-09-03 — `CHAT-006`: Socket.IO + Redis pub/sub, presence, typing

- `socketAuth.js` — verify JWT ตอน handshake (จุดเดียวที่ auth WebSocket ได้ เพราะ gateway
  upgrade proxy ข้าม middleware ปกติ); 6 unit test
- `socketServer.js` — เช็ค participant ซ้ำตอน `join` จาก database จริง ไม่เชื่อ handshake อย่าง
  เดียว; ไม่มี `message:send` event ตั้งใจ — ส่งข้อความผ่าน REST เท่านั้นเพื่อให้มี code path
  เดียวรับผิดชอบ write+transaction+broadcast
- `broadcast.js` ยิง event **หลัง** MongoDB transaction สำเร็จเท่านั้น; `presence.js` ใช้ Redis
  TTL key ไม่แตะ MongoDB
- Frontend: `connectSocket` ใน `lib/chat.js`, ห้องแชทต่อ socket จริงและใช้ REST polling เป็น
  fallback เท่านั้น (ปิดเมื่อ `realtime` true), `MessageComposer` เพิ่ม `onTyping` แบบ debounce
- **เจอ scope gap จริง**: Backend realtime ทำเสร็จและ test ผ่าน 74 ตัวแล้ว แต่ Frontend (CHAT-004)
  ยังเป็น polling-only ไม่มีโค้ด socket เลย — ปิด gap นี้ในรอบเดียวกัน ไม่ปล่อยให้ "backend
  เขียวหมด" หลอกว่า feature เสร็จ
- **เจอบั๊กใหญ่ที่ Gateway ไม่ใช่ chat-service**: WebSocket proxy ของ Gateway (ทั้ง
  `http-proxy-middleware` แบบ per-request instance, แบบ shared instance, และ raw `http-proxy`
  library โดยตรง) ทำ response เสียหายเมื่อมี 2 client ต่อพร้อมกัน — พิสูจน์ด้วยการทดสอบตรงไปที่
  chat-service (ผ่านเสมอ) เทียบกับผ่าน gateway (ล้มเสมอ) และ log ยืนยันว่า chat-service ทำ
  handshake สำเร็จทั้งคู่จริง ปัญหาอยู่ที่ response path ของ proxy library เท่านั้น แก้โดยเขียน
  raw TCP pipe เองใน `backend/gateway/src/server.js` (เปิด `net.connect()` ใหม่ต่อ upgrade,
  ส่งต่อ header/head bytes, แล้ว pipe สองทาง) — ดูรายละเอียดเต็มใน `decision.md` CHAT-DEC-005
- ตรวจสอบจริงด้วย Docker stack: concurrent 2-client ผ่าน gateway 4 รอบติด, 2 process แยกกันจริง,
  **`docker compose up --scale chat-service=2`** พร้อม log ยืนยันว่าทั้งสอง instance รับ
  connection จริงและยัง deliver ข้อความข้าม instance ได้ (Redis adapter ทำงานจริง), หยุด Redis
  แล้วส่งข้อความยังสำเร็จ (persist ไม่พึ่ง Redis), และ**ทดสอบผ่าน Browser จริง** — login 2 session
  (buyer/seller) แยกกัน ส่งข้อความจาก API ขณะ seller เปิดหน้าแชทค้างไว้ ข้อความขึ้นสดไม่ต้อง reload
- เจอ gap จริงระหว่างตรวจ: `GET /api/auth/users/:id/public` เป็น seller-only endpoint ทำให้ seller
  มองชื่อ buyer ไม่ออก (fallback เป็น "ผู้ใช้" อยู่แล้ว ไม่ crash) — เป็นของ auth-service ไม่ใช่
  ขอบเขต Chat ปล่อยไว้เป็น follow-up แยก ไม่ได้แก้ในรอบนี้
- เจอ Docker gotcha ระหว่างตรวจ: anonymous `node_modules` volume บัง dependency ใหม่หลัง rebuild
  ต้องใช้ `--force-recreate -V` ถึงจะเห็นของใหม่จริง
- chat-service suite ทั้งหมด: 74/74 ผ่าน; `npm run lint`/`format:check` ผ่าน; Frontend 47/47 ผ่าน
  - production build สำเร็จ (`/chat`, `/chat/[id]` รวมอยู่)
- **ขอบเขตรอบนี้ (`CHAT-001`–`CHAT-006`) เสร็จสมบูรณ์แล้ว** `CHAT-007`/`CHAT-008` ยังไม่เริ่ม

## 2026-09-03 — Post-CHAT-006 bugfix: duplicate own message on realtime race + missing background updates

- **เจอบั๊กจริงจาก user report**: ข้อความของตัวเองขึ้นซ้ำ 2 ครั้งแบบสุ่ม เกิดเพราะ REST response
  (แทนที่ optimistic bubble ด้วย `.map`) กับ Socket echo ของข้อความตัวเอง (merge ด้วย id) ทำงาน
  แข่งกัน — ถ้า Socket มาถึงก่อน REST ตอบกลับ (บ่อยเพราะ WS เร็วกว่า HTTP) ได้ข้อความซ้ำ 2 รายการ
  คนละ path การ reconcile กัน แก้โดยให้ REST response ก็ merge ด้วย id หลังตัด optimistic ทิ้งแทน
  `.map` เดิม ทำให้ idempotent ไม่ว่าใครมาถึงก่อน
- เขียน `chat-room.test.js` จำลอง race นี้ตรง ๆ (บังคับ Socket event มาก่อน REST resolve) — รันกับ
  โค้ดเดิมแล้ว fail จริง (`Received length: 2`) ยืนยันว่า test จับบั๊กถูกจุด แล้วผ่านหลังแก้
- เจอ scope gap ที่สองจาก user report: หน้า `/chat` (inbox) และ badge unread บน `NavBar` ไม่มี
  Socket และไม่มี polling เลย — โหลดครั้งเดียวตอน mount ค้างจนกว่าจะ reload หน้า (CHAT-006 ต่อ
  realtime ให้แค่หน้าห้องแชทที่เปิดอยู่เท่านั้นตามแผนเดิม) แก้ด้วย polling ทุก 15 วิ (หยุดเมื่อ tab
  ไม่ active) ทั้งสองจุด — pattern เดียวกับ REST fallback ที่ห้องแชทใช้อยู่แล้ว
- Frontend test ทั้งหมด 49/49 ผ่าน (เพิ่ม 2 จาก chat-room.test.js); `npm run lint`,
  `format:check`, production build ผ่านหมด; rebuild container จริงด้วย `--force-recreate -V`

## 2026-09-03 — App-wide realtime: one shared socket + per-user notification room

- **ที่มา**: ผู้ใช้รายงานว่าหน้า `/chat` และ badge บน NavBar ไม่อัปเดตเองเมื่อมีข้อความใหม่
  ต้อง refresh ก่อนถึงจะเห็น — เพราะ `CHAT-006` ต่อ Socket ให้เฉพาะหน้าห้องแชทที่เปิดอยู่
  (`/chat/[id]`) เท่านั้น ส่วนอื่นโหลดครั้งเดียวตอน mount
- **Backend**: ทุก socket ที่ authenticate แล้วจะ join "ห้องส่วนตัว" ของตัวเอง
  (`user:<userId>`) อัตโนมัติตอน connect — ไม่ต้อง authorize เพิ่มเพราะ handshake พิสูจน์
  ตัวตนไปแล้ว วิธีนี้ทำให้ไม่ต้อง join ห้องแชททุกห้องที่ผู้ใช้มี (ซึ่งจะโตตามจำนวนห้อง)
- `broadcast.broadcastMessage(conversation, message)` (เดิมรับ `conversationId`) ยิงเพิ่ม
  `conversation:activity` ไปยังห้องส่วนตัวของ**ทุก participant** — payload เบา ๆ ตั้งใจ**ไม่ใส่
  จำนวน unread** เพราะเลขที่ server คำนวณจะ race กับ mark-read ที่ client เรียกเอง ให้ client
  ไปอ่านเลขจริงเองแทน
- เพิ่ม socket event `leave` — จำเป็นเพราะ client ใช้ socket เส้นเดียวข้ามหน้าแล้ว ถ้าไม่ leave
  ผู้ใช้ที่เปิดห้อง A แล้วไปห้อง B จะยังคงอยู่ในห้อง A ฝั่ง server
- `messageService.sendMessage` คืน `{ message, conversation }` แทน message เดี่ยว เพื่อให้
  controller ส่ง participants ต่อให้ broadcast ได้โดยไม่ต้อง query ซ้ำ
- **Frontend**: `ChatSocketProvider` ใหม่ — Socket **เส้นเดียวทั้งแอป** อยู่ใน `layout.js`
  แทนที่จะให้แต่ละหน้าเปิดเอง (เดิมหน้าห้องแชทเปิด/ปิด socket ทุกครั้งที่เข้า-ออก) พร้อม hook
  `useChatSocketEvent` ที่ subscribe/unsubscribe ให้อัตโนมัติ — สำคัญเพราะ socket อยู่ยาวกว่า
  หน้าเว็บแล้ว handler ที่ไม่ถูกถอดจะรั่วสะสมทุกครั้งที่เปลี่ยนหน้า
- NavBar + หน้า `/chat` ฟัง `conversation:activity` แล้วอ่านค่าจริงใหม่ทันที; REST polling
  เหลือเป็น fallback ที่ทำงาน**เฉพาะตอน socket ไม่ connected** (gate ด้วย `socketConnected`)
  ไม่ให้ push กับ poll ทำงานซ้อนกัน; และ resync ทุกครั้งที่ socket reconnect เพราะช่วงที่หลุด
  ไปคือช่วงที่พลาด event
- **Test ใหม่ 15 ตัว**: backend 3 (participant ที่ไม่ได้ join ห้องยังได้ activity, ไม่รั่วไปหา
  คนนอกห้อง, SYSTEM message ก็ยิง activity), frontend 12 (`ChatSocketProvider` 5 ตัว รวม
  "3 consumer เปิด socket เส้นเดียว" และ unsubscribe ตอน unmount, `NavBar` 5 ตัว รวม badge
  อัปเดตสดและ resync ตอน reconnect, inbox 1 ตัว, room page 2 ตัว)
- **แก้ test ที่กลายเป็น vacuous**: `chat-room.test.js` เดิม mock `connectSocket` ของ
  `lib/chat` — พอหน้าเปลี่ยนไปใช้ socket จาก provider แทน test ก็ยิง event ใส่ socket ที่ไม่มี
  ใครฟัง ทำให้ **ผ่านด้วยเหตุผลผิด** แก้โดย mock ที่ provider seam แทน แล้วเพิ่ม test ยืนยันว่า
  มี listener จริงเพื่อกันไม่ให้ vacuous อีก; ยืนยันซ้ำด้วยการ revert fix ชั่วคราวแล้วดูว่า
  test fail จริง (`Received length: 2`)
- **ตรวจสอบจริงบน Docker stack**: socket ที่ไม่ join ห้องเลยยังได้ `conversation:activity`
  ผ่าน gateway จริง, in-room realtime ยังทำงานปกติ (ไม่ regress), และ**ทดสอบผ่าน browser จริง**
  — seller เปิดหน้า `/chat` ค้างไว้ preview เปลี่ยนสดเป็นข้อความใหม่ + badge 4→5 โดยไม่ reload
  จากนั้นย้ายไปหน้า `/products` (ไม่เกี่ยวกับแชทเลย) badge ยังขึ้น 5→6 สดเช่นกัน
- Backend 77/77, Frontend 64/64, lint/format/production build ผ่านหมด

## 2026-09-03 — `CHAT-007` (บางส่วน): ไฟล์แนบ/รูปภาพ

- ทำเฉพาะ **Step 1–2 ของ `CHAT-007`** (ไฟล์แนบ) ตามที่ผู้ใช้ขอ — Step 3–6 (rate limit,
  `chat:read:any`, report, soft delete) **ยังไม่ทำ**
- **เก็บแบบ private ไม่ใช่ public**: ไฟล์แนบในแชทเป็นของคู่สนทนาเท่านั้น จึงใช้ pattern เดียวกับ
  `order-service`'s `private-evidence` (ไดเรกทอรีของตัวเอง + อ่านผ่าน requireAuth + participant
  check) ไม่ใช่ `product-service`'s `uploads/` ที่ gateway เสิร์ฟเป็น static ให้ guest
- `attachmentStorage.js` — multer + allow-list (`image/*`, `mp4`, `quicktime`, `pdf`), cap 10 MB,
  ชื่อไฟล์ที่เก็บเป็น `randomUUID` ของเราเองเสมอ ไม่ใช่ชื่อจาก client (กัน path separator /
  double extension) พร้อม `absolutePath()` ที่กัน path traversal
- `attachmentService.js` — ใช้ `getForParticipant` ตัวเดียวกับการส่งข้อความ (participant-only +
  บล็อกห้อง `LOCKED`) จึงไม่มีทางที่กฎสองทางจะเพี้ยนจากกัน; `messageId` ถูก scope ด้วย
  `conversationId` ตอนดาวน์โหลด — ไม่งั้นคนในห้อง A จะอ่านไฟล์ของห้อง B ได้ด้วยการยัด id
- ไฟล์ **ไม่ลงฐานข้อมูล** ตาม Global Constraint — เก็บบนดิสก์ ใน `Message.payload` มีแค่
  `{ storageKey, filename, mimeType, size }`; URL ที่ client ใช้คำนวณเองจาก id ที่มีอยู่แล้ว
- `type` เป็น `IMAGE` เมื่อเป็น `image/*` และ `FILE` สำหรับที่เหลือ — ให้ server เป็นคนตัดสิน
  ว่า client ควร render inline หรือให้ดาวน์โหลด แทนที่จะให้ client เดาจาก MIME เอง
- เพิ่ม `preview` override ใน `messageModel.createAndTouch` — ไฟล์แนบที่ไม่มี caption จะได้
  preview เป็น "📷 รูปภาพ" / "📎 ชื่อไฟล์" แทน `[IMAGE]` ดิบ ๆ ที่หลุด enum ภายในไปโชว์ผู้ใช้
- upload ที่ถูกปฏิเสธ (ไม่ใช่ participant / ห้องล็อก) จะ **ลบไฟล์ทิ้ง** — multer เขียนไฟล์ลงดิสก์
  ก่อนที่ check ของเราจะรัน ถ้าไม่ลบจะเหลือไฟล์ค้าง volume ตลอดไป
- Frontend: ปุ่มคลิปหนีบใน `MessageComposer` (ข้อความที่พิมพ์ค้างไว้กลายเป็น caption ไม่ถูกทิ้ง),
  `MessageAttachment` แสดงรูป/ไฟล์ — ต้องโหลดผ่าน `fetchAuthedBlobUrl` เพราะ `<img src>` ธรรมดา
  ไม่แนบ bearer token จะได้ 401 (ข้อจำกัดเดียวกับตอนดูหลักฐานข้อพิพาท); revoke object URL ตอน
  unmount กันหน่วยความจำรั่ว; ไฟล์ที่ไม่ใช่รูปจะ **ไม่โหลดล่วงหน้า** โหลดตอนกดเท่านั้น
- เพิ่ม volume `chat_private_attachments` ใน compose + `.gitignore` (ยืนยันด้วย `git check-ignore`)
- **Test**: 9 unit test ใหม่ฝั่ง backend (allow-list, cap, path traversal, type/preview mapping)
  ผ่านหมด; 11 frontend test ใหม่ (`MessageAttachment` 6, `MessageComposer` attach 5) ผ่านหมด
  รวม frontend 75/75; lint/format/production build ผ่าน
- **ยังไม่ได้รัน**: `attachment.integration.test.js` (15 subtest — อัปโหลดจริง/ดาวน์โหลดจริง/
  403/404/409/400/orphan cleanup) เขียนเสร็จแล้วแต่ยังไม่ได้รันกับ MongoDB จริง เพราะ Docker
  Desktop ล่มระหว่างทาง (WSL backend ไม่ยอมขึ้นหลัง restart หลายรอบ) — ต้องรันด้วย
  `REQUIRE_INTEGRATION=1` เมื่อ Docker กลับมา ก่อนถือว่า acceptance ผ่านจริง

## 2026-09-04 — `CHAT-007` (ไฟล์แนบ): รัน integration test แล้ว + แก้บั๊ก 413

- Docker กลับมาแล้ว จึงได้รัน `attachment.integration.test.js` ที่ค้างอยู่ — **16/16 ผ่าน**
  บน MongoDB replica set จริง + ดิสก์จริง
- **เจอบั๊ก API จริงจากการรัน**: ไฟล์ใหญ่เกินคืน **500 ไม่ใช่ 413** เพราะ multer โยน
  `MulterError` ที่ไม่มี `status` ทำให้ `errorHandler` กลางตีเป็น 500 — ความผิดฝั่ง client
  กลายเป็นเหมือน server พัง แก้ด้วย `uploadErrorHandler` แปลง `LIMIT_FILE_SIZE` → 413 และ
  error เรื่องจำนวนไฟล์ → 400
- **บทเรียนจากบั๊กนี้**: test เดิมเขียนรับ `413 || 400 || 500` (เผื่อไว้) เลย **ผ่านทั้งที่ API
  ตอบผิด** — แก้ให้ assert `413` ตรง ๆ การเขียน assertion แบบเผื่อ ๆ ทำให้ test ไร้ความหมาย
- **ตรวจสอบจริงผ่าน gateway**: อัปโหลด PNG จริงเป็น buyer แล้วดาวน์โหลดเป็น seller ได้
  `200 image/png` ไบต์ตรงกันเป๊ะ; guest ได้ `401`; บัญชี CS ที่ token ใช้ได้แต่ไม่ได้อยู่ในห้อง
  ได้ `403`; ไฟล์ใหญ่เกิน `413`; `.sh` ได้ `400`; หลังจากนั้นไดเรกทอรียังมีไฟล์เดียว (ไม่มีขยะค้าง)
- ยืนยันในคอนเทนเนอร์: ไฟล์อยู่บน volume `chat_private_attachments` ชื่อเป็น UUID และ MongoDB
  เก็บแค่ metadata ไม่มีไบต์ไฟล์
- **ตรวจสอบจริงบนเบราว์เซอร์**: รูปแสดงเป็น `<img>` ที่ `src` เป็น `blob:` (ไม่ใช่ URL ตรง ๆ)
  และ decode ได้จริง พิสูจน์ว่าเส้นทาง authenticated fetch ทำงานครบ; แล้วอัปโหลดรูปที่สอง
  **ผ่าน UI จริง** (ยัด File เข้า input ของปุ่มคลิปหนีบแบบเดียวกับที่ file dialog ทำ) ขึ้นในแชท
  และ render กลับมาได้
- chat-service ทั้งหมด **102/102**; ทั้ง repo 186 pass / 2 fail (ของเดิม) / 25 skip;
  frontend 75/75; lint/format/build ผ่าน

## 2026-09-04 — `CHAT-007` (ชื่อคู่สนทนา): ให้ chat resolve ชื่อเองผ่าน Internal API

- **ปัญหาเดิม**: หน้าแชทเรียก `GET /api/auth/users/:id/public` จากเบราว์เซอร์เพื่อแปลง
  `userId` เป็นชื่อ ซึ่งแปลว่า **แค่ล็อกอินบัญชีเดียวก็ไล่ยิงทุก id เพื่อดูดรายชื่อผู้ใช้ทั้งระบบได้**
  (enumeration) และ endpoint นั้นยังคืน `firstName + lastName` เต็ม ๆ ด้วย
- **ทางแก้**: ย้ายการแปลงชื่อไปอยู่ **ฝั่ง server** — chat-service เป็นคนถามชื่อให้ แล้วส่ง
  `participant.displayName` มากับตัว conversation เลย เบราว์เซอร์จึง **ไม่มี endpoint ค้นหาผู้ใช้
  ให้เรียกอีกต่อไป** และ id ที่ถูกแปลงชื่อเป็น id ของคนในห้องที่ผู้เรียก "ผ่านการตรวจสิทธิแล้ว"
  เท่านั้น ไม่มีทางถามชื่อคนนอกห้อง
- **auth-service**: `POST /internal/users/display-names` (ใหม่) หลัง `requireInternalToken`
  รับ id เป็นชุด (จำกัด 100 ต่อครั้ง กัน dump ทั้งตาราง) คืน **ชื่อต้นอย่างเดียว** ตาม
  `NFR-SP-02` — นามสกุลไม่ออกจาก service เลย; บัญชีที่มีร้านจะคืน **ชื่อร้าน** แทน เพราะชื่อร้าน
  เป็นตัวตนทางธุรกิจที่เปิดสาธารณะอยู่แล้วและเป็นชื่อที่ผู้ซื้อจำได้จริง — ตัดสินจาก "มีชื่อร้านไหม"
  **ไม่ใช่เช็ค role** จึงไม่ผูก chat กับ BUYER/SELLER; id ที่ไม่มีอยู่จะหายไปเฉย ๆ ไม่ throw
  (บัญชีที่ถูกลบบัญชีเดียวต้องไม่ทำให้ทั้งห้อง render ไม่ได้)
- **chat-service**: `src/services/authClient.js` — best-effort ล้วน ถ้า auth-service ล่ม
  จะคืน Map ว่างและ **ยังอ่านแชทได้ตามปกติ** (ตกไปแสดง "ผู้ใช้") ไม่ใช่ทั้งหน้าพัง;
  `withDisplayNames()` เติมชื่อให้ทั้ง inbox ในคำขอเดียว (จาก N+1 request ต่อแถว → 0)
- **Frontend**: `ConversationRow` และหน้าห้องแชทอ่าน `displayName` ที่ติดมากับข้อมูลแล้ว
  ลบ `useEffect` ที่ยิง lookup รายแถวทิ้ง — เพิ่ม test ที่ assert ตรง ๆ ว่า **ไม่มีการเรียก
  `/api/auth/users/` ตอน render inbox** เพื่อกันไม่ให้ใครเผลอเอากลับมาใหม่
- **Test**: auth-service 5 ตัว (ไม่มี token → 403, bearer token ของผู้ใช้ก็ไม่ผ่าน, ชนิดข้อมูลผิด
  → 400, เกิน 100 → 400) + 3 subtest กับ DB จริง (ชื่อต้นเท่านั้น/ชื่อร้าน/id ไม่รู้จัก);
  chat-service authClient 5 ตัว (map, ส่ง token + de-dup, auth ล่ม, 5xx, ชุดว่างไม่ยิงเลย);
  frontend 75/75 ผ่าน; lint/format ผ่าน

## 2026-09-04 — `CHAT-007` (ป้ายบทบาท): บอกว่ากำลังคุยกับใครอยู่

- ผู้ใช้ขอให้มี status ใต้ชื่อว่าห้องนี้คุยกับใคร (ร้านค้า / ฝ่ายบริการลูกค้า) — เลือก "แบบ ก"
  คือป้ายบอก**บทบาทของคู่สนทนา** อย่างเดียว ไม่เอาป้ายบอกหัวข้อ (`contextType`)
- **ไม่ต้องแก้ backend เลยแม้แต่บรรทัดเดียว** — `Participant.role` มีอยู่ใน schema ตั้งแต่
  `CHAT-002` แล้ว (`BUYER | SELLER | AGENT | ADMIN | SYSTEM`) และถูกส่งถึงเบราว์เซอร์อยู่แล้ว
  งานทั้งหมดคือแปลงค่าเป็นภาษาไทยแล้วแสดง
- **จุดที่ต้องแยกให้ชัด**: อันนี้อ่าน `Participant.role` ซึ่งเป็น**ข้อมูลของ chat เองระดับห้อง**
  ไม่ใช่ role ระดับบัญชีของ auth-service — คนเดียวกันเป็นผู้ขายในห้องหนึ่งและผู้ซื้อในอีกห้องได้
  ซึ่ง role ระดับบัญชีบอกไม่ได้ และ**ไม่มีอะไรตรวจสิทธิ์ด้วยค่านี้** เป็นแค่ป้ายกำกับล้วน ๆ
  จึงไม่ขัดกับหลักการ "chat ต้องไม่ผูกกับ role" ที่ยึดมาตลอด
- `participantRoleLabel()` ใน `lib/chat.js` คืน `null` ถ้าเจอ role ที่ไม่รู้จัก — วันหน้ามีใคร
  เพิ่ม role ใหม่ที่อื่น หน้าแชทจะ**ไม่แสดงป้าย**แทนที่จะปล่อยคำดิบ ๆ อย่าง `MODERATOR` หลุด UI
- ป้ายอธิบาย**อีกฝ่ายเสมอ** ไม่ใช่ตัวเอง (มี test assert ว่า "ผู้ซื้อ" ต้องไม่โผล่ตอนผู้ซื้อเป็นคนดู)
- **Test**: `lib/chat.test.js` ใหม่ 4 ตัว + inbox 1 ตัว (ห้องร้านค้า/ห้อง CS/role ที่ไม่รู้จัก
  อยู่ในจอเดียวกัน) + หัวห้อง 1 ตัว; frontend รวม **81/81**
- **พิสูจน์ว่า test ไม่กลวง**: ปิดฟีเจอร์ชั่วคราว (ให้ `participantRoleLabel` คืน `null` เสมอ)
  แล้วรันใหม่ → **fail 4 ตัว** ตามคาด แล้วค่อยคืนค่าเดิม
- ระหว่างแก้ยัง**ลบ mock ที่เขียนมือซ้ำ** ใน `chat-room.test.js` ทิ้ง เปลี่ยนไปใช้
  `jest.requireActual` สำหรับฟังก์ชัน pure — mock ที่ก๊อปตรรกะมาเองมีสิทธิ์เพี้ยนจากของจริงได้
- **ตรวจจริงบนเบราว์เซอร์**: กล่องข้อความแสดงสองห้องพร้อมกัน — "น่าน · ฝ่ายบริการลูกค้า" กับ
  "Retro & Vintage House · ร้านค้า" แยกออกทันทีโดยไม่ต้องเปิดอ่าน; หัวห้องทั้งสองแสดงป้ายถูก;
  ยิงข้อความจาก CS เข้าไปแล้วขึ้น realtime ทันทีไม่ต้องรีเฟรช (ยืนยันว่าไม่ไปทำ socket พัง)

## 2026-09-04 — `CHAT-007` Step 3: rate limit + จำกัดความยาวข้อความ

- **เจอตอนตรวจสถานะก่อนส่งมอบ ไม่ได้อยู่ในแผนเดิม**: ไม่มีการจำกัดความยาวข้อความเลย ยิงจริง
  ผ่าน gateway ได้ **30,000 ตัวอักษร → `201` เก็บลง MongoDB** เพดานเดียวที่มีคือ default
  100 KB ของ `express.json()` ซึ่งเป็นอุบัติเหตุจาก framework ไม่ใช่การตัดสินใจ
- `MAX_MESSAGE_LENGTH = 4000` **นับเป็นตัวอักษร ไม่ใช่ไบต์** — ภาษาไทย 1 ตัวกิน 3 ไบต์ใน UTF-8
  ถ้าใช้ไบต์คนไทยจะได้พื้นที่แค่ 1 ใน 3 ของคนใช้ภาษาอังกฤษเงียบ ๆ
- **บังคับที่ `messageModel.createAndTouch` จุดเดียว** ด้วยเหตุผลเดียวกับที่ `getForParticipant`
  เป็นด่านสิทธิ์จุดเดียว — ถ้าไปเช็คที่ controller ต้องเช็คซ้ำทั้งเส้น user, เส้น Internal API,
  เส้น caption ของไฟล์แนบ และเส้นที่จะเพิ่มในอนาคต เส้นไหนลืมก็กลายเป็นรู (มี test ยืนยันว่า
  **Internal API ก็ข้ามไม่ได้**)
- **Rate limit ใช้ Redis ไม่ใช่ in-memory** — chat รันหลาย instance (มี 2-instance scale test
  จาก `CHAT-006`) ถ้านับในหน่วยความจำแต่ละ instance จะมีโควตาของตัวเอง เพดานจริงกลายเป็น N เท่า
  ของที่เขียนไว้โดยไม่มีใครรู้; ใช้ Redis ตัวเดิมที่มีอยู่แล้วสำหรับ Socket.IO adapter
- INCR กับ EXPIRE รวมเป็น **Lua script ตัวเดียว** — ถ้าแยกสองคำสั่งแล้วโปรเซสตายคั่นกลาง
  จะเหลือ key ที่ไม่มี TTL = ผู้ใช้คนนั้นโดนแบนถาวร
- **Fail open**: Redis ล่ม → ปล่อยผ่าน ไม่ใช่บล็อก เพราะหน้าที่หลักของแชทคือให้คนอ่าน/ส่งข้อความ
  ตัวเองได้ Redis ล่มทำให้ presence กับ cross-instance เสียอยู่แล้ว ต้องไม่ให้กลายเป็นล่มทั้งระบบ
- โควตา: ส่งข้อความ 30/10 วิ, แนบไฟล์ 10/นาที (คิดจากพื้นที่ดิสก์ 10 MB ต่อไฟล์ ไม่ใช่ความถี่),
  เปิดห้อง 20/นาที — นับ**ต่อ userId ไม่ใช่ต่อ IP** เพราะหลัง gateway ทุกคนใช้ IP เดียวกัน
  ถ้านับ IP จะกลายเป็นบล็อกผู้ใช้ทั้งเว็บพร้อมกัน
- **`/internal` ไม่โดนจำกัด** — order-service ส่ง SYSTEM message เป็นชุดได้ตามปกติ
- Frontend: `maxLength` + ตัวนับที่โผล่เมื่อเหลือ 200 ตัวสุดท้าย (ไม่ใช่โชว์ "0 / 4,000" ค้างไว้
  ตั้งแต่กล่องว่าง) + ตัดข้อความที่ **paste** เกินโควตาทิ้ง เพราะ `maxLength` กันการพิมพ์ได้
  แต่บางเบราว์เซอร์ปล่อย paste ผ่าน

### บั๊กที่ตัวเองทำแล้วเจอจากการรัน test (ไม่ใช่จากการเดา)

- **Rate limit ทำ test เดิมพัง 4 ตัว** — `message.integration.test.js` ยิง 65 ข้อความรวดเพื่อ
  เทส pagination เลยโดน 429 **ไม่ได้แก้ด้วยการลดเพดานจริง** แต่ทำให้ override ได้ด้วย env
  (`CHAT_RATE_LIMIT_*`) แล้วให้ test ยกเพดานของตัวเอง — production ยังใช้เลขเดิมเป๊ะ
- **Test 2 ไฟล์ค้าง 300 วินาที** — limiter เปิด Redis connection แบบ lazy ตอนโดนยิงครั้งแรก
  แล้วไม่มีใครปิด โปรเซส test เลยไม่จบ เพิ่ม `closeRateLimitClient()` ใน `after()` ทุกไฟล์
- **Unit test ค้างเหมือนกันตอนแรก** เพราะ mock `ioredis.prototype.eval` ยังสร้าง client จริง
  ที่ retry ไม่เลิก — เปลี่ยนเป็น**ฉีด client เข้าไปทาง argument** แทนการ mock prototype
- **Test**: unit 5 ตัว (ใต้เพดาน/เกินเพดาน/แยกตาม user/Redis ล่ม fail-open/ไม่มี userId),
  integration 11 ตัว กับ **MongoDB + Redis จริง**; chat-service รวม **123/123**
- **พิสูจน์ว่า test ไม่กลวง**: ปิดทั้งสองฟีเจอร์ชั่วคราวแล้วรันใหม่ → fail 5 ตัว แล้วคืนค่า
- **ตรวจจริงผ่าน gateway**: 4,000 ตัว → `201`, 4,001 ตัว → `400` พร้อมข้อความไทยที่อ่านรู้เรื่อง,
  30,000 ตัว → `400` (เดิมเคยได้ `201`); ยิงรัว 40 ครั้ง → ผ่าน 27 บล็อก 13 พร้อม `Retry-After: 10`
- **ตรวจบนเบราว์เซอร์**: พิมพ์ 3,970 ตัวขึ้น "เหลือ 30 ตัวอักษร"; paste 10,000 ตัวถูกตัดเหลือ
  4,000 พอดีและตัวนับเปลี่ยนเป็นสีแดง "เหลือ 0 ตัวอักษร"
