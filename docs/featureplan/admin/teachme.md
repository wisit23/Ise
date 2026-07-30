# Admin Feature Teach Me

## Round 0 — Role enum ยังไม่ใช่ RBAC

ปัจจุบัน JWT มี `role` ค่าเดียวและ middleware เช็ค `requireRole(...roles)` เท่านั้น แต่ทีมต้องมี
Buyer, Seller, Customer Service, Admin, Marketing และ Executive พร้อม permission ราย action

การเพิ่ม route `/admin` โดยซ่อนเมนูไม่ป้องกัน direct API call งาน `ADM-001` จึงต้องเปลี่ยน
identity contract, token freshness และ server-side permission ก่อน Admin UI

**Teach-back:** อะไรต่างกันระหว่าง Role กับ Permission และเหตุใด UI guard อย่างเดียวไม่พอ?
