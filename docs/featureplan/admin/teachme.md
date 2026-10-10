# Admin Feature Teach Me

## Round 0 — Role enum ยังไม่ใช่ RBAC

ปัจจุบัน JWT มี `role` ค่าเดียวและ middleware เช็ค `requireRole(...roles)` เท่านั้น แต่ทีมต้องมี
Buyer, Seller, Customer Service, Admin, Marketing และ Executive พร้อม permission ราย action

การเพิ่ม route `/admin` โดยซ่อนเมนูไม่ป้องกัน direct API call งาน `ADM-001` จึงต้องเปลี่ยน
identity contract, token freshness และ server-side permission ก่อน Admin UI

**Teach-back:** อะไรต่างกันระหว่าง Role กับ Permission และเหตุใด UI guard อย่างเดียวไม่พอ?

## TSR-03 — Idempotency ไม่ใช่แค่เก็บ response หลังทำงาน

ถ้าเพิ่งบันทึก idempotency key หลัง side effect คำขอสองตัวที่มาพร้อมกันยังผ่านเข้าไปทำงานได้ทั้งคู่ และถ้า service ปลายทางทำสำเร็จแต่ response สูญหาย ฝั่งต้นทางจะไม่รู้ว่าควร retry หรือหยุด

TSR-03 จึงแยกหลักสำคัญสามชั้น:

1. claim operation ก่อน side effect และผูก key กับ actor/action/target/payload เดียวกัน
2. ใช้ state/version CAS เพื่อให้มีเพียงคำสั่งเดียวเปลี่ยน business state ได้
3. ให้ owner service เก็บผลคำสั่งใน transaction เดียวกับ state change เพื่อ replay ผลเดิมได้หลัง timeout

Audit ที่อยู่ฐานเดียวกับ state ต้อง commit ใน transaction เดียวกัน ส่วน cross-service ใช้ durable operation เพื่อ resume/finalize แทนการแกล้งทำว่าเป็น distributed transaction เดียว

**Teach-back:** ถ้า Product เปลี่ยนสถานะสำเร็จแล้วแต่ Auth timeout เหตุใดการ retry ด้วย key เดิมจึงปลอดภัยกว่าการส่ง key ใหม่?
