# แผนแก้ไขและเติมความสามารถ Trust & Safety

วันที่: 2026-10-10
สถานะ: **กำลังดำเนินการ — TSR-01 ถึง TSR-10 และ TSR-14 ทำ implementation ตามขอบเขต schema คงที่แล้ว; TSR-11–13 ถูกข้ามไว้ตามคำสั่ง และ TSR-15 ตรวจรับได้บางส่วนโดยยังมีข้อจำกัดที่ปิดไม่ได้โดยไม่เปลี่ยน schema/runtime contract**
ขอบเขต: บทบาท `TRUST_AND_SAFETY` เดิมคือ Admin; อ้างอิง `UR-22`–`UR-26`, `WF-01`, `WF-08`, `WF-09` และงาน Support ที่เปิดให้บทบาทนี้ใช้งาน

## 1. เป้าหมายและขอบเขต

ทำให้การกระทำของเจ้าหน้าที่มีผลจริงตามที่ UI แจ้ง ข้อมูลที่ใช้ตัดสินครบ และการทำงานร่วมกับ service อื่นไม่ลบล้างคำสั่งด้านความปลอดภัย

- ใช้ระบบและ UI ที่มีอยู่ต่อ แก้เป็นชุดเล็กที่ทดสอบและตรวจรับได้
- Auth เป็นเจ้าของบัญชี/สิทธิ์/KYC/Report; Product เป็นเจ้าของสินค้า; Order เป็นเจ้าของข้อพิพาท/สถานะพักเงิน; Support เป็นเจ้าของ Ticket/FAQ; Chat เป็นเจ้าของข้อความสนทนา
- ติดต่อข้อมูลข้าม service ผ่าน API หรือ event ที่ตกลงกัน ไม่มีการเขียนฐานข้อมูลข้ามเจ้าของ
- KYC ใช้ข้อมูลทดสอบ และ Hold/Refund ยังคงเป็น simulation ตาม `ADM-DEC-003`; การต่อ Payment Gateway จริงไม่รวมในแผนแก้ Core
- ประมูลเป็นขอบเขต Marketing ตาม `ADM-DEC-017`
- ชื่อ route `/admin/*` และ permission `admin:*` เดิมยังใช้ได้ ไม่ต้องเปลี่ยนชื่อทั้งระบบเพื่อแก้ความสามารถ
- ยังไม่เพิ่ม UI จัดการ role ของเจ้าหน้าที่ เพราะไม่ได้เป็น requirement ของงาน T&S รอบนี้
- ประวัติใน `progress.md`/`changelog.md` เดิมคงไว้; บันทึกผลตรวจรับรอบใหม่ด้วย task `TSR-*` แทนการอ้างว่า Done จากบันทึกเดิม

แหล่งอ้างอิง: [ไฟล์เล่ม](../../S2G5_RE-LOOP_ISE.md), [แผนเดิม](plan.md), [progress](progress.md), [ข้อตกลง scope](decision.md), [handoff](handoff.md)

## 2. ลำดับส่งมอบ

| ช่วง                   | งาน                                                                                                                                                | ผลที่ต้องได้ก่อนผ่านช่วงนี้                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0                      | TSR-00 เก็บ baseline และเตรียมข้อมูลทดสอบ                                                                                                          | แยกปัญหา source/runtime/data ได้ และมีฐานข้อมูลทดสอบแยก                |
| 1 — เร่งด่วน           | **TSR-01 บังคับ Ban/RBAC (เสร็จ)**, **TSR-02 สถานะ Hold/Dispute (เสร็จ)**, **TSR-03 คำสั่งซ้ำ/พร้อมกัน (เสร็จ)**, **TSR-04 การซ่อนสินค้า (เสร็จ)** | คำสั่ง T&S มีผลจริง ไม่ถูก flow อื่นทับ และ UI ไม่อ้างสำเร็จผิด        |
| 2 — ทำของเดิมให้ใช้ครบ | TSR-05 Inbox, TSR-06 KYC, TSR-07 ประวัติผู้ใช้, TSR-08 Audit, TSR-09 Ticket/FAQ/Dashboard                                                          | เจ้าหน้าที่ใช้ของที่มีอยู่ได้ครบและเห็นข้อมูลจริง                      |
| 3 — เติม flow ตามเล่ม  | TSR-10 หลักฐาน/Chat/พัสดุ, TSR-11 ขอข้อมูลเพิ่ม, TSR-12 แจ้งผล, TSR-13 เพิกถอนสิทธิ์ทำงาน/อุทธรณ์, TSR-14 Bulk UI                                  | ครบวงจรรับเรื่อง → ตรวจ → ตัดสิน → แจ้งผล → ทบทวน                      |
| 4                      | TSR-15 ตรวจรับรวมและปรับเอกสาร                                                                                                                     | มีหลักฐาน PostgreSQL/API/browser และสถานะ requirement ที่ตรงกับงานจริง |

งาน security สำหรับ production, การต่อผู้ให้บริการภายนอก และ NFR ที่ยังไม่ผ่าน ให้คงสถานะแยก ไม่รวมยอดว่า Core เสร็จแล้วจึงเสร็จทั้งหมด

## 3. รายละเอียดงาน

### TSR-00 — Baseline และสภาพแวดล้อมตรวจรับ

**วิธีทำ**

- ตรวจ revision ของ source เทียบ image ที่กำลังรัน เพราะ frontend bind mount แต่ backend บางตัวเป็น image ที่ build ไว้ก่อนหน้า
- เก็บรายการหน้า/API/permission ที่ T&S ใช้จริง โดยใช้บัญชี T&S, CS, Buyer, Seller และบัญชีหลายบทบาท
- เตรียม PostgreSQL และที่เก็บไฟล์สำหรับทดสอบแยกจากข้อมูลใช้งานเดิม; ไม่รัน seed/reset/integration cleanup ใส่ฐานเดิม
- เพิ่มกรณีทดสอบที่แสดงบั๊กของแต่ละชุดก่อนแก้ โดยเฉพาะ Ban, concurrent decisions และ Hold ของหลายฝ่าย
- ตรวจ schema จริงและ migration history ก่อนเขียน migration ใหม่ โดยเฉพาะการเปลี่ยน enum `ADMIN` เป็น `TRUST_AND_SAFETY`; ไม่แก้ migration ที่เคยใช้แล้ว

**ผ่านเมื่อ:** ระบุ source/runtime ที่ทดสอบได้, มี fixture แยก, และ reproduce กรณีหลักได้โดยไม่กระทบข้อมูลเดิม

### TSR-01 — บังคับใช้การระงับบัญชี (Ban) ในทุกจุดสัมผัส

อ้างอิง `UR-25`, `WF-01`, `WF-09` — ระดับ P1

**วิธีทำ**

- สรุปจุดสัมผัสของบัญชี: ซื้อ, ขาย, แก้ไขโปรไฟล์, ยืนยัน KYC, ส่งข้อความ, จัดการสินค้า, รีวิว, ธุรกรรมเงิน, API ภายใน และคำสั่งแอดมิน
- เพิ่ม validation ใน token verification หรือ middleware กลาง ให้ตรวจ `status === ACTIVE` สำหรับคำขอที่มีผลต่อข้อมูล; ไม่พึ่งพาเฉพาะเวลาหมดอายุของ JWT
- คำสั่ง Ban/Unban ต้องอัปเดตสถานะและ revoke/invalidate active sessions ทันที
- จัดกลุ่มผลกระทบของการ Ban: สินค้าที่ลงขายต้องหยุดการมองเห็นหรือระงับการซื้อ, แชทระงับการส่งข้อความใหม่, ข้อพิพาทคงสิทธิ์อ่านหลักฐานเดิมตามกฎหมาย แต่ห้ามเปิดข้อพิพาทใหม่
- เพิ่ม Audit event บันทึกผู้สั่ง Ban, เหตุผล, วันเวลา และเวลามีผล

**ผ่านเมื่อ**

- [x] บัญชีที่ถูก Ban ไม่สามารถ login ได้
- [x] Session/Token เดิมถูกตัดทันที ไม่สามารถใช้ token เก่าซื้อสินค้า ลงขาย แชท หรือโอนเงินได้
- [x] การพยายามทำธุรกรรมของผู้ใช้ที่ถูก Ban ถูกปฏิเสธด้วย 403 Forbidden หรือรหัสข้อผิดพลาดที่ตกลงกัน
- [x] ปลด Ban (Unban) คืนสถานะและสร้าง Audit ครบถ้วน

### TSR-02 — เจ้าของเคสรายคน และกฎ Hold/Release ของข้อพิพาท

อ้างอิง `UR-26`, `FR-3.2.4`, `WF-08` — ระดับ P1

**วิธีทำ**

- กำหนดให้หนึ่ง `DisputeCase` มีผู้รับผิดชอบที่แก้ไขได้เพียงคนเดียวในแต่ละช่วงเวลา โดยเพิ่ม `assignedTo`, `assignedRole`, `claimedAt` และใช้ `version` สำหรับ optimistic concurrency
- เพิ่มคำสั่ง Claim/Reassign/Escalate ที่เปลี่ยนผู้รับผิดชอบด้วย conditional update ภายใน transaction: เคสที่ยังไม่มีเจ้าของรับได้เพียงคนเดียว, ผู้รับผิดชอบเดิมหรือผู้มีสิทธิ์กำกับจึงส่งต่อได้ และทุกการเปลี่ยนเจ้าของต้องมี Audit
- หลัง Claim เฉพาะ `assignedTo` เท่านั้นที่เพิ่มข้อมูล ตัดสิน หรือดำเนินคำสั่งของเคสได้ เจ้าหน้าที่คนอื่นเปิดอ่านได้ตามสิทธิ์ แต่ UI ต้องเป็น read-only และแสดงผู้รับผิดชอบปัจจุบัน
- เมื่อ CS ส่งต่อเคสให้ T&S ให้โอน ownership อย่างชัดเจน ไม่ให้ CS และ T&S แก้ไขหรือตัดสิน `DisputeCase` เดียวกันพร้อมกัน; การรับช่วงและส่งคืนต้องรักษาประวัติผู้รับผิดชอบทั้งหมด
- สร้าง transition service กลางใน Order ให้ Admin hold/release, dispute decision และเส้นทางเปลี่ยนสถานะคำสั่งซื้อใช้กฎเดียวกัน
- แยก “เจ้าของเคส” ออกจาก “เหตุพักเงิน”: แม้ `DisputeCase` มีผู้รับผิดชอบคนเดียว ออเดอร์ยังมี active hold จากหลายต้นทางได้ เช่น เคสข้อพิพาท, คำสั่ง T&S รายออเดอร์ และการลงโทษบัญชีใน TSR-13; ใช้ hold records ที่ระบุ source/reference เพื่อปล่อยเฉพาะเหตุที่คำสั่งนั้นเป็นเจ้าของ
- ให้ `payoutHeld` เป็นผลที่คำนวณจากเหตุพักเงินที่ยัง active; ถ้าคง field เดิมไว้เพื่อ compatibility ต้องอัปเดตพร้อมกันใน transaction
- การตัดสินของเจ้าของเคสปิดได้เฉพาะเหตุพักเงินของ dispute ไม่ยกเลิก Hold ของ T&S และการโอน ownership ไม่สร้างหรือลบ Hold โดยปริยาย
- Release ไม่คืน `preDisputeStatus` แบบไม่มีเงื่อนไข โดยเฉพาะเมื่อมีผลตัดสิน `refunded/completed` แล้ว; แยกผลตัดสินกับความพร้อมจ่ายเงิน
- ตรวจ state/version ในคำสั่งเขียนจริง เช่น conditional update และเช็ก affected rows; ทุกเส้นทางที่แตะสถานะต้องใช้ concurrency contract เดียวกัน
- ป้องกัน participant status API, payment และ internal status commands เปลี่ยนข้ามกฎของเคส/hold ที่กำลังเปิด
- ระบุออเดอร์ที่มีสิทธิ์ Hold ตาม lifecycle ปัจจุบัน ไม่อนุมานว่า `completed` หมายถึงส่งของแล้ว เพราะระบบปัจจุบันใช้ค่านี้หลังจ่ายเงินจำลอง
- มี migration/backfill ที่ตรวจความขัดแย้งระหว่าง `payoutHeld`, `paymentSimulationStatus`, dispute และ audit; ข้อมูลกำกวมต้องอยู่ในรายการให้ตรวจ ไม่ปล่อยเงินเองโดยอัตโนมัติ

