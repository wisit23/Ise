# Chat Platform Implementation Plan

> **สถานะเอกสาร:** ยืนยันแล้วโดยผู้ใช้เมื่อ 2026-09-03 — เริ่ม `CHAT-001` ได้
> **ขอบเขตรอบนี้: `CHAT-001`–`CHAT-006` เท่านั้น** (ดู "การตัดสินใจที่ยืนยันแล้ว" ด้านล่าง)
> `CHAT-007`–`CHAT-008` ยังอยู่ในเอกสารเป็น Roadmap แต่ไม่ใช่ขอบเขตที่ต้องส่งรอบนี้

**Goal:** สร้าง `chat-service` ให้เป็น **ระบบข้อความกลางของทั้งแพลตฟอร์ม** ที่ Feature อื่น
(Buyer, Seller, Customer Service, Admin) เรียกใช้ได้ผ่าน Contract เดียวกัน โดยรอบแรกส่งมอบ
เส้นทาง Buyer ↔ Seller ให้ใช้งานได้จริงก่อน แล้วจึงเปิดให้ Feature อื่นต่อเข้ามาโดยไม่ต้อง
แก้ Data Model

**Architecture:** `chat-service` เป็น Owner เดียวของข้อความทุกชนิดในระบบ เก็บใน **MongoDB**
(document store) ส่วน Business Process ของแต่ละ Feature ยังอยู่ในฐาน PostgreSQL ของ Service
เจ้าของเดิม เชื่อมกันด้วย `conversationId` แบบ soft reference ไม่ใช่ FK ระดับฐานข้อมูล

**Tech Stack:** Express, Prisma 5.18 (MongoDB connector), MongoDB 7 (replica set), Redis 7
(ioredis), Socket.IO, Next.js 15, Node test runner + supertest

---

## Global Constraints

- Owner: อชิรวินท์ จรูญกีรติโรจน์ (Customer Service — เจ้าของจริงตาม `FR-4.1.2`) ·
  Reviewer: สิรดนัย กันหา (ตาม cross-review ที่ตั้งไว้ใน [`../README.md`](../README.md))
  — Chat เปิดให้ Feature อื่นเรียกใช้ผ่าน Contract เดียวกันได้ตั้งแต่ `CHAT-005`
  แต่ความเป็นเจ้าของเอกสาร/การตัดสินใจ design ยังอยู่ที่ CS
- **ขอบเขตรอบนี้ (ยืนยันแล้ว 2026-09-03):** ทำถึง `CHAT-006` เท่านั้น — เน้นให้ตัวระบบแชท
  เองสมบูรณ์ (ห้อง, ข้อความ, สิทธิ์, realtime) ก่อน ยังไม่ผูกกับ Role อื่นนอกจาก
  Buyer/Seller ที่จำเป็นสำหรับพิสูจน์ว่าระบบทำงานจริง `CHAT-007` (ไฟล์แนบ/rate-limit/
  Admin moderation) และ `CHAT-008` (ย้ายข้อความ CS) เลื่อนไปทำต่อหลังจากนี้
- Trace: `UR-05`, `UR-18`, `UC-05`, `FR-2.2.1`, `FR-2.2.2`, `FR-4.1.2`, `WF-06`
- ใช้ Contract กลางจาก [`../integration.md`](../integration.md); ห้าม Service อื่นอ่าน MongoDB
  ของ Chat โดยตรง ต้องผ่าน Internal API เท่านั้น
- **MongoDB ต้องรันเป็น replica set** แม้เป็น node เดียว มิฉะนั้น Prisma ใช้ transaction ไม่ได้
- ข้อความต้อง persist ใน MongoDB จริง ห้ามใช้ in-memory database เป็นหลักฐาน acceptance
- ไฟล์แนบ **ห้ามเก็บลงฐานข้อมูล** ต้องเก็บเป็นไฟล์แล้วเก็บเฉพาะ URL ตาม Pattern เดิมของ
  `product-service/src/controllers/uploadController.js`
- Redis เป็น **delivery layer เท่านั้น** ห้ามใช้เป็นแหล่งความจริงของข้อความ — เขียน MongoDB
  สำเร็จก่อนเสมอ แล้วจึง publish
- ทุก Task อัปเดต `progress.md`, append `changelog.md`, เพิ่มบทเรียนใน `teachme.md`

---

## Requirement Traceability

| UR      | Functional Requirement | Workflow | Task                    | Phase     |
| ------- | ---------------------- | -------- | ----------------------- | --------- |
| `UR-05` | `FR-2.2.1`, `FR-2.2.2` | `WF-06`  | `CHAT-002`–`CHAT-004`   | Core      |
| `UR-05` | `FR-2.2.2`             | `WF-06`  | `CHAT-006` (realtime)   | Enhance   |
| `UR-18` | `FR-4.1.2`             | `WF-10`  | `CHAT-005`, `CHAT-008`  | Integrate |
| `UR-34` | `FR-4.1.2`             | `WF-10`  | `CHAT-007` (moderation) | Integrate |
| —       | Infra prerequisite     | —        | `CHAT-001`              | Core      |

