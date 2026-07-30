# RE-LOOP Feature Ownership Planning Design

## 1. เป้าหมาย

ปรับแผน RE-LOOP จากการแบ่งงานตามชั้นเทคนิค เช่น Database, API และ Frontend
เป็นการแบ่งแบบ Vertical Feature ตามผู้ให้สัมภาษณ์ 6 บทบาท เพื่อให้สมาชิกแต่ละคนรับผิดชอบ
ประสบการณ์ของผู้ใช้หนึ่งกลุ่มตั้งแต่ UI, API, business logic, database change ที่จำเป็น
ไปจนถึง automated test และเอกสารหลักฐาน แล้วจึงรวมงานผ่านสัญญากลางที่ตรวจสอบได้

แผนใหม่นี้ไม่ลบหรือเปลี่ยนความหมายของ Task ID, Decision ID และหลักฐานเดิมใน
`docs/planmain.md`, `docs/planadminweb.md`, `docs/progress.md` หรือ `docs/changelog.md`
งาน prototype ที่มีอยู่ถึง `MOCK-TRADE-007` จะถูกตรวจจาก source และ test ปัจจุบันก่อนนำมา
อ้างว่าเป็นส่วนใดของ feature ใหม่

## 2. ผู้รับผิดชอบและขอบเขต Feature

| Feature          | Owner                    | Core รอบรวมระบบแรก                                                                                  | Extended หลัง Core ผ่าน                                            |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Buyer            | วิศิษฏ์ เจียมสันต์       | Catalog/search/filter, cart lock, mock checkout, order tracking, review seller                      | Personalized feed, wishlist, swipe, auction participation          |
| Seller           | เอกตระการ บุญญกาศ        | Seller onboarding, test-KYC submission, listing/media, inventory, seller dashboard, shipping action | Price recommendation, chat quick replies, auction submission       |
| Customer Service | อชิรวินท์ จรูญกีรติโรจน์ | Order lookup, support chat, case evidence, refund/return decision                                   | FAQ/How-to management, SLA priority, support analytics             |
| Admin            | สิรดนัย กันหา            | Test-KYC approval, report moderation, ban/suspend, dispute evidence, simulated fund hold            | Auction moderation, bounded bulk operations, advanced audit search |
| Marketing        | ศิวกร วรวัฒน์อมรชัย      | Campaign/promotion CRUD, preview/approval/publish, basic conversion dashboard                       | Segmentation, knowledge content, auction campaign, swipe strategy  |
| Executive        | อัสนัย เมืองรอด          | Read-only GMV/revenue/user totals, top categories/products, monthly/yearly comparison               | Anomaly alert, CSV/PDF export, executive drill-down                |

ชื่อ Feature และ Owner อ้างอิงจากผู้สัมภาษณ์และ Role ใน
`docs/S2G5_RE-LOOP_ISE.md` ส่วน User Requirements สมาชิกแต่ละคนเป็นเจ้าของการประสาน
requirement ของ Role นั้น แต่ไม่สามารถเปลี่ยน shared contract หรือ approve งานของตนเองได้
โดยลำพัง

## 3. โครงสร้างเอกสาร

```text
docs/
└── featureplan/
    ├── README.md
    ├── integration.md
    ├── plan.md
    ├── progress.md
    ├── changelog.md
    ├── teachme.md
    ├── buyer/
    │   ├── plan.md
    │   ├── progress.md
    │   ├── changelog.md
    │   └── teachme.md
    ├── seller/
    │   ├── plan.md
    │   ├── progress.md
    │   ├── changelog.md
    │   └── teachme.md
    ├── customer-service/
    │   ├── plan.md
    │   ├── progress.md
    │   ├── changelog.md
    │   └── teachme.md
    ├── admin/
    │   ├── plan.md
    │   ├── progress.md
    │   ├── changelog.md
    │   └── teachme.md
    ├── marketing/
    │   ├── plan.md
    │   ├── progress.md
    │   ├── changelog.md
    │   └── teachme.md
    └── executive/
        ├── plan.md
        ├── progress.md
        ├── changelog.md
        └── teachme.md
```