**ไฟล์หลัก:** Order schema, `adminDisputeService.js`, `disputeModel.js`, `disputeService.js`, `orderModel.js`, `orderController.js`, หน้า Hold และ Dispute

**ผ่านเมื่อ**

- [x] บังคับ Claim ก่อนเขียนเคส: `decide` และ `addEvidence` ตรวจ `assignedTo === userId`; เคส `assignedTo=null` เป็น read-only; T&S ต้อง Claim หลังรับเคส escalated ก่อนตัดสิน; ซ่อนฟอร์มตัดสินใน UI จนกว่า Claim สำเร็จ
- [x] Atomic CAS ทุกเส้นทาง: `openDispute()` และ `decide()` อัปเดต Order ด้วย atomic conditional CAS (`where: { id, version, status }`) ตรวจสอบ affected rows คืน 409 Conflict เมื่อสถานะเปลี่ยนพร้อมกัน; ไม่มีคำสั่ง `order.update({ where: { id } })` เหลืออยู่ใน state transition สำคัญ
- [x] ปรับ Payment flow: มี guard ป้องกัน active hold/dispute ใน `pay()`; ส่ง `order.version` ให้ `orderModel.updateStatus()` ทั้งกรณีสำเร็จและกรณี reservation หมดอายุ; ทำ Order CAS สำเร็จก่อนตัดสต็อก
- [x] ตรวจสอบ Reassign target: ตรวจสอบเป้าหมายผ่าน auth service ว่ามีอยู่จริง, สถานะ `ACTIVE`, และมี Role `CUSTOMER_SERVICE` หรือ `TRUST_AND_SAFETY` ดึง `assignedRole` จาก Auth service โดยตรง ไม่รับ role มั่วจาก payload
- [x] กำหนด Order statuses ที่ Hold ได้ชัดเจน: อนุญาตเฉพาะ `confirmed`, `shipped`, `completed`, `disputed`; ปฏิเสธ `pending`, `pending_payment`, `cancelled`, `refunded` ภายใน CAS transaction
- [x] เคลียร์ legacy hold fields หมดจด: Release เคลียร์ `heldBy: null` ควบคู่กับ `heldAt: null` และ `holdReason: null` รักษาสถานะ `paymentSimulationStatus`, `payoutHeld`, และ `OrderHold` ให้สอดคล้องกันทุกการเปลี่ยนผ่าน
- [x] Concurrency Integration Tests ผ่าน 100% บน PostgreSQL จริง: ครอบคลุม 5 scenarios ของ `Promise.all` (แย่ง Claim เคสเดียวกัน, Admin แย่ง Hold ซ้ำ, Dispute Decision vs T&S Hold race, Payment vs Hold race, Reassign vs Decision race)
- [x] Ownership test flow ครบถ้วน: Escalate → T&S Claim → Decide; unassigned CS/T&S ไม่สามารถ decide หรือ add evidence ได้ (403 Forbidden)
- [x] ผลรัน Hold Backfill สอดคล้องและ Idempotent: สแกน 63 คำสั่งซื้อในฐานข้อมูลจริง ไม่พบข้อมูลกำกวม (`Ambiguous orders detected: 0`), ระบบทำงานแบบ Idempotent ไม่สร้าง record ซ้ำ

### TSR-03 — คำสั่งซ้ำ การเขียน Audit และผลลัพธ์จริงบน UI

อ้างอิง `ADM-002`–`ADM-005` — ระดับ P1

**วิธีทำ**

- KYC ใช้ conditional update `id + version + PENDING` ภายใน transaction เดียวกับ SellerProfile/Audit
- Report review/action ใช้การเปลี่ยนสถานะที่กันคำสั่งพร้อมกัน; การระงับ/คืนบัญชีและ Audit ในฐานเดียวกันต้องสำเร็จหรือ rollback พร้อมกัน
- สำหรับ REMOVE_PRODUCT ที่ข้าม service ให้บันทึก operation/idempotency key ก่อน dispatch; Product จำผลคำสั่งและตอบ replay ได้ หาก Auth ติดขัดหลัง Product สำเร็จ ต้อง resume/finalize ได้โดยไม่ลบซ้ำ
- Bulk idempotency ผูก actor/action/payload และ claim key ก่อนเริ่มงาน; key เดิมต่าง payload ต้อง conflict และ retry พร้อมกันต้องไม่รันซ้ำ
- ปุ่ม Ban รายคนใน Inbox เปลี่ยนไปใช้ single-user suspend endpoint; ถ้าเรียก Bulk ต้องอ่าน `succeeded/failed/results` และแสดงผลรายรายการจริง
- กรณี review สำเร็จแต่ action ล้มเหลว ให้ reload เคสเป็น REVIEWED และ retry ได้ ไม่ส่ง review ซ้ำจาก snapshot เก่า
- บังคับเหตุผลสำหรับ moderation ที่ต้องตรวจย้อนหลัง รวมถึงคืนสินค้า; dialog ระบุเป้าหมาย/ผลกระทบและไม่แทนเหตุผลจริงด้วยข้อความ default เงียบ ๆ

**ผ่านเมื่อ**

- [x] KYC และ Report ใช้ version/state CAS; business state กับ Audit ในฐานเดียวกัน commit/rollback ใน transaction เดียว
- [x] REMOVE/RESTORE_PRODUCT มี durable operation ก่อน dispatch และ Product เก็บผลตาม idempotency key; key เดิมต่าง payload ตอบ 409
- [x] timeout หลัง Product ทำสำเร็จ retry ได้ด้วย operation/key เดิม โดยไม่สั่งซ้ำและไม่สร้าง Audit ซ้ำ
- [x] Bulk claim key ก่อน side effect, ผูก actor/action/payload hash, replay ผลเดิม และ concurrent retry ไม่ทำงานซ้ำ; partial failure แสดงผลรายรายการ
- [x] Inbox Ban ใช้ single-user suspend endpoint, กัน double submit และบังคับเหตุผล; Restore Product บังคับเหตุผลและ reuse key เดิมเมื่อ retry
- [x] PostgreSQL integration ครอบคลุม double/concurrent request, replay, payload mismatch, timeout/retry และ duplicate-audit prevention; frontend tests/build ผ่าน

**ขอบเขตผลตรวจรับ:** TSR-03 ผ่าน targeted integration และ regression จาก source กับฐานทดสอบแยกแล้ว การคลิก browser ผ่าน runtime stack จริงและการตรวจรับรวมทุก service ยังคงอยู่ใน TSR-15

### TSR-04 — สินค้าที่ถูกระงับต้องไม่เผยแพร่กลับผ่านช่องทางอื่น

อ้างอิง `UR-24`, `FR-4.2.5` — ระดับ P1

**วิธีทำ**

- Public product detail ไม่คืนเนื้อหาสินค้าที่ถูกระงับ; staff detail แยก route และตรวจ permission เพื่อยังตรวจหลักฐานได้
- กำหนด seller view ที่เหมาะสม: ดูเหตุผลการระงับของตัวเองได้ แต่แก้ไขสถานะให้กลับมาเผยแพร่เองไม่ได้
- ตรวจ feed/search/store/video/checkout และ internal lifecycle ของ reservation/order ไม่เขียนทับสถานะ moderation
- Restore เช็กสถานะซื้อขายและเหตุระงับอื่นที่ยังค้างก่อนคืนการมองเห็น ไม่ใช้ `preRemovalStatus` ที่ล้าสมัยอย่างเดียว
- เก็บความสัมพันธ์ moderation กับ product/audit ให้ค้นย้อนจากสินค้าได้ แม้เริ่มจาก Report
- แยกการปิด public detail ออกจากการลบไฟล์ media เดิม: นโยบายไฟล์สาธารณะ/CDN ต้องกำหนดเพิ่ม หากต้องถอนสื่อจาก URL โดยตรงด้วย

**ผ่านเมื่อ**

- [x] หลัง Remove สินค้าไม่ปรากฏใน public detail, feed, search, public store, video feed และ auction; staff detail ใช้ route ที่ตรวจ permission แยก
- [x] Seller เห็นสถานะ/เหตุผลแบบ read-only แต่แก้ไข ลบ เปิด visibility หรือแนบ video ใหม่ไม่ได้
- [x] Reservation, campaign checkout และ bid ถูกปฏิเสธเมื่อ moderation ยัง active; cancellation/payment/internal status เปลี่ยนได้เฉพาะ commerce state ใต้ moderation overlay จึงไม่ทำให้สินค้ากลับสู่ public
- [x] Auction auto-open/close ใช้ moderation-aware CAS และไม่ดำเนิน side effect ต่อเมื่อการระงับหรือยกเลิกชนะ race
- [x] Restore คำนวณจาก commerce state ปัจจุบัน รวม reservation expiry และ winning auction order แทนการคืน `preRemovalStatus` เก่าโดยตรง
- [x] คำสั่งจาก Report และ direct moderation ตามย้อนด้วย `report.productId`, `AdminAudit.targetId/requestId` และ Product moderation command

**ขอบเขตผลตรวจรับ:** ผ่าน targeted PostgreSQL/API/unit/UI verification แล้ว โดยไม่แก้ schema หรือ migration ในรอบ TSR-04; browser click-through บน main stack อยู่ใน TSR-15

**ข้อจำกัด:** URL ไฟล์เดิมใต้ public `/uploads/*` ยังเปิดตรงได้หากผู้ใช้รู้ URL อยู่แล้ว การเพิกถอน URL/CDN ต้องมี storage delivery policy เช่น private object + signed URL หรือ CDN purge ซึ่งทำไม่ได้จาก Product visibility layer ปัจจุบันและไม่ควรแก้ด้วย schema database

