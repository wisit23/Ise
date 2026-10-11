# แผน Merge และเชื่อมระบบ — 2026-10-10

Status: แผนพร้อมใช้; ยังไม่ได้เริ่ม merge หรือ cutover

อ้างอิง [ผล audit และ pinned branch SHAs](merge-audit-2026-10-10.md) รายงานนั้นตรวจ source/Git และจุดเชื่อมต่อหลัก ไม่ใช่ผลทดสอบระบบรวมที่รันผ่านแล้ว

## 1. ข้อตกลงที่ผู้ใช้ยืนยัน

- D-01: ใช้ Order schema ใหม่ของ Buyer เป็นฐาน แล้วขยาย/ปรับให้รองรับ CS, Chat, Marketing, Trust & Safety และ Seller ครบ ห้ามนำ schema Buyer ไปทับ schema ของทุก service
- D-02: รักษาข้อมูล database เดิมทั้งหมด หยุด cutover จน mapping ค่าที่ขาดได้ครบ ห้ามสร้างประวัติ payment/address/dispute ที่ไม่มีหลักฐาน
- D-03: จุดทับกันที่เปลี่ยน business rule หรือทำให้ต้องเลือกทิ้งความสามารถให้ถามผู้ใช้ก่อนตัดสินใจ งานปรับโค้ดเพื่อรักษาพฤติกรรมทั้งสองฝั่งทำได้ตามแผน

เป้าหมายคือรวมทุกฟีเจอร์ให้เชื่อมกันและไม่รับผลรวมที่ยังมีปัญหาที่ทราบอยู่ ไม่สามารถรับรองว่าไม่มี defect ทุกชนิดด้วยการตรวจ source เพียงอย่างเดียว ต้องใช้หลักฐานจาก acceptance gates ด้านล่าง

## 2. ขอบเขตและ invariants

| ID | ข้อกำหนด Must |
| --- | --- |
| R-01 | งานจากทั้ง 7 branch และ local-only feature ที่ตรวจพบต้องมีรายการ disposition: เก็บ/ปรับรวม/รอคำตอบ ไม่มีการทิ้งเงียบ ๆ |
| R-02 | ยอดเงินต่อ order, checkout, payment และ attribution ใช้หน่วยและ precision เดียวกัน ไม่สูญเสียทศนิยม |
| R-03 | การจ่ายซ้ำ, callback ซ้ำ และ retry ไม่สร้าง payment/order/attribution ที่มีผลทางธุรกิจซ้ำ |
| R-04 | Hold จาก dispute, T&S และ sanction แยกเหตุผลกัน ปลดเหตุผลหนึ่งต้องไม่ปลดเหตุผลอื่น |
| R-05 | Ticket/dispute assignment, SLA, priority, evidence และ audit ยังใช้งานได้บน schema รวม |
| R-06 | Chat ตรวจสิทธิ์จาก case owner/participant/staff policy และ internal notes ไม่รั่วไป requester |
| R-07 | Product moderation ยังบังคับได้ระหว่าง reserve, sell, auction และ restore |
| R-08 | ข้อมูลเก่าและ media เก็บครบ พร้อม mapping และหลักฐานการย้ายก่อน cutover |
| R-09 | API callers, response projections, events และ generated clients ต้องตรงกับ schema เป้าหมาย |
| R-10 | Main จะไม่รับ integration tree หาก required gates fail, skip, ยังไม่ได้รัน หรือมี known defect ใน flow ที่อยู่ในขอบเขต |

ไม่กำหนด SLA หรือ business states ใหม่เอง ให้ยึดกติกาที่มีหลักฐานในโค้ด/เอกสารและถามเมื่อสอง branch ขัดกัน

## 3. Schema integration matrix

