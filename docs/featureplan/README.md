# RE-LOOP Feature Plans

ชุดเอกสารนี้แบ่งงานตาม Role ที่สมาชิกแต่ละคนสัมภาษณ์ โดยแต่ละคนเป็นเจ้าของ Vertical
Feature ตั้งแต่ UI, API, business rule, database change ที่จำเป็น ไปจนถึง test และเอกสาร
แต่ยังต้องใช้สัญญากลางใน [`integration.md`](integration.md)

## เอกสารรวม

- [`plan.md`](plan.md) — แผนรวม ลำดับรอบ และ Integration Gate
- [`progress.md`](progress.md) — สถานะปัจจุบันของทั้งหก Feature
- [`changelog.md`](changelog.md) — ประวัติการเปลี่ยนแปลงรวมแบบ append-only
- [`teachme.md`](teachme.md) — บทเรียนรวมจากแต่ละรอบ
- [`integration.md`](integration.md) — API/data contract, shared files และกติกา merge

## Feature ownership

| Feature          | Owner                    | Reviewer หลัก            | เอกสาร                                   |
| ---------------- | ------------------------ | ------------------------ | ---------------------------------------- |
| Buyer            | วิศิษฏ์ เจียมสันต์       | เอกตระการ บุญญกาศ        | [`buyer/`](buyer/)                       |
| Seller           | เอกตระการ บุญญกาศ        | วิศิษฏ์ เจียมสันต์       | [`seller/`](seller/)                     |
| Customer Service | อชิรวินท์ จรูญกีรติโรจน์ | สิรดนัย กันหา            | [`customer-service/`](customer-service/) |
| Admin            | สิรดนัย กันหา            | อชิรวินท์ จรูญกีรติโรจน์ | [`admin/`](admin/)                       |
| Marketing        | ศิวกร วรวัฒน์อมรชัย      | อัสนัย เมืองรอด          | [`marketing/`](marketing/)               |
| Executive        | อัสนัย เมืองรอด          | ศิวกร วรวัฒน์อมรชัย      | [`executive/`](executive/)               |

## กติกาการอัปเดตในแต่ละรอบ

1. ก่อนเริ่ม ให้ Owner เลือก Task จาก `plan.md` ของ Feature และเปลี่ยน `progress.md`
2. ระหว่างทำ ให้ commit เฉพาะ vertical slice ของ Task นั้น
3. หลังตรวจ ให้เพิ่มรายการใน `changelog.md` โดยไม่ลบผลตรวจเดิม
4. ก่อนส่ง Review ให้เพิ่มบทเรียนของรอบใน `teachme.md`
5. Reviewer คนละคนกับ Owner ตรวจ acceptance criteria และหลักฐาน
6. ไฟล์รวมที่ root สรุปจากไฟล์ย่อยเท่านั้น ห้ามสร้างสถานะใหม่ที่ไฟล์ย่อยไม่มี

งาน prototype เดิมใน `docs/progress.md` เป็นหลักฐานให้ตรวจรับช่วง ไม่ได้ถูกนับเป็น Done ของ
Feature ใหม่โดยอัตโนมัติ