### TSR-05 — Inbox: Report กับ Ticket ต้องค้น/แบ่งหน้าได้ถูกต้อง

อ้างอิง `UR-24`, `WF-09` — ระดับ P2

**วิธีทำ**

- คงแท็บหลัก “เคส Trust & Safety” แต่แยกย่อย “รายงาน” และ “เคสส่งต่อ” ให้มี filter/pagination ของตัวเอง แทนการ merge สองหน้าจากคนละ service แล้วใช้จำนวนหน้ามากสุด
- ส่ง page/limit/search/status จริงทั้งสองประเภท และเพิ่ม query contract ของ Report ให้รองรับคำค้นที่ UI เสนอ
- แสดง error พร้อม retry ของแหล่งข้อมูลที่ล้มเหลว ไม่แสดงรายการว่างแทนความผิดพลาด
- เปิดเคสแล้วโหลด detail ล่าสุด มีชื่อ/รหัสผู้แจ้งและคู่กรณี รายละเอียดสินค้า และทางลัดประวัติผู้ใช้; คงการแยกคู่กรณีออกจากผู้แจ้ง
- เพิ่มหมวดเหตุผลและไฟล์หลักฐาน Report ตาม WF-09 โดยใช้ที่เก็บ private และ authorization แบบเดียวกับหลักฐานข้อพิพาท
- เคสปิดแล้วต้องดูผลตัดสิน เหตุผล ผู้ตัดสิน และวันเวลาได้

**สถานะ implementation (2026-10-08):** ทำส่วน Inbox contract/UI ที่ไม่เปลี่ยน schema แล้ว — แยก “รายงาน”/“เคสส่งต่อ” พร้อม state, filter, search และ pagination ของตัวเอง; error แยกตาม service พร้อม retry; เปิดเคสโหลด detail ล่าสุดและแสดงผู้แจ้ง/คู่กรณี/สินค้า/ทางลัดประวัติ; เคสปิดแสดงผล เหตุผล ผู้ตัดสิน และเวลา

**ผลตรวจรับย่อย**

- [x] หน้า Report และ Ticket ไม่ merge กันและเปิด page 3 ได้ตาม total ของแหล่งตัวเอง
- [x] Report API รองรับ `page`, `limit`, `status`, `q`; ค้น reason/ID/ชื่อและอีเมลผู้แจ้งได้
- [x] แสดง source-specific error และ retry โดยไม่แปลง failure เป็น empty list
- [x] Report detail อ่านผู้แจ้ง คู่กรณี สินค้าจาก owner service และ decision จาก append-only AdminAudit
- [x] Product owner internal detail contract ผ่าน PostgreSQL integration 1/1; frontend Inbox tests ผ่าน 4/4; Auth report service unit ผ่าน 3/3
- [ ] หมวดเหตุผลและไฟล์หลักฐาน Report: schema `Report` ปัจจุบันมีเพียง `reason` และไม่มี evidence relation/storage key จึงทำ persistence/authorization ที่ถูกต้องไม่ได้ภายใต้ข้อกำหนดห้ามแก้ schema; ไม่ encode ข้อมูลลง `reason`
- [ ] Auth PostgreSQL acceptance รอบนี้ถูกบล็อกด้วย test DB/Prisma client drift ที่ `User.role`; ไม่รัน db push/migration เพื่อรักษา schema ตามข้อกำหนด

**ผ่านเมื่อ:** มีข้อมูลเกินสองหน้าแล้วเปิดได้ทุกรายการ, ค้น Report ได้จริง, service ใดล่มเห็น error ชัด และรายงานใหม่จาก Buyer/Seller ไปถึง T&S พร้อมหลักฐานครบ — ตอนนี้ผ่านส่วน Inbox แต่ยังไม่ผ่านคำว่า “พร้อมหลักฐานครบ” เพราะข้อจำกัด schema ข้างต้น

### TSR-06 — KYC: ตัวกรอง ไฟล์เอกสาร และประวัติคำขอ

อ้างอิง `UR-22`, `FR-4.2.1` — ระดับ P2; concurrency อยู่ TSR-03

**วิธีทำ**

- กำหนด `status=ALL` อย่างชัดเจน; backend ไม่เพิ่มเงื่อนไขสถานะเมื่อเลือก ALL แต่ยังคง default PENDING สำหรับ client เดิม
- mount volume ของ `private-kyc-documents` และกำหนด storage path ผ่าน config
- ก่อน recreate container ให้ inventory และย้ายไฟล์ที่มีอยู่ไป persistent storage พร้อมตรวจเทียบ key ใน DB; volume ว่างไม่ได้กู้ไฟล์เก่าให้อัตโนมัติ
- ใบสมัครเก่าที่ไม่มีไฟล์ต้องแสดง unavailable อย่างชัดเจนและมีแนวทางให้ส่งใหม่ ไม่แสดงว่ามีหลักฐานครบ
- ทำ submission ของ SellerProfile/KycApplication ให้ atomic และจัดการไฟล์ orphan เมื่อ DB ล้มเหลว
- เก็บ snapshot ข้อมูลประกอบในใบสมัครแต่ละรอบ เพื่อไม่ให้คำขอเก่าแสดงข้อมูลร้านจากการแก้ครั้งใหม่
- เพิ่ม Audit การอ่านเอกสาร และคง owner/reviewer authorization

**สถานะ implementation (2026-10-08):** ทำส่วนที่รองรับโดย schema เดิมแล้ว — `ALL` เป็น contract ชัดเจน, submission ล็อกต่อ user และ commit role/profile/application ใน transaction เดียว, file upload ใช้ bounded memory แล้ว persist ก่อน transactionพร้อมชดเชยลบเมื่อ DB ล้ม, document read มี authorization + Audit, storage path ตั้งค่าผ่าน `KYC_STORAGE_DIR` และ compose mount named volume

**ผลตรวจรับย่อย**

- [x] Backend แยก omitted status = PENDING และ `status=ALL` = ไม่ใส่ status predicate; UI ส่ง `ALL` ชัดเจน
- [x] resubmit ยังคงสร้าง `KycApplication` แถวใหม่ และ transaction ป้องกัน role/profile/application ค้างครึ่งทาง
- [x] DB failure หลังเขียนไฟล์เรียก orphan cleanup; inventory script รายงาน DB keys, missing files และ orphan files พร้อม optional safe copy จาก storage เดิม
- [x] missing/legacy file แสดง unavailable พร้อมแนวทางให้ผู้ขายส่งใหม่ ไม่แสดงภาพ placeholder ว่าเป็นหลักฐานครบ
- [x] owner/reviewer authorization เดิมยังอยู่ และ successful document read บันทึก `KYC_DOCUMENT_VIEWED` ใน AdminAudit
- [x] `docker compose config` ผ่านและประกาศ `auth_private_kyc`; inventory container ปัจจุบันพบ DB document 0 / file 0 จึงไม่มีไฟล์เดิมต้องย้ายก่อน rollout รอบนี้
- [x] Unit/regression: KYC backend 5/5, Auth targeted 22 passed/0 failed/1 DB-dependent skip, frontend targeted 15/15
- [ ] Snapshot ข้อมูลร้านต่อใบสมัคร: schema `KycApplication` ไม่มี snapshot columns/JSON relation จึงเก็บค่าประวัติอย่างถูกต้องไม่ได้เมื่อห้ามแก้ schema; UI ระบุชัดว่าค่าที่แสดงเป็น profile ปัจจุบัน
- [ ] PostgreSQL KYC integration ถูกบล็อกก่อน assertion ด้วย test DB/Prisma drift ที่ `User.role`; ไม่ db push/migrate/regenerate เพื่อรักษาข้อกำหนด schema คงที่
- [ ] ยังไม่ได้ recreate Auth container พร้อมไฟล์ทดสอบเพื่อพิสูจน์ persistence end-to-end; เก็บ runtime/browser acceptance ไว้ใน TSR-15

**ผ่านเมื่อ:** PENDING/VERIFIED/REJECTED/ALL ตรง DB, resubmit เก็บประวัติเดิม, ตัดสินพร้อมกันไม่ทับกัน และเอกสารทดสอบยังเปิดได้หลัง recreate container — ตอนนี้ผ่าน implementation/unit/UI แต่ยัง partial ที่ snapshot และ PostgreSQL/runtime acceptance ตามข้อจำกัดข้างต้น

### TSR-07 — ประวัติผู้ใช้ที่ใช้ตัดสินได้จริง

อ้างอิง `UR-23`, `FR-4.2.2`, `NFR-P-01` — ระดับ P2

**วิธีทำ**

- ให้ Order มี API สรุปสถิติของ user ตามบทบาท buyer/seller; Auth หรือ query aggregator เรียกอ่านผ่าน contract ไม่ join DB ข้าม service
- เพิ่ม pagination ให้ประวัติออเดอร์ และแสดง total จาก API ไม่ใช้จำนวนในหน้าแรกแทนทั้งหมด
- แยก “ไม่พบประวัติ” กับ “โหลดประวัติไม่ได้”; หากข้อมูลไม่พร้อม ให้แสดง unavailable พร้อม retry
- แสดงประวัติ Report/Warning/Suspension/Restore ที่เปิดรายละเอียดและเชื่อมเคสต้นทางได้
- `completedOrders` ต้องระบุความหมายตามสถานะจริง; จนกว่า fulfillment จะพร้อม ห้ามแปล paid simulation ว่าได้รับสินค้าเรียบร้อย
- สถิติส่งช้า/พัสดุต้องรอข้อมูล shipping ใน TSR-10; ไม่ใส่ 0 แทนข้อมูลที่ยังไม่มี
- จำกัดข้อมูลส่วนบุคคลตามหน้าที่ ไม่ส่งเลขบัตร/บัญชีเต็มให้ทุกหน้าค้นหาหรือทุก role เพียงเพราะอ่าน Ticket ได้

**ผลดำเนินการ (2026-10-08, schema คงที่)**

- [x] Order owner API `/support/users/:id/history` รวม buyer/seller อย่างถูกต้อง รองรับ role/page/limit และส่ง total/totalPages จากฐานเจ้าของข้อมูล
- [x] Summary นับ `completedOrders` เฉพาะ `Order.status=completed` พร้อม machine-readable meaning; late shipment/package issue ส่ง `null + available=false` ไม่ปลอมเป็นศูนย์
- [x] หน้า user history แยก loading/error/empty, มี retry, ใช้ API total และเปิดหน้าถัดไปได้
- [x] เพิ่ม Report และ Warning/Suspend/Restore history แบบแบ่งหน้า; action ที่มาจาก Report เชื่อมกลับ source case ผ่าน request ID และ deep-link เปิดรายละเอียดเคสได้
- [x] General user lookup เลือกเฉพาะ shop/KYC status และไม่ query/ส่งเลขบัตร บัญชีธนาคาร หรือที่อยู่เต็ม; รายละเอียดเหล่านั้นคงอยู่ใน KYC workflow เท่านั้น
- [x] PostgreSQL Order fixture ผ่าน 1/1 รวม total=2, page size 1 เปิดครบสองหน้า, completed=1 และ query contract ต่ำกว่า 2 วินาที; frontend targeted 7/7 และ Auth unit 2/2 ผ่าน
- [ ] Auth PostgreSQL suite ยังถูกบล็อกก่อน history assertions ด้วย test DB/Prisma drift ที่ `User.role` (`ADMIN`); ไม่ db push/migrate/regenerate ตามข้อกำหนด
- [ ] Browser/main-stack acceptance และ workload benchmark ที่ขนาดข้อมูล production-like คงไว้ใน TSR-15; shipping stats รอ owner data ใน TSR-10

