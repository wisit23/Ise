# Chat Platform Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## CHAT-DEC-001 — MongoDB สำหรับข้อความ, PostgreSQL/Redis คงเดิมสำหรับส่วนอื่น

- Date: 2026-09-03
- Status: Accepted
- Decision: `chat-service` เก็บ `Conversation`/`Message` ใน MongoDB (ไม่ใช่ Postgres เดิมของทุก
  service อื่น) โดยใช้โครงหลักเป็น field ตายตัว (index/query ได้เร็ว) + `payload: Json` สำหรับส่วน
  ที่แปรผันตามชนิดข้อความ Redis ยังเป็น delivery/presence layer เท่านั้น ไม่ใช่แหล่งความจริง
- Reason: ข้อความแต่ละชนิด (TEXT/IMAGE/PRODUCT_CARD/ORDER_CARD/SYSTEM) มี field ไม่เท่ากัน —
  ตารางเดียวแบบ Postgres คอลัมน์ตายตัวจะได้ NULL เต็มไปหมดและเพิ่มชนิดใหม่ต้อง migration ทุกครั้ง
  ประเมินแล้วว่าปริมาณข้อความของระบบนี้ (หลักล้านแถว/ปี) ไม่ถึงจุดที่ Cassandra/ScyllaDB คุ้มค่า
  (Discord ย้ายจาก Mongo ไป Cassandra ที่ ~100M+ แถว ไม่ใช่ที่สเกลนี้) และ MongoDB ให้ประโยชน์เชิง
  วิชาการของ polyglot persistence ที่ Postgres+JSONB ให้ไม่ครบเท่า (ผู้ใช้ยืนยันเลือกทางนี้)
- Consequence: ไม่มี FK ระดับฐานข้อมูลข้าม order/product — authorization ต้องเช็คจาก
  `participants` ที่ฝังอยู่ในเอกสารเอง ไม่ใช่ join ข้าม service; ต้องรัน Mongo เป็น replica set แม้
  node เดียวเพื่อให้ Prisma transaction ใช้ได้ (`CHAT-001`); ไฟล์แนบยังคงเก็บนอกฐานข้อมูลเหมือน
  Pattern เดิม (`product-service`/`order-service`/`auth-service`)

## CHAT-DEC-002 — Chat เป็นระบบกลาง, Owner คือ CS

- Date: 2026-09-03
- Status: Accepted
- Decision: `chat-service` เป็น Owner เดียวของข้อความทุกชนิดในระบบ (`contextType`:
  `PRODUCT`/`ORDER`/`SUPPORT`/`DIRECT`) เปิด Internal API ให้ Service อื่นเรียกได้โดยไม่ต้องมี JWT
  ของผู้ใช้ตั้งแต่ `CHAT-005` แต่ความเป็นเจ้าของเอกสาร/การตัดสินใจ design ยังอยู่ที่ CS
  (อชิรวินท์ เป็น Owner, สิรดนัย เป็น Reviewer)
- Reason: ผู้ใช้ยืนยันว่า CS เป็นเจ้าของจริงตามความต้องการเดิม (`FR-4.1.2`) แต่ต้องการให้ Feature
  อื่นดึงไปใช้ได้โดยไม่ต้องแก้ Data Model ทีหลัง — `contextKey`/`contextType` design ไว้ให้ขยาย
  ชนิด context ใหม่ได้โดยไม่แก้ schema
- Consequence: `README.md`'s Role-based ownership table ไม่ตรงกับ Chat ตรง ๆ — Chat เป็นข้อยกเว้น
  ต้องมีคนอ่านเอกสารนี้แยกจากตาราง ownership หลัก

## CHAT-DEC-003 — ขอบเขตรอบนี้ = `CHAT-001`–`CHAT-006` เท่านั้น

- Date: 2026-09-03
- Status: Accepted
- Decision: ทำให้ตัวระบบแชทสมบูรณ์ end-to-end ก่อน (ห้อง → ข้อความ → สิทธิ์ → realtime ผ่าน
  Socket.IO + Redis) ยังไม่ทำ `CHAT-007` (ไฟล์แนบ/rate-limit/Admin moderation) หรือ `CHAT-008`
  (ย้ายข้อความตั๋ว CS มารวม) ในรอบนี้
- Reason: ผู้ใช้ยืนยันตรง ๆ ว่าอยากเห็นแกนกลางของระบบแชททำงานสมบูรณ์ก่อน โดยไม่ต้องผูกกับแต่ละ
  Role — ถ้าแกนแข็งแรง การต่อให้ Role อื่นใช้ทีหลังเป็นงานเชื่อมสาย ไม่ใช่งานออกแบบใหม่