### MongoDB acceptance สำหรับ Chat

- `CHAT-002`: create-or-open ยิงพร้อมกัน 2 ครั้งต้องได้ Conversation เดียว อ่านกลับจาก
  MongoDB จริง (พิสูจน์ unique index ไม่ใช่ if-else ในโค้ด)
- `CHAT-003`: ข้อความและ `lastReadAt` ต้องรอด process restart
- `CHAT-005`: Service อื่นสร้างห้อง/ส่ง SYSTEM message ผ่าน Internal API ได้ และคนนอกห้อง
  อ่านไม่ได้ (`403`)
- `CHAT-008`: ข้อความตั๋วเดิมย้ายครบ ไม่มีข้อความหาย และ ticket lifecycle test เดิมยังผ่าน
- ทุก Test รันด้วย `REQUIRE_INTEGRATION=1`; ฐานข้อมูลที่ต่อไม่ได้ต้อง **fail ไม่ใช่ skip**

---

## Data Model

เก็บใน MongoDB ผ่าน Prisma — **โครงหลักเป็น field ตายตัวเพื่อให้ index/query ได้เร็ว ส่วนที่
แปรผันตามชนิดข้อความอยู่ใน `payload` แบบ schemaless**

```prisma
model Conversation {
  id                 String        @id @default(auto()) @map("_id") @db.ObjectId
  contextType        String        // PRODUCT | ORDER | SUPPORT | DIRECT
  contextId          String?       // productId / orderId / ticketId
  contextKey         String        @unique   // dedupe key — ดูด้านล่าง
  participants       Participant[] // embedded document (Mongo-native)
  status             String        @default("ACTIVE")  // ACTIVE|ARCHIVED|LOCKED
  lastMessageAt      DateTime?
  lastMessagePreview String?
  createdBy          String
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  messages Message[]

  @@index([lastMessageAt])
}

type Participant {              // embedded ไม่ใช่ collection แยก
  userId     String
  role       String             // BUYER|SELLER|AGENT|ADMIN|SYSTEM
  joinedAt   DateTime
  lastReadAt DateTime?
  leftAt     DateTime?
}

model Message {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  conversationId String    @db.ObjectId
  senderId       String
  senderRole     String
  type           String    @default("TEXT")
  // TEXT | IMAGE | FILE | PRODUCT_CARD | ORDER_CARD | SYSTEM
  body           String    @default("")
  payload        Json?     // ← ส่วน semi-structured ตามชนิด
  visibility     String    @default("ALL")   // ALL | INTERNAL (โน้ตภายในของ CS)
  editedAt       DateTime?
  deletedAt      DateTime? // soft delete — ข้อความเป็นหลักฐานตอนพิพาท ห้ามลบจริง
  createdAt      DateTime  @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId, createdAt])
  @@index([conversationId, deletedAt, createdAt])
}
```

**`contextKey` คือหัวใจของ create-or-open** — เป็น string ที่คำนวณได้แน่นอนจาก Context
เช่น `PRODUCT:<productId>:<buyerId>` เมื่อมี `@unique` การกดปุ่ม "ติดต่อผู้ขาย" รัว ๆ จะ
ชนกันที่ index แล้วเราจับ duplicate-key error เพื่อคืนห้องเดิม — **ไม่ใช่การเช็คว่า "มีห้องอยู่
แล้วหรือยัง" ในโค้ด ซึ่ง race กันได้**

| contextType | contextKey                           | ผู้เข้าร่วม       |
| ----------- | ------------------------------------ | ----------------- |
| `PRODUCT`   | `PRODUCT:<productId>:<buyerId>`      | Buyer + Seller    |
| `ORDER`     | `ORDER:<orderId>`                    | Buyer + Seller    |
| `SUPPORT`   | `SUPPORT:<ticketId>`                 | Requester + Agent |
| `DIRECT`    | `DIRECT:<userIdA>:<userIdB>` (เรียง) | สองฝ่าย           |

`payload` ต่อชนิด:

```
TEXT          → null
IMAGE / FILE  → { storageKey, filename, mimeType, size }
PRODUCT_CARD  → { productId, title, price, thumbnailUrl }
ORDER_CARD    → { orderId, status, total }
SYSTEM        → { event, actorId?, ...ตามเหตุการณ์ }
```

**หมายเหตุ (แก้จากแผนเดิมตอน implement `CHAT-007`):** ช่อง `url` ในแผนเดิมถูกเปลี่ยนเป็น
`storageKey` เพราะ URL ที่ client ใช้ (`/api/chat/conversations/<convId>/attachments/<messageId>`)
คำนวณได้จาก id ที่ client มีอยู่แล้ว — เก็บซ้ำใน payload จะเป็นข้อมูลที่ derive ได้และต้องเขียน
สองครั้ง (message id ยังไม่มีตอนสร้าง payload) ส่วน `width`/`height` ตัดออกเพราะต้องพึ่ง library
อ่านขนาดรูป ซึ่งเกินขอบเขตที่จำเป็น