| Service | Inputs | Target / สิ่งที่ต้องรักษา |
| --- | --- | --- |
| Order | Buyer + CS + Chat + Marketing; ผู้เรียก T&S/Seller | Basket/Checkout/Payment/Shipping/Hold/OrderLog จาก Buyer; เพิ่ม assignment, priority, SLA, case-chat link และ audit ที่จำเป็น; รักษา durable attribution และหลาย hold sources |
| Product | Buyer + Marketing + T&S | Reviews/photos/videos + auction/campaign/voucher/attribution + moderation command deduplication; reservation/eligibility/visibility สอดคล้องกัน |
| Support | CS + Chat; ผู้เรียก T&S/CEO | Normalized category/priority/status/assignment/history/SLA/FAQ revision; legacy message archive และ chat link; DTO เดิมที่ยังมี caller ต้องมี adapter |
| Chat | Chat + CS + Marketing; ผู้เรียก Seller/Order | Case conversation/participant/access/attachment; internal visibility; message idempotency, sync และ realtime; backfill fields/unique indexes สำหรับ document เดิม |
| Auth | T&S; ผู้เรียกทุก role/CEO | Role catalog/grants/profile/audit/relations; JWT และ authorization ต้องยังตีความ role ได้ตรงกัน |
| Review | Buyer ย้ายไป Product | Public endpoints/media URLs และ eligibility คงใช้ได้; เก็บฐานเก่าจนตรวจย้ายครบ; retire runtime service เมื่อ consumer ย้ายครบ |

ทุก field ที่ rename/remove ต้องมี mapping แสดง old path, new path, type/unit, nullability, source, backfill และ affected callers การมีชื่อ table เหมือนกันไม่ถือว่า contract เหมือนกัน

Order migrations ของ CS/Chat ที่สร้างจาก schema เก่าต้องตรวจและปรับเป็น migration chain ของ schema รวม ห้ามรันต่อกันตามวันที่โดยไม่ตรวจ SQL/dependencies ห้ามแก้ migration ที่ apply แล้วในฐานจริงโดยไม่มี forward migration/baseline strategy

## 4. Contract ที่ต้องปิดก่อน merge gate

| ID | Producer -> Consumer | Contract ที่ต้องตกลงและตรวจ |
| --- | --- | --- |
| C-01 | Frontend -> Order | Checkout ส่ง addressId ของ address ที่เลือกจริง; dispute ส่ง disputeType ที่รองรับ; shipping ส่ง company/trackingNumber ตามสถานะ |
| C-02 | Order <-> Product | Reserve/complete/release, expiry และ compensation; auction winner callback สร้าง order แบบ idempotent |
| C-03 | Order -> Product marketing | order.completed.v1, event ID, precision/amount unit, retry และ deduplication; durable event ต้องอยู่ใน transaction เดียวกับ completion |
| C-04 | Support/Order <-> Chat | Context keys, conversation IDs, participant/access checks, internal message visibility, assignment/reassignment และ completion notifications |
| C-05 | Auth/T&S -> Product | Moderation command identity/replay, visibility overlay และ restore state |
| C-06 | T&S/CS -> Order | Payment hold/release/decision/evidence review; reason/reference matching และ optimistic concurrency |
| C-07 | Services -> CEO/Admin dashboards | Complaint/report projection, status/category/priority aliases, totals/filter/pagination และ role restrictions |
| C-08 | Gateway -> Product reviews | /api/reviews และ /review-uploads คง URL; rewrite prefixes, public reads, authenticated writes และ existing volume |
| C-09 | Auth -> ทุก service/socket | Primary/multiple roles, permission claims, token refresh, ban/revocation และ socket access policy |

Contract record ต้องมี method/path หรือ event name, payload/response example, types/nullability, error cases, authorization, idempotency และ test IDs ห้ามใช้ UI mocks เป็นหลักฐานเพียงอย่างเดียวว่า producer/consumer เข้ากัน

## 5. Execution phases และ checkpoint

