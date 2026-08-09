# Admin Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## ADM-DEC-001 — Vertical Admin ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Admin Owner รับผิดชอบ `UR-22`–`UR-26` แบบ vertical ตั้งแต่ UI, API, RBAC/admin rules, PostgreSQL tests และเอกสาร
- Reason: รวม staff-control behavior และหลักฐานการตัดสินใจไว้ที่ Owner เดียว
- Consequence: Product, Order และ Chat owner ต้องร่วม review command contract ที่กระทบข้อมูลของตน

## ADM-DEC-002 — Central Auth/RBAC contract

- Date: 2026-08-10
- Status: Accepted
- Decision: Admin/Auth เป็น provider ของ role และ permission catalog สำหรับทุก Feature
- Reason: ป้องกันแต่ละ service นิยาม role/permission ไม่ตรงกัน
- Consequence: Frontend visibility ไม่ถือเป็น authorization และการเปลี่ยน permission contract ต้อง review ร่วมทุก Role

## ADM-DEC-003 — Synthetic KYC and simulated fund hold

- Date: 2026-08-10
- Status: Accepted
- Decision: KYC review ใช้ synthetic data และ fund hold เป็น simulation เท่านั้น
- Reason: รองรับ functional workflow โดยไม่ใช้ข้อมูลส่วนบุคคลหรือเงินจริง
- Consequence: KYC decision, moderation, dispute และ hold state ต้อง persist ใน PostgreSQL จริงพร้อม audit evidence

## ADM-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Privileged audit/security/PDPA hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้