---

## API Contract

### Public API (ผ่าน Gateway, ใช้ Bearer JWT)

| Method | Path                                                 | ทำอะไร                                      |
| ------ | ---------------------------------------------------- | ------------------------------------------- |
| POST   | `/api/chat/conversations`                            | create-or-open (idempotent ด้วย contextKey) |
| GET    | `/api/chat/conversations`                            | กล่องข้อความของฉัน + unread count           |
| GET    | `/api/chat/conversations/:id`                        | รายละเอียดห้อง (403 ถ้าไม่ใช่คู่สนทนา)      |
| GET    | `/api/chat/conversations/:id/messages`               | ประวัติ — **cursor pagination**             |
| POST   | `/api/chat/conversations/:id/messages`               | ส่งข้อความ                                  |
| POST   | `/api/chat/conversations/:id/read`                   | mark read ถึงเวลาปัจจุบัน                   |
| POST   | `/api/chat/conversations/:id/attachments`            | อัปโหลดไฟล์แนบ (multipart) — `CHAT-007`     |
| GET    | `/api/chat/conversations/:id/attachments/:messageId` | ดาวน์โหลดไฟล์แนบ (participant เท่านั้น)     |
| GET    | `/api/chat/unread-count`                             | ตัวเลขบน NavBar                             |

**ทำไม cursor ไม่ใช่ `page`/`limit` เดิมจาก `shared/pagination.js`:** แชทเพิ่มข้อความจาก
ด้านบนตลอดเวลา ถ้าใช้ offset แล้วมีข้อความใหม่เข้ามาระหว่างที่ผู้ใช้เลื่อนขึ้น จะเห็นข้อความ
ซ้ำหรือข้ามหาย — ต้องใช้ `?before=<messageId>&limit=` แทน แล้วคืน `{items, nextCursor}`

### Internal API (`x-internal-token`, ไม่ผ่าน Gateway)

**นี่คือส่วนที่ทำให้ Chat เป็น "ระบบกลาง"** — Service อื่นเรียกได้โดยไม่ต้องมี JWT ของผู้ใช้

| Method | Path                                           | ผู้ใช้ตัวอย่าง                        |
| ------ | ---------------------------------------------- | ------------------------------------- |
| POST   | `/internal/conversations`                      | support-service เปิดห้องให้ตั๋วใหม่   |
| GET    | `/internal/conversations/by-context/:type/:id` | ค้นห้องจาก orderId/ticketId           |
| POST   | `/internal/conversations/:id/messages`         | order-service ส่ง SYSTEM "จัดส่งแล้ว" |
| POST   | `/internal/conversations/:id/participants`     | CS เข้าร่วมห้องพิพาท                  |
| PATCH  | `/internal/conversations/:id/status`           | Admin ล็อกห้องเมื่อถูกร้องเรียน       |
| GET    | `/internal/conversations/:id/transcript`       | Admin/CS ดึงเป็นหลักฐาน               |

ใช้ `requireInternalToken` จาก `@reloop/shared` ตาม Pattern เดิมของ product lock/unlock

### Authorization

- ทุก Public endpoint เช็คว่า `req.userId` อยู่ใน `participants` ของห้องนั้นจริง
  **ตัดสินจากเอกสารในฐานข้อมูล ไม่ใช่จาก claim ใน JWT**
- สร้างห้องแบบ `PRODUCT`: Client ส่งมาแค่ `productId` — **Server ไปถาม product-service เอง
  ว่า sellerId คือใคร** ห้ามให้ Client ส่ง `sellerId` มา ไม่งั้นปลอมได้
- CS/Admin อ่านห้องที่ตัวเองไม่ได้อยู่: ต้องผ่าน Internal API หรือ permission ใหม่
  `chat:read:any` (ดูคำถามข้อ 4)

---

## Phase 0 — Infrastructure

### Task CHAT-001: MongoDB replica set, Redis wiring และ CI — ✅ Done (2026-09-03)

> หลักฐานเต็มอยู่ที่ [`progress.md`](progress.md) และ [`docs/progress.md`](../../progress.md)
> Task `CHAT-001`

**Files:**

- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `infra/postgres/init-databases.sql`
- Create: `infra/mongo/init-replica.sh`
- Modify: `scripts/ensurePrismaClients.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `backend/services/chat-service/package.json`
- Modify: `backend/services/chat-service/src/app.js`

**Steps:**

- [x] **Step 1:** เพิ่ม service `mongo` ใน compose — image `mongo:7`, command
      `--replSet rs0 --bind_ip_all`, healthcheck ที่รัน `rs.status()` และ init container
      หรือ entrypoint ที่สั่ง `rs.initiate()` ครั้งแรก
- [x] **Step 2:** เปลี่ยน `DATABASE_URL_CHAT` ใน `.env.example` เป็น
      `mongodb://mongo:27017/reloop_chat?replicaSet=rs0&directConnection=true`
      และเพิ่ม `REDIS_URL` ให้ `chat-service` ใน compose
