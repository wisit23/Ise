# Customer Service priority and SLA — cs-24x7-v2

บริการตลอด 24 ชั่วโมงทุกวันตามที่เจ้าของระบบยืนยันวันที่ 9 ตุลาคม 2026 ทุกชั่วโมงเป็น calendar hour รวมกลางคืน เสาร์ อาทิตย์ และวันหยุด เก็บเวลาใน UTC และแสดงเวลาไทย

## กติกาความสำคัญ

| Priority | หลักการและตัวอย่าง |
| --- | --- |
| LOW | สอบถามทั่วไปในหมวด OTHER หรือปัญหา cosmetic เช่นสีปุ่ม/คำผิด โดยไม่มีสัญญาณผลกระทบที่สูงกว่า |
| NORMAL | ปัญหาการใช้งานทั่วไป ไม่มีเงินที่ต้องตรวจสอบ บัญชีใช้งานไม่ได้ หรือการสูญเสียที่กำลังเกิดขึ้น |
| HIGH | Dispute ที่พักเงิน; Ticket PAYMENT ผูกกับคำสั่งซื้อที่มียอดเงินจริง; เข้าบัญชีไม่ได้; ไม่ได้รับสินค้า; แจ้งสงสัยโกง/สินค้าปลอม |
| URGENT | Dispute หรือ PAYMENT ที่มีเงินเกี่ยวข้องตั้งแต่ 10,000 บาท; แจ้งชำระเงินซ้ำ/ธุรกรรมไม่ได้อนุญาต/บัญชีถูกยึด |

กฎเลือกผลกระทบสูงสุดที่ตรงกัน มูลค่าใช้จาก Order ที่ server ตรวจสอบสิทธิ์แล้ว ไม่รับยอดเงินหรือ priority จากฟอร์มเปิดเคส ประวัติร้องเรียนใช้เป็นคะแนนเสริมเล็กน้อยภายในระดับเดิม ไม่ถือว่าเป็นข้อพิสูจน์การกระทำผิด หากบริการตรวจประวัติล่ม บันทึก `riskLookupAvailable: false` และไม่แต่งจำนวนร้องเรียนขึ้นมา

การจับข้อความเป็น deterministic triage จากอาการที่ผู้ใช้แจ้ง ไม่ใช่ข้อสรุปเรื่องความผิด รองรับคำไทย/อังกฤษที่ระบุไว้ใน servicePolicy.js และการปฏิเสธคำโกงบางรูปแบบ ไม่ใช่ NLP ที่เข้าใจทุกบริบท เจ้าหน้าที่ต้องตรวจข้อเท็จจริงก่อนตัดสินเงินหรือบัญชี

## เป้าหมายเวลา

| Priority | Ticket ตอบครั้งแรก | Ticket แก้ไข | Dispute เริ่มตรวจ | Dispute ตัดสิน |
| --- | --- | --- | --- | --- |
| URGENT | 30 นาที | 12 ชั่วโมง | 30 นาที | 4 วัน |
| HIGH | 2 ชั่วโมง | 24 ชั่วโมง | 2 ชั่วโมง | 7 วัน |
| NORMAL | 8 ชั่วโมง | 72 ชั่วโมง | 8 ชั่วโมง | 10 วัน |
| LOW | 24 ชั่วโมง | 7 วัน | 24 ชั่วโมง | 14 วัน |

ตัวเลขนี้เป็น **นโยบายเริ่มต้นของโครงการ** ที่กำหนดจากผลกระทบและขั้นตอนงาน ไม่ใช่มาตรฐานอุตสาหกรรมที่บังคับทุกบริษัท เกณฑ์ 10,000 บาทเป็นเกณฑ์ปฏิบัติงานที่ปรับได้เมื่อมีข้อมูลความเสียหาย/กำลังคนจริง Dispute ใหม่ตาม intake ปกติเริ่มที่ HIGH หรือ URGENT; แถวอื่นเผื่อการจัดประเภทโดย policy ภายหลัง

Dispute ต้องตรวจหลักฐานและมีช่องทางขอข้อมูล 48 ชั่วโมงอยู่แล้ว จึงแยกการเริ่มตรวจเร็วออกจากการตัดสินที่ใช้เวลาหลายวัน ควรตรวจอัตราทำได้ตาม SLA, P90 เวลาแต่ละขั้น และจำนวนเคสต่อเจ้าหน้าที่หลังใช้งานจริงเพื่อปรับรุ่นถัดไป

## ความหมายและวงจรของนาฬิกา

- Ticket: FIRST_RESPONSE สำเร็จเมื่อมีข้อความสาธารณะจากเจ้าหน้าที่จริง การรับเคสหรือ internal note ไม่นับเป็นการตอบลูกค้า; RESOLUTION ใช้การเปลี่ยนเป็น RESOLVED/CLOSED ตาม lifecycle เดิม
- Dispute: FIRST_REVIEW หมายถึงเจ้าหน้าที่กดรับเคส หรือทำ triage โดยมอบหมาย/ส่งต่ออย่างชัดเจนครั้งแรก เป็นการ acknowledge งานตรวจสอบ **ไม่ใช่การตอบลูกค้าครั้งแรก**; การเปิดดูหน้าเคสเฉย ๆ ไม่นับ ตัดสินเงินตามอำนาจของ Admin เดิม
- นาฬิกาทั้งสองเริ่มจากเวลาเปิดเคส การรับเคสทำให้ deadline ที่คิวและ dashboard แสดงเปลี่ยนไปเป็น deadline ขั้นตัดสินที่บันทึกไว้ตั้งแต่เปิด
- การรอข้อมูล/ส่งต่อ/เปลี่ยนเจ้าหน้าที่ไม่หยุดหรือเริ่มนับ deadline ใหม่; evidenceDeadline 48 ชั่วโมงเป็นกำหนดส่งข้อมูลแยกจาก SLA การตัดสิน ขอหลักฐานช้าอาจทำให้ผิด SLA ได้ ระบบไม่เพิ่มเวลาปิดเคสให้อัตโนมัติ
- จบเคสแล้วไม่มี countdown งานค้าง ภาพรวม dashboard แสดง deadline ของขั้นที่ยังไม่สำเร็จ
- SLA ใกล้หมดหรือเกินกำหนดเพิ่ม urgency ของคิว แต่ไม่เปลี่ยน priority ที่บันทึกไว้ ผลตัวกรอง คิว และกราฟใช้ priority เดียวกัน
- Support มี monitor escalation เมื่อผิด SLA ตามระบบเดิม; Dispute แสดงการเกินกำหนดในคิว/dashboard และยังไม่มี worker escalation อัตโนมัติ

