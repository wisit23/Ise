# ข้อตกลง: แยกข้อมูลการทำงานออกจาก audit log

ไฟล์นี้บันทึกสิ่งที่ผู้ใช้กับผู้ช่วยคุยและตกลงกัน รายละเอียดการลงมือ ผล test และหลักฐานการรันแยกไว้ที่ [รายงาน operational storage](../evidence/operational-storage.md)

## ที่มาและข้อสรุป

ผู้ใช้ตั้งคำถามถึงการเก็บข้อมูลที่ระบบใช้ทำงานไว้ใน log และต้องการแยกออกมาเป็น column/table ที่ตรงความหมาย โดยให้เสนอรายการแก้ ER ทั้งหมดก่อน ผู้ใช้อนุมัติข้อเสนอด้วยข้อความ “ok เเก้ให้เป็นเอาตามที่นายเสนอมาเลย”

ข้อตกลงใหม่นี้แทนแนวทางเดิมที่อ่านสถานะหลักของ Order/Product/Support จาก log ส่วน log เดิมยังเก็บไว้เป็นประวัติ และยังบันทึกการกระทำต่อไป

## รายการที่ตกลงแก้

- **Order:** เพิ่ม 17 workflow fields ใน `dispute_case`; เพิ่ม `product_title`, `campaign_code`, `pre_dispute_status` ใน `orders`; แยก `checkout_address_snapshots` และ `shipping_address_snapshots`; เปลี่ยน `order_attribution_jobs` จาก view เป็น table; เพิ่ม `order_product_sync_jobs` และเลิกใช้ view สถานะ dispute ที่อิง log
- **Product:** เพิ่ม title/categories และข้อมูลยกเลิกใน `auction_rounds`; เพิ่มข้อมูลยกเลิกใน `auction_items`; เพิ่ม `product_moderation_commands` สำหรับผลคำสั่งและการป้องกันการทำซ้ำ โดยคง moderation columns ที่มีอยู่แล้วในสินค้า
- **Support:** เพิ่ม priority/risk/responder และ classification fields ใน `support_tickets`; เพิ่ม `ticket_sla_rounds` เก็บรอบและ policy snapshot; ผูก `ticket_sla_targets` กับรอบของ ticket/policy เดียวกัน; เพิ่ม `ticket_chat_message_receipts` สำหรับตรวจข้อความที่ส่งซ้ำ
- รวมเจ็ดตารางจริง (นับการเปลี่ยน attribution view เป็น table) และเพิ่ม 35 columns ในหกตารางเดิม รายละเอียดชื่อ/type/key อยู่ใน [พจนานุกรมโครงสร้างปัจจุบัน](../../database/operational-storage.md)

## ข้อตกลงเรื่อง shipping address snapshot

ผู้ใช้ยืนยันให้สร้าง **table แยก** แทนการเพิ่มเจ็ด address columns ลงใน `shipping` โดยตรง:

- `shipping_address_snapshots.shipping_id` เป็นทั้ง PK และ FK อ้างถึง `shipping`
- เก็บที่อยู่ ณ เวลาทำรายการเจ็ด fields: ผู้รับ โทรศัพท์ ที่อยู่ ตำบล อำเภอ จังหวัด และรหัสไปรษณีย์
- เป็น snapshot เพื่อรักษาที่อยู่ของรายการเดิม ไม่อ่านที่อยู่ปัจจุบันมาทับประวัติ
- API ยังคงรูปแบบ `addressSnapshot` เดิม

## เงื่อนไขที่ต้องรักษา

- คง flow และ API เดิม รวมถึง queue, SLA, retry และการป้องกันงานซ้ำ
- รักษาข้อมูลเดิม audit history, IDs, ยอดเงิน เวลา และ policy provenance ไม่แต่งข้อมูลย้อนหลัง
- คงขอบเขตความเป็นเจ้าของข้อมูลระหว่าง service และการกรองข้อมูลส่วนตัว
- ปรับ ER ข้อ 1, เอกสารอ้างอิง และ PDF ให้สะท้อนรายการที่อนุมัติ โดยเก็บต้นฉบับเก่าไว้เป็นประวัติ
- ขอบเขตการแก้ระบบคือ Order/Product/Support; ไม่รวมการแก้งานอื่นที่มีอยู่ก่อน

## การอนุมัติเพิ่มเติม

ตอนเริ่มงานยังไม่รวมการ migrate ฐานที่แอปใช้ ต่อมาผู้ใช้สั่ง **“migration เเละ test ให้ด้วย”** จึงอนุมัติให้สำรองและย้ายฐาน local ที่ตั้งค่าไว้ พร้อม rebuild/restart สาม service และทดสอบหลังย้าย ข้อตกลงนี้แทนข้อจำกัดเดิมเฉพาะการย้าย local; ไม่ได้มีคำสั่ง deploy production หรือ commit

## ข้อตกลงเรื่องที่เก็บบันทึก — 2026-10-15

ผู้ใช้ชี้แจงว่า `log/loger` ใช้บันทึกสิ่งที่เราคุยและตกลงกัน และสั่ง “เเยกไว้เลย” หลังเสนอให้แยกผล test/หลักฐานการรันออกไป จึงใช้:

- `log/loger/`: บทสนทนาต้นทาง ข้อเสนอ การตัดสินใจ และข้อตกลงล่าสุด
- `log/evidence/`: รายงานการลงมือ ผล test, review, migration และ raw output โดยลิงก์จากข้อตกลงเมื่อจำเป็น

ข้อตกลงในไฟล์นี้เป็นสรุปจากบทสนทนาที่มีใน thread ไม่ใช่ transcript แบบคำต่อคำ หลักฐานการลงมือและข้อจำกัดดูที่ [รายงาน](../evidence/operational-storage.md) และ [สารบัญหลักฐาน](../evidence/README.md)