- [x] **Step 3:** ลบ `CREATE DATABASE reloop_chat;` ออกจาก `init-databases.sql`
      พร้อมคอมเมนต์ว่าย้ายไป MongoDB แล้ว (ห้ามทิ้งฐานว่างไว้ให้คนอ่านสับสน)
- [x] **Step 4:** เพิ่ม entry `chat-service` ใน `ensurePrismaClients.js` (`CLIENTS` array)
- [x] **Step 5:** เพิ่ม MongoDB ลง CI — GitHub Actions `services:` สั่ง `rs.initiate()`
      ไม่ได้ตรง ๆ ต้องใช้ `supercharge/mongodb-github-action` (รองรับ replica set)
      หรือรัน `docker run` ใน step แยก แล้วตั้ง `DATABASE_URL_CHAT`
- [x] **Step 6:** ทำ `/health` ของ chat-service ping MongoDB จริง (ไม่ใช่ตอบ ok ลอย ๆ)
      แล้วเขียน `test/health.integration.test.js` ตาม Pattern support-service
- [x] **Step 7:** `docker compose up` แล้วยืนยันว่า Prisma ต่อ Mongo ได้ และ CI เขียว

**Acceptance:** `npx prisma db push` ทำงานได้กับ Mongo, `/health` ตอบ `{db:"ok"}`,
CI job ผ่านโดย integration test **ไม่ถูก skip**

> ⚠️ **ความเสี่ยงที่สูงที่สุดของทั้งแผนอยู่ที่ Step 1 และ 5** — replica set บน Docker และบน
> GitHub Actions เป็นจุดที่คนติดกันบ่อยที่สุด ถ้าติดเกินครึ่งวันให้หยุดแล้วคุยกันใหม่

---

## Phase 1 — Core (Buyer ↔ Seller ใช้งานได้จริง)

### Task CHAT-002: Conversation, participant authorization และ create-or-open — ✅ Done (2026-09-03)

**Files:**

- Create: `backend/services/chat-service/prisma/schema.prisma`
- Create: `backend/services/chat-service/src/models/prismaClient.js`
- Create: `backend/services/chat-service/src/features/conversations/conversationModel.js`
- Create: `backend/services/chat-service/src/features/conversations/conversationService.js`
- Create: `backend/services/chat-service/src/features/conversations/conversationController.js`
- Create: `backend/services/chat-service/src/features/conversations/conversationRoutes.js`
- Create: `backend/services/chat-service/src/features/conversations/contextKey.js`
- Create: `backend/services/chat-service/src/features/conversations/contextKey.test.js`
- Create: `backend/services/chat-service/src/services/productClient.js`
- Modify: `backend/services/chat-service/src/app.js`
- Test: `backend/services/chat-service/test/conversation.integration.test.js`

**Interfaces:**

- Consumes: `GET {PRODUCT_SERVICE_URL}/:id` เพื่ออ่าน `sellerId` (soft reference)
- Produces: `Conversation` พร้อม `participants` ที่ Server เป็นคนกำหนด

**Steps:**

- [x] **Step 1:** เขียน test ที่ล้มก่อน — สร้างห้องซ้ำ 2 ครั้งต้องได้ id เดิม, คนนอกเรียก
      `GET /conversations/:id` ต้องได้ `403`, guest ต้องได้ `401`, ปลอม `sellerId` ต้องไม่มีผล
- [x] **Step 2:** รัน test ยืนยันว่าล้มจริงก่อนเขียนโค้ด
- [x] **Step 3:** เขียน schema + `contextKey.js` (pure function, unit test แยก)
- [x] **Step 4:** `POST /conversations` — resolve seller จาก product-service, สร้างด้วย
      `contextKey` แล้วจับ duplicate-key error (`P2002`) คืนห้องเดิม
- [x] **Step 5:** middleware `requireParticipant` อ่านห้องแล้วเทียบ `req.userId`
- [x] **Step 6:** `GET /conversations` (inbox) เรียงตาม `lastMessageAt` desc
- [x] **Step 7:** รัน test ให้เขียว + lint + format

**Acceptance:** ยิง `POST /conversations` พร้อมกัน 2 request ด้วย productId เดียวกันได้
Conversation เดียวใน MongoDB จริง; ผู้ใช้ที่ไม่ใช่คู่สนทนาได้ `403` ทุก endpoint

### Task CHAT-003: Message ส่ง/อ่าน, cursor pagination และ unread count — ✅ Done (2026-09-03)

**Files:**