| Phase | งาน | Gate ก่อนจบ phase |
| --- | --- | --- |
| P0 Preserve | เก็บ index/tracked/untracked snapshot ที่กู้คืนได้; inventory local feature กับ generated/tool artifacts; pin refs; ตรวจ existing worktrees และใช้ checkout แยกจาก dirty workspace | พิสูจน์ snapshot อ่าน/กู้คืนได้; รู้ว่า local-only งานไหนต้องนำเข้า; ไม่เปลี่ยนงานต้นฉบับ |
| P1 Baseline | รัน clean main บน dependencies และ DB แยก; บันทึก test/build/config failures และ skipped tests | ผล main reproducible พร้อม environment และ log; ปัญหาที่กระทบ scope มีงานแก้ ไม่ใช้เป็นข้อยกเว้นปล่อย regression |
| P2 Contracts | ทำ final schema draft, field mapping, API/event/role matrix และ feature checklist ครบทุก branch | ไม่มี business ambiguity ที่ต้องตัดสินใจเอง; D-01/D-02 ถูกบังคับ; schema/model validate |
| P3 Buyer | Merge pinned Buyer และ integration fixes สำหรับ frontend contract/reviews routing/commerce foundation | Checkout/payment/shipping/review/reservation ผ่านบน DB ใหม่; required fields ไม่หลุด |
| P4 CS + Chat | Merge CS แล้ว Chat; เทียบ shared paths; port case priority/SLA/assignment/evidence ไป Order ใหม่ | Ticket/dispute/chat/workspace ผ่านร่วมกัน; ownership/internal notes และ migration chain ผ่าน |
| P5 T&S | Merge T&S; port model callers; รวม Auth/Product schema | Ban/role/moderation/evidence/overlapping holds และ retry/concurrency ผ่าน |
| P6 Marketing | Merge Marketing; รวม schemas/outbox/decimal contracts | Voucher/auction/cancellation/budget/attribution cross-service ผ่าน |
| P7 Seller | Merge Seller; port paid notification และ shipping UI | จ่ายหลาย order -> chat -> shipping -> complete ผ่านและ retry ไม่ซ้ำ |
| P8 CEO | Merge CEO; รวม projections/search และ resolve production config | Complaint/detail/search/metrics/access ผ่านกับ schema รวม; Dockerfile/Compose config ตรงกัน |
| P9 Local delta | นำ local-only behavior ที่ยืนยันแล้วเข้าครั้งเดียว; ตรวจ feature disposition ทุก input | ไม่มี behavior หายหรือ duplicate; docs/artifacts ที่เกี่ยวข้องมี disposition |
| P10 Release candidate | Full suite, UI journey, fresh DB + legacy-copy migration rehearsal, restart/retry และ cumulative diff review | Required gates ทุกตัว PASS ที่ commit เดียวกัน; input SHAs/ancestry และ feature coverage ครบ |

ลำดับนี้เป็นลำดับ commit ไม่ใช่ลำดับออกแบบ schema: ต้องพิจารณา contributions ทุก branch ใน P2 ก่อนเริ่ม P3

ในแต่ละ phase: simulate against current integration HEAD -> inspect conflicts and semantic overlap -> merge without auto-committing unresolved choices -> resolve/adapt -> focused tests -> traceable commit/checkpoint. Phase ที่ fail หยุดแก้ ณ phase นั้น ไม่สะสมปัญหาแล้วค่อยตรวจตอนท้าย

Main merge, push และ live data cutover ไม่ได้เกิดขึ้นจากการเขียนแผนนี้ หากเริ่ม execution ให้ทำใน integration checkout ก่อน ยังไม่เริ่ม runtime ของ tree ใหม่บน database เดิม

## 6. Conflict decision protocol

### จัดการได้โดยไม่ต้องถามซ้ำ

- Import/path rename, formatting, generated client, dependency reconciliation ที่ไม่ตัดฟีเจอร์
- รวม additive fields/routes/tests และปรับ callers ให้ตรง contract ที่ตกลงแล้ว
- เก็บ behavior ทั้งสองฝั่งด้วย adapter หรือ refactor โดยไม่เปลี่ยนสิทธิ์/สถานะ/ยอดเงิน
- แก้ defect ที่ยืนยันได้เพื่อให้ผ่าน requirements ของแผน

### ต้องถามก่อนใช้คำตอบในส่วนที่เกี่ยวข้อง

- Business rules ขัดกัน เช่น case-level vs evidence-level deadline, SLA policy, allowed transitions หรือ refund timing
- ต้องเลือก ownership/source of truth ที่ยังไม่ได้ยืนยัน หรือทิ้ง/ลดฟีเจอร์ใด
- แหล่งข้อมูลจริงไม่พอสำหรับ migration หรือ mapping มีหลายทางและความหมายต่างกัน
- เปลี่ยน permission, audience ของข้อมูล, หน่วยเงิน หรือ public API compatibility ที่กระทบผู้ใช้
- เปลี่ยน UX workflow ที่สอง branch ตั้งใจต่างกันและไม่สามารถรักษาทั้งสองแบบได้

แต่ละคำถามจะระบุ: conflict ID, behavior ของแต่ละฝั่ง, ผลกระทบ, ตัวเลือก, ข้อเสนอแนะ และงานที่หยุดรอ ตอบแล้วบันทึก Decision Log; ทำงานส่วนอื่นที่ไม่ขึ้นกับคำตอบต่อได้ ห้ามนับการไม่ตอบเป็นการยอมรับ

