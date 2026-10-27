# ตรวจซ้ำการส่งงาน CS ↔ Trust and Safety — 26 ตุลาคม 2026

อัปเดต 27 ตุลาคม 2026: ทั้ง 4 จุดในรายงานนี้ได้รับการแก้ใน working tree แล้ว ดูผลและขอบเขตการแก้ใน [รายงานการแก้](cs-ts-handoff-fixes-2026-10-27.md) เนื้อหาด้านล่างเก็บผล audit ก่อนแก้ไว้เพื่ออ้างอิง

ตรวจจาก working tree บน `main` ที่รวมการแก้คิวส่งต่อ ชื่อทีม และไอคอนจากรอบก่อน ยังไม่ commit/push

**ผล: พบข้อผิดพลาดที่ยืนยันได้ 4 จุด** รอบนี้เป็น audit และจำลองอาการ ไม่ได้แก้พฤติกรรมทั้ง 4 จุด

## 1. [P1] Ticket ที่ระบบส่งต่อเพราะเกิน SLA ก่อน CS รับงาน ไม่มีเจ้าหน้าที่ตอบลูกค้า

### วิธีเกิด

1. ลูกค้าเปิด ticket ใหม่ ยังไม่มี assignment และ `chatResponderId` เป็น null
2. เลยกำหนด SLA; `ticketModel.escalateOverdue()` เปลี่ยนเป็น ESCALATED
3. CS รับ ticket ที่ ESCALATED ไม่ได้
4. T&S รับ ticket ได้ แต่การรับงานด้วย role T&S ไม่ได้กำหนด CS ผู้ตอบแชต
5. CS ส่งข้อความไม่ได้เพราะไม่ได้เป็น owner/responder; T&S ส่งข้อความสาธารณะไม่ได้ตามนโยบายอ่านอย่างเดียว

### ผลที่วัดได้กับฐานข้อมูลทดสอบ

| รายการ | ผล |
| --- | --- |
| สถานะหลัง T&S รับ | ESCALATED |
| chatResponderId | null |
| CS รับงานก่อน T&S รับ | HTTP 403 |
| CS รับงานหลัง T&S รับ | HTTP 409 |
| CS ตอบลูกค้าหลัง T&S รับ | HTTP 403 |
| T&S ตอบลูกค้า | HTTP 403 |

ข้อมูลเคสยังอยู่ แต่ช่องทางตอบลูกค้าของเจ้าหน้าที่ติดขัดตาม API ปัจจุบัน

จุดต้นเหตุ: `backend/services/support-service/src/features/tickets/ticketModel.js:759` และ `ticketService.js:262`, `:294`, `:313`

แนวแก้: กำหนด flow รับผิดชอบการสื่อสารสำหรับเคสที่ auto-escalate ก่อนมี CS เช่น ให้ CS รับเฉพาะหน้าที่ responder ขณะ T&S ยังเป็นผู้ตรวจสอบ ไม่ควรปลดสิทธิ์ T&S หรือลดสถานะเคสโดยอัตโนมัติเพียงเพื่อเปิดแชต

เกณฑ์รับงานแก้: auto-escalate จาก NEW ทั้งก่อนและหลัง T&S รับ ต้องมีวิธีกำหนด CS responder ที่ผ่านสิทธิ์และ concurrency check และ CS คนอื่นยังตอบไม่ได้

## 2. [P2] ข้อพิพาทปรากฏใน “ปิดแล้ว” ของ CS แต่เปิดรายละเอียด/แชตไม่ได้

### วิธีเกิด

CS รับข้อพิพาท → ส่งต่อ T&S → T&S รับและตัดสิน → CS เปิดแท็บปิดแล้วและเลือกเคสเดิม

`disputeModel.listQueue(scope=closed)` ตั้งใจรวมเคสที่ CS เคยได้รับหรือเป็นผู้ส่งต่อ แต่สิทธิ์ watcher ใน `workspacePolicy` และสิทธิ์แชตสิ้นสุดทันทีเมื่อเป็น DECIDED

### ผลที่วัดได้กับฐานข้อมูลทดสอบ

