# ปรับ backend ให้ตรง ER ข้อ 1 — work map

## Agreement

- Mode: implement and verify; งานที่อนุมัติไว้เสร็จและตรวจบนระบบทดสอบแล้ว
- อนุมัติเดิม: “เริ่มได้ bro make no mistake” ใน thread c61fc8e0-3d19-44e6-9ae2-d2f8b4dc8b4f; ผู้ใช้ยืนยันให้ทำต่อใน thread dbc15ab6-f59f-438f-b7ce-f7217831ba60
- Scope: ER/schema/migration/callers ของ Auth/Product/Order/Support และส่วนเชื่อม Chat ตาม decisions.md แต่ละ service รักษา API/ข้อมูล/ประวัติเดิม
- คำยืนยันใหม่: ย้าย Auth legacy_* พร้อมข้อมูลไป legacy_archive; reviews.product_id เป็น logical reference เพื่อคงรีวิวและ ID แม้ลบสินค้า
- ไม่แตะ DB จริง ไม่ commit/deploy ไม่ใช้ db push/reset/baseline เพื่อข้าม guard
- Subagent รอบนี้ใช้ claudeAgent / claude-sonnet-5-5 / effort=medium เท่านั้น ทุกงานได้รับคำสั่งให้อ่านและใช้ nes-mode ก่อนทำงาน และรายงานคู่มือที่อ่าน ผู้ช่วยหลักตรวจโค้ด/แก้จุดหลุด/รันทดสอบเอง

## Route — completed

- Auth: auto_messages, composite item key และ migration 9 ย้าย archive สำเร็จ โดยรักษา table OID, rows, constraints, indexes และ sequence; conflict rollback ผ่าน
- Order: evidence/hold names, 17-field log-backed dispute workflow, selected-address/product-title history และ attribution jobs ผ่าน production facade ที่ประกอบ wrappers ทั้งสองใน transaction เดียวกัน
- Product: M:N categories, Condition FK, count_views, review_media, audit-backed auction/moderation และ attribution-derived budget; แก้ category-only edit ให้รักษาหมวดรอง, lock concurrent category writes, แยก internal audit rows และคืน spentBudget ใน audit state
- Support/Chat: normalized identifiers, explicit SLA rounds/policy snapshots, queue/responder events, Chat-owned history; importer ผ่าน PostgreSQL→HTTP→Mongo จริงแบบ rerunnable ก่อน contract migration
- ER/copies: Auth/Order/Product runtime/reference copies ตรงกัน; Product drawio แก้ reviews.product_id เป็น logical และ date→created_at ตามชื่อที่ตกลง; amendments ของทุก service เป็นส่วนหนึ่งของ reference ปัจจุบัน
- Actual consumers: bearer token ของ endpoint เปลี่ยนที่อยู่จัดส่งส่งต่อ Auth ถูกต้อง; live checkout/payment/shipping/chat history, live Support sync/takeover ACL, demo seed ทั้งชุด ผ่าน

## Parent code review and fixes

ผู้ช่วยหลักตรวจ migration Auth, composition/state/history/checkout/shipping/outbox Order, Product categories/review-copy/audit/budget, Support event/queue/SLA/audit และ Chat historical import เทียบ callers/tests ด้วยตนเอง หลังรับรายงาน Sonnet:

- พบและ reproduce PATCH shipping-address คืน403แม้ tokenถูกต้อง; แก้ controller และ regression ผ่าน HTTP จริง
- ตรวจ/ปรับ live Support test ที่ยัง include messages ซึ่งถูกถอดจาก schema แล้ว ให้ตรวจข้อความจาก Chat และยืนยันไม่มี ticket_messages แทน
- ตรวจ Sonnet fixes แล้วเสริม review-copy conflict check ให้เทียบทุกค่าของรีวิว/สื่อ รวม URL/ตำแหน่ง/เวลา ไม่ใช่ ID อย่างเดียว
- public Support audit ไม่นับ projection/receipt events; regression ตรวจ counts/pagination จริง
- mirrored requester ที่เป็น staff รักษาบทบาทเดิมของ Chat โดยยังตรวจ original ID/author/conversation/visibility และปฏิเสธผู้เขียนคนอื่น
- รัน demo seed จริงด้วย clients ที่ชี้เฉพาะฐานทดสอบ ตรวจ7users/4tickets/4orders/4disputes/3reports/12rooms และ historical assignment constraints
- แก้ Mongo rehearsal ให้ข้ามเมื่อไม่มี targetที่อนุญาต ก่อนโหลดclient; explicit CHAT_ER_MONGO_REHEARSAL=1 ยังปฏิเสธtargetผิด
- ใช้Product Redis DB1แยกจาก live workers; หยุด listener56101–56105ที่งานนี้สร้างแล้ว

## Executed evidence — current files, Node v24.20.0

ทุกผลต่อไปนี้รันโดยผู้ช่วยหลักใน continuation นี้ raw outputs อยู่ในไฟล์ที่ลิงก์ ไม่ใช่คำรับรองจาก subagent:

