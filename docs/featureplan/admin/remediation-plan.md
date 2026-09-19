# แผนแก้ไขและเติมความสามารถ Trust & Safety

วันที่: 2026-09-18  
สถานะ: **แผนเสนอให้ตรวจ — ยังไม่ได้เริ่ม implementation**  
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

| ช่วง | งาน | ผลที่ต้องได้ก่อนผ่านช่วงนี้ |
| --- | --- | --- |
| 0 | TSR-00 เก็บ baseline และเตรียมข้อมูลทดสอบ | แยกปัญหา source/runtime/data ได้ และมีฐานข้อมูลทดสอบแยก |
| 1 — เร่งด่วน | TSR-01 บังคับ Ban/RBAC, TSR-02 สถานะ Hold/Dispute, TSR-03 คำสั่งซ้ำ/พร้อมกัน, TSR-04 การซ่อนสินค้า | คำสั่ง T&S มีผลจริง ไม่ถูก flow อื่นทับ และ UI ไม่อ้างสำเร็จผิด |
| 2 — ทำของเดิมให้ใช้ครบ | TSR-05 Inbox, TSR-06 KYC, TSR-07 ประวัติผู้ใช้, TSR-08 Audit, TSR-09 Ticket/FAQ/Dashboard | เจ้าหน้าที่ใช้ของที่มีอยู่ได้ครบและเห็นข้อมูลจริง |
| 3 — เติม flow ตามเล่ม | TSR-10 หลักฐาน/Chat/พัสดุ, TSR-11 ขอข้อมูลเพิ่ม, TSR-12 แจ้งผล, TSR-13 ลงโทษทั้งบัญชี/อุทธรณ์, TSR-14 Bulk UI | ครบวงจรรับเรื่อง → ตรวจ → ตัดสิน → แจ้งผล → ทบทวน |
| 4 | TSR-15 ตรวจรับรวมและปรับเอกสาร | มีหลักฐาน PostgreSQL/API/browser และสถานะ requirement ที่ตรงกับงานจริง |

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

### TSR-01 — Ban ต้องบล็อกการใช้งานจริง และใช้สิทธิ์ตรงกัน

อ้างอิง `UR-23`, `FR-4.2.3`, `ADM-001` — ระดับ P1

**วิธีทำ**

- ให้ login/refresh ปฏิเสธบัญชีที่ไม่ ACTIVE ด้วย error code ชัดเจน เช่น `ACCOUNT_SUSPENDED`
- Suspend และการบันทึก Audit อยู่ transaction เดียวกัน พร้อม revoke refresh sessions และเพิ่ม revision ของสิทธิ์/session (`authVersion` หรือชื่อที่ตกลงใน contract)
- ตรวจสถานะบัญชีและ revision ปัจจุบันที่ฝั่ง server สำหรับ protected API รวมถึง service ที่ถูกเรียกตรง; ใช้ internal Auth API ที่ยืนยันตัวตนของ service และมี timeout
- เริ่มด้วยการตรวจสดสำหรับคำขอที่ต้องยืนยันตัวตน ไม่ใช้ positive cache ที่ทำให้ Ban ยังใช้งานต่อได้; หาก Auth ตรวจสอบไม่ได้ ให้คืน service unavailable ไม่ปล่อย mutation ผ่าน
- Restore ไม่ทำให้ access/refresh token ที่เพิกถอนไปแล้วกลับมาใช้ได้ ผู้ใช้ต้องรับ session ใหม่
- ส่ง `roles[]/permissions[]` ให้ frontend และปรับ guard ของ Workspace/Support/Order/Product ที่เกี่ยวข้องให้ใช้ contract เดียวกัน; ถอน role แล้ว token เดิมต้องใช้ privileged API ไม่ได้
- ทบทวนสิทธิ์สร้างสินค้าเดิมของ T&S: บทบาท T&S อย่างเดียวไม่ควรได้สิทธิ์ขายหรือข้าม KYC; หากมี SELLER ร่วม ต้องผ่านกฎ Seller ปกติ

