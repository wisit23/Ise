# RE-LOOP — แผนสร้าง Web App (Core Marketplace MVP)

## Context

สร้างแพลตฟอร์มซื้อ-ขายเสื้อผ้าแฟชั่นมือสอง "RE-LOOP" ตามเอกสาร `D:\ise\docs\documenttation.pdf` (94 หน้า) และ ER diagram `D:\ise\docs\erdatabase.png`
Tech stack ตามโจทย์: **Next.js (frontend) / JavaScript (backend) / PostgreSQL / MVC + Microservices / Docker**

การตัดสินใจที่ grill กับผู้ใช้แล้ว (ยืนยันครบ):

| หัวข้อ   | คำตอบ                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope    | **Core Marketplace ก่อน** — Buyer+Seller ครบวงจร (KYC, ลงขาย, feed/ค้นหา/swipe, cart lock 10 นาที, order+escrow, ติดตามออเดอร์, แชท, รีวิว) — Admin/MKT/CEO dashboard เป็น phase ถัดไป |
| Services | **5 microservices + API Gateway** แต่ละตัวเป็น MVC ภายใน                                                                                                                               |
| Backend  | **Express.js + Prisma** (plain JavaScript)                                                                                                                                             |
| Database | **Postgres container เดียว แยก database ต่อ service** — ห้าม service ข้าม DB, คุยผ่าน API/event เท่านั้น                                                                               |
| Comms    | **REST ระหว่าง service + Redis**: BullMQ (delayed jobs/timers), Redis pub/sub (events), Socket.IO + Redis adapter (chat)                                                               |
| Payment  | **Mock Payment Gateway** (adapter interface สลับเป็นของจริงได้) + Escrow states ใน DB                                                                                                  |
| Repo     | **Monorepo** — docker-compose เดียวรันทั้งระบบ                                                                                                                                         |
| Frontend | Next.js 15 App Router, JavaScript, Tailwind CSS + shadcn/ui, TanStack Query, Socket.IO client                                                                                          |
| ER       | อิง `erdatabase.png` เป็นหลัก ปรับได้ **แต่ทุกการปรับต้องรายงาน + ให้เหตุผล** (ดูตารางด้านล่าง)                                                                                        |

**ข้อกำหนดเพิ่มจากผู้ใช้:** ตอนลงมือทำ ให้สร้างโฟลเดอร์ใน `D:\ise`:

