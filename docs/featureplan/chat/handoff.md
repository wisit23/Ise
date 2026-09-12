# Chat Platform Feature Handoff

> อัปเดตล่าสุด: 2026-09-03

## Ownership

- Owner: อชิรวินท์ จรูญกีรติโรจน์ (Customer Service)
- Reviewer: สิรดนัย กันหา
- Requirement scope: `UR-05`, `UR-18`, `UR-34` (`CHAT-001`–`CHAT-006` เป็น Core ของรอบนี้;
  `CHAT-007`/`CHAT-008` เป็น Roadmap ที่ยังไม่เริ่ม)
- Current status: **`CHAT-001`–`CHAT-006` เสร็จครบตามขอบเขตที่ยืนยันไว้** — ตรวจสอบแล้วด้วย
  Docker Stack จริงทั้งหมด รวม Browser จริง 2 session แยกกัน, 2-instance scale test ของ Redis
  adapter, และ chai-service test suite 74/74

## Scope to hand off

ลำดับ `CHAT-001` → `CHAT-006` ทำครบแล้วทั้งหมด ถัดไปคือการตัดสินใจว่าจะทำ `CHAT-007`/`CHAT-008`
ต่อหรือไม่ (ดู `decision.md` CHAT-DEC-003 สำหรับเหตุผลที่เลื่อนไว้)

- `CHAT-001`: Infrastructure — MongoDB replica set, Redis wiring, CI **(Done)**
- `CHAT-002`: Conversation model, participant authorization, create-or-open **(Done)**
- `CHAT-003`: Message ส่ง/อ่าน, cursor pagination, unread count **(Done)**
- `CHAT-004`: Frontend — กล่องข้อความ, ห้องแชท, ปุ่มติดต่อผู้ขาย **(Done)**
- `CHAT-005`: Internal API ให้ Service อื่นเรียกใช้ได้ **(Done)**
- `CHAT-006`: Socket.IO + Redis pub/sub realtime, presence, typing **(Done)**
- `CHAT-007`: ไฟล์แนบ, rate limit, `chat:read:any` สำหรับ CS/Admin (report-gated) — **ยังไม่เริ่ม**
- `CHAT-008`: ย้ายข้อความตั๋ว CS มารวมกับ Conversation/Message model เดียวกัน — **ยังไม่เริ่ม**

## Current evidence

- Requirement traceability, Data Model, API Contract และ acceptance steps อยู่ใน
  [`plan.md`](plan.md) — ทุก Task มี checkbox ติ๊กครบและ heading บอกวันที่เสร็จ
- หลักฐานการตรวจทุก Task (คำสั่ง Docker ที่รันจริง, ผลลัพธ์, บั๊กที่เจอและแก้) อยู่ใน
  [`progress.md`](progress.md) — รวมเรื่องบั๊กใหญ่ของ Gateway WebSocket proxy ที่เจอใน `CHAT-006`
- เหตุผลของทุกการตัดสินใจ (MongoDB, ownership, ขอบเขต, สิทธิ์อ่านห้อง, raw TCP proxy) อยู่ใน
  [`decision.md`](decision.md) — 5 รายการ (`CHAT-DEC-001`–`CHAT-DEC-005`)

## สิ่งที่คนถัดไปต้องรู้ก่อนแตะโค้ดนี้ต่อ

1. **Gateway's WebSocket proxy เป็น raw TCP pipe เอง ไม่ใช่ library** —
   `backend/gateway/src/server.js` เขียน proxy เองเพราะทั้ง `http-proxy-middleware` และ
   `http-proxy` ทำ response เสียหายเมื่อมี WebSocket connection พร้อมกัน 2 อัน (ดู `decision.md`
   CHAT-DEC-005 สำหรับรายละเอียดเต็มของการ debug) **อย่าเปลี่ยนกลับไปใช้ library โดยไม่ทดสอบ
   concurrency จริงผ่าน Docker ก่อน**
2. **Redis เป็น delivery layer เท่านั้น** — ทดสอบแล้วว่าหยุด Redis container ยังส่งข้อความผ่าน
   REST ได้สำเร็จ (`201`, persist ใน MongoDB) มีแค่ realtime push ที่หายไปตอน Redis ล่ม
3. **Frontend ใช้ Socket เป็นหลัก REST polling เป็น fallback** — `frontend/app/chat/[id]/page.js`
   polling effect gate ด้วย `!realtime`; ถ้าจะแก้ logic ตรงนี้ให้ระวังอย่าทำให้ polling รันซ้อนกับ
   socket พร้อมกันโดยไม่ตั้งใจ
4. **`GET /api/auth/users/:id/public` เป็น seller-only endpoint** — seller มองชื่อ buyer ในห้อง
   แชทไม่ออก (fallback "ผู้ใช้") เป็น known gap ที่ไม่ได้แก้ในรอบนี้เพราะอยู่นอกขอบเขต Chat
   (เป็นไฟล์ของ auth-service/`getPublicSellerProfile`) — ใครหยิบไปทำต่อควรทำเป็น task แยก
5. **Anonymous `node_modules` volume ใน docker-compose.yml บัง dependency ใหม่หลัง rebuild** —
   ถ้าเพิ่ม dependency ใหม่ใน `frontend/package.json` หรือ service อื่นที่มี pattern เดียวกัน
   ต้องใช้ `docker compose up -d --build --force-recreate -V <service>` ไม่ใช่แค่ `--build`
   เฉย ๆ ไม่งั้นจะเจอ "Module not found" ทั้งที่ package.json ถูกต้องแล้ว
6. **ทดสอบ replica set + scale ในเครื่อง** ก่อนแก้อะไรเกี่ยวกับ realtime:
   `docker compose up -d mongo redis && docker compose up mongo-init` แล้วเช็ค
   `docker compose ps mongo` ว่า `healthy`; ทดสอบ multi-instance ด้วย
   `docker compose up -d --scale chat-service=2 chat-service`