**ผ่านเมื่อ:** สถิติเทียบ fixture ใน PostgreSQL ถูกต้อง, ออเดอร์เกินหนึ่งหน้าเปิดได้ครบ, order service ล่มไม่ถูกแสดงเป็นไม่มีประวัติ และวัดการโหลดหน้าตาม NFR-P-01

### TSR-08 — Audit ที่ค้นได้ครบและตรงคำสั่ง

อ้างอิง `ADM-005`, `NFR-M-01`; hardening สำหรับ production แยกเฟส

**วิธีทำ**

- ใช้ action catalog เดียวระหว่าง backend/frontend; แก้ filter `WARN_USER` ให้ตรง event `USER_WARNED` และรองรับ `REPORT_*`
- สร้าง read API สำหรับ Auth audit, Order hold/dispute audit และ Support audit โดยยังเก็บข้อมูลใน owner เดิม
- ระยะแรกให้หน้า Audit เลือกแหล่งข้อมูล/ประเภท พร้อม pagination ของแต่ละแหล่ง ไม่ทำรวมผลแล้วแบ่งหน้าผิดแบบ Inbox เดิม
- ใช้รูปแบบกลาง `source, eventId, actorId, action, targetType, targetId, caseId, reason, occurredAt, requestId/operationId`; field ที่ข้อมูลเก่าไม่มีแสดง unavailable
- เพิ่มตัวกรอง actor/target/action/ช่วงเวลา และลิงก์กลับเคส; แยกเหตุการณ์เปิดหน้ากับเปิดไฟล์หลักฐานจริง
- แสดงสถานะเมื่อแหล่งข้อมูลหนึ่งโหลดไม่ได้ และเก็บ operational error ในรูปแบบค้นย้อนด้วย request/operation ID ได้

**ผลดำเนินการ (2026-10-09, schema คงที่)**

- [x] แก้ action catalog ของ Auth ให้ตรง event จริง เช่น `USER_WARNED`, `KYC_VERIFIED`, `KYC_REJECTED`, `REMOVE_PRODUCT` และ `RESTORE_PRODUCT`; ไม่มี `WARN_USER` ปลอมใน filter แล้ว
- [x] Auth audit รองรับ actor/target/action/request ID/ช่วงเวลา และคืน normalized contract พร้อม source, target type, case ID และ occurredAt
- [x] เพิ่ม owner read API สำหรับ Order Hold audit, Order Dispute audit และ Support Ticket audit โดยแบ่งหน้าและนับ total จากตารางของแต่ละ owner โดยตรง
- [x] หน้า Audit แยก 4 แหล่งข้อมูลพร้อม filter/pagination/error/retry ของตัวเอง และไม่รวมผลข้าม service ก่อนแบ่งหน้า
- [x] แยก event เปิดไฟล์หลักฐาน (`VIEW_EVIDENCE`/`EVIDENCE_VIEWED`) ออกจาก action อื่น และเชื่อมกลับ User, Report, Order และ Ticket ต้นทางผ่าน deep link
- [x] Unit contract 5/5 และ frontend targeted 11/11 ผ่าน; read-only PostgreSQL checks ผ่านสำหรับ Auth (`USER_WARNED` 1), Order Hold (91), Order Dispute (390) และ Support query (0 records แต่ query/schema ใช้งานได้)
- [x] Support ใช้ `dedupeKey` เดิมเป็น operation reference สำหรับ event ที่มี key และค้นได้; event ทั่วไปที่ไม่มี key ยังคงแสดง unavailable
- [ ] Order audit schema ไม่มี request/operation ID จึงแสดง unavailable; ไม่ pack reference ลง reason หรือ field อื่น
- [ ] ยังไม่มี persistent operational-error log กลางสำหรับ network/provider failures; การเพิ่ม durable error records ต้องมี owner persistence contract
- [ ] Browser/main-stack acceptance และข้อมูล Support fixture ที่มี status transition จริงคงไว้ใน TSR-15

**ผ่านเมื่อ:** กรองคำเตือนได้, ตาม Hold/Release/decision/เปิดหลักฐาน/สถานะ Ticket ย้อนกลับได้ และตัวเลข/หน้ารายการไม่ทำข้อมูลตกหล่น

### TSR-09 — Workspace: Ticket, FAQ และ Dashboard

งานร่วมกับ Support — ระดับ P2

**วิธีทำ**

- นำ thread ข้อความ Ticket ที่มี API อยู่แล้วมาใช้ใน drawer พร้อม reply/internal note และโหลด detail เมื่อเปิด ไม่ใช้ queue row เป็นข้อมูลครบของเคส
- เปิด transition ที่ทำได้ตาม state/permission เช่น IN_PROGRESS, PENDING_USER, RESOLVED, CLOSED พร้อม reason/version และ conflict handling
- การมอบหมายต่อ T&S ต้องมีทางดำเนินงานแม้ CS รับงานไว้ โดยคงประวัติผู้รับผิดชอบ
- ถ้าขยาย FAQ เป็นจัดการครบวงจร ให้เพิ่ม edit/unpublish พร้อม authorization/version/audit; แยกเป็น extension ของ Support ไม่ถือว่า UR-22–26 บังคับโดยตรง
- Dashboard ใช้ aggregate endpoint จริงสำหรับยอดรวม/กราฟตามช่วงเวลา แทนการนับจาก 50 tickets หน้าแรก
- เพิ่มยอด pending KYC, open Reports และ active T&S Holds พร้อมลิงก์ไปคิว; refresh หลัง action และแสดง unavailable เมื่อ API ล้มเหลว
- ปรับ label Admin ที่ยังตกค้างในหน้าที่ผู้ใช้เห็นเป็น Trust & Safety

**ผ่านเมื่อ:** เจ้าหน้าที่รับเรื่อง → อ่าน/ตอบ → รอข้อมูล → แก้ไขสำเร็จ/ปิดงานได้จาก Workspace; internal note ไม่ออกไปฝั่งลูกค้า และ Dashboard ตรงข้อมูลจริง

### TSR-10 — หลักฐานข้อพิพาท, ประวัติ Chat และพัสดุ

อ้างอิง `UR-25`, `FR-3.2.3`, `WF-08` — ระดับ P2; มี dependency ต่อ Chat/Order

**วิธีทำ**

- หน้า Hold ใช้หลักฐานจริงของ DisputeCase ผ่าน API ที่มีอยู่; AdminDisputeEvidence เก่าเก็บเป็น legacy reference พร้อม source label ไม่ทำซ้ำไฟล์
- เปิดไฟล์ผ่าน authorized endpoint พร้อม Audit และจัดการไฟล์ไม่พบ/หมดอายุ โดยไม่ใช้ URL ดิบข้ามการตรวจสิทธิ์
- ตกลง Chat contract ที่ผูก conversation กับ order/buyer/seller และมี paginated history ให้ T&S อ่านเฉพาะเคสที่ได้รับอนุญาต พร้อม Audit การเข้าถึง
- chat-service มี ORDER conversation จริงแล้ว: internal contract ตรวจ order/buyer/seller, แบ่งหน้าด้วย cursor และส่งไฟล์แนบผ่าน authorized proxy; Ticket reply ใน TSR-09 ไม่ถูกใช้แทนประวัติซื้อขาย
- ให้ Order/fulfillment ส่งเลขติดตาม บริษัทขนส่ง และ timeline ที่มี source/timestamp; ระยะแรกใช้ข้อมูลที่บันทึกจริงหรือข้อมูลทดสอบระบุชัด ไม่อ้างว่าเชื่อม carrier สด
- ประสานนิยามสถานะ paid/shipped/received กับ Order ก่อนเปลี่ยนกฎเปิด dispute ให้ตรงช่วงก่อนยืนยันรับของตาม WF-08; ไม่เพิ่ม tracking UI บน lifecycle ที่ยังแยกไม่ออก
- การคุยสดกับลูกค้าจาก drawer เป็นงานต่อยอดแยกจาก requirement อ่านประวัติแชท ต้องระบุสถานะให้ตรงกับสิ่งที่รองรับ

**ผ่านเมื่อ:** ผู้ซื้อแนบไฟล์แล้ว T&S เห็นไฟล์เดียวกันทั้ง Dispute/Hold, อ่านประวัติแชทของออเดอร์ได้, เห็นข้อมูลจัดส่งจริง และผู้ไม่มีสิทธิ์เปิดหลักฐาน/บทสนทนาไม่ได้

**สถานะ fixed-schema (2026-10-10):** หลักฐานจริงและ Chat history ผ่าน integration แล้ว รวมถึง authorization/audit/file-missing path; Order ส่งได้เฉพาะ status และเวลา created/updated ที่บันทึกจริง พร้อม `available=false` สำหรับ tracking เพราะ schema ไม่มี carrier, tracking number, shippedAt หรือ receivedAt จึงยังไม่ผ่านส่วนข้อมูลพัสดุเต็มรูปแบบและไม่เปลี่ยนกฎเปิด dispute ให้เดา receipt state

### TSR-11 — ขอข้อมูลเพิ่มและกำหนดเวลา 48 ชั่วโมง

อ้างอิง `WF-08` ขั้นที่ 6 — ระดับ P2

**วิธีทำ**

- เพิ่มคำสั่ง request-info พร้อมผู้รับ คำถาม เหตุผล และ deadline ฝั่ง server; เปลี่ยนเคสเป็น NEEDS_INFO
- Buyer/Seller ตอบกลับและแนบหลักฐานผ่าน case เดิม; บันทึกว่าเป็นการตอบคำขอใด แล้วส่งกลับคิวตรวจ
- มี job ประมวลผล deadline แบบ idempotent พร้อม Audit และการแจ้งเตือน
- ตามเล่ม กรณีผู้ซื้อไม่ตอบให้ส่งเข้าคิวเจ้าหน้าที่เพื่อพิจารณาปิด/ปฏิเสธ ไม่สั่งปล่อยเงินอัตโนมัติจาก timer
- กรณีผู้ขายไม่ตอบไม่ปฏิเสธสิทธิ์ผู้ซื้อเอง ให้เจ้าหน้าที่ประเมินตามหลักฐานและบันทึกเหตุผล
- การขอเพิ่ม/ตอบ/หมดเวลาไม่ปลด Hold ของฝ่ายอื่น และปิดช่อง race ระหว่างการตอบกับ job หมดเวลา