**ไฟล์หลัก:** `authService.js`, `reportService.js`, Auth schema, `backend/shared/src/authMiddleware.js`, `permissions.js`, gateway, `frontend/lib/auth.js`, Workspace และ service guards ที่เกี่ยวข้อง

**ผ่านเมื่อ**

- [ ] หลัง Ban: login/refresh ถูกปฏิเสธ และ token ที่ออกก่อน Ban เรียก protected API ไม่ได้
- [ ] หลัง Restore: session เก่ายังถูกปฏิเสธ แต่ login ใหม่ได้
- [ ] T&S+บทบาทอื่นเข้า Workspace ได้ตาม permission; Buyer/CS เรียกคำสั่งเฉพาะ T&S ไม่ได้
- [ ] Auth ขัดข้องไม่ทำให้คำสั่งที่ต้องตรวจสถานะหลุดผ่าน และทดสอบผลต่อ latency

### TSR-02 — รวมกฎ Hold/Release กับการตัดสินข้อพิพาท

อ้างอิง `UR-26`, `FR-3.2.4`, `WF-08` — ระดับ P1

**วิธีทำ**

- สร้าง transition service กลางใน Order ให้ Admin hold/release, dispute decision และเส้นทางเปลี่ยนสถานะคำสั่งซื้อใช้กฎเดียวกัน
- แยกเหตุพักเงินตามต้นทางอย่างชัดเจน: เคสข้อพิพาท, คำสั่ง T&S รายออเดอร์ และการลงโทษบัญชีใน TSR-13; ใช้ hold records ที่ระบุ source/reference เพื่อปล่อยเฉพาะเหตุที่ตัวเองเป็นเจ้าของ
- ให้ `payoutHeld` เป็นผลที่คำนวณจากเหตุพักเงินที่ยัง active; ถ้าคง field เดิมไว้เพื่อ compatibility ต้องอัปเดตพร้อมกันใน transaction
- การตัดสิน CS ปิดได้เฉพาะเหตุพักเงินของ dispute ไม่ยกเลิก Hold ของ T&S
- Release ไม่คืน `preDisputeStatus` แบบไม่มีเงื่อนไข โดยเฉพาะเมื่อมีผลตัดสิน `refunded/completed` แล้ว; แยกผลตัดสินกับความพร้อมจ่ายเงิน
- ตรวจ state/version ในคำสั่งเขียนจริง เช่น conditional update และเช็ก affected rows; ทุกเส้นทางที่แตะสถานะต้องใช้ concurrency contract เดียวกัน
- ป้องกัน participant status API, payment และ internal status commands เปลี่ยนข้ามกฎของเคส/hold ที่กำลังเปิด
- ระบุออเดอร์ที่มีสิทธิ์ Hold ตาม lifecycle ปัจจุบัน ไม่อนุมานว่า `completed` หมายถึงส่งของแล้ว เพราะระบบปัจจุบันใช้ค่านี้หลังจ่ายเงินจำลอง
- มี migration/backfill ที่ตรวจความขัดแย้งระหว่าง `payoutHeld`, `paymentSimulationStatus`, dispute และ audit; ข้อมูลกำกวมต้องอยู่ในรายการให้ตรวจ ไม่ปล่อยเงินเองโดยอัตโนมัติ

**ไฟล์หลัก:** Order schema, `adminDisputeService.js`, `disputeModel.js`, `orderModel.js`, `orderController.js`, หน้า Hold และ Dispute

**ผ่านเมื่อ**

- [ ] CS ตัดสินขณะ T&S Hold → เหตุพักเงินของ T&S ยังคงอยู่
- [ ] T&S Release ขณะ CS ยังตรวจ → เคสยังพักเงินอยู่
- [ ] Release หลัง Refund → ไม่เปลี่ยนออเดอร์กลับเป็น disputed หรือพร้อมจ่ายให้ผู้ขาย
- [ ] ผู้ซื้อ/ผู้ขายใช้ API อื่นปลด Hold หรือคืนสถานะเองไม่ได้
- [ ] สั่งพร้อมกันหรือส่ง version เก่า → ได้ผลถูกต้องหนึ่งครั้ง ที่เหลือ conflict พร้อมให้ reload

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