`README.md` เป็นสารบัญ แสดง Owner, Reviewer, Core/Extended status, dependency และลิงก์
ไปยังเอกสารของแต่ละ Feature ส่วน `integration.md` เป็นสัญญากลางและลำดับ merge

ไฟล์ `plan.md`, `progress.md`, `changelog.md` และ `teachme.md` ที่ root เป็นมุมมองรวมของทั้ง
โครงการ โดยสรุปและลิงก์ข้อมูลจากไฟล์ชื่อเดียวกันของทั้งหก Feature ไม่แทนที่ไฟล์ย่อย
และไม่เพิ่มสถานะหรือหลักฐานที่ไม่มีอยู่ในไฟล์ย่อย

## 4. หน้าที่ของเอกสารแต่ละไฟล์

### `plan.md`

- เป็นขอบเขตงานที่ได้รับอนุมัติ ไม่ใช่ไฟล์สถานะรายวัน
- เชื่อม Story ID, UR ID, Use Case ID และ requirement ที่ Feature ต้องรับผิดชอบ
- แบ่ง Core และ Extended ชัดเจน
- ระบุ dependency, API/event contract, database ownership, expected files และสิ่งที่ห้ามแก้
- แบ่งงานเป็นรอบเล็กที่จบด้วยผลลัพธ์ทดสอบได้
- ทุก Task มี acceptance criteria, test cases, security/privacy concern, rollback และ reviewer
- การเปลี่ยนขอบเขตหลังอนุมัติต้องผ่าน review และบันทึกเหตุผลใน `changelog.md`

### `progress.md`

- เป็นสถานะปัจจุบันเพียงแหล่งเดียวของ Feature นั้น
- แสดงรอบที่กำลังทำ, Owner, Reviewer, สถานะ, dependency/blocker, หลักฐานล่าสุด
  และ next action หนึ่งรายการ
- ใช้สถานะ `Not started`, `In progress`, `Review`, `Blocked` หรือ `Done`
- `Done` ใช้ได้ต่อเมื่อ acceptance criteria ผ่าน มีผล test จริง และ reviewer คนอื่นลงชื่อ
- เมื่องานเปลี่ยนรอบ ให้แทนที่สถานะปัจจุบัน ไม่สะสมประวัติยาวในไฟล์นี้

### `changelog.md`

- เป็นประวัติแบบ append-only เรียงตามวันที่และรอบ
- บันทึกสิ่งที่เปลี่ยนจริง, ไฟล์หรือ contract ที่กระทบ, migration, ผล verification,
  commit/PR/merge และเหตุผลของการปรับแผน
- การมีรายการใน Changelog ไม่ได้แปลว่า Feature หรือ Task เสร็จ
- ห้ามลบ failed check หรือข้อจำกัดเดิม; ให้เพิ่มรายการใหม่ที่อธิบายการแก้และผลตรวจซ้ำ

### `teachme.md`

- อัปเดตอย่างน้อยหนึ่งบทเรียนเมื่อจบแต่ละรอบ ไม่รอจน Feature เสร็จทั้งหมด
- สอนจากงานที่ลงมือทำหรือสิ่งที่ตรวจพบจริงในรอบนั้น ไม่เขียนแผนอนาคตเป็นข้อเท็จจริง
- แต่ละบทเรียนประกอบด้วย: เป้าหมาย, data/request flow, เหตุผลการออกแบบ, จุดพลาดที่พบ,
  วิธีตรวจ, ผลตรวจจริง และคำถาม teach-back สั้น ๆ ให้สมาชิกคนอื่นตอบได้