**ผ่านเมื่อ:** ทดสอบก่อน/ตรง/หลัง deadline, job ซ้ำ, ตอบพร้อมหมดเวลา และเคสที่มี Hold อิสระได้ผลถูกต้อง

### TSR-12 — แจ้งคำเตือนและผลการดำเนินการถึงผู้ใช้

อ้างอิง `WF-08`, `WF-09` — ระดับ P2

**วิธีทำ**

- เพิ่ม in-app notification ที่บันทึกจริงสำหรับ Warn, Report outcome, KYC decision, dispute decision และ request-info
- ใช้ event/outbox ที่บันทึกพร้อมผลคำสั่งใน owner transaction แล้วส่งต่อแบบ retry ได้ มี event key กันแจ้งซ้ำ
- แยกข้อความสำหรับผู้รายงาน ผู้ถูกลงโทษ และ staff; ไม่เผย internal note/ข้อมูลอีกฝ่าย
- ผู้ใช้เปิดอ่านและดูผลเคสที่มีสิทธิ์ได้; toast ฝั่งเจ้าหน้าที่ไม่นับว่าแจ้งผู้ใช้แล้ว
- Email/SMS เป็นช่องทางต่อยอด ไม่จำเป็นต่อการตรวจรับ in-app notification รอบแรก

**ผ่านเมื่อ:** ผู้ใช้แต่ละฝ่ายเห็นข้อความที่ถูกต้อง, retry ไม่สร้างซ้ำ และ notification provider ล่มไม่ทำให้ผลคำสั่งหรือข้อมูลแจ้งเตือนสูญหาย

### TSR-13 — เพิกถอนสิทธิ์การทำงานในระบบและอุทธรณ์แบบไม่มีกำหนด

อ้างอิง `WF-09` ขั้นที่ 5–7 — ระดับ P2; เริ่มหลัง TSR-01–04 และ TSR-12

**หลักการใหม่**

- การลงโทษใน TSR-13 ไม่ใช่การปิดบัญชีและไม่ใช่การห้าม login ผู้ใช้ยังเข้าสู่ระบบ ดูเหตุผล/หลักฐานที่เปิดเผยได้ อ่านการแจ้งเตือน ดูสถานะคำสั่งซื้อหรือเคสเดิม และยื่น/ติดตามอุทธรณ์ได้
- เพิกถอนเฉพาะ “สิทธิ์ทำงาน” ตามบทบาทและขอบเขตของ sanction โดยตรวจที่ API owner ทุกครั้ง ไม่พึ่งการซ่อนปุ่มใน UI
- ไม่มี deadline สำหรับการยื่นอุทธรณ์ ผู้ใช้ยื่นได้ตราบใดที่ sanction ยัง active; อนุญาตอุทธรณ์ที่กำลังพิจารณาได้ครั้งละหนึ่งรายการต่อ sanction เพื่อป้องกันรายการซ้ำ
- `Ban/SUSPENDED` แบบตัด login ของ TSR-01 ยังคงเป็นมาตรการฉุกเฉินแยกต่างหากสำหรับบัญชีที่ต้องหยุดการเข้าถึงทั้งหมด ไม่ใช้แทน role-scoped restriction ของ TSR-13

**ขอบเขตสิทธิ์เมื่อถูกเพิกถอน**

- **Seller restriction:** login/read/notification/appeal ได้ แต่เปิดร้าน, onboarding/KYC เพื่อเปิดขาย, สร้างหรือแก้ไขสินค้า, publish/unpublish, เพิ่มวิดีโอ, สร้างประมูล/แคมเปญ, รับออเดอร์ใหม่ และดำเนินการขายใหม่ไม่ได้; ข้อมูลร้านและเคสเดิมยังดูได้ตามสิทธิ์
- **Buyer restriction:** login/read/notification/appeal ได้ แต่เพิ่มตะกร้า, จองสินค้า, checkout/ชำระเงินจำลอง, bid, ใช้คูปอง และสร้างคำสั่งซื้อใหม่ไม่ได้; ยังดูคำสั่งซื้อเดิมและดำเนินการที่จำเป็นต่อเคสเดิม เช่นอ่านผลข้อพิพาทหรือให้ข้อมูลที่เจ้าหน้าที่ร้องขอได้
- **บัญชีหลายบทบาท:** sanction ระบุ scope `BUYER`, `SELLER` หรือ `ALL_COMMERCE`; การเพิกถอน Seller อย่างเดียวต้องไม่ตัดสิทธิ์ Buyer และกลับกัน เว้นแต่คำสั่งระบุทุกสิทธิ์การค้า
- การจำกัด staff role หรือการปิด login ทั้งหมดอยู่นอก flow นี้และต้องใช้ policy/คำสั่งเฉพาะ ไม่อนุมานจาก Buyer/Seller restriction

**วิธีทำ**

- เก็บ sanction แบบ durable โดยมี `sanctionId`, case/reference, target user, scope, actor, reason, evidence references, startedAt, current status, decision/outcome และ operation ID; ไม่ต้องมี appeal deadline
- Auth/token verification ยังคงอนุญาต authentication สำหรับบัญชีที่มี role restriction แต่ทุก write endpoint ที่เป็นการซื้อ/ขายต้องตรวจ active sanction จาก authoritative contract ก่อนทำรายการ
- Frontend แสดง banner ชัดเจนว่าถูกจำกัดสิทธิ์ใด เพราะเหตุใด เริ่มเมื่อใด ช่องทางดูรายละเอียด และปุ่มยื่น/ติดตามอุทธรณ์ โดยไม่แสดงปุ่มทำรายการที่ backend จะปฏิเสธ
- Product, Order, Chat และ service อื่นบังคับ policy เดียวกันที่ server: block การเริ่ม commerce ใหม่ แต่คง read access และ action ที่จำเป็นต่อการแก้ข้อพิพาท/อุทธรณ์เดิม
- เมื่อ sanction ฝั่ง Seller เริ่มทำงาน ให้ Product หยุด visibility/การซื้อของสินค้าที่เกี่ยวข้องตาม policy และให้ Order ป้องกันออเดอร์ใหม่ โดยใช้ persisted operation/outbox, idempotency และ reconciliation; partial failure ต้องแสดงสถานะค้างและ retry ได้
- การยื่นอุทธรณ์ต้องผูกกับ sanction เดิม มีเหตุผล/หลักฐาน/สถานะ/ประวัติการพิจารณา และแจ้งผลกลับผู้ใช้ ผู้ใช้ยังเปิดดูอุทธรณ์ของตนได้แม้สิทธิ์การค้าถูกเพิกถอน
- เมื่ออนุมัติอุทธรณ์หรือเจ้าหน้าที่เพิกถอน sanction ให้คืนเฉพาะ capability และ side effect ที่ sanction นั้นเป็นเจ้าของ ไม่ปลด Hold, product moderation หรือข้อจำกัดจากเคสอื่น และไม่ย้อนผล Refund ที่เสร็จแล้ว
- ทุก create/review/reject/approve/revoke/retry ต้องมี Audit พร้อม actor, reason, เวลา และ operation/reference ID

**ข้อจำกัดของ schema คงที่ ณ 2026-10-10**

- Auth schema ปัจจุบันมีเพียง `User.status` แบบ string จึงเก็บ current scope แบบจำกัดได้เป็น `RESTRICTED_BUYER`, `RESTRICTED_SELLER` หรือ `RESTRICTED_ALL_COMMERCE` แต่ไม่มี sanction/appeal relation สำหรับเก็บ sanction ID, case/evidence linkage, หลาย sanction พร้อมกัน, lifecycle และประวัติอุทธรณ์แบบ durable
- ห้ามใช้ `User.status=SUSPENDED` สำหรับ flow นี้ เพราะ middleware ปัจจุบันตีความเป็นการห้ามใช้ protected API ทั้งหมด ซึ่งขัดกับเงื่อนไขที่ผู้ใช้ต้อง login เพื่ออ่านการแจ้งเตือนและอุทธรณ์ได้
- ห้ามยัด sanction/appeal ลง `AdminAudit.reason`, Ticket reply หรือ field อื่นที่ไม่ใช่เจ้าของข้อมูล ดังนั้น current restriction และ audit event ทำได้ภายใต้ schema เดิม แต่ appeal submission/review/evidence/history ยังเป็น **Deferred / requires approved persistence contract**

**สถานะ implementation แบบ schema คงที่ (2026-10-10)**

- Auth เก็บ current restriction scope ใน `User.status` และยังออก/refresh/validate session ได้; live session validation ส่ง scope ล่าสุดไป Gateway และ owner services ทำให้ access token เก่าเลี่ยงคำสั่งใหม่ไม่ได้
- เพิ่มคำสั่ง staff สำหรับเพิกถอน/คืนสิทธิ์ Buyer, Seller หรือทุกสิทธิ์การค้า พร้อมเหตุผลและ append-only `AdminAudit`; หน้า user lookup แสดงสถานะและคำสั่งตาม role ส่วน Audit workspace ค้นเหตุการณ์ชุดนี้ได้
- Product/Auth บล็อกการเปิดร้าน/KYC เพื่อขาย, การเขียนสินค้า, visibility, วิดีโอ และ auction submit; Product บล็อก bid/campaign claim; Order บล็อก create/pay/checkout และตรวจผู้ซื้อกับผู้ขายซ้ำก่อนสร้าง Order จาก auction อัตโนมัติ
- ผู้ใช้ยัง login, refresh session, อ่านข้อมูล/ออเดอร์/เคสเดิม และเห็น banner พร้อม scope/เหตุผลได้ การจัดการออเดอร์เดิมและ dispute communication ยังคงเปิดเพื่อไม่ทิ้งภาระผูกพันเดิม
- `SUSPENDED` แบบตัด login ยังเป็นคนละ flow และถูกกันไม่ให้เขียนทับ `RESTRICTED_*`; ต้องคืน commerce restriction ก่อนจึงระงับเต็มรูปแบบได้ เพราะ schema เดิมไม่มีที่เก็บสถานะทั้งสองพร้อมกัน
- ยังไม่มีปุ่ม/endpoint ยื่นอุทธรณ์, สถานะพิจารณา, หลักฐาน, notification record หรือการคืน side effect ราย sanction; UI บอกข้อจำกัดนี้ตรงไปตรงมา ไม่สร้างข้อมูลปลอม

**ผ่านเมื่อ:** ผู้ถูกจำกัดสิทธิ์ยัง login และอ่านเหตุผล/การแจ้งเตือน/เคสเดิมได้, Buyer/Seller/multi-role ถูกบล็อกเฉพาะ capability ตาม scope ที่ทั้ง UI และ owner API, token เดิมไม่เลี่ยงข้อจำกัด, อุทธรณ์ยื่นได้โดยไม่มี deadline และไม่เกิดรายการซ้ำ, การคืนสิทธิ์ไม่ปลดข้อจำกัดจากเคสอื่น และทุกขั้นมี Audit ที่ตามกลับ sanction เดิมได้