- Create: `backend/services/chat-service/src/features/messages/messageModel.js`
- Create: `backend/services/chat-service/src/features/messages/messageService.js`
- Create: `backend/services/chat-service/src/features/messages/messageController.js`
- Create: `backend/services/chat-service/src/features/messages/messageRoutes.js`
- Create: `backend/services/chat-service/src/features/messages/cursor.js`
- Create: `backend/services/chat-service/src/features/messages/cursor.test.js`
- Test: `backend/services/chat-service/test/message.integration.test.js`

**Steps:**

- [x] **Step 1:** เขียน test ที่ล้มก่อน — ส่งข้อความแล้วอ่านกลับได้, cursor ไม่คืนซ้ำ/ไม่ข้าม
      แม้มีข้อความแทรกระหว่างหน้า, คนนอกส่งไม่ได้ (`403`), ห้อง `LOCKED` ส่งไม่ได้ (`409`),
      body ว่างได้ `400`
- [x] **Step 2:** รัน test ยืนยันว่าล้ม
- [x] **Step 3:** `POST /conversations/:id/messages` — เขียน Message + อัปเดต
      `lastMessageAt`/`lastMessagePreview` ใน **transaction เดียว** (นี่คือเหตุผลที่ต้องมี
      replica set)
- [x] **Step 4:** `GET .../messages?before=&limit=` คืน `{items, nextCursor}` เรียงใหม่→เก่า
- [x] **Step 5:** `POST .../read` เซ็ต `lastReadAt` ของ participant คนนั้น
- [x] **Step 6:** `GET /unread-count` นับจาก `createdAt > lastReadAt` ของทุกห้องที่อยู่
- [x] **Step 7:** ยืนยันว่าข้อมูลรอด restart — รัน test, ปิด process, รันอ่านซ้ำ

**Acceptance:** ประวัติข้อความ 60 ข้อความอ่านครบด้วย cursor 3 หน้าโดยไม่ซ้ำไม่ขาด และ
unread count ตรงหลังกด read

### Task CHAT-004: Frontend — กล่องข้อความ, ห้องแชท และปุ่มติดต่อผู้ขาย — ✅ Done (2026-09-03)

**Files:**

- Create: `frontend/lib/chat.js`
- Create: `frontend/app/chat/page.js`
- Create: `frontend/app/chat/[id]/page.js`
- Create: `frontend/components/chat/MessageList.js`
- Create: `frontend/components/chat/MessageComposer.js`
- Create: `frontend/components/chat/ConversationRow.js`
- Create: `frontend/components/chat/ContactSellerButton.js`
- Modify: `frontend/components/NavBar.js`
- Modify: `frontend/app/products/[id]/page.js`
- Modify: `frontend/app/store/[sellerId]/page.js`
- Modify: `frontend/app/orders/page.js`
- Test: `frontend/app/chat/chat.test.js`
- Test: `frontend/components/chat/MessageComposer.test.js`

**Steps:**

- [x] **Step 1:** เขียน Jest test ที่ล้มก่อน — guest กดปุ่มต้องถูกส่งไป `/login`,
      ห้องว่างต้องมี empty state, ส่งข้อความแล้วต้องขึ้นในรายการ, error ต้องแสดงไม่ใช่หน้าขาว
- [x] **Step 2:** ทำ `ContactSellerButton` เรียก `POST /api/chat/conversations` แล้ว
      `router.push()` ไปห้องนั้น — วางในหน้า Product detail, Store และ Orders
      (ปลด dependency ที่ [`buyer/plan.md` `BUY-004` Step 3](../buyer/plan.md) ค้างอยู่)
- [x] **Step 3:** หน้า `/chat` — รายการห้อง, badge unread, empty state
- [x] **Step 4:** หน้า `/chat/[id]` — โหลดประวัติ, infinite scroll ขึ้นด้วย cursor,
      composer ส่งข้อความ, optimistic append แล้ว reconcile
- [x] **Step 5:** ชั่วคราวใช้ polling ทุก 4 วินาทีขณะเปิดหน้าห้องอยู่ (หยุด poll เมื่อ tab
      ไม่ active) — **มี comment กำกับว่าเป็นของชั่วคราวรอ `CHAT-006`**
- [x] **Step 6:** NavBar badge เรียก `/api/chat/unread-count`
- [x] **Step 7:** ตาม [`ui-conventions.md`](../../ui-conventions.md) — `/chat` เป็นโลก
      Storefront ใช้โทน `gray` และ Design Token ไม่ใช่ hex ดิบ
- [x] **Step 8:** รัน `npm run test:frontend` + production build

**Acceptance:** เดินจริงได้ครบวง — ผู้ซื้อเปิดหน้าสินค้า → กดติดต่อผู้ขาย → พิมพ์ → ผู้ขาย
ล็อกอินอีก browser เห็นข้อความภายใน ~4 วินาที และตอบกลับได้

> ถึงตรงนี้ระบบ **ใช้งานได้จริงและ demo ได้แล้ว** งานที่เหลือคือทำให้เป็นระบบกลางและสวยขึ้น

---