**ผ่านเมื่อ:** double-click, concurrent request, timeout หลังปลายทางทำสำเร็จ, partial failure และ retry ไม่สร้างผลหรือ Audit ซ้ำ และ UI ไม่แสดง success เมื่อคำสั่งล้มเหลว

### TSR-04 — สินค้าที่ถูกระงับต้องไม่เผยแพร่กลับผ่านช่องทางอื่น

อ้างอิง `UR-24`, `FR-4.2.5` — ระดับ P1

**วิธีทำ**

- Public product detail ไม่คืนเนื้อหาสินค้าที่ถูกระงับ; staff detail แยก route และตรวจ permission เพื่อยังตรวจหลักฐานได้
- กำหนด seller view ที่เหมาะสม: ดูเหตุผลการระงับของตัวเองได้ แต่แก้ไขสถานะให้กลับมาเผยแพร่เองไม่ได้
- ตรวจ feed/search/store/video/checkout และ internal lifecycle ของ reservation/order ไม่เขียนทับสถานะ moderation
- Restore เช็กสถานะซื้อขายและเหตุระงับอื่นที่ยังค้างก่อนคืนการมองเห็น ไม่ใช้ `preRemovalStatus` ที่ล้าสมัยอย่างเดียว
- เก็บความสัมพันธ์ moderation กับ product/audit ให้ค้นย้อนจากสินค้าได้ แม้เริ่มจาก Report
- แยกการปิด public detail ออกจากการลบไฟล์ media เดิม: นโยบายไฟล์สาธารณะ/CDN ต้องกำหนดเพิ่ม หากต้องถอนสื่อจาก URL โดยตรงด้วย

**ผ่านเมื่อ:** หลัง Remove สินค้าไม่ปรากฏ/ซื้อไม่ได้ผ่าน public flows และ cancellation/payment ไม่ทำให้กลับมา available; T&S ยังดูหลักฐานและคืนสถานะที่ถูกต้องได้

### TSR-05 — Inbox: Report กับ Ticket ต้องค้น/แบ่งหน้าได้ถูกต้อง

อ้างอิง `UR-24`, `WF-09` — ระดับ P2

**วิธีทำ**

- คงแท็บหลัก “เคส Trust & Safety” แต่แยกย่อย “รายงาน” และ “เคสส่งต่อ” ให้มี filter/pagination ของตัวเอง แทนการ merge สองหน้าจากคนละ service แล้วใช้จำนวนหน้ามากสุด
- ส่ง page/limit/search/status จริงทั้งสองประเภท และเพิ่ม query contract ของ Report ให้รองรับคำค้นที่ UI เสนอ
- แสดง error พร้อม retry ของแหล่งข้อมูลที่ล้มเหลว ไม่แสดงรายการว่างแทนความผิดพลาด
- เปิดเคสแล้วโหลด detail ล่าสุด มีชื่อ/รหัสผู้แจ้งและคู่กรณี รายละเอียดสินค้า และทางลัดประวัติผู้ใช้; คงการแยกคู่กรณีออกจากผู้แจ้ง
- เพิ่มหมวดเหตุผลและไฟล์หลักฐาน Report ตาม WF-09 โดยใช้ที่เก็บ private และ authorization แบบเดียวกับหลักฐานข้อพิพาท
- เคสปิดแล้วต้องดูผลตัดสิน เหตุผล ผู้ตัดสิน และวันเวลาได้

**ผ่านเมื่อ:** มีข้อมูลเกินสองหน้าแล้วเปิดได้ทุกรายการ, ค้น Report ได้จริง, service ใดล่มเห็น error ชัด และรายงานใหม่จาก Buyer/Seller ไปถึง T&S พร้อมหลักฐานครบ

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