### TSR-14 — Bulk UI สำหรับคำสั่งที่ Backend รองรับ

อ้างอิง `ADM-005` — ระดับ P3; เริ่มหลัง TSR-03

**วิธีทำ**

- เพิ่มการเลือกหลายบัญชีสำหรับ Suspend/Warn/Restore พร้อมจำนวนไม่เกิน 100, เหตุผล และ preview/dry-run
- Preview ระบุผลที่คาด ไม่รับประกันว่าทำจริงจะสำเร็จ เพราะสถานะอาจเปลี่ยนระหว่างนั้น
- ยืนยันแล้วแสดง succeeded/failed รายบัญชีและเหตุผล; retry เฉพาะรายการล้มเหลวด้วย operation ใหม่ที่เชื่อมกับต้นฉบับ
- timeout ของคำสั่งเดิมให้ query/replay operation เดิม ไม่สร้าง key ใหม่จนเสี่ยงทำซ้ำ
- ไม่เพิ่ม bulk auction ในงานนี้

**ผ่านเมื่อ:** จำกัด batch, dry-run ไม่เขียนข้อมูล, partial failure ไม่ขัดขวางรายการอื่น, retry พร้อมกันไม่ทำซ้ำ และ UI/Audit ตรงผลจริง

**สถานะ fixed-schema (2026-10-10):** เพิ่ม Bulk Actions ใน Workspace สำหรับ Warn/Suspend/Restore ครบ cap 100, dry-run, ผลรายบัญชี, replay key เดิมเมื่อผลไม่แน่ชัด และ retry เฉพาะ failure ด้วย key ใหม่ที่อ้าง key ต้นฉบับ; frontend test/build ผ่าน แต่ PostgreSQL integration ปัจจุบันถูกบล็อกด้วย Auth test DB/generated-client drift ที่ `User.role=ADMIN` และไม่ได้แก้ schema ตามข้อจำกัด จึงยังไม่ถือว่า runtime/Audit acceptance รอบนี้ผ่าน

### TSR-15 — ตรวจรับทั้ง flow และปรับเอกสาร

- [ ] รัน unit tests เฉพาะกฎสำคัญ และ integration ด้วย `REQUIRE_INTEGRATION=1` บน PostgreSQL ทดสอบแยก; **Partial — Auth blocked และ Order/Support ยังไม่ใช่ฐานแยก**
- [ ] ทดสอบผ่าน Gateway → owner services → DB จริง สำหรับ KYC, Report, moderation, hold และ Ticket; **Partial — role matrix ผ่าน แต่ Auth integration contract ยัง blocked**
- [ ] ทดสอบจาก browser ด้วยบทบาท T&S/CS/Buyer/Seller/หลายบทบาท และตรวจ API โดยตรงสำหรับ authorization; **Partial — desktop T&S/CS ผ่าน**
- [x] ทดสอบ concurrent writes, token ก่อน Ban, partial service failure, timeout/retry และกรณีมากกว่าหนึ่งหน้า
- [ ] ทดสอบ evidence persistence หลัง recreate container บน stack ทดสอบ; **Blocked by unsafe db-push startup**
- [ ] ตรวจ empty/error/loading/stale state และ mobile layout ของหน้าที่แก้; **Partial — component states ผ่าน แต่ mobile browser ยัง Deferred**
- [ ] วัดเวลาหน้าค้นหา/ประวัติ/Dashboard ตาม `NFR-P-01` โดยระบุขนาดข้อมูลและสภาพแวดล้อม; **Partial — demo data ผ่าน แต่ production-like dataset ยัง Deferred**
- [x] ปรับ progress/handoff/traceability ให้แยก Implemented, Verified, Blocked by provider, Deferred และบันทึกวันที่/ผลทดสอบจริง

**ผลตรวจรับ ณ 2026-10-10 (schema คงที่):**

- **Verified:** กฎสำคัญ backend 64/64, Workspace frontend 29/29, Product PostgreSQL 3/3, Order PostgreSQL 16/16, Support PostgreSQL 4/4, Chat Mongo/Redis 82/82 และ Next production build 27 หน้า/route ผ่าน
- **Verified:** Gateway authorization ตรง role สำหรับ KYC, Report, Dispute, Hold, Ticket และ Bulk dry-run; browser desktop ยืนยัน T&S Dashboard/Bulk/Audit ทั้ง 4 owner sources และยืนยันว่า CS ไม่เห็น KYC/Audit/Bulk/T&S-only navigation
- **Verified on small demo data:** ตัวอย่าง 5 ครั้งต่อ endpoint ผ่าน `NFR-P-01 <= 2s`; ค่าสูงสุด Report search 97 ms, Order history 46 ms, Auth dashboard 32 ms, Order dashboard 22 ms และ Support dashboard 53 ms
- **Blocked:** Auth PostgreSQL integration 0/5 เพราะฐานทดสอบมีค่า legacy `User.role=ADMIN` แต่ generated client คาด contract ปัจจุบัน จึงเกิด Prisma `P2032` ก่อน assertions; ไม่ใช้ db push/migration/regenerate เพื่อบังคับให้ผ่าน
- **Blocked:** evidence persistence หลัง recreate container ยังพิสูจน์ไม่ได้ เพราะ Product/Order/Support Dockerfile ยังเริ่มด้วย `prisma db push --accept-data-loss`; การ recreate จะขัดข้อกำหนด schema คงที่
- **Deferred:** production-like performance dataset, mobile browser acceptance, Buyer/Seller browser click-through และบัญชีหลายบทบาท; บัญชี/fixture ที่พร้อมในรอบนี้ยืนยันเฉพาะ T&S และ CS บน desktop
- **Partial:** Order/Support integration ใช้ฐาน dev ที่ test สร้างและล้าง fixture ของตนเอง เพราะยังไม่มีฐาน PostgreSQL ทดสอบแยกสำหรับสอง service; จึงไม่อ้างว่าผ่านเงื่อนไข isolation เต็มรูปแบบ
- **เอกสาร:** อัปเดต progress, handoff, changelog และ traceability แล้ว โดยคงสถานะ TSR-15 เป็น **Partially Verified / Blocked** ไม่ใช่ Done

## 4. ข้อตกลงทางเทคนิคที่เสนอให้ใช้

| เรื่อง             | แนวทางเสนอ                                           | เหตุผล                                                           |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Inbox รวมสองระบบ   | แยกแท็บย่อยภายในพื้นที่ T&S เดิม                     | ค้นและแบ่งหน้าได้ถูกต้องโดยไม่สร้างฐานข้อมูลรวมเพิ่ม             |
| Ban ทันที          | ตรวจบัญชี/session revision ปัจจุบันที่ server        | token ก่อน Ban ต้องหยุดใช้ได้ ไม่รอหมดอายุ 15 นาที               |
| หลายฝ่ายพักเงิน    | Hold แยกตามต้นทาง/เคส                                | Release ของฝ่ายหนึ่งไม่ปล่อยเงินที่อีกฝ่ายพักไว้                 |
| คำสั่งข้าม service | persisted operation + idempotency + retry            | timeout ต้องตรวจผลและทำต่อได้ ไม่เกิดสำเร็จครึ่งทางแบบมองไม่เห็น |
| Audit รวม          | อ่านจาก owner API และเลือก source ใน UI              | เก็บ ownership เดิมและไม่ทำ pagination ของผลรวมผิด               |
| การแจ้งเตือนรอบแรก | in-app ที่บันทึกจริง                                 | ปิด flow แจ้งผู้ใช้โดยไม่ต้องผูกผู้ให้บริการ Email/SMS           |
| ข้อมูล Chat/พัสดุ  | provider contract และข้อมูลจริง/ทดสอบที่ระบุแหล่งชัด | ไม่รายงาน placeholder ว่าเป็น requirement ที่เสร็จแล้ว           |

รายละเอียดเหล่านี้เป็นข้อเสนอในแผน ยังไม่ใช่ decision record ที่อนุมัติแล้ว หากเริ่มพัฒนาค่อยเพิ่ม ADM-DEC ใหม่พร้อมผลกระทบและ compatibility ที่เลือกจริง

## 5. Traceability และงานที่ยังแยกเฟส

| Requirement                | งานแก้/เติม                    | สถานะตรวจรับ 2026-10-10                                                                       |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| UR-22 / FR-4.2.1 / WF-01   | TSR-03, TSR-06                 | Implemented; browser T&S ผ่าน แต่ Auth PostgreSQL fixture drift ทำให้ integration ยัง Blocked |
| UR-23 / FR-4.2.2–3         | TSR-01, TSR-03, TSR-07, TSR-13 | TSR-13 current role restriction implemented; appeal persistence ยัง Deferred                  |
| UR-24 / FR-4.2.4–5 / WF-09 | TSR-03–05, TSR-12–13           | Implemented/verified ตาม scope TSR-03–05; TSR-12–13 Deferred                                  |
| UR-25 / FR-3.2.3 / WF-08   | TSR-08, TSR-10–11              | Audit/Chat verified; TSR-11 Deferred และข้อมูลพัสดุจริง Blocked by fixed schema/provider      |
| UR-26 / FR-3.2.4           | TSR-02, TSR-13                 | Hold/Dispute และ current role restriction implemented; durable appeal ยัง Deferred            |
| ADM-001                    | TSR-01                         | Verified ทาง API; multi-role browser fixture ยัง Deferred                                     |
| ADM-005                    | TSR-03, TSR-08, TSR-14         | Implemented; Audit browser ผ่าน, Bulk PostgreSQL ยัง Blocked by Auth drift                    |
| Support ที่ T&S ใช้งาน     | TSR-05, TSR-09                 | PostgreSQL/API/browser desktop verified; FAQ durable action audit ยัง Blocked by schema       |

งานที่ไม่ถือว่าเสร็จจากการแก้ Core:

- Production encryption/PDPA/PCI-DSS และ privileged audit hardening ตาม `ADM-DEC-004`; ส่วน functional authorization และการบันทึกผลคำสั่งต้องแก้ใน Core อยู่แล้ว
- Backup แยกเครื่องรายวันตาม `NFR-BR-01` รวมทั้งการกู้คืนและซ้อม restore: ต้องเป็นงาน deployment/operations ที่มีหลักฐานจริง; persistent volume ไม่ใช่ backup
- Payment Gateway/การคืนและโอนเงินจริง, carrier integration และระบบ Chat เต็มรูปแบบ: มี provider dependencies ต่างหาก; T&S integration จะ Verified ได้เมื่อ provider พร้อมและผ่านการทดสอบรวม
- Report รีวิวตาม WF-07 หากยังอยู่ใน release scope: ต้องตกลงกับ Review owner เรื่อง target type, moderation และหลักฐานก่อนขยายจาก Report สินค้า/ผู้ขาย ไม่ถือว่า product report ครอบคลุม review report อัตโนมัติ

## 6. ชุดแรกที่แนะนำให้เริ่ม