| รายการ | ผล |
| --- | --- |
| GET คิว CS scope=closed | HTTP 200 มีเคส |
| capabilities.canViewDetail ของเคสในคิว | false |
| GET รายละเอียดด้วย CS ผู้ส่งต่อ | HTTP 403 |
| POST เปิดแชตด้วย CS ผู้ส่งต่อ | HTTP 403 |

จุดต้นเหตุ: `backend/services/order-service/src/features/disputes/disputeModel.js:220`, `workspacePolicy.js:14`, `disputeService.js:52`, `disputeChatAccessRoutes.js:30`

แนวแก้: ทำขอบเขตประวัติและสิทธิ์อ่านย้อนหลังให้ตรงกัน หากประวัติตั้งใจให้ CS ที่เคยเกี่ยวข้องเปิดอ่านได้ ต้องเปิดเฉพาะ read-only ของเคสนั้น ทั้ง API รายละเอียดและแชต โดยยังห้ามแก้ข้อมูล/ส่งข้อความหลังตัดสิน ห้ามขยายให้ CS ทุกคนอ่านเคสได้

เกณฑ์รับงานแก้: CS ที่เคยเกี่ยวข้องเห็นคิวและอ่านผลได้, CS ที่ไม่เกี่ยวข้องยังถูกปฏิเสธ, ทุกคนที่ไม่มีสิทธิ์เขียนยังส่งข้อความไม่ได้

## 3. [P2] คิว CS ที่เปิดค้างไม่อัปเดตเมื่อ T&S ส่งงานกลับ

`useCaseWorkspace` โหลดคิวเมื่อ mount เปลี่ยน filter หรือเรียก refresh หลัง action ของตัวเอง แต่ไม่มี polling, focus refresh หรือ subscription รับการส่งคืนงานจากอีกฝั่ง

จำลอง hook จริงโดยให้ API มีงานส่งคืนเพิ่มเข้ามา หลังจากนั้นเลื่อนเวลา 120 วินาทีและส่ง event focus:

```json
{"elapsedSeconds":120,"focusTriggered":true,"queueRequests":1,"visibleCases":0,"upstreamCases":1}
```

งานอยู่ใน backend แล้ว แต่ CS อาจยังเห็นคิวว่างหรือเห็นข้อมูลเดิมจนกด refresh เปลี่ยน filter หรือเปิดใหม่

จุดต้นเหตุ: `frontend/components/support/workspace/useCaseWorkspace.js:189`, `:286`, `:382`

แนวแก้: เพิ่มการรับ event และ/หรือ polling/focus refresh ตาม config กลาง โดยไม่ remount แชตหรือทับข้อความร่าง และใช้ request generation ป้องกันข้อมูลเก่าทับเคสที่เลือกใหม่

เกณฑ์รับงานแก้: CS เปิดหน้าค้างแล้วเห็นเคสตีกลับภายในช่วงเวลาที่กำหนด โดยยังพิมพ์แชต/อัปโหลด/เปลี่ยนเคสได้ปลอดภัย

## 4. [P2] รายละเอียดข้อพิพาทที่ T&S เปิดค้างยังขึ้น “รอ CS” หลัง CS ส่งกลับมาแล้ว

คิว T&S มีการ refresh ทุก 15 วินาทีแล้ว แต่ข้อมูล `selectedDispute` และ detail ภายใน `AdminDisputeAuditPanel` ไม่ได้ refresh ตามคิว; effect ของ detail ทำงานเมื่อ `dispute.id` หรือ token เปลี่ยนเท่านั้น

จำลอง panel จริง: เริ่มจากสถานะส่งกลับให้ CS แล้วเปลี่ยนข้อมูล upstream ของ dispute เดิมให้กลับมาอยู่คิว T&S และรับงานได้:

```json
{"detailRequests":1,"stillShowsWaitingForCs":true,"canClaimInPanel":false,"upstreamCanClaim":true}
```

เคสกลับมาแล้ว แต่ modal เดิมยังรอ CS และไม่มีปุ่มรับงาน ต้องปิดและเปิดใหม่