## Phase 2 — ทำให้เป็นระบบกลาง

### Task CHAT-005: Internal API, SYSTEM message และ event contract — ✅ Done (2026-09-03)

**Files:**

- Create: `backend/services/chat-service/src/features/internal/internalRoutes.js`
- Create: `backend/services/chat-service/src/features/internal/internalController.js`
- Modify: `backend/shared/src/events.js`
- Modify: `docs/featureplan/integration.md`
- Create: `backend/services/order-service/src/services/chatClient.js`
- Test: `backend/services/chat-service/test/internal-api.integration.test.js`

**Steps:**

- [x] **Step 1:** เขียน test ที่ล้มก่อน — ไม่มี `x-internal-token` ต้อง `403`,
      token ผิดต้อง `403`, สร้างห้องจาก Context ที่ยังไม่มีต้องได้ห้องใหม่, มีแล้วต้องได้ห้องเดิม
- [x] **Step 2:** ทำ Internal endpoints ทั้ง 6 ตามตาราง API Contract ด้านบน
- [x] **Step 3:** เพิ่ม `CHAT_MESSAGE_CREATED` และ `CHAT_CONVERSATION_OPENED` ลง
      `shared/src/events.js` พร้อมคอมเมนต์ payload
- [x] **Step 4:** ทำ `chatClient.js` ใน order-service เป็นตัวอย่าง Consumer ตัวแรก —
      เมื่อออเดอร์เปลี่ยนสถานะ ส่ง SYSTEM message เข้าห้องของออเดอร์นั้น
- [x] **Step 5:** เขียน Contract ลง `integration.md` ให้ Owner Feature อื่นอ่านแล้วต่อได้เอง
- [x] **Step 6:** รัน test ทั้ง repo ยืนยันว่าไม่มีอะไรพัง

**Acceptance:** order-service สร้างห้องและส่ง SYSTEM message ได้โดยไม่มี JWT ของผู้ใช้ และ
ผู้เรียกที่ไม่มี internal token ทำไม่ได้

---

## Phase 3 — Realtime และความปลอดภัย

### Task CHAT-006: Socket.IO + Redis pub/sub, presence และ typing — ✅ Done (2026-09-03)

**Files:**

- Create: `backend/services/chat-service/src/realtime/socketServer.js`
- Create: `backend/services/chat-service/src/realtime/socketAuth.js`
- Create: `backend/services/chat-service/src/realtime/socketAuth.test.js`
- Create: `backend/services/chat-service/src/realtime/presence.js`
- Modify: `backend/services/chat-service/src/server.js`
- Modify: `frontend/lib/chat.js`
- Modify: `frontend/app/chat/[id]/page.js`
- Test: `backend/services/chat-service/test/realtime.integration.test.js`

**Steps:**

- [x] **Step 1:** เขียน test ที่ล้มก่อน — **handshake ที่ไม่มี token ต้องถูกปฏิเสธ**,
      token หมดอายุต้องถูกปฏิเสธ, join ห้องที่ไม่ได้เป็นคู่สนทนาต้องถูกปฏิเสธ
      (เช็คซ้ำตอน join ไม่ใช่เชื่อ handshake อย่างเดียว)
- [x] **Step 2:** ทำ `socketAuth.js` — verify JWT ตอน `io.use()` แล้วผูก `socket.data.userId`
      ⚠️ Gateway ตั้ง `ws: true` ซึ่ง **ข้าม middleware ตรวจ token ปกติ** ตามที่
      [`architecture.md`](../../architecture.md) เตือนไว้ ดังนั้น chat-service ต้องตรวจเอง
      100% ห้ามสมมติว่า Gateway ตรวจให้แล้ว
- [x] **Step 3:** ต่อ `@socket.io/redis-adapter` ใช้ `REDIS_URL` เดิม
- [x] **Step 4:** ยิง event หลังเขียน MongoDB สำเร็จเท่านั้น — ลำดับห้ามสลับ
- [x] **Step 5:** presence/typing เป็น Redis key ที่มี TTL (30 วิ / 5 วิ) ไม่แตะ MongoDB
- [x] **Step 6:** Frontend เปลี่ยนจาก polling เป็น socket แต่ **คง REST เดิมไว้เป็น
      fallback** เมื่อ socket ต่อไม่ได้ — และลบ comment ชั่วคราวจาก `CHAT-004` Step 5
- [x] **Step 7:** ทดสอบ 2 instance จริง (`docker compose up --scale chat-service=2`)

**Acceptance:** ผู้ใช้สองคนที่ต่อคนละ instance เห็นข้อความกันภายใน < 1 วินาที และปิด Redis
แล้วข้อความยังไม่หาย (แค่ไม่ push)

### Task CHAT-007: ไฟล์แนบ, rate limit, report และสิทธิ์ Admin — 🟡 ไฟล์แนบเสร็จแล้ว (2026-09-03), Step 3–6 ยังไม่ทำ

**Files:**