- [Auth full regression](auth-service/resume-full-regression.txt): 79 passed / 0 failed / 1 skipped (opt-in rehearsal); [archive/fresh/populated/legacy rehearsal](auth-service/resume-archive-rehearsal.txt): 7/7 passed แยกแล้ว
- [Order full regression](order-service/resume-full-regression.txt): 138 passed / 0 failed / 2 skipped; [composed history upgrade/restart](order-service/resume-history-rehearsal.txt): 8/8; [live checkout/payment/shipping/chat](order-service/resume-live-flow.txt): 1/1 ปิด live skip แยกแล้ว
- [Product full regression final](product-service/resume-full-regression-final.txt): 317/317, 0 skipped, natural exit WITHOUT --test-force-exit; [populated preserving upgrade](product-service/resume-migration-rehearsal-final.txt): guards, media/state/budget preservation, repeat deploy และ empty diff ผ่าน
- [Support full regression final](support-service/resume-full-regression-final.txt): 85 passed / 0 failed / 3 opt-in skipped; ทั้งสามตรวจแยกแล้ว: [populated guards/rollback](support-service/resume-preserving-upgrade.txt), [real PostgreSQL→HTTP→Mongo importer](support-service/resume-real-import.txt), [live Chat metadata sync/takeover access](support-service/resume-live-sync.txt): 1/1 แต่ละชุด
- [Chat full regression final](chat-service/resume-full-regression-final.txt): 173/173, 0 skipped; [final real Mongo mirror/restart/privacy/worker retry](chat-service/resume-mongo-final.txt): 1/1 หลังเพิ่ม staff-requester case
- [Demo integration](resume-demo-integration.txt): 1/1; demo unit3/3 และ historical-assignment testsผ่านใน Support suite
- Prisma validate: Auth/Product/Order/Support/Chat ผ่านทั้ง5; four PostgreSQL [Auth](auth-service/resume-schema-diff.txt)/[Product](product-service/resume-schema-diff.txt)/[Order](order-service/resume-schema-diff.txt)/[Support](support-service/resume-schema-diff.txt) diffs เป็น empty migration; ห้ามใช้ diff เป็นเหตุลบ legacy_archive
- Scoped ESLint ทุกไฟล์ JS ที่แก้ในรอบนี้ผ่าน; [git diff --check](resume-diff-check.txt) exit0; reference copies byte-identical และ XML parse Productผ่าน

Commands: full service suitesใช้ node --test --test-concurrency=1 --test-timeout=120000 --test-reporter=tap test/src globs; DATABASE_URL และservice URL overrides ชี้ disposable storesเท่านั้น Productใช้ REDIS_URL=redis://127.0.0.1:55440/1. Rehearsal testsมี opt-in/target allowlistsตามไฟล์ทดสอบ. First Chat full runขาด JWT secretในenvironmentและล้มเหลว; corrected explicit test-secret runผ่านทั้งหมด ไม่มีแก้productionเพื่อกลบfailure.

## Delegated records — all completed, no pending work

- [Product read-only review](product-service/sonnet-review.md); [Product fixes](product-service/review-fixes.md)
- [Support/Chat read-only review](support-service/sonnet-review.md); [demo fixes](demo-review-fixes.md)
- [Auth archive implementation](auth-service/archive-implementation.md)
- Task IDs: er-resume-product-sonnet-review-r1, er-resume-support-chat-sonnet-review-r1, er-auth-archive-sonnet-r1, er-product-review-fixes-sonnet-r1, er-demo-review-fixes-sonnet-r1 (T3 delegated-task command prefix e04b9632-0f95-4945-a755-2a64993cc567). Full durable IDs use node:delegated-task:command%3Amcp%3A<prefix>%3Adelegate-task%3A<task-name>.

## Delivery boundaries

- Synthetic disposable databases only; real customer data and production deployment are not certified or performed
- Historical PDFs remain historical; source drawio plus explicit amendments describe current ER. No PDF regeneration requested/performed
- Auth old NOT VALID actor FKs and baseline helper's unknown-schema policy predate this scope; no actors/data fabricated to validate them
- Frontend internal-note caller sends no stable event key; backend preserves that API and guarantees dedupe only when callers reuse a key. No frontend changes or claim that identical keyless UI retries are distinguishable
- Mongo tests provision the unique indexes on rehearsal stores. They prove enforcement when installed; existing production indexes/deployment health were not inspected. Import dedupe additionally uses Mongo's existing unique _id
- Mongo process failover/multi-node durability, browser workflows, universal performance and unrelated repo checks are not claimed
- Owned temporary PG/Mongo/Redis containers retained with synthetic fixtures/evidence; all five live Node listeners stopped. No remaining in-scope blocker or pending delegated task

สกิลที่ใช้: nes-mode (Harness, Senior Mentor, Wayfinder) | ref ที่ใช้: harness.md, senior-mentor.md, wayfinder-unified.md, software-playbooks.md (Backend and API, Review) | playbook ที่ใช้: Session Pickup, Refactoring