**ผ่านเมื่อ:** PENDING/VERIFIED/REJECTED/ALL ตรง DB, resubmit เก็บประวัติเดิม, ตัดสินพร้อมกันไม่ทับกัน และเอกสารทดสอบยังเปิดได้หลัง recreate container

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
- เนื่องจาก chat-service ปัจจุบันมีเพียง health route งานนี้ต้องมี Chat provider จริงก่อนจึงตรวจรับประวัติ buyer–seller ได้; Ticket reply ใน TSR-09 ใช้แทนประวัติซื้อขายไม่ได้
- ให้ Order/fulfillment ส่งเลขติดตาม บริษัทขนส่ง และ timeline ที่มี source/timestamp; ระยะแรกใช้ข้อมูลที่บันทึกจริงหรือข้อมูลทดสอบระบุชัด ไม่อ้างว่าเชื่อม carrier สด
- ประสานนิยามสถานะ paid/shipped/received กับ Order ก่อนเปลี่ยนกฎเปิด dispute ให้ตรงช่วงก่อนยืนยันรับของตาม WF-08; ไม่เพิ่ม tracking UI บน lifecycle ที่ยังแยกไม่ออก
- การคุยสดกับลูกค้าจาก drawer เป็นงานต่อยอดแยกจาก requirement อ่านประวัติแชท ต้องระบุสถานะให้ตรงกับสิ่งที่รองรับ

**ผ่านเมื่อ:** ผู้ซื้อแนบไฟล์แล้ว T&S เห็นไฟล์เดียวกันทั้ง Dispute/Hold, อ่านประวัติแชทของออเดอร์ได้, เห็นข้อมูลจัดส่งจริง และผู้ไม่มีสิทธิ์เปิดหลักฐาน/บทสนทนาไม่ได้

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

### TSR-13 — ลงโทษทั้งบัญชีและอุทธรณ์ 7 วัน

อ้างอิง `WF-09` ขั้นที่ 5–7 — ระดับ P2; เริ่มหลัง TSR-01–04 และ TSR-12

**วิธีทำ**

- แยก account sanction จากการระงับรายสินค้า/รายออเดอร์ เก็บ case/actor/reason/start/deadline/outcome และ operation ID
- Ban ปิดสิทธิ์บัญชีทันทีใน Auth แล้วส่ง owner commands ไป Order เพื่อพักออเดอร์ที่มีสิทธิ์ และ Product เพื่อซ่อนสินค้าของผู้ขาย
- ตรวจออเดอร์/สินค้าที่เกิดพร้อมการ Ban ด้วยการตรวจสถานะบัญชี ณ จุดทำรายการร่วมกับ retry/reconciliation; ไม่พึ่งการกวาดข้อมูลรอบเดียว
- ใช้ persisted operation/outbox และผลราย service; ถ้าบางส่วนทำไม่สำเร็จ ให้แสดง “ระงับบัญชีแล้ว แต่กำลังดำเนินการกับสินค้า/ออเดอร์” พร้อม retry ไม่แสดงว่าทั้งหมดสำเร็จ
- รองรับอุทธรณ์ภายใน 7 วันจากเวลาลงโทษที่ server กำหนด พร้อมเหตุผล/หลักฐาน/สถานะ/ผลตัดสิน
- บัญชีที่ถูก Ban ต้องยังยื่นอุทธรณ์ของตัวเองได้ผ่าน session ที่จำกัดเฉพาะ appeal หลังยืนยันตัวตน; ไม่อนุญาตให้ใช้ restricted session กับ API ซื้อขายทั่วไป
- เมื่อยกเลิก Ban ให้คืนเฉพาะสิทธิ์/การซ่อน/เหตุ Hold ที่เกิดจาก sanction นี้ ไม่ปลดคำสั่งอิสระจากเคสอื่นและไม่แก้ผล Refund
- พ้นกำหนดหรือยืนยันโทษเดิมคงสถานะระงับ พร้อมบันทึกผลและแจ้งผู้ใช้