- Create: `backend/services/chat-service/src/middleware/upload.js`
- Create: `backend/services/chat-service/src/features/attachments/attachmentController.js`
- Create: `backend/services/chat-service/src/middleware/rateLimit.js`
- Create: `backend/services/chat-service/src/middleware/rateLimit.test.js`
- Modify: `backend/shared/src/permissions.js`
- Modify: `frontend/components/chat/MessageComposer.js`
- Modify: `frontend/components/ReportModal.js`
- Test: `backend/services/chat-service/test/attachment.integration.test.js`

**Steps:**

- [x] **Step 1:** เขียน test ที่ล้มก่อน — ไฟล์เกินขนาด `413`, MIME ที่ไม่อนุญาต `400`,
      ส่งเกิน N ข้อความ/นาที `429`, คนนอกอัปโหลดเข้าห้อง `403`
- [x] **Step 2:** อัปโหลดตาม Pattern `product-service/src/middleware/upload.js` —
      เก็บไฟล์ แล้วเก็บเฉพาะ URL ลง `payload` **ห้ามเก็บ binary ลง MongoDB**
- [ ] **Step 3:** rate limit ด้วย Redis `INCR` + `EXPIRE`
- [ ] **Step 4:** เพิ่ม permission `chat:read:any` ให้ `CUSTOMER_SERVICE` และ `ADMIN`
      ใน `permissions.js` พร้อม test ว่า Role อื่นไม่ได้
- [ ] **Step 5:** ต่อ report แชทเข้ากับ `ReportModal` เดิม และทำ `PATCH .../status` ให้
      Admin ล็อกห้องได้
- [ ] **Step 6:** soft delete เท่านั้น — ข้อความที่ถูกลบยังต้องอ่านได้จาก transcript สำหรับ
      Admin (`deletedAt` ไม่ใช่การลบแถวจริง)

**Acceptance:** ผู้ใช้ทั่วไปอ่านห้องคนอื่นไม่ได้ทุกช่องทาง; CS ที่มี `chat:read:any` อ่านได้
และการอ่านนั้นถูกบันทึกไว้

---

## Phase 4 — รวมกับ Customer Service

### Task CHAT-008: ย้ายข้อความตั๋วมาที่ Chat (แยกการสนทนาออกจากกระบวนการ)

> ทำหลังสุดโดยตั้งใจ — `support-service` ทำเสร็จและมี integration test ผ่านแล้ว
> การรื้อพร้อมกับสร้างของใหม่ = พังสองที่พร้อมกัน

**Files:**

- Modify: `backend/services/support-service/prisma/schema.prisma`
- Modify: `backend/services/support-service/src/features/tickets/ticketService.js`
- Create: `backend/services/support-service/src/services/chatClient.js`
- Create: `backend/services/support-service/prisma/migrateTicketMessages.js`
- Modify: `frontend/app/support/tickets/[id]/page.js`
- Modify: `docs/featureplan/customer-service/decision.md`
- Test: `backend/services/support-service/test/ticket-lifecycle.integration.test.js`

**Steps:**

- [ ] **Step 1:** เพิ่ม `conversationId String?` ใน `SupportTicket` — **ยังไม่ลบ
      `TicketMessage`** ให้เขียนสองที่ชั่วคราว (dual-write) เพื่อให้ rollback ได้
- [ ] **Step 2:** ตั๋วใหม่เปิดห้องผ่าน Internal API พร้อมกัน
- [ ] **Step 3:** เขียนสคริปต์ย้ายข้อความเก่า แล้วยืนยันจำนวนตรงกันก่อน/หลัง
- [ ] **Step 4:** เปลี่ยนหน้า UI ให้อ่านจาก Chat แต่ยังแสดง status/SLA จาก support-service
      เหมือนเดิม — `isInternal` เดิม map เป็น `visibility: "INTERNAL"`
- [ ] **Step 5:** รัน `ticket-lifecycle.integration.test.js` เดิมให้ผ่านทั้งหมด
- [ ] **Step 6:** เมื่อผ่านครบแล้วจึงลบ `TicketMessage` และ dual-write ออก
      **ใน commit แยกต่างหาก**
- [ ] **Step 7:** จัดการกรณีเขียน Chat สำเร็จแต่ update ตั๋วล้ม — ข้ามฐานข้อมูลแล้ว
      **ไม่มี transaction ร่วม** ต้องมี compensation หรืออย่างน้อย log ให้ตามเก็บได้

**Acceptance:** ticket lifecycle test เดิมผ่านครบ, จำนวนข้อความก่อน/หลังย้ายเท่ากัน,
`FR-4.1.2` (Chat Console ของเจ้าหน้าที่) มีหลักฐานว่าใช้งานได้จริง

---

## Definition of Done (ระบบสมบูรณ์ 100%)

