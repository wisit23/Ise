# Merge Plan — รวมทุก Feature Branch เข้า `main`

วันที่วางแผน: 2026-08-26
Target branch: `integration/all-features` (ตัดจาก `main` แล้วค่อยเปิด PR เข้า `main` ครั้งเดียว)

## สถานะ Branch (เทียบ `origin/main` = `2c8ef20`)

| Branch                           | ล้ำหน้า | ตามหลัง | ขอบเขต                                                          | Merge-base |
| -------------------------------- | ------- | ------- | --------------------------------------------------------------- | ---------- |
| `ceo`                            | 1       | 0       | Executive dashboard + metrics API (auth/order/product)          | `2c8ef20`  |
| `marketing`                      | 1       | 0       | Auction system + Swipe choice                                   | `2c8ef20`  |
| `buyer`                          | 1       | 4       | Reservation 10 นาที + Cart                                      | `76910b7`  |
| `feature-admin`                  | 1       | 4       | KYC, reports, moderation, bulk action, dispute hold, multi-role | `76910b7`  |
| `feature/customer-service-panel` | 9       | 0       | support-service (ticket/dispute/FAQ) + agent panel              | `2c8ef20`  |

## ลำดับการ Merge และเหตุผล

```
main
 └─ integration/all-features
     ├─ 1. feature-admin   ← ฐาน shared layer (permissions, requirePermission, multi-role)
     ├─ 2. ceo             ← ต่อยอด shared layer, เพิ่ม EXECUTIVE
     ├─ 3. marketing       ← auction, เพิ่ม role enum ครบชุด
     ├─ 4. buyer           ← reservation (แตะ product/order schema หนักสุด)
     └─ 5. customer-service← ปรับตัวเข้ากับโลกที่ merge เสร็จแล้วครั้งเดียว
```

**เหตุผลของลำดับ**

1. **`feature-admin` ก่อน** — เป็นเจ้าเดียวที่แก้ `backend/shared/` เชิงโครงสร้าง (`permissions.js`,
   `requirePermission`, `req.userRoles`/`req.permissions`) ให้ฐานนี้ลงก่อน branch อื่นจะต่อยอดได้ทันที
   และ conflict กับ `main` ที่ `authMiddleware.js` แก้ตอนฐานยังสะอาดที่สุด
2. **`ceo`** — แตะ `shared/src/index.js` ต่อจาก admin, ต้องการ role `EXECUTIVE` ซึ่ง `RoleCode` ของ
   admin มีอยู่แล้ว merge ตามหลังจึงไม่ต้องแก้ย้อน
3. **`marketing`** — เพิ่ม `Role` enum ครบชุด (`MARKETING`/`CUSTOMER_SERVICE`/`EXECUTIVE`) พอ ceo ลงไป
   ก่อนแล้ว การรวม enum จบในที่เดียว
4. **`buyer`** — แตะ `Product`/`Order` schema หนักสุดและตามหลัง main 4 commit ให้ลงหลัง marketing
   เพื่อรวม schema ทีเดียวจบ
5. **`customer-service` ท้ายสุด** — เป็น branch ที่ต้อง "ปรับตัว" มากที่สุด (เปลี่ยนชื่อ role,
   รวมระบบ dispute กับ admin) ลงท้ายสุดแปลว่าปรับครั้งเดียวเข้ากับของทุกทีมที่ลงไปแล้ว
   ไม่ต้องไล่แก้ซ้ำทุกรอบ

## ปัญหาที่ต้องแก้ (พบจากการทดลอง merge จริง)

### 🔴 P1 — `dispute_evidence` ชนกัน ทำให้ order-service start ไม่ขึ้น

`feature-admin` และ CS ต่างนิยาม model `DisputeEvidence` ลงตาราง `dispute_evidence` เดียวกัน
คนละคอลัมน์ ยืนยันด้วย `prisma validate` → `P1012`

**มติ:** เปลี่ยนชื่อฝั่ง Admin เป็น `AdminDisputeEvidence` / ตาราง `admin_dispute_evidence`
แล้ว**เชื่อมให้ใช้ payout hold ร่วมกัน** — `adminDisputeService` ต้องเขียน `order.payoutHeld`
ของ CS ด้วย ไม่ใช่ถือสถานะแยกใน `paymentSimulationStatus` อย่างเดียว

- CS เป็นเจ้าของ "เคสข้อพิพาท" (`DisputeCase` ครบวงจร)
- Admin เป็นชั้น escalation "คุมเงิน" (hold/release + audit)
- ทั้งคู่อ่าน/เขียนสถานะพักเงินตัวเดียวกัน → ไม่มีสองแหล่งความจริง

### 🔴 P2 — ชื่อ Role ของฝ่าย CS ไม่ตรงกัน

CS ใช้ `SUPPORT` (hardcode 15 จุด) ส่วน `marketing` + `feature-admin` ใช้ `CUSTOMER_SERVICE`

**มติ:** มาตรฐานคือ **`CUSTOMER_SERVICE`** — แก้ฝั่ง CS ทั้ง 15 จุด
(`AGENT_ROLES`, เช็ค `user.role` ใน frontend, seed, test) เพื่อให้ CS เสียบเข้า
`ROLE_PERMISSIONS` ของ admin ได้ทันทีและ enum เหลือค่าเดียว