**ผ่านเมื่อ:** Ban ข้าม service สำเร็จครบหรือเห็นสถานะค้างที่ตามต่อได้, retry ไม่ทำซ้ำ, อุทธรณ์ภายใน/พ้น 7 วันถูกต้อง และ Restore ไม่ปลด Hold/ซ่อนสินค้าจากคดีอื่น

### TSR-14 — Bulk UI สำหรับคำสั่งที่ Backend รองรับ

อ้างอิง `ADM-005` — ระดับ P3; เริ่มหลัง TSR-03

**วิธีทำ**

- เพิ่มการเลือกหลายบัญชีสำหรับ Suspend/Warn/Restore พร้อมจำนวนไม่เกิน 100, เหตุผล และ preview/dry-run
- Preview ระบุผลที่คาด ไม่รับประกันว่าทำจริงจะสำเร็จ เพราะสถานะอาจเปลี่ยนระหว่างนั้น
- ยืนยันแล้วแสดง succeeded/failed รายบัญชีและเหตุผล; retry เฉพาะรายการล้มเหลวด้วย operation ใหม่ที่เชื่อมกับต้นฉบับ
- timeout ของคำสั่งเดิมให้ query/replay operation เดิม ไม่สร้าง key ใหม่จนเสี่ยงทำซ้ำ
- ไม่เพิ่ม bulk auction ในงานนี้

**ผ่านเมื่อ:** จำกัด batch, dry-run ไม่เขียนข้อมูล, partial failure ไม่ขัดขวางรายการอื่น, retry พร้อมกันไม่ทำซ้ำ และ UI/Audit ตรงผลจริง

### TSR-15 — ตรวจรับทั้ง flow และปรับเอกสาร

- [ ] รัน unit tests เฉพาะกฎสำคัญ และ integration ด้วย `REQUIRE_INTEGRATION=1` บน PostgreSQL ทดสอบแยก; DB เข้าไม่ได้ต้อง fail
- [ ] ทดสอบผ่าน Gateway → owner services → DB จริง สำหรับ KYC, Report, moderation, hold และ Ticket; mock อย่างเดียวไม่นับเป็น acceptance
- [ ] ทดสอบจาก browser ด้วยบทบาท T&S/CS/Buyer/Seller/หลายบทบาท และตรวจ API โดยตรงสำหรับ authorization
- [ ] ทดสอบ concurrent writes, token ก่อน Ban, partial service failure, timeout/retry และกรณีมากกว่าหนึ่งหน้า
- [ ] ทดสอบ evidence persistence หลัง recreate container บน stack ทดสอบ
- [ ] ตรวจ empty/error/loading/stale state และ mobile layout ของหน้าที่แก้
- [ ] วัดเวลาหน้าค้นหา/ประวัติ/Dashboard ตาม `NFR-P-01` โดยระบุขนาดข้อมูลและสภาพแวดล้อม; ถ้าไม่ถึงเกณฑ์ให้คงเป็นงานค้าง
- [ ] ปรับ progress/handoff/traceability ให้แยก Implemented, Verified, Blocked by provider, Deferred และบันทึกวันที่/ผลทดสอบจริง

## 4. ข้อตกลงทางเทคนิคที่เสนอให้ใช้

| เรื่อง | แนวทางเสนอ | เหตุผล |
| --- | --- | --- |
| Inbox รวมสองระบบ | แยกแท็บย่อยภายในพื้นที่ T&S เดิม | ค้นและแบ่งหน้าได้ถูกต้องโดยไม่สร้างฐานข้อมูลรวมเพิ่ม |
| Ban ทันที | ตรวจบัญชี/session revision ปัจจุบันที่ server | token ก่อน Ban ต้องหยุดใช้ได้ ไม่รอหมดอายุ 15 นาที |
| หลายฝ่ายพักเงิน | Hold แยกตามต้นทาง/เคส | Release ของฝ่ายหนึ่งไม่ปล่อยเงินที่อีกฝ่ายพักไว้ |
| คำสั่งข้าม service | persisted operation + idempotency + retry | timeout ต้องตรวจผลและทำต่อได้ ไม่เกิดสำเร็จครึ่งทางแบบมองไม่เห็น |
| Audit รวม | อ่านจาก owner API และเลือก source ใน UI | เก็บ ownership เดิมและไม่ทำ pagination ของผลรวมผิด |
| การแจ้งเตือนรอบแรก | in-app ที่บันทึกจริง | ปิด flow แจ้งผู้ใช้โดยไม่ต้องผูกผู้ให้บริการ Email/SMS |
| ข้อมูล Chat/พัสดุ | provider contract และข้อมูลจริง/ทดสอบที่ระบุแหล่งชัด | ไม่รายงาน placeholder ว่าเป็น requirement ที่เสร็จแล้ว |