| Decision | Status |
| --- | --- |
| D-01 Order ใช้ Buyer foundation และเพิ่ม feature อื่น | Confirmed |
| D-02 Preserve all legacy data; no cutover before full mapping | Confirmed |
| Deadline/SLA/status/role rules ที่อาจขัดกัน | ตรวจใน P2/P4/P5; ถ้าขัดจริงให้ถามพร้อมหลักฐาน |
| Missing historical data mappings | Pending actual data inventory; ห้าม fabricate |

## 7. Data preservation / migration plan

1. Inventory schema จริงและ migration ledger แบบ read-only หลังมี runtime access; ใช้ข้อมูล ณ เวลานั้น ไม่อ้างจำนวนจากเอกสารเก่าว่าเป็นจำนวนปัจจุบัน
2. ทำ backup DB และ storage/media พร้อม restore verification ใน environment แยก; รวม PostgreSQL, MongoDB และ volumes ที่เกี่ยวข้อง
3. จัด field/record mapping: IDs, checkout-address linkage, money, payment timestamps, disputes/evidence/audits/holds, ticket state/history/SLA และ message IDs/visibility/timestamps
4. บันทึก missing mappings เป็นรายการที่ต้องถามหรือหาแหล่งจริง; quarantine/archive ชั่วคราวต้องไม่ถือว่า mapping สำเร็จหรืออนุญาต cutover
5. ใช้ expand/backfill/validate approach เท่าที่ schema รองรับ; SQL-specific functions/indexes ต้องอยู่ใน migration chain; unique Mongo fields ต้องวาง backfill ก่อน index หากข้อมูลเดิมไม่ครบ
6. Rehearse กับ restored copies: before/after row reconciliation, IDs/FKs/orphans, exact money totals, hold sources, message ordering/internal visibility และ media access ตรวจทั้ง interruption/re-run
7. Data gate ผ่านเมื่อ mapping ครบ ไม่มี missing/unexplained discrepancies และ restore/rollback rehearsal ผ่าน
8. Cutover วาง maintenance/write freeze และ order ของ service startup ตาม final topology; ป้องกัน old/new writers ใช้ model คนละแบบ ไม่รัน cutover จน data gate ผ่าน

Review copy ต้องตรวจ source/destination conflicts และจำนวน/attachments ครบ เก็บฐาน Review และ volume เดิมจนตรวจเสร็จ ไม่ลบเพราะ runtime service ถูก retire

## 8. Acceptance test matrix

สถานะเริ่มต้นทุก case: NOT RUN แผนนี้ไม่ได้สร้างผล PASS ล่วงหน้า

| Test | Trace | Scenario / Expected |
| --- | --- | --- |
| T-01 | R-02/R-09 C-01/C-02 | Buyer checkout หลาย seller พร้อม voucher/address -> ยอดรวม exact; invalid address ถูกปฏิเสธ ไม่มี partial orphan |
| T-02 | R-03 C-02 | Double confirm และ dependency timeout/retry -> ผลจ่ายหนึ่งครั้ง ไม่สร้าง order/payment ซ้ำ |
| T-03 | R-02/R-03 C-02/C-03 | Fractional money/zero discount/boundary amounts -> Order/Product/outbox total เท่ากัน ไม่มี rounding loss |
| T-04 | R-09 C-01/C-04 | Seller shipping -> tracking/company/address ถูกต้อง; notification ถึง chat; refresh/retry ไม่ซ้ำ |
| T-05 | R-08/R-09 C-08 | Completed order -> review eligibility; guest media/read + authorized upload; old URLs ยังอ่านได้ |
| T-06 | R-05/R-06 C-04 | Ticket assign/reassign/reply/escalate/resolve -> queue/SLA/history/chat participant ตรงกัน |
| T-07 | R-06 C-04/C-09 | Requester/other customer/unauthorized staff ขอ case/room/attachment -> deny; internal notes ไม่อยู่ใน response/event ที่ลูกค้าเห็น |
| T-08 | R-05 C-01/C-06 | Open dispute/evidence/deadline/review/decision -> supported states และ version guards; malformed/missing inputs ถูก reject |
| T-09 | R-04 C-06 | เปิด dispute + T&S + sanction holds แล้วปลดทีละเหตุผล -> ยัง hold จนเหตุผลที่ต้องถือทั้งหมดถูกปลด; refund ตาม rule ที่ยืนยัน |
| T-10 | R-03/R-05 C-06 | สอง agent claim/decision/evidence review พร้อมกัน -> หนึ่ง valid transition; audit ไม่ซ้ำ |
| T-11 | R-03/R-07 C-02/C-05 | Moderation ระหว่าง reservation expiry/auction/sale -> สินค้าไม่กลับมาซื้อได้ผิดสิทธิ์; command replay ไม่ทำซ้ำ |
| T-12 | R-02/R-03 C-02/C-03 | Auction win/cancel และ voucher redeem/release -> order/compensation/attribution consistent; retry event dedup |
| T-13 | R-05/R-09 C-07 | CEO/Admin complaint search/detail/filters/metrics -> ข้อมูลจาก normalized models ครบ; role ที่ไม่อนุญาตอ่านไม่ได้ |
| T-14 | R-06/R-09 C-09 | Multi-role, token refresh, banned/revoked account และ socket reconnect -> policy consistent |
| T-15 | R-08 | Legacy DB copy -> complete mappings, counts/key/amount reconciliation; interruption/re-run ไม่สูญ/ซ้ำ; original data ไม่ถูกแก้ใน rehearsal |
| T-16 | R-09/R-10 | Fresh DB install และ restart -> migrations/functions/indexes/seeds/clients/startup สำเร็จ; no hidden skip |
| T-17 | R-01 | Branch feature checklist + local snapshot reconciliation -> intended feature ทุกตัวมี implementation/test หรือ user decision |