- ถ้ารอบนั้น Blocked ให้สอนสิ่งที่พิสูจน์ได้เกี่ยวกับ blocker และระบุสิ่งที่ยังยืนยันไม่ได้
- แยกหัวข้อ Security, API, Database, Testing หรือ Performance เฉพาะเมื่อเกี่ยวข้องจริง

## 5. หลักการแยก Source Code

หนึ่ง Feature เป็นเจ้าของ vertical slice แต่ไม่ได้เป็นเจ้าของ microservice ทั้งก้อนโดยอัตโนมัติ
เพราะ Product, Order, Auth, Review และ Chat ถูกใช้ข้าม Role ให้แยก module ตาม business
capability ภายในรูปแบบเดิมของ repository และประกาศ interface ให้ชัดก่อนมี consumer

ไฟล์ที่ทุก Feature มีโอกาสแก้ร่วมกัน ได้แก่ Gateway route registry, service `app.js`,
Prisma schema, `backend/shared`, shared frontend navigation/session และ root configuration
ไฟล์เหล่านี้ถือเป็น Integration Surface การแก้ต้องอยู่ใน Task ที่ระบุชัด มี reviewer
จาก Feature ที่ได้รับผลกระทบ และ merge แยกจาก business implementation เมื่อทำได้

แต่ละ Task ใช้ feature branch ของตัวเอง ห้ามรวมหลาย Feature ที่ไม่เกี่ยวข้องใน branch เดียว
และห้าม merge consumer ที่เดาชื่อ field/status/event ก่อน provider contract ผ่าน review

## 6. Shared Contract และ Data Flow

ก่อนทำ Core พร้อมกัน ทีมต้องยืนยัน Integration Gate 0:

1. User ID, Product ID, Order ID และ Case ID ใช้ชนิดและชื่อเดียวกันทุก service
2. Role/permission และ 401/403 behavior มาจาก Auth/Gateway contract เดียว
3. Product, reservation, order, shipment, dispute และ review states มี transition ที่ระบุชัด
4. API success/error/pagination shape ใช้ shared convention
5. Cross-service event มีชื่อ, version, payload, idempotency key และ owner
6. Database migration มีลำดับ apply/rollback; service ห้ามอ่าน database ของ service อื่น
7. Payment เป็น deterministic mock เท่านั้น และ KYC ใช้ synthetic test data เท่านั้น

Provider/consumer หลัก:

| Provider              | Consumer                                   | Contract                                                |
| --------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Seller/Product        | Buyer, Marketing, Admin                    | Product read/listing/status/media contract              |
| Buyer/Order           | Seller, Customer Service, Admin, Executive | Reservation/order/shipping/dispute projection           |
| Auth                  | ทุก Feature                                | Identity, role, permission, session และ KYC state       |
| Customer Service/Chat | Buyer, Seller, Admin                       | Participant access, support handoff และ evidence access |
| Admin/Moderation      | Seller, Customer Service, Executive        | Report/case decision และ auditable command outcome      |
| Marketing/Campaign    | Buyer, Executive                           | Published campaign and conversion measurement           |
| Executive/Analytics   | ไม่มี write consumer                       | Read-only projection; ห้ามเปลี่ยน source transaction    |

## 7. ลำดับพัฒนาและ Integration Gate

### Gate 0 — Contract baseline

ทีมอนุมัติ shared contract, fixtures และ negative permission cases ก่อน parallel implementation
แต่ละ Feature สามารถเขียน UI และ test ด้วย fixture ที่ตรง contract ได้โดยไม่รอ provider เสร็จ

### Core parallel round

- Seller สร้าง Product listing/inventory contract; Buyer ใช้ read contract และทำ Order journey
- Customer Service ทำ Chat/Case module โดยใช้ Order evidence contract
- Admin ทำ KYC/Moderation commands โดยไม่ข้าม database ownership
- Marketing ทำ Campaign module และ event measurement แบบแยกจาก Product internals
- Executive ทำ read-only analytics projection จาก event/aggregate contract

