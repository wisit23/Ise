# หลักฐานการลงมือและการตรวจสอบ

โฟลเดอร์นี้แยกจาก `log/loger` ตามที่ผู้ใช้ตกลงเมื่อ 2026-10-15 ใช้เก็บรายงาน implementation, review, ผล test, migration และ raw output โดยคงโครงสร้างย่อยตาม service และรักษาเนื้อหาผลรันเดิม

- [ข้อตกลงและต้นทางบทสนทนา](../loger/README.md)
- [Operational storage: implementation, migration และผลตรวจ](operational-storage.md)
- [งานเทียบ ER รอบก่อน: work map](implementation.md)
- [Auth](auth-service/implementation.md), [Order](order-service/workflow-implementation.md), [Product](product-service/implementation.md), [Support](support-service/implementation.md), [Chat](chat-service/implementation.md)

รายงานเก่าบันทึกสถานะ ณ เวลาที่รัน ต้องอ่านส่วนเพิ่มเติมล่าสุดก่อนสรุปสถานะปัจจุบัน ไฟล์ผลรันที่ล้มเหลวระหว่างทางยังเก็บไว้เป็นหลักฐานและไม่ได้หมายความว่าผลสุดท้ายล้มเหลว

การจัดโฟลเดอร์ครั้งนี้ย้าย 121 ไฟล์ (raw text output 104 ไฟล์และรายงาน 17 ไฟล์) จาก `log/loger` มาที่นี่ ตรวจ checksum ก่อน/หลังย้ายทุกไฟล์แล้ว จากนั้นแก้ relative links ใน Markdown ตามตำแหน่งใหม่ ส่วน operational-storage ใน `log/loger` เขียนเป็นบันทึกข้อตกลงแยกจากรายงานเดิม