- Consequence: `FR-4.1.2` (Chat Console ของ CS) ยังไม่ถูก cover จนกว่าจะทำ `CHAT-008`; `CSS-001`
  ใน `customer-service/plan.md` ยังคง Deferred ต่อไปจนกว่าจะตัดสินใจใหม่

## CHAT-DEC-004 — CS/Admin อ่านห้องอื่นได้เฉพาะห้องที่ถูก report

- Date: 2026-09-03
- Status: Accepted
- Decision: CS/Admin จะไม่มีสิทธิ์อ่านห้อง Buyer↔Seller ทุกห้องโดยทั่วไป อ่านได้เฉพาะห้องที่ถูก
  report แล้วเท่านั้น ผ่าน permission ใหม่ `chat:read:any` (จะ implement ใน `CHAT-007`)
- Reason: ผู้ใช้ยืนยันแนวทางที่เสนอไว้ — ประเด็นความเป็นส่วนตัวยังไม่มี `ADR-012` รองรับเต็มรูปแบบ
  การจำกัดสิทธิ์ไว้ก่อนปลอดภัยกว่า
- Consequence: `CHAT-001`–`CHAT-006` (ขอบเขตรอบนี้) จะยังไม่มี endpoint ให้ CS/Admin อ่านห้องคนอื่น
  เลย — ต้องรอ `CHAT-007`

## CHAT-DEC-005 — Gateway WebSocket proxy ใช้ raw TCP pipe เอง ไม่ใช่ http-proxy-middleware/http-proxy

- Date: 2026-09-03
- Status: Accepted
- Decision: `backend/gateway/src/server.js`'s WebSocket upgrade proxy (สำหรับ `/api/chat`)
  เขียนเป็น raw TCP pipe เอง (`net.connect()` ใหม่ต่อ upgrade, replay header/head bytes, แล้ว
  `pipe()` สองทาง) แทนการใช้ `http-proxy-middleware`'s `ws:true`/`.upgrade()` หรือ raw
  `http-proxy` library โดยตรง
- Reason: ทดสอบทั้งสามแบบ (http-proxy-middleware แบบสร้าง instance ใหม่ต่อ request, แบบ instance
  เดียวใช้ซ้ำ, และ raw `http-proxy` library) ล้วนทำให้ response เสียหาย (`ECONNRESET` ทั้งสองฝั่ง)
  เมื่อมี 2 client ต่อ WebSocket พร้อมกันผ่าน gateway จริง — พิสูจน์ด้วยการทดสอบเปรียบเทียบ:
  ต่อตรงไปที่ chat-service (ไม่ผ่าน gateway) สำเร็จทุกครั้ง, ต่อผ่าน gateway ทีละคน (sequential)
  สำเร็จ, แต่ต่อผ่าน gateway พร้อมกันล้มเหมอ; log ฝั่ง chat-service ยืนยันว่า Socket.IO server
  ทำ handshake สำเร็จทั้งสอง client จริง ('connection' event ยิงสองครั้ง) แปลว่าปัญหาไม่ได้อยู่ที่
  chat-service เลย แต่อยู่ที่ library จัดการ response path ตอน proxy concurrent WS upgrade กลับ
  ไม่ถูกต้อง (เชื่อว่าเกี่ยวกับ internal connection-pooling/agent handling ที่ public API ของทั้ง
  สอง library ไม่มีทางปิดได้ตรง ๆ) ที่แย่กว่านั้นคือ shared-instance variant พอพังครั้งเดียว
  จะพังต่อไปทุก request จนกว่าจะ restart gateway process — raw TCP pipe เป็น connection ใหม่
  อิสระต่อ upgrade ไม่มี pool ให้เสียหาย
- Consequence: `backend/gateway/package.json` ไม่มี `http-proxy` เป็น dependency อีก (ลองแล้ว
  ไม่ใช่ทางแก้ ถอดออก); `backend/gateway/src/app.js`'s `/api/chat` proxy (HTTP request ปกติ)
  ยังใช้ `http-proxy-middleware` เหมือนเดิม — กระทบเฉพาะ WebSocket upgrade path เท่านั้น;
  โค้ด raw TCP pipe เป็นโค้ดที่ต้องดูแลเอง ไม่ได้พึ่ง library maintainer อีกต่อไป มี comment
  อธิบายเหตุผลไว้ในโค้ดตรง ๆ เผื่อใครสงสัยว่าทำไมไม่ใช้ library สำเร็จรูป