- `D:\ise\plan\` — เก็บสำเนาแผนนี้ + แผนย่อยแต่ละ phase
- `D:\ise\database\` — เก็บ schema.prisma ทุก service, ER ฉบับปรับแล้ว (markdown/mermaid), ตารางการเปลี่ยนแปลงจาก ER เดิม
- `D:\ise\log\` — เก็บ log บันทึกการทำงาน/การตัดสินใจแต่ละ phase (append ทุกครั้งที่จบ phase)

โค้ดทั้งหมดอยู่ที่ `D:\ise\` (monorepo root)

---

## 1. Architecture รวม

```
D:\ise\
├── docs\                      (ของเดิม)
├── plan\                      ← สำเนาแผน + แผนย่อย
├── database\                  ← schema ทุก service + ER-changes.md
├── log\                       ← work log ต่อ phase
├── docker-compose.yml
├── .env.example
├── gateway\                   ← API Gateway (Express, port 8080)
├── services\
│   ├── auth-service\          ← port 3001, DB: reloop_auth
│   ├── product-service\       ← port 3002, DB: reloop_product
│   ├── order-service\         ← port 3003, DB: reloop_order
│   ├── chat-service\          ← port 3004, DB: reloop_chat (Socket.IO)
│   └── review-service\        ← port 3005, DB: reloop_review (+notification)
├── shared\                    ← JWT middleware, event names, error utils (npm workspace)
└── frontend\                  ← Next.js (port 3000)
```

**โครง MVC ในแต่ละ service (เหมือนกันทุกตัว):**

```
services/<name>/
├── src/
│   ├── routes/          (Route definitions)
│   ├── controllers/     (รับ req → เรียก service → ตอบ res)
│   ├── services/        (business logic)
│   ├── models/          (Prisma client wrapper + queries)
│   ├── events/          (Redis pub/sub publishers + subscribers)
│   ├── jobs/            (BullMQ workers เช่น cart-unlock)
│   └── app.js / server.js
├── prisma/schema.prisma
├── Dockerfile
└── package.json
```

**Infra containers:** `postgres:16` (1 ตัว, init script สร้าง 5 databases), `redis:7`, gateway, 5 services, frontend — รวม 9 containers ใน docker-compose

**Auth flow:** JWT (access 15m + refresh 7d) ออกโดย auth-service, ตรวจที่ gateway ด้วย shared middleware (public key/secret ร่วม), ส่ง `x-user-id`, `x-user-role` ต่อไปยัง services

**Event flow หลัก (Redis pub/sub):**

- `order.paid` → product-service เปลี่ยน Product เป็น Sold, review-service ยังไม่ทำอะไร
- `order.completed` → review-service เปิดสิทธิ์รีวิว (14 วัน), notification แจ้งผู้ซื้อ
- `product.sold` → chat-service ซ่อนปุ่มเริ่มแชทใหม่
- `kyc.approved` → notification แจ้งผู้ขาย
- `order.cancelled` / `cart.expired` → product-service ปลดล็อกกลับ Available

**BullMQ delayed jobs (ใน order-service):** cart-unlock (10 นาที), checkout-expire (10 นาที), ship-deadline (3 วัน), auto-confirm-receive (3 วัน)

---

## 2. Database — การปรับจาก ER (`erdatabase.png`) พร้อมเหตุผล

> ไฟล์นี้จะถูกเขียนซ้ำเป็น `D:\ise\database\ER-changes.md` ตอนลงมือทำ

### 2.1 ตารางที่ **เก็บตาม ER** (ปรับชื่อ/ที่อยู่)

| ER เดิม                                          | ใหม่ (service.table)   | การปรับ + เหตุผล                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                                             | auth.users             | เก็บ FName/LName/email/status → เพิ่ม `password_hash`, `phone` (ER ไม่มีช่องรหัสผ่าน — จำเป็นต่อ login)                                                                                                                                                                             |
| Role                                             | auth.users.role (enum) | ยุบตาราง Role เป็น enum column `BUYER/SELLER/ADMIN` — เหตุผล: MVP ผู้ใช้มี role เดียว+อัปเกรดเป็น seller, แยกตารางเพิ่ม join โดยไม่ได้อะไร (ถ้าอนาคตต้อง multi-role ค่อย migrate เป็น user_roles)                                                                                   |
| Buyer (style/size/brand_preference)              | auth.buyer_profiles    | ตาม ER — เก็บ preference เริ่มต้น (แบบสอบถาม cold start)                                                                                                                                                                                                                            |
| Seller (shop_name, id_card_number, bank_account) | auth.seller_profiles   | ตาม ER + เพิ่ม `kyc_status (PENDING/VERIFIED/REJECTED)`, `kyc_document_url`, `verified_at` — เหตุผล: WF-01 ต้องมีสถานะ KYC และไฟล์เอกสาร ซึ่ง ER ไม่มี                                                                                                                              |
| Login_Log                                        | auth.login_logs        | ตาม ER — รองรับ audit (NFR-SP-03)                                                                                                                                                                                                                                                   |
| Product                                          | product.products       | ตาม ER (name, brand, price, type→category, seller_id) + เพิ่ม `condition_level`, `size`, `status enum(DRAFT/AVAILABLE/LOCKED_IN_CART/LOCKED_IN_CHECKOUT/SOLD/HIDDEN)`, `view_count` — เหตุผล: FR-1.3.1 บังคับระบุสภาพสินค้า, WF-04 ต้องมี state machine ของสต็อก ซึ่ง ER ไม่ได้ระบุ |
| Photo                                            | product.product_photos | ตาม ER — บังคับ ≥4 รูปที่ application layer (FR-1.3.1), บีบอัด ≤500KB/1080px ด้วย sharp (NFR-P-05)                                                                                                                                                                                  |
| Swipe                                            | product.swipes         | ตาม ER (user_id, product_id, date) + เพิ่ม `direction (LEFT/RIGHT)` — เหตุผล: WF-03 ต้องรู้ปัดซ้าย/ขวาเพื่อปรับ weight ของ Style Profile แต่ ER ไม่มี field ทิศทาง                                                                                                                  |
| Book_Mark                                        | product.bookmarks      | ตาม ER (= Wishlist ใน FR-1.4.2) — rename เป็น bookmarks ให้สื่อความหมาย                                                                                                                                                                                                             |
| basket                                           | order.cart_items       | ตาม ER (buyer_id, product_id, locked_at) + เพิ่ม `locked_until` — เหตุผล: การล็อก 10 นาทีต้องรู้เวลาหมดอายุตรงๆ เพื่อกัน race และให้ scheduler ปลดล็อกถูกตัว (NFR-AR-02)                                                                                                            |
| Order                                            | order.orders           | ตาม ER + `status enum(PENDING_PAYMENT/TO_SHIP/TO_RECEIVE/COMPLETED/CANCELLED/DISPUTED/REFUNDED/CLOSED)` — เหตุผล: ER มีแค่ Order_Type/date แต่ WF-04/05 กำหนด state machine ละเอียด                                                                                                 |
| Order_Items                                      | order.order_items      | ตาม ER (order_id, product_id, price)                                                                                                                                                                                                                                                |
| Payments                                         | order.payments         | ตาม ER (amount, payment_status, hold_status, paid_at) + เพิ่ม `escrow_status enum(NONE/HELD/RELEASED/REFUNDED)`, `gateway_ref` — เหตุผล: ER มี hold_status อยู่แล้ว แต่ escrow ตาม WF-04/05 มีวงจรชัดเจนต้องแยก field                                                               |
| Shippings                                        | order.shipments        | ตาม ER (tracking_number, shipping_company, status, order_id)                                                                                                                                                                                                                        |
| message                                          | chat.messages          | ตาม ER (text, sender, date, chat_id) + เพิ่มตาราง `chat.chat_rooms (buyer_id, seller_id, product_id)` — เหตุผล: ER ผูก message กับ Chat_ID แต่ไม่มีตารางห้องแชท; WF-06 ต้องผูกห้องกับสินค้า (Context Link) และเช็คห้องเดิมก่อนสร้างใหม่                                             |
| Auto_messages                                    | chat.auto_messages     | ตาม ER — quick replies / Instant FAQ ของผู้ขาย (FR-2.2.3)                                                                                                                                                                                                                           |

### 2.2 ตารางที่ **เพิ่มใหม่** (ER ไม่มี แต่ requirement บังคับ)

| ตารางใหม่                                                                | เหตุผล                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| review.reviews (order_id UNIQUE, rating 1-5, text, photos, published_at) | **ER ไม่มีตาราง Review เลย** แต่ FR-2.1.1/2.1.2 + WF-07 บังคับมีรีวิว, 1 order = 1 รีวิว, สิทธิ์ 14 วัน                                                                         |
| review.seller_stats (seller_id, avg_rating, review_count, sales_count)   | คะแนนเฉลี่ยหน้าโปรไฟล์ร้าน (denormalized เพื่อความเร็ว ≤2s ตาม NFR-P-01)                                                                                                        |
| review.notifications (user_id, type, payload, read_at)                   | ระบบแจ้งเตือน in-app ที่ WF ทุกตัวอ้างถึง แต่ ER ไม่มี                                                                                                                          |
| product.tags + product.product_tags + product.user_tag_scores            | อัลกอริทึม Tag-Matching & Scoring ใน WF-03 (Style Profile) ต้องมีที่เก็บ tag และคะแนน weight ต่อผู้ใช้ — ER เก็บ preference เป็น string เดี่ยวใน Buyer ซึ่งคำนวณ scoring ไม่ได้ |
| product.product_views (product_id, viewer_id, viewed_at)                 | สถิติยอดเข้าชมต่อโพสต์ (FR-1.4.3) + กติกาไม่นับซ้ำใน 5 นาที (NFR-AR-04) ต้องมี raw data                                                                                         |
| auth.refresh_tokens                                                      | JWT refresh rotation — ความจำเป็นด้าน auth ที่ ER ไม่ครอบคลุม                                                                                                                   |

### 2.3 ตารางที่เหลือจาก ER — **สร้างครบทุกตัวใน MVP** (ตามคำสั่งผู้ใช้: ห้ามตัดตาราง)

ตารางเหล่านี้ถูกสร้างใน schema ตั้งแต่ MVP โดยระบุ service เจ้าของ; ส่วน "ระดับฟีเจอร์" ระบุว่า MVP เปิดใช้แค่ไหน:

| ER เดิม             | ใหม่ (service.table)                                                                                                   | ระดับฟีเจอร์ใน MVP + เหตุผลการจัดวาง                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video               | product.product_videos                                                                                                 | สร้างตาราง + อัปโหลดวิดีโอประกอบสินค้าได้ (optional) — อยู่กับ product เพราะเป็นสื่อของโพสต์เหมือน Photo                                                                                                                   |
| Dispute             | order.disputes (dispute_id, order_id, requester_id, reason, status, solved_id)                                         | ผู้ซื้อ**เปิดเคสได้จริงใน MVP** (WF-08 ฝั่งผู้ใช้): เปิดเคส → order เป็น DISPUTED + Hold Payout อัตโนมัติ; หน้าจอเจ้าหน้าที่พิจารณาเป็น phase ถัดไป (MVP มี dev-endpoint approve/reject) — อยู่กับ order เพราะผูก order_id |
| Reports             | auth.reports (report_id, reporter_id, target_id, product_id, reason, status, reported_at)                              | ผู้ใช้**กด Report สินค้า/ผู้ขายได้จริงใน MVP** (FR-4.2.4); หน้าศูนย์รวมของ Admin (FR-4.2.5) เป็น phase ถัดไป — อยู่กับ auth เพราะเป็นเรื่อง governance ของบัญชีผู้ใช้ (นำไปสู่ ban)                                        |
| Auction             | product.auctions (auction_id, product_id, user_id, min_step_bid, current_max_price, start_price, start_time, end_time) | สร้างตาราง + relation กับ product ครบ (รองรับ UR-10 "สถาปัตยกรรมขยายสู่ auction ได้") — ตัว flow ประมูลจริงเป็น phase ถัดไป                                                                                                |
| Campaign            | product.campaigns (campaign_id, campaign_name, description, budget, status, start_date, end_date)                      | สร้างตารางครบ — เครื่องมือสร้าง/อนุมัติแคมเปญ (WF-11) เป็น phase ถัดไป; อยู่กับ product เพราะแคมเปญโปรโมตสินค้า (Product_Campaign ผูกตรง)                                                                                  |
| Product_Campaign    | product.product_campaigns (junction)                                                                                   | สร้างตาราง — ใช้จริงเมื่อเปิดฟีเจอร์แคมเปญ                                                                                                                                                                                 |
| Campaign_KPIs       | product.campaign_kpis (kpi_id, campaign_id, target_value, current_value)                                               | สร้างตาราง — dashboard MKT เป็น phase ถัดไป                                                                                                                                                                                |
| Evaluation_Criteria | product.evaluation_criteria (criteria_id, criteria_name, description, unit, passing_value)                             | สร้างตาราง — ผูกกับ campaign_kpis ตาม ER                                                                                                                                                                                   |

### 2.4 กติกา cross-service

- ไม่มี FK ข้าม database — ใช้ logical ID (เช่น order.orders.product_id อ้าง product-service ผ่าน API)
- ชื่อ column ทั้งหมด normalize เป็น `snake_case` (ER เดิมปนกัน เช่น `Product_ID`, `buyer_id`, `CreatedAt`)
- ทุกตารางมี `created_at`, `updated_at`

---

## 3. หน้าที่ของแต่ละ Service (mapping กับ FR/WF)

### 3.1 auth-service (3001)

- สมัคร/ล็อกอิน (JWT + refresh), โปรไฟล์ buyer/seller
- เปิดร้าน + อัปโหลดเอกสาร KYC → สถานะ KYC_PENDING (WF-01) — **MVP: มี endpoint ให้ approve KYC แบบ dev-tool/seed ไปก่อน** (หน้าจอ Admin จริงคือ phase 2)
- login_logs

### 3.2 product-service (3002)

- CRUD ประกาศขาย (แก้ไขได้ตลอด — FR-1.3.2), บังคับรูป ≥4, sharp บีบอัด ≤500KB/1080px, เก็บไฟล์ที่ Docker volume `/uploads` เสิร์ฟผ่าน gateway
- สถานะสินค้า state machine + endpoint ภายใน `POST /internal/products/:id/lock|unlock|sold` (เรียกโดย order-service, ป้องกันด้วย service token)
- Feed: ผู้ใช้ใหม่ = Popularity & Recency (Cold Start), ผู้ใช้เดิม = Tag-Matching & Scoring (WF-03)
- ค้นหา + filter หลายเงื่อนไข (style/brand/price/size/condition) — Postgres index + ILIKE (MVP ไม่ต้อง Elasticsearch)
- Swipe API (ปัดขวา +weight, ปัดซ้าย -weight → user_tag_scores)
- Bookmark/Wishlist, product_views + สถิติผู้ขาย (views/bookmarks/chats ต่อโพสต์)
- Price Suggestion: คำนวณ min/max/avg จากราคาขายสำเร็จ ≤6 เดือน ตาม brand+category+condition (WF-02, NFR-AR-04) — ข้อมูลขายสำเร็จรับผ่าน event `order.completed`

### 3.3 order-service (3003)

- Cart: กดใส่ตะกร้า → **atomic lock** (`UPDATE products SET status='LOCKED' WHERE id=? AND status='AVAILABLE'` ผ่าน internal API ของ product-service ซึ่งใช้ conditional update กัน race ตาม NFR-AR-02) + BullMQ delayed job 10 นาที
- Checkout: kill cart timer → สร้าง checkout timer 10 นาทีใหม่ (Timer Overwrite ตาม WF-04), สร้าง order PENDING_PAYMENT
- Mock Payment adapter (`PaymentGateway` interface: `charge()`, `refund()`) → สำเร็จ = Escrow HELD, product SOLD, order TO_SHIP
- Shipping: ผู้ขายกรอก tracking → TO_RECEIVE; mock webhook endpoint จำลองขนส่ง; ส่งครบ → นับ 3 วัน auto-confirm → COMPLETED → ตรวจ hold_payout → Escrow RELEASED → CLOSED (WF-05)
- ผู้ขายไม่ส่งใน 3 วัน → auto-cancel + refund

### 3.4 chat-service (3004)

- Socket.IO (+Redis adapter), REST สำหรับประวัติ
- สร้าง/เปิดห้องผูกกับสินค้า (Context Link), บล็อกแชทใหม่เมื่อ Sold (WF-06)
- Instant FAQ: สแกนข้อความเข้ากับ auto_messages ของผู้ขาย → ตอบอัตโนมัติ
- Quick Replies ฝั่งผู้ขาย

### 3.5 review-service (3005)

- สิทธิ์รีวิวเมื่อ order CLOSED (event), หมดอายุ 14 วัน (BullMQ), 1 order = 1 review, profanity filter คำหยาบพื้นฐาน (WF-07)
- คำนวณ seller_stats ใหม่เมื่อรีวิว published
- Notifications: subscriber รวมของทุก event → เก็บ + push ผ่าน Socket.IO ของ chat-service (หรือ polling ใน MVP)

### 3.6 gateway (8080)

- Reverse proxy ตาม path prefix: `/api/auth/*→3001`, `/api/products/*→3002`, `/api/orders/*→3003`, `/api/chat/*→3004`, `/api/reviews/*→3005`, `/uploads/*→static volume`
- ตรวจ JWT, แนบ `x-user-id`/`x-user-role`, rate limit, CORS

### 3.7 frontend (Next.js)

หน้าหลัก: สมัคร/ล็อกอิน • แบบสอบถามสไตล์ (cold start) • Feed + filter ขั้นสูง • โหมด Swipe (การ์ดปัดซ้าย/ขวา) • หน้าสินค้า (รูป 4 มุม, สภาพ, รีวิวผู้ขาย, ปุ่มแชท/ตะกร้า) • ตะกร้า (countdown 10 นาที) • Checkout + หน้า mock payment • My Orders 4 แท็บ (ที่ต้องชำระ/จัดส่ง/ได้รับ/สำเร็จ) • แชท • เปิดร้าน+KYC upload • ลงขาย (แนะนำราคา + ปุ่มใช้ราคาแนะนำ) • จัดการร้าน (สต็อก 3 สถานะ, สถิติต่อโพสต์, quick replies) • โปรไฟล์ร้าน (badge ยืนยันตัวตน, รีวิว) • เขียนรีวิว

---

## 4. ลำดับการลงมือทำ (Phases)

**Phase 0 — Scaffold + Infra**
สร้างโฟลเดอร์ `plan/`, `database/`, `log/` + คัดลอกแผนนี้ไป `plan/00-master-plan.md`; monorepo (npm workspaces), docker-compose (postgres+init 5 DBs, redis), โครง MVC ทุก service + healthcheck endpoint, gateway proxy, frontend เปล่า, `.env.example`
✔ ตรวจ: `docker compose up` แล้วทุก container healthy, gateway proxy ถึงทุก service

**Phase 1 — Auth + KYC**
schema `reloop_auth`, สมัคร/ล็อกอิน/refresh, buyer/seller profile, KYC upload + dev-approve, login logs, หน้า frontend auth
✔ ตรวจ: สมัคร→login→เปิดร้าน→approve→role เปลี่ยนเป็น SELLER ผ่าน browser จริง

**Phase 2 — Product: ลงขาย + Feed + Search + Swipe**
schema `reloop_product`, ลงขาย+อัปโหลด≥4 รูป+sharp, แก้ไขโพสต์, สถานะสต็อก, feed 2 อัลกอริทึม, filter, swipe+tag scoring, bookmark, views, price suggestion, seed data (~30 สินค้า + tags)
✔ ตรวจ: ลงขายผ่านหน้าเว็บ, feed เปลี่ยนตามการปัด swipe, filter ทำงาน, ราคาแนะนำขึ้น

**Phase 3 — Order: Cart lock + Checkout + Escrow + Shipping**
schema `reloop_order`, atomic lock + BullMQ timers, checkout timer overwrite, mock payment, escrow states, shipping + mock webhook, auto-confirm/auto-cancel, My Orders UI
✔ ตรวจ: (1) flow ซื้อจบ Escrow RELEASED (2) ปล่อยหมดเวลา 10 นาที → ปลดล็อกจริง (3) ยิง concurrent add-to-cart 2 คนพร้อมกัน → ล็อกได้คนเดียว

**Phase 4 — Chat**
schema `reloop_chat`, Socket.IO+Redis adapter, ห้องผูกสินค้า, Instant FAQ, quick replies, บล็อกเมื่อ Sold, UI แชท
✔ ตรวจ: เปิด 2 browsers คุยกัน realtime, ตั้ง FAQ แล้วถามตรง keyword → ตอบอัตโนมัติ

**Phase 5 — Review + Notification + Report/Dispute (ฝั่งผู้ใช้) + เก็บงาน**
schema `reloop_review`, review flow ครบ (สิทธิ์ 14 วัน, 1 order 1 review, profanity filter), seller stats บนโปรไฟล์, notifications, ปุ่ม Report สินค้า/ผู้ขาย (บันทึกลง auth.reports), ผู้ซื้อเปิด Dispute ได้ (order → DISPUTED + hold payout + dev-endpoint ตัดสิน), seed demo ครบวงจร, README วิธีรัน
✔ ตรวจ: จบ order แล้วรีวิวได้, รีวิวซ้ำถูกปฏิเสธ, คะแนนร้านอัปเดต, เปิด dispute แล้วเงินถูก hold จริง

หมายเหตุ: ตาราง Auction/Campaign/KPI/Criteria ถูกสร้างใน migration ตั้งแต่ Phase 2 (product schema) ตามคำสั่งห้ามตัดตาราง — ฟีเจอร์เปิดใช้ใน phase ถัดไป

ทุก phase: เขียนบันทึกลง `D:\ise\log\phase-N.md` (ทำอะไร, ตัดสินใจอะไร, ปัญหาที่เจอ) และอัปเดตไฟล์ใน `database/` เมื่อ schema เปลี่ยน

---

## 5. Verification รวม (จบโปรเจกต์)

1. `docker compose up --build` จากเครื่องเปล่า → ระบบขึ้นครบ 9 containers
2. เดิน E2E ผ่าน browser: สมัคร buyer → สมัคร seller+KYC → ลงขาย → buyer swipe/ค้นหา → ใส่ตะกร้า (เห็น countdown) → จ่ายเงิน mock → seller กรอก tracking → จำลอง delivered → confirm → เงิน released → รีวิว
3. ทดสอบ race: script ยิง add-to-cart พร้อมกัน 20 requests → สำเร็จ 1 เดียว
4. ทดสอบ timer: หมดเวลา cart/checkout → สินค้ากลับ Available
5. Chat 2 หน้าต่าง latency ต่ำ + FAQ auto-reply

## สิ่งที่อยู่นอก scope รอบนี้ (phase ถัดไปตามเอกสาร)

Admin console (KYC review UI, หน้าศูนย์รวม report/moderation, ban, หน้าเจ้าหน้าที่ตัดสิน dispute WF-08/09, hold payout ฉุกเฉิน), Support ticket + SLA (WF-10), Marketing campaign UI + approval (WF-11), Executive dashboard + risk alert (WF-12), Auction flow, Community content — **ตาราง DB ของทั้งหมดนี้ถูกสร้างครบตั้งแต่ MVP แล้ว** เหลือแค่ฟีเจอร์/UI