เพิ่ม test cases ตาม state/permission/boundary ที่พบจาก implementation ไม่ถือว่า 17 scenario นี้ครอบคลุมทุก defect ใช้ unit -> producer/consumer contract -> real DB integration -> browser E2E ตามชนิดความเสี่ยง

## 9. Validation and release gate

- ติดตั้งด้วย npm ci, regenerate Prisma clients, schema validation, lint/format, secret scan, backend/frontend tests และ production build
- Required integration ใช้ PostgreSQL + Mongo replica set + Redis ใน environment แยก พร้อม REQUIRE_INTEGRATION=1; ต้องไม่มี silent skip
- CI ต้อง test migration chain และ fresh schema จริงของแต่ละ service ไม่ใช้ db push อย่างเดียวแทน functions/indexes/migrations
- Compose/production Compose/Kubernetes, URLs/env names, health/dependencies, review routing และ media/private storage ต้องผ่าน configuration check และ runtime smoke ตาม scope
- หลัง final fix รัน gates ที่ได้รับผลกระทบใหม่ และ final required suite ที่ commit เดียวกัน บันทึก commit/environment/command/log/result
- Known baseline failure ที่กระทบ scope ต้องแก้หรือหยุด gate; ไม่ใช้คำว่า pre-existing เป็นการยกเว้นข้อกำหนดผู้ใช้

Status: PASS / FAIL / BLOCKED / NOT RUN / SKIPPED. BLOCKED/NOT RUN/SKIPPED ไม่เท่ากับ PASS

หลักฐานส่งมอบ: final schema + mapping, API/event matrix, conflict/decision log, feature checklist, test report, migration/restore report, final diff และ branch ancestry

## 10. Recovery และขอบเขตที่ยังไม่ยืนยัน

Code checkpoints อยู่ใน checkout แยก; หาก phase fail ให้แก้หรือ revert เฉพาะ integration commit ไม่ reset workspace ต้นฉบับ Data rehearsal ใช้ disposable copies; live rollback ต้องตรวจ new writes และ compatibility ก่อน ไม่ใช่เพียง revert Git หรือ restore backup แล้วทำข้อมูลใหม่หาย

ยังต้องตรวจ runtime/DB จริง, field mappings และกติกาที่ขัดกันแบบละเอียดเมื่อเริ่ม P1/P2 ขณะ audit Docker access ถูกปฏิเสธ จึงยังไม่มีหลักฐานว่ารัน integration ได้ และไม่อ้างว่า baseline หรือระบบรวมผ่าน tests แล้ว

Next step: P0/P1 แล้วจัดทำ contract/schema mapping ใน P2 ก่อนลงมือ merge branch แรก


## Execution update — 2026-10-11

All seven branch tips are integrated and core validation passed. See [validation results and remaining cutover gates](merge-validation-2026-10-11.md). Git merge and database cutover are separate; legacy mappings remain a cutover blocker.