`TSR-01 → TSR-10` ทำส่วนที่ schema เดิมรองรับครบและบันทึกข้อจำกัดไว้แล้ว; `TSR-11–12` ยังไม่ได้ทำตามคำสั่งให้ข้าม; `TSR-13` ทำ current role-scoped restriction/enforcement/audit/banner แล้ว แต่อุทธรณ์และ notification แบบ durable ยังติด persistence contract; `TSR-14` มี UI implementation และ frontend verification แล้วแต่ PostgreSQL acceptance ติด Auth DB/client drift; `TSR-15` ตรวจรับ API/PostgreSQL/desktop browser ได้บางส่วนตามหลักฐานด้านบน แต่ยังเป็น Partially Verified / Blocked

ยังไม่ประมาณระยะเวลารวมเป็นวัน เพราะ Chat, fulfillment และ baseline ของฐานข้อมูลมีผลต่อขนาดงาน ควรประเมินรายชุดหลัง TSR-00 และหลังตรวจ contract กับเจ้าของ service

## 7. สรุปงาน remediation ทั้งหมดสำหรับผู้ตรวจรับ

| งาน    | สิ่งที่ทำ                                                                                               | สถานะปัจจุบัน                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| TSR-00 | เก็บ baseline, แยก owner service/ฐานข้อมูล และเตรียม fixture/test contract                              | Implemented; test DB แยกมีเฉพาะ Auth/Product ขณะที่ Order/Support ยังใช้ self-clean fixture บนฐาน dev          |
| TSR-01 | บังคับ Ban ที่ login และ request ที่มีผลต่อข้อมูล, revoke session/token เดิม, Restore และ Audit         | Verified ด้วย dedicated Ban fixture และ authorization tests                                                    |
| TSR-02 | บังคับ Claim/ownership ของ Dispute, CAS/version, Hold หลายต้นทาง และ race protection                    | Verified บน PostgreSQL รวม concurrency scenarios                                                               |
| TSR-03 | เพิ่ม idempotency/replay/conflict handling สำหรับ KYC, Report, Product moderation และ Bulk              | Implemented/verified ตาม fixed-schema contract; Auth PostgreSQL รอบ TSR-15 ยังติด DB/client drift              |
| TSR-04 | ซ่อนสินค้าที่ถูกระงับจาก public feed/search/store/video/auction และบล็อกการซื้อ/แก้ไข                   | Implemented/verified; URL ไฟล์ `/uploads/*` ที่เคยทราบแล้วยัง revoke ไม่ได้หากไม่มี private storage/CDN policy |
| TSR-05 | แยก Report กับ escalated Ticket inbox, เพิ่ม search/filter/page/detail/error/retry                      | Implemented; Report category/evidence ทำไม่ได้เพราะไม่มี field/storage relation ที่ถูกประเภท                   |
| TSR-06 | แก้ KYC filters, transaction/resubmit, private document storage, authorized read และ Audit              | Implemented; historical application snapshot และ recreate acceptance ยัง partial                               |
| TSR-07 | เพิ่มประวัติ buyer/seller แบบแบ่งหน้า, totals/statistics จริง และ unavailable state                     | Implemented; shipping facts ที่ไม่มี owner data ไม่แสดงเป็นศูนย์                                               |
| TSR-08 | เพิ่ม Audit จาก Auth/Order/Support พร้อม source/action/filter/page/deep link                            | Desktop browser verified; Order request ID และ durable provider-error log ยังไม่มี persistence contract        |
| TSR-09 | ทำ Ticket workflow, internal note privacy, T&S takeover, FAQ lifecycle และ Dashboard aggregates         | PostgreSQL/UI/browser verified; FAQ actor/action audit แบบ durable ยังทำไม่ได้ใน schema เดิม                   |
| TSR-10 | ใช้ Dispute evidence จริง, authorized file access, buyer-seller ORDER chat history และ attachment proxy | Evidence/Chat verified; carrier/tracking/shippedAt/receivedAt ยังไม่มีใน Order schema                          |
| TSR-11 | Request-info และ deadline 48 ชั่วโมง                                                                    | Deferred ตามคำสั่ง ยังไม่ได้ implement                                                                         |
| TSR-12 | In-app notification/outbox สำหรับผลคำสั่ง                                                               | Deferred ตามคำสั่ง ยังไม่ได้ implement                                                                         |
| TSR-13 | เพิกถอนสิทธิ์ซื้อ/ขายตาม role โดยยัง login/read/notification/appeal ได้ และอุทธรณ์ไม่มีกำหนด            | Partial; current scope/enforcement/audit/banner implemented, durable sanction/appeal/notification ยัง Deferred |
| TSR-14 | Bulk Warn/Suspend/Restore สูงสุด 100 รายการ, dry-run, partial result และ safe retry                     | Frontend/browser implemented; Auth PostgreSQL acceptance blocked by legacy role drift                          |
| TSR-15 | รวม unit/integration/Gateway/browser/performance evidence และปรับเอกสาร                                 | Partially Verified / Blocked ตามผลในหัวข้อ TSR-15                                                              |

## 8. คู่มือทดสอบผ่านหน้าเว็บด้วยตนเอง

### 8.1 การเตรียมระบบและบัญชี

1. ตรวจ stack เดิมด้วย `docker compose ps` และใช้ container ที่กำลังรันอยู่ จากนั้นเปิด `http://localhost:3000/login` ใน Chrome หรือ Edge ห้าม `--force-recreate` Product/Order/Support ในช่วง schema-frozen เพราะ startup ปัจจุบันยังมี `prisma db push --accept-data-loss`
2. ใช้ Incognito/Profile แยกต่อบทบาท เพื่อไม่ให้ cookie/token ของบัญชีเดิมปะปนกัน
3. เปิด DevTools → Network, เปิด Preserve log และบันทึก request URL, status, response time และ screenshot เมื่อพบข้อผิดพลาด
4. ใช้บัญชีเดโมต่อไปนี้เท่านั้นสำหรับ flow ที่เปลี่ยนข้อมูล:

| บทบาท            | อีเมล                    | รหัสผ่าน      | ใช้ตรวจ                                                      |
| ---------------- | ------------------------ | ------------- | ------------------------------------------------------------ |
| Trust & Safety   | `trust.ban@test.local`   | `BanDemo123!` | Workspace, Ban/Restore, Audit, Bulk                          |
| Ban target       | `buyer.ban@test.local`   | `BanDemo123!` | token ก่อน Ban และ login หลัง Ban                            |
| Customer Service | `cs.nan@example.com`     | `password123` | Ticket/Dispute/FAQ และตรวจเมนูตามสิทธิ์                      |
| Buyer            | `buyer.demo@example.com` | `password123` | ตรวจว่าเข้า staff workspace ไม่ได้ และดู buyer flow          |
| Seller           | `shop.denim@example.com` | `password123` | ตรวจว่าเข้า staff workspace ไม่ได้ และดู seller/product flow |
| Legacy Admin     | `admin@example.com`      | `password123` | compatibility เฉพาะกรณีจำเป็น                                |

บัญชี `trust.ban` และ `buyer.ban` มาจาก dedicated fixture รันด้วย `docker compose exec -T auth-service npm run seed:ban-demo` การรัน seed นี้จะ reset เฉพาะสองบัญชีดังกล่าวและ revoke session เก่าของสองบัญชี ห้ามใช้บัญชีผู้ใช้จริงทดสอบ Ban/Bulk/Product removal

### 8.2 Smoke test และ role navigation

1. Login เป็น T&S แล้วเปิด `http://localhost:3000/workspace`
2. ต้องเห็น `Dashboard`, `Tickets`, `Disputes`, `ค้นหา`, `จัดการ FAQ`, `เคส Trust & Safety`, `จัดการสินค้า`, `คิวตรวจ KYC`, `Audit Logs` และ `Bulk Actions`
3. Dashboard ต้องแสดง Total/Resolved/Pending/Escalated Tickets, Pending KYC, Open Reports และ Active T&S Holds; ถ้า owner service ล่มต้องขึ้น unavailable/error ไม่ใช่เลขศูนย์ปลอม
4. Logout แล้ว login เป็น CS เปิด `/workspace`; ต้องเห็นเฉพาะ Dashboard, Tickets, Disputes, Search และ FAQ และต้องไม่เห็น KYC, T&S cases, Product moderation, Audit หรือ Bulk
5. Login เป็น Buyer และ Seller แล้วเปิด `/workspace` โดยตรง; ต้องถูกปฏิเสธหรือไม่เห็น staff workspace หากเข้าถึงได้ให้ถือว่า Fail และเก็บ Network response/screenshot

### 8.3 Ban และ token เดิม (TSR-01)

ขั้นตอนนี้เปลี่ยนข้อมูล แต่ปลอดภัยเมื่อใช้ `buyer.ban@test.local` เท่านั้น

1. เปิด Incognito A login เป็น `buyer.ban@test.local` และคง session ไว้
2. เปิด Incognito B login เป็น T&S → Workspace → `ค้นหา` แล้วค้น `buyer.ban@test.local`
3. สั่งระงับบัญชีพร้อมเหตุผลทดสอบที่จำง่าย เช่น `manual TSR-01 acceptance YYYY-MM-DD`
4. กลับ Incognito A โดยไม่ login ใหม่ แล้วลอง action ที่มีผลต่อข้อมูล เช่นแก้โปรไฟล์/เพิ่มตะกร้า/ส่งข้อความ; ต้องถูกปฏิเสธหรือถูกบังคับออกจากระบบ
5. เปิด Incognito ใหม่แล้วลอง login บัญชีเป้าหมาย; ต้อง login ไม่ได้
6. กลับ T&S แล้ว Restore พร้อมเหตุผล จากนั้นบัญชีเป้าหมายต้อง login ใหม่ได้
7. เปิด Audit Logs → source บัญชี/KYC/Report แล้วค้น target; ต้องพบ Suspend/Restore พร้อม actor, reason และเวลา

### 8.4 Inbox, Ticket, FAQ และ Dashboard (TSR-05/09)

1. T&S → `เคส Trust & Safety`: สลับ Report/เคสส่งต่อ ค้นหา เปลี่ยน filter และ pagination; เปิดรายการแล้วข้อมูล detail ต้องตรงรายการล่าสุด
2. ลองคำค้นที่ไม่มีผลลัพธ์; ต้องเห็น empty state ไม่ใช่ error และไม่ค้าง loading
3. CS → `Tickets`: เปิด Ticket ทดสอบ ตรวจ thread, reply และ internal note แยกกันชัดเจน
4. หากจะเปลี่ยนสถานะ ให้ใช้ Ticket ทดสอบเท่านั้น แล้วไล่ `IN_PROGRESS → PENDING_USER → IN_PROGRESS → RESOLVED → CLOSED`; เปิดสอง browser พร้อมกันเพื่อยืนยันว่าสำเนา stale ถูกตอบ Conflict แทนการเขียนทับ
5. เปิด Ticket เดียวกันในมุม requester; internal note ต้องไม่ปรากฏ
6. T&S เปิด escalated Ticket แล้วรับช่วง; Audit source Ticket ต้องมี `HANDOFF` และผู้รับผิดชอบเดิม/ใหม่
7. `จัดการ FAQ`: ใช้บทความทดสอบเพื่อลอง Edit/Publish/Unpublish และ refresh เพื่อตรวจว่าค่า version/status คงอยู่ หมายเหตุ: actor/action audit ของ FAQ ยังไม่มี durable storage ใน schema เดิม