ถ้าต้องแก้ Integration Surface ให้เปิด integration change ขนาดเล็กก่อน แล้วจึง rebase
Feature branch บน contract ที่ผ่าน review เพื่อจำกัด merge conflict

### Gate 1 — Core integration

Core พร้อมรวมเมื่อ:

- contract tests ของ provider/consumer ผ่าน
- migrations รวมและ rollback ได้ตามลำดับ
- permission-negative tests ผ่าน โดยเฉพาะ Admin, Customer Service และ Executive
- Buyer → Seller → reservation/order → shipping → review critical flow ผ่าน
- campaign ไม่เปลี่ยนราคา/สิทธิ์ของ order โดยข้าม owner
- analytics เป็น read-only และตัวเลข trace กลับไปยัง source event/query ได้
- `progress.md`, `changelog.md` และ `teachme.md` ของทุก Feature สอดคล้องกับหลักฐาน

Extended work เริ่มหลัง Core ของ Feature นั้นผ่าน review แต่ Extended ที่เปลี่ยน shared contract
ต้องรอ Gate 1 ของผู้เกี่ยวข้อง ไม่เริ่มจากการแก้ consumer ฝั่งเดียว

## 8. Error Handling และ Recovery

- ทุก API แยก validation error, authentication, permission, not found, conflict และ dependency
  unavailable ด้วย status/shape ที่ตกลงร่วมกัน
- Feature ที่พึ่ง service อื่นต้องกำหนด timeout และ safe retry เฉพาะ operation ที่ idempotent
- Order, mock payment, dispute และ moderation command ต้องป้องกันการทำซ้ำ
- Dashboard ต้องแสดง unavailable/partial state อย่างตรงไปตรงมา ห้ามแทนข้อมูลหายด้วยเลขศูนย์
- การ rollback code ห้ามทำลายข้อมูลที่ migration ใหม่สร้างไว้; data migration ต้องมี recovery note
- failed integration ต้องคง branch/หลักฐานของแต่ละ Feature และย้อน integration commit ที่แยกไว้ได้

## 9. Testing และ Review

ทุก Feature ต้องมี:

1. Unit test ของ business rule
2. API/contract test ของ provider และ consumer
3. Database integration test เมื่อมี query/transaction/migration
4. Permission-negative และ cross-user test
5. Frontend interaction test สำหรับ critical state
6. E2E ของ Core journey ที่ Feature เป็นเจ้าของ
7. Focused lint/format/test และผล full repository gate ก่อน merge
8. Reviewer คนละคนกับ Owner และ teach-back หนึ่งรอบ

ผลตรวจต้องบอกคำสั่ง, exit/result, ขอบเขตที่ตรวจ และสิ่งที่ยังไม่ได้ตรวจ
การ build ผ่านไม่เท่ากับ E2E ผ่าน และ prototype เดิมไม่ถูกนับว่า Production-ready
จนกว่าจะผ่าน acceptance criteria ของแผน Feature ใหม่

## 10. Definition of Done ของระบบเอกสาร

ระบบ Feature Plan พร้อมใช้งานเมื่อ:

- มี root index และ integration contract
- มี `plan.md`, `progress.md`, `changelog.md` และ `teachme.md` ระดับรวมที่ root
- มีหก Feature directories ตามชื่อที่กำหนด
- แต่ละ Feature มี `plan.md`, `progress.md`, `changelog.md` และ `teachme.md`
- Requirement จากการสัมภาษณ์ทุกข้อถูก trace ไปยัง Core, Extended หรือเหตุผลที่อยู่นอกขอบเขต
- ไม่มี Task ที่ Owner ต้องเดา interface, acceptance criteria หรือคำสั่ง verification
- สถานะปัจจุบันไม่ปนกับประวัติ และบทเรียนไม่กล่าวเกินหลักฐาน
- dependency และ shared-file ownership ทำให้ทั้งหกคนเริ่มงานแยกกันและรวมผ่าน Gate ได้