จุดต้นเหตุ: `frontend/components/support/sections/admin-inbox/AdminDisputeAuditPanel.js:35`, `:43` และ `frontend/components/support/sections/AdminInboxSection.js:634`

แนวแก้: refresh detail ของเคสที่เปิดเมื่อ version เปลี่ยน/ได้รับ event/กลับมา focus หรือ polling ที่ปลอดภัย ต้องไม่ทับเหตุผลที่เจ้าหน้าที่กำลังร่าง และปิดปุ่ม action ที่ใช้ version เก่าระหว่าง reconcile

เกณฑ์รับงานแก้: เปิด panel ค้างตลอดรอบตีกลับ-ส่งคืนแล้วเปลี่ยนเป็นข้อมูลล่าสุดและรับงานได้ โดยไม่ต้องปิดเปิด และข้อมูลเก่าห้ามย้อนทับเคสใหม่

## Flow ที่ตรวจซ้ำแล้วผ่าน

- Ticket ที่ CS รับก่อนส่งต่อ: เข้าคิว unassigned ของ T&S, takeover แล้วออกจาก unassigned ไป mine, CS เดิมยังตอบลูกค้าได้, การเปลี่ยนเจ้าของ/สถานะมี version check
- Dispute ปกติ: CS รับ → ส่ง memo → T&S รับ → ส่งกลับ CS พร้อม checklist → CS บันทึกผล → ส่งกลับ T&S โดยเก็บผล checklist → ตัดสินและเข้าประวัติ T&S
- สิทธิ์ระหว่างรอตรวจ: CS ผู้ส่งต่อดูข้อพิพาทแบบ read-only; CS อื่นเข้าไม่ได้; ผู้ซื้อและผู้ขายใช้ห้องแชตแยกกัน
- การรับงานพร้อมกัน, reassign ชน decision, decision ชน hold, การคืนเงิน/ปล่อยเงิน และไม่ให้เปลี่ยนผลที่ตัดสินแล้ว ยังคงผ่านชุดทดสอบเดิม

## หลักฐานและข้อจำกัด

- รัน integration tests ของ dispute flow/queue/decision/ownership-hold/chat-history: 15 tests ผ่าน ไม่ skip
- รัน integration tests ของ ticket lifecycle: 2 tests ผ่าน ไม่ skip
- รัน frontend tests ของ CaseWorkspace, ReturnToCsDialog, EscalationMemoDialog, CaseHandoffBanner, AdminInboxSection, AdminInboxDecision, AdminDisputeAuditPanel: 7 suites / 33 tests ผ่าน
- เพิ่ม probe ชั่วคราวเพื่อจำลอง 4 อาการข้างต้น: สองกรณีใช้ฐานข้อมูลทดสอบจริง สองกรณีใช้ hook/component จริงกับ API จำลอง ผลที่บันทึกไว้ยืนยันอาการผิด ไม่ได้หมายความว่าอาการเหล่านั้นถูกแก้แล้ว ลบไฟล์ probe หลังเก็บผล
- ฐานข้อมูลใช้ `reloop_ci_reference_order` และ `reloop_ci_reference_support`; ไม่ทดลองตัดสินหรือเปลี่ยนสถานะเคสใช้งานจริง
- ผลรอบนี้เป็นการอ่าน source, ทดสอบ API/ฐานข้อมูล และจำลอง React; ไม่ใช่การเดินครบทุกกรณีผ่าน browser หรือยืนยันการส่ง notification ระหว่างบริการจริงทุกชนิด บาง integration tests มีการจำลองปลายทางแชต/การยืนยัน session และมี log ว่าส่ง notification ในบริบทเทสต์ไม่สำเร็จ
- คิว report ใช้ T&S รับและพิจารณาโดยตรง ไม่ใช้ flow ส่งต่อ/ตีกลับ CS ของข้อพิพาท จึงไม่ได้ใช้ผล audit นี้อ้างว่า report ทุกกรณีถูกทดสอบใหม่

ลำดับแก้ที่แนะนำ: ข้อ 1 → ข้อ 2 → ข้อ 3 และ 4 พร้อม regression tests เฉพาะเงื่อนไขที่พบใหม่