### 🟠 P3 — Seed UUID ชนกัน บัญชี demo หายเงียบ

`20000000-0000-0000-0000-000000000001` ถูกจองโดยทั้ง `cs.nan@example.com` (CS) และ
`marketing@example.com` (marketing) — upsert by `id` ทำให้ตัวที่รันทีหลังเข้าเงื่อนไข
`update: {}` แล้วถูกข้ามเงียบ ๆ **ไม่ error แต่บัญชีหายไป 1 อัน**

**แก้:** ย้าย staff ของ marketing ไป block UUID ของตัวเอง (`40000000-...`)
และจัดโซน UUID ให้ชัด: `1xxx`=seller, `2xxx`=CS agent, `3xxx`=buyer, `4xxx`=marketing,
`10000000-...-099`=executive

### 🟠 P4 — `feature-admin` จะทำ Thai-name fix พัง (regression)

`authMiddleware.js` ของ `feature-admin` แตกมาก่อน commit `2c8ef20` จึงยังเป็นเวอร์ชันก่อนแก้
`ERR_INVALID_CHAR` **ห้าม resolve ด้วย `--theirs`**

**แก้:** union — เก็บ `decodeURIComponent` ของ main **และ** `req.userRoles`/`req.permissions`
ของ admin ไว้ทั้งคู่

### 🟠 P5 — `buyer` จะลบ trigram search ภาษาไทยทิ้ง (regression)

`buyer` ตามหลัง main 4 commit → `productModel.js` ของมันยังไม่มี `searchText`/pg_trgm search
ที่เพิ่งเพิ่มใน `da6f255` **ห้าม resolve ด้วย `--theirs`**

**แก้:** union — เก็บ trigram search ของ main **และ** field reservation ของ buyer
(`toApiShape` ต้อง `delete` ทั้ง `searchText` และ `reservationId`/`reservedBy`/`reservationExpiresAt`)

### 🟡 P6 — `feature-admin` มี `prisma/migrations/` แต่ทั้งโปรเจกต์ใช้ `db push`

Dockerfile ยังเป็น `prisma db push` → โฟลเดอร์ migration ไม่ถูกใช้งานเลย เป็นไฟล์ตายที่จะทำให้
คนหลังเข้าใจผิดว่ารันด้วย `migrate deploy`

**แก้:** เก็บไว้แต่บันทึกไว้ใน changelog ว่าไม่ได้ถูกใช้ (ไม่ลบ เพราะเป็นงานของทีม admin
และไม่กระทบ runtime) — ทบทวนตอนตั้ง migration strategy จริง

## Conflict ที่เป็นแค่ "ต่อท้าย" (แก้เชิงกลไก keep both)

| ไฟล์                                     | branch ที่ชน                 | วิธี                        |
| ---------------------------------------- | ---------------------------- | --------------------------- |
| `backend/services/*/src/app.js` (3 ไฟล์) | admin, ceo, buyer, marketing | รวม `app.use()` ทุกเส้น     |
| `frontend/components/NavBar.js`          | admin, ceo, marketing, CS    | รวมลิงก์ทุกเมนู ตาม role    |
| `backend/shared/src/index.js`            | admin, ceo                   | รวม export                  |
| `auth/order/product schema.prisma`       | เกือบทุก branch              | รวม field/model (ยกเว้น P1) |
| `auth-service/prisma/seed.js`            | marketing, ceo, CS           | รวม (ยกเว้น P3)             |
| `product-service/src/server.js`          | buyer, marketing             | รวม background job ทั้งคู่  |

## จุดที่ "เชื่อมระบบเข้าหากัน" เพิ่มเติม

1. **Admin dispute ↔ CS dispute** — ใช้ `order.payoutHeld` ร่วมกัน (P1)
2. **CS role ↔ Admin permission system** — CS ใช้ `CUSTOMER_SERVICE` แล้วได้
   `support:case:read/write`, `order:read:any` จาก `ROLE_PERMISSIONS` ทันที (P2)
3. **NavBar** — รวมเมนูของทุก role ไว้ที่เดียว ผู้ใช้แต่ละ role เห็นเฉพาะของตัวเอง
4. **Gateway** — รวม public path ของ marketing (auction) และ CS (FAQ) + route `/api/support`

## ขั้นตอนตรวจสอบทุก Phase (ห้ามข้าม)

หลัง merge แต่ละ branch:

1. `prisma validate` ทั้ง 4 schema (auth/order/product/support) — ต้องผ่านก่อนไปต่อ
2. `npm run lint` เฉพาะไฟล์ที่แตะ
3. `npm test` — ต้องไม่ต่ำกว่า baseline
4. Phase สุดท้าย: `docker compose up --build` ให้ทุก container `healthy`
   แล้วเดิน flow จริงใน browser ทุก role

## Definition of Done

- [ ] ทุก container ขึ้น `healthy` จาก clone เปล่า (`docker compose up --build`)
- [ ] `npm test` ผ่านทั้งหมด
- [ ] เดิน flow จริงผ่าน browser ครบทุก role: buyer, seller, CS, admin, marketing, executive
- [ ] ฟีเจอร์เดิมของ `main` ไม่ regress (Thai name, trigram search, auto-refresh token)
- [ ] เปิด PR `integration/all-features` → `main` ครั้งเดียว