## Persistence และ rollout

กติกากลาง: `backend/shared/src/servicePolicy.js` (`cs-24x7-v2`) ใช้ทั้งสองบริการ; `casePriority.js` เก็บคะแนนภายในระดับพร้อมความเร่งของ deadline

Ticket เก็บ SLA policy ID และ dueAt แยก FIRST_RESPONSE/RESOLUTION ใน TicketSlaTarget นโยบาย generic v2 เป็น create-only และเก็บ effectiveFrom ของการติดตั้งครั้งแรก Category-specific SLA ที่ผู้ดูแลกำหนดไว้ยังมีลำดับสูงกว่า generic ค่า snapshot ของเคสเดิมไม่เปลี่ยนเมื่อ seed ซ้ำ บันทึก CLASSIFY พร้อมเหตุผลและ policy ID ใน audit

Dispute เพิ่ม nullable `slaPolicyVersion`, `firstReviewDueAt`, `firstReviewedAt`, `decisionDueAt`; `slaExpiresAt` เป็น deadline ของขั้นปัจจุบัน บันทึกเหตุผลใน OPEN audit เมื่อรับเคสครั้งแรก บันทึกเวลาเริ่มตรวจและเปลี่ยน active deadline ใน transaction เดียวกับการรับเคส เก็บ CRITICAL แบบเก่าเพื่ออ่านประวัติ แต่ intake ใหม่ใช้สี่ระดับข้างต้น

ก่อนเริ่ม binary ใหม่ ให้ generate Prisma client และติดตั้ง schema/reference:

```powershell
node node_modules/prisma/build/index.js generate --schema backend/services/order-service/prisma/schema.prisma
npm run migrate:sla --workspace @reloop/order-service
npm run seed:sla --workspace @reloop/support-service
```

คำสั่งอ่าน DATABASE_URL_ORDER / DATABASE_URL_SUPPORT ตาม environment มี SQL migration แบบ ADD COLUMN IF NOT EXISTS และ reference upsert แบบไม่ทับ policy เดิม ไม่ต้อง reset ฐานข้อมูลหรือ seed demo ทับข้อมูลจริง เคสเดิมไม่จัด priority/เลื่อน deadline ใหม่เงียบ ๆ เพื่อรักษาประวัติและข้อผูกพันเดิม

## Validation

Unit scenarios ครอบคลุมทุกระดับ เกณฑ์เงิน 9,999/10,000 คำไทย อาการบัญชี/ชำระซ้ำ ข้อกล่าวหา/การปฏิเสธ และ deadline ที่ไม่เปลี่ยน priority; ทดสอบรวมวันหยุด

`backend/shared/src/servicePolicy.integration.test.js` ใช้ฐานข้อมูล reloop_ui_* แยกจาก production: ตรวจ intake ที่ persisted จริง, response กับ resolution คนละเป้าหมาย, public reply สำเร็จเฉพาะ first response, first claim/ส่งต่อ/รับโดย Admin ไม่เลื่อนกำหนดตัดสิน, reference/migration idempotent, การเก็บ deadline เก่า และคิวเรียง/กรอง legacy CRITICAL กับ URGENT/HIGH ถูกต้อง ทำความสะอาดเคสทดสอบหลังจบ

หลักการแยก response/resolution และกำหนดเป้าหมายตาม priority อ้างอิง [Zendesk SLA policies](https://support.zendesk.com/hc/en-us/articles/5600997516058-About-SLA-policies-and-how-they-work); หลักผลกระทบในการจัดระดับอ้างอิง [Atlassian severity levels](https://www.atlassian.com/incident-management/kpis/severity-levels/) ตัวเลข SLA ข้างต้นเป็นการออกแบบของโครงการนี้

### ผล rollout ที่ localhost — 2026-10-09

- เพิ่ม schema และ reference v2 แล้ว; ตรวจ snapshot ก่อน/หลัง: Ticket SLA targets 10 รายการ และ Dispute 4 รายการเก็บค่าเดิมครบ
- อัปเดต Docker Support/Order ด้วย runtime override ที่ไม่ seed demo; ตรวจภายใน container ว่าโหลด cs-24x7-v2 และโค้ด triage รุ่นสุดท้าย
- Unit 25 tests, database lifecycle/ownership regressions 21 tests, policy database integration 1 test และ frontend 20 tests ผ่าน; ESLint และ Next production build ผ่าน
- Gateway จริง: dashboard ทั้งสองแหล่งและ queue HTTP 200; ตัวกรอง LOW/NORMAL/HIGH/URGENT ส่ง priority ตรงกับที่กรอง และ priority ที่แสดงตรงกับที่เก็บ
- หลักฐาน: `ui-verification/cs-policy-rollout.json` และ `ui-verification/cs-policy-api-smoke.json`