### 8.5 KYC และประวัติผู้ใช้ (TSR-06/07)

1. T&S → `คิวตรวจ KYC`: ตรวจ filter PENDING/VERIFIED/REJECTED/ALL และ empty/loading/error state
2. เปิดใบสมัครที่มีไฟล์ทดสอบ; เอกสารต้องเปิดผ่าน authorized endpoint ไม่ใช่ raw public URL และ Audit ต้องมี `KYC_DOCUMENT_VIEWED`
3. ถ้าไฟล์ backing หาย ต้องแสดง unavailable/resubmit guidance ไม่ใช่หน้าขาวหรือ 500 ที่ไม่มีคำอธิบาย
4. `ค้นหา` → เปิดผู้ใช้เดโม ตรวจแยก buyer/seller history, totals, status counts และ pagination; เปลี่ยนไปหน้าถัดไปแล้วต้องไม่ใช้จำนวนแถวหน้าแรกเป็น total
5. ถ้า Order owner ล้ม หน้า history ต้องแสดง unavailable/retry ไม่ใช่ “ไม่มีประวัติ”

### 8.6 Product moderation (TSR-04)

ขั้นตอนนี้เปลี่ยน visibility ของสินค้า ต้องใช้สินค้าทดสอบที่จด product ID ไว้ก่อนเท่านั้น

1. ก่อนระงับ เปิด public product detail, search, seller store และช่องทาง auction/video ที่เกี่ยวข้อง ยืนยันว่ามองเห็นสินค้า
2. T&S → `จัดการสินค้า` → เปิดสินค้าทดสอบ → Remove พร้อมเหตุผล
3. Refresh ทุก public path เดิม; สินค้าต้องไม่ปรากฏและ checkout/campaign/bid/swipe ต้องใช้งานไม่ได้
4. Login เป็น seller เจ้าของสินค้า; edit/delete/visibility/video action ที่ขัด moderation ต้องถูกบล็อกและแสดงเหตุผล
5. Restore จาก T&S แล้วตรวจว่าสินค้ากลับตาม commerce state ปัจจุบัน ไม่ย้อนกลับไป stale state ก่อนถูกระงับ
6. URL `/uploads/*` ที่คัดลอกไว้ก่อน Remove อาจยังเปิดได้ นี่เป็นข้อจำกัดที่บันทึกไว้ ไม่ถือว่า visibility layer สามารถ revoke file URL ได้

### 8.7 Dispute, Hold, Evidence และ Chat (TSR-02/10)

1. T&S → `Disputes` หรือ `เคส Trust & Safety` เปิดเคสทดสอบ ตรวจ assigned owner และปุ่ม Claim
2. ก่อน Claim ฟอร์มเขียน/ตัดสินต้อง disabled หรือ hidden; หลัง Claim เฉพาะเจ้าของเคสจึงดำเนินการได้
3. เปิดหลักฐานจาก Dispute และ Hold ที่อ้างเคสเดียวกัน ต้องเป็นไฟล์ชุดเดียวกัน; Audit ต้องเกิดเมื่อเปิดไฟล์จริง ไม่ใช่เพียงเปิด drawer
4. เปิด buyer-seller ORDER chat history ตรวจข้อความหลายหน้า ปุ่มโหลดข้อความเก่า และไฟล์แนบ; ผู้ไม่มีสิทธิ์ต้องเปิด history/attachment ไม่ได้
5. ข้อมูลพัสดุต้องแสดง `available=false`/ข้อความไม่พร้อมเมื่อไม่มี carrier/tracking จริง ห้ามแสดงค่าที่อนุมานขึ้นเอง
6. หลีกเลี่ยงการกด Decide/Hold/Release บนเคสเดโมที่ต้องเก็บไว้ หากต้องทดสอบ write ให้สร้าง fixture แยกและจด order/case ID ก่อนเริ่ม

### 8.8 Audit และ Bulk Actions (TSR-08/14)

1. T&S → `Audit Logs` แล้วสลับ 4 sources: บัญชี/KYC/Report, Hold/Release, ข้อพิพาท/หลักฐาน และสถานะ Ticket
2. แต่ละ source ต้องมี total/page ของตัวเอง ลอง filter actor, target, action และช่วงวันที่ แล้วกดค้นหา
3. ทดสอบวันที่เดียวกันโดยตั้งวันเริ่มและวันสิ้นสุดเท่ากัน; ต้องรวม event ตั้งแต่ `00:00:00.000Z` ถึง `23:59:59.999Z` และไม่เลื่อนวันตาม timezone เครื่อง
4. กด deep link ของ event; ต้องกลับไป User/Report/Order/Ticket ที่เกี่ยวข้อง หาก event ไม่มี request ID ต้องแสดง unavailable ไม่สร้างค่าเทียม
5. `Bulk Actions`: วาง account IDs ซ้ำกันและกด Preview; จำนวนต้อง deduplicate, dry-run ต้องไม่เปลี่ยนสถานะจริง และผลต้องแสดงรายบัญชี
6. ทดลองมากกว่า 100 IDs; UI ต้องบล็อกก่อนส่ง request
7. อย่ากด Confirm กับบัญชีจริง หากต้องตรวจ write ให้ใช้ dedicated fixtures เท่านั้น แล้วตรวจ succeeded/failed รายบัญชีและ Audit; retry ต้องเลือกเฉพาะรายการล้มเหลว

### 8.9 เพิกถอนสิทธิ์ซื้อ/ขายโดยยัง Login ได้ (TSR-13)

ขั้นตอนนี้เปลี่ยนสถานะบัญชี ใช้เฉพาะ dedicated fixture หรือบัญชีทดสอบที่ลบข้อมูลได้ ห้ามใช้ผู้ใช้จริง

1. เปิด Incognito A login เป็น Buyer fixture แล้วคง session ไว้ จากนั้นเปิดสินค้า ออเดอร์เดิม และหน้าโปรไฟล์เพื่อยืนยันว่าอ่านข้อมูลได้
2. เปิด Incognito B login เป็น T&S → `ค้นหา` → ค้น Buyer fixture → กด `เพิกถอนสิทธิ์ซื้อ` พร้อมเหตุผล เช่น `manual TSR-13 buyer restriction YYYY-MM-DD`
3. กลับ Incognito A โดยไม่ login ใหม่และ refresh หน้า; ต้องยัง login อยู่และเห็น banner ระบุ `สิทธิ์การซื้อ` พร้อมเหตุผล
4. ตรวจ read path เดิม: โปรไฟล์, รายการสินค้า, ออเดอร์เดิม และข้อพิพาทเดิมต้องยังเปิดได้
5. ลองสร้าง Order/Buy now, checkout, payment, bid และ claim campaign; backend ต้องตอบ `403 COMMERCE_RESTRICTED` และต้องไม่เกิด Order/payment/bid/claim ใหม่ แม้ใช้ access token ที่ออกก่อนถูกจำกัด
6. กลับ T&S → Audit Logs → source บัญชี/KYC/Report → filter action `COMMERCE_RESTRICTED_BUYER`; ต้องพบ target, actor, reason และเวลา จากนั้นเปิดประวัติผู้ใช้และต้องเห็น restriction event
7. กด `คืนสิทธิ์ซื้อขาย` พร้อมเหตุผล แล้วกลับ Buyer refresh; banner ต้องหายและ action ซื้อใหม่ต้องกลับมาใช้ได้ โดยไม่ต้อง Restore แบบ full account ban
8. ทดสอบ Seller ด้วย disposable Seller fixture เท่านั้น: เลือก `เพิกถอนสิทธิ์ขาย` แล้วตรวจว่า login/read/ออเดอร์เดิมยังได้ แต่ shop change/KYC submission, create/edit/delete/visibility สินค้า, video และ auction submit ถูกปฏิเสธ ผู้ซื้ออื่นต้องสร้าง Order ใหม่จากสินค้าของ Seller นี้ไม่ได้ และ reservation ที่เริ่มแล้วต้องถูกคืน
9. สำหรับบัญชีหลายบทบาท ให้จำกัด BUYER แล้วตรวจว่า SELLER write ยังได้ จากนั้นเพิ่ม SELLER ให้เป็น `ALL_COMMERCE`; คืนเฉพาะ BUYER แล้ว SELLER restriction ต้องยังอยู่
10. อย่าคาดหวังปุ่มยื่นอุทธรณ์หรือ notification inbox ในรอบนี้: banner ต้องแจ้งตรง ๆ ว่า appeal submission ยังไม่พร้อม ส่วน `SUSPENDED` เป็น emergency ban คนละ flow และระบบต้องไม่ให้เขียนทับ `RESTRICTED_*` โดยไม่คืน restriction ก่อน

### 8.10 Responsive, state และเวลาโหลด (TSR-15)

1. DevTools → Toggle device toolbar ตรวจอย่างน้อย 390×844, 768×1024 และ desktop; sidebar/drawer/table ต้องใช้งานได้ ไม่ซ้อนปุ่มสำคัญ และตารางกว้างต้อง scroll ได้
2. ใช้ Network throttling เพื่อตรวจ loading skeleton/spinner แล้วลอง filter ที่ไม่พบข้อมูลเพื่อตรวจ empty state
3. Error-state test ควรทำเฉพาะ test stack โดยหยุด owner service ทีละตัว; หน้าเว็บต้องบอกว่า source ใดไม่พร้อมและมี Retry ห้ามแสดงศูนย์หรือรายการว่างแทน error
4. เปิด Network แล้ววัดอย่างน้อย 5 ครั้งสำหรับ Report search, User order history, Auth dashboard, Order dashboard และ Support dashboard; จดจำนวน records และ response time ทุกครั้ง เกณฑ์ `NFR-P-01` คือไม่เกิน 2 วินาที
5. ผล demo-data เดิมใช้เป็น baseline เท่านั้น การปิด TSR-15 ต้องทดสอบซ้ำด้วยข้อมูลขนาด production-like

### 8.11 แบบบันทึกผล manual acceptance

| วันที่/เวลา | บทบาท | TSR/หน้า | ข้อมูลทดสอบ/ID | Expected | Actual | PASS/FAIL/BLOCKED | Screenshot/Network evidence |
| ----------- | ----- | -------- | -------------- | -------- | ------ | ----------------- | --------------------------- |
|             |       |          |                |          |        |                   |                             |

เมื่อพบ Fail ให้เก็บ URL, role, record ID, ขั้นตอนที่ทำ, HTTP status/response body, เวลา และ screenshot โดยไม่ใส่ token, password, เลขบัตร หรือข้อมูลส่วนบุคคลลงในหลักฐาน