รายละเอียดเหล่านี้เป็นข้อเสนอในแผน ยังไม่ใช่ decision record ที่อนุมัติแล้ว หากเริ่มพัฒนาค่อยเพิ่ม ADM-DEC ใหม่พร้อมผลกระทบและ compatibility ที่เลือกจริง

## 5. Traceability และงานที่ยังแยกเฟส

| Requirement | งานแก้/เติม |
| --- | --- |
| UR-22 / FR-4.2.1 / WF-01 | TSR-03, TSR-06; รักษา Seller KYC gate และตรวจผลสถานะหลังตัดสิน |
| UR-23 / FR-4.2.2–3 | TSR-01, TSR-03, TSR-07, TSR-13 |
| UR-24 / FR-4.2.4–5 / WF-09 | TSR-03–05, TSR-12–13 |
| UR-25 / FR-3.2.3 / WF-08 | TSR-08, TSR-10–11 |
| UR-26 / FR-3.2.4 | TSR-02, TSR-13 |
| ADM-001 | TSR-01 |
| ADM-005 | TSR-03, TSR-08, TSR-14 |
| Support ที่ T&S ใช้งาน | TSR-05, TSR-09 |

งานที่ไม่ถือว่าเสร็จจากการแก้ Core:

- Production encryption/PDPA/PCI-DSS และ privileged audit hardening ตาม `ADM-DEC-004`; ส่วน functional authorization และการบันทึกผลคำสั่งต้องแก้ใน Core อยู่แล้ว
- Backup แยกเครื่องรายวันตาม `NFR-BR-01` รวมทั้งการกู้คืนและซ้อม restore: ต้องเป็นงาน deployment/operations ที่มีหลักฐานจริง; persistent volume ไม่ใช่ backup
- Payment Gateway/การคืนและโอนเงินจริง, carrier integration และระบบ Chat เต็มรูปแบบ: มี provider dependencies ต่างหาก; T&S integration จะ Verified ได้เมื่อ provider พร้อมและผ่านการทดสอบรวม
- Report รีวิวตาม WF-07 หากยังอยู่ใน release scope: ต้องตกลงกับ Review owner เรื่อง target type, moderation และหลักฐานก่อนขยายจาก Report สินค้า/ผู้ขาย ไม่ถือว่า product report ครอบคลุม review report อัตโนมัติ

## 6. ชุดแรกที่แนะนำให้เริ่ม

เริ่ม `TSR-00 → TSR-01 → TSR-02 → TSR-03 → TSR-04` ก่อน แล้วตรวจรับร่วมกันหนึ่งรอบ ผลที่ต้องเห็นคือแบนแล้วใช้งานไม่ได้จริง, Hold ไม่หลุดจากการตัดสินอีกฝ่าย, คำสั่งพร้อมกันไม่ทับกัน, UI บอกผลตรง และสินค้าที่ถูกระงับไม่กลับมาขายผ่าน flow อื่น จากนั้นจึงต่อคิว/ประวัติ/หลักฐานและ workflow ที่เหลือ

ยังไม่ประมาณระยะเวลารวมเป็นวัน เพราะ Chat, fulfillment และ baseline ของฐานข้อมูลมีผลต่อขนาดงาน ควรประเมินรายชุดหลัง TSR-00 และหลังตรวจ contract กับเจ้าของ service
