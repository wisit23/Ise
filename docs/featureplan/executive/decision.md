# Executive Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## CEO-DEC-001 — Vertical Executive ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Executive Owner รับผิดชอบ `UR-27`–`UR-31` แบบ vertical ตั้งแต่ UI, API, metric rules, PostgreSQL tests และเอกสาร
- Reason: ทำให้นิยาม KPI และ dashboard outcome มี Owner เดียว
- Consequence: Source metric contracts ยังต้อง review ร่วมกับ Buyer, Seller และ Marketing

## CEO-DEC-002 — Read-only analytics boundary

- Date: 2026-08-10
- Status: Accepted
- Decision: Executive Feature เป็น read-only และไม่มีสิทธิ์เปลี่ยน Product, Order หรือ Campaign state
- Reason: ลด coupling และป้องกัน dashboard กลายเป็นช่องทางแก้ข้อมูลธุรกรรม
- Consequence: Action ที่กระทบ source data ต้องส่งไปยัง owner service เท่านั้น

## CEO-DEC-003 — Owner-local aggregates

- Date: 2026-08-10
- Status: Accepted
- Decision: KPI ใช้ owner-local aggregate endpoints/events และห้าม query database ของ service อื่นโดยตรง
- Reason: รักษา data ownership และทำให้ metric trace กลับได้
- Consequence: Dashboard ต้องแสดง unavailable/partial state แทนการปลอมค่าเป็นศูนย์เมื่อ provider มีปัญหา

## CEO-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Export/authorization/security hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้