- [ ] `CHAT-001` … `CHAT-008` ผ่าน acceptance ครบทุกข้อ
- [ ] Backend test ทั้ง repo เขียว รวม integration ที่รันกับ MongoDB จริง (`REQUIRE_INTEGRATION=1`)
- [ ] Frontend test + production build ผ่าน
- [ ] `npm run lint`, `npm run format:check`, `npm run secret-scan` ผ่าน
- [ ] Contract อยู่ใน [`integration.md`](../integration.md) และ Owner Feature อื่นอ่านแล้วต่อได้
- [ ] [`architecture.md`](../../architecture.md) อัปเดต — ลบข้อความ "chat-service remains the
      only unimplemented backend service" และเพิ่ม MongoDB เข้า Component/Data-store diagram
- [ ] มี ADR บันทึกเหตุผลที่เลือกให้ MongoDB + Redis + PostgreSQL อยู่ร่วมกัน
      (polyglot persistence) พร้อม **เกณฑ์ที่จะทำให้ตัดสินใจใหม่**
- [ ] `docs/progress.md`, `chat/progress.md`, `chat/changelog.md`, `chat/teachme.md`,
      `chat/decision.md`, `chat/handoff.md` ครบตามกติกาใน [`../README.md`](../README.md)
- [ ] Reviewer (คนละคนกับ Owner) ตรวจ acceptance criteria และเซ็นรับ

## สิ่งที่ _ไม่_ อยู่ในแผนนี้ (พูดให้ชัดว่าไม่ทำ)

- End-to-end encryption
- ลบข้อความถาวร / นโยบาย retention (ยังเป็น Open Question ข้อ 5 ใน `architecture.md`)
- แชทกลุ่มเกิน 2 คน (โครงสร้าง `participants` รองรับไว้ แต่ยังไม่ทำ UI)
- Push notification นอกเว็บ
- แปลภาษาอัตโนมัติ / bot ตอบอัตโนมัติ

---

## การตัดสินใจที่ยืนยันแล้ว (2026-09-03)

1. **Owner = CS (อชิรวินท์), Reviewer = สิรดนัย** — Chat เป็นของ CS โดยสัญชาตญาณ
   (`FR-4.1.2` ต้องมีระบบแชทคุยกับ user ทั่วไป) แต่ต้องออกแบบให้ Feature อื่นดึงไปใช้ได้ตั้งแต่
   แรกผ่าน Contract เดียวกัน (`contextType`/Internal API) — ไม่ใช่ผูกกับ CS จนแก้ยากทีหลัง
2. **ขอบเขตรอบนี้ = `CHAT-001`–`CHAT-006`** เน้นให้ตัวระบบแชทเองสมบูรณ์และเห็นการทำงาน
   จริงแบบ end-to-end ก่อน (ห้อง → ข้อความ → สิทธิ์ → realtime) ยังไม่ต้องเดินสาย Role อื่น
   นอกจาก Buyer/Seller ที่จำเป็นต่อการพิสูจน์ระบบ — เหตุผล: ถ้าแกนกลางแข็งแรง การเอาไปต่อ
   ให้ Order/Support/Admin ใช้ทีหลังจะเป็นงานเชื่อมสาย ไม่ใช่งานออกแบบใหม่ ต้องขอบคุณที่
   `contextKey`/`contextType` ถูกออกแบบให้ขยาย type ใหม่โดยไม่แก้ schema อยู่แล้ว
3. **`CHAT-007`/`CHAT-008` เลื่อนออกจากรอบนี้** ยังคงอยู่ในเอกสารเป็น Roadmap ที่ต่อได้ทันที
   เพราะ Data Model (`visibility`, `deletedAt`, `payload`) เผื่อไว้ให้แล้วตั้งแต่ `CHAT-002`
4. **CS/Admin อ่านห้องอื่นได้เฉพาะห้องที่ถูก report แล้ว** — ยืนยันแนวทางเดิมที่เสนอไว้
   จะ implement จริงใน `CHAT-007` (permission `chat:read:any` + ผูกกับสถานะ report)
   รอบนี้ (`CHAT-001`–`CHAT-006`) ยังไม่มี endpoint ให้ CS/Admin อ่านห้องคนอื่น
5. **CI budget สำหรับ MongoDB** — ยังไม่ตัดสินใจ จะประเมินหน้างานตอน `CHAT-001` Step 5
   ถ้าช้าเกินรับได้จะแยก integration job แล้วรายงานใน `changelog.md`

---

**อัปเดตล่าสุด:** 2026-09-03 — `CHAT-001`–`CHAT-006` เสร็จครบตามขอบเขตรอบนี้ ตรวจสอบแล้วด้วย
Docker Stack จริงทั้งหมด รวม Browser จริง 2 session และ 2-instance scale test (ดู `progress.md`
สำหรับหลักฐานเต็ม, `decision.md` CHAT-DEC-005 สำหรับเหตุผลที่เปลี่ยน WebSocket proxy implementation
กลางทาง) `CHAT-007`/`CHAT-008` ยังไม่เริ่มตามที่ตกลงไว้
