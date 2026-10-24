# ผลตรวจระบบรหัสอ้างอิง — 24 ตุลาคม 2026

ฐาน source เดิม: `57e46b0`; งานนี้ยังไม่ได้ commit หรือ push

อัปเดตล่าสุด: 25 ตุลาคม 2026 — ผลล่าสุดครอบคลุมการแสดงผลทุก role; ตาราง regression ด้านล่างเก็บผลรอบแรกไว้แยกจากรอบขยายขอบเขตในหัวข้อท้ายเอกสาร

## ผลที่ยืนยันแล้ว

| การตรวจ                                         | ผล                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Frontend ทั้งหมด                                | ล่าสุด 171 suites / 1,216 tests ผ่านทั้งหมด (รอบแรก 1,214 tests)                                           |
| Frontend production build                       | ผ่าน compile, lint/type check และสร้าง static pages 32/32                                                 |
| Scoped lint                                     | ไฟล์ JavaScript ที่แก้/เพิ่มผ่าน ไม่มี errors ในรอบตรวจ                                                   |
| Generator/normalizer/collision/alias/display unit tests | ล่าสุด 7/7 ผ่าน รวม internal batch, สิทธิ์, cache และการค้นหารหัส (รอบแรก 3 tests)                    |
| PostgreSQL isolated migrations                  | Auth, Product, Order, Support ผ่านทั้ง 4 บริการ                                                           |
| PostgreSQL forced collision/exhaustion          | สุ่มใหม่ใน transaction ได้ และหมด attempts แล้วล้มเหลวอย่างถูกต้อง                                        |
| PostgreSQL immutability/rollback/backfill       | ผ่าน โดย schema ทดสอบถูก rollback ออก                                                                     |
| PostgreSQL concurrency                          | 24 concurrent inserts ได้รหัสต่างกัน และคง ID ที่ caller กำหนด                                            |
| MongoDB isolated backfill                       | ข้อมูลทั้ง missing/null ได้ CHT, ObjectId เดิมคงอยู่, รันซ้ำไม่เปลี่ยนรหัส และ unique index ปฏิเสธรหัสซ้ำ |
| ฐานใช้งานในเครื่อง                              | เติมรหัส 361 records ใน 25 ประเภท; missing = 0 ทุกประเภท                                                  |
| Runtime API                                     | Product UUID/ID เดิม, reference alias และ catalog search คืนสินค้ารายการเดียวกัน                          |
| Runtime negative access                         | Order reference ปฏิเสธ outsider และ anonymous; Chat reference ปฏิเสธ nonparticipant                       |
| Runtime support/chat                            | TKT และ CHT resolve กลับเป็น ticket/Conversation เดิมได้                                                  |

Regression รอบแรกบนฐานทดสอบแยกหลังปรับ assertion และเตรียม indexes (ก่อนขยายการแสดงผลทุก role):

| กลุ่ม                                              | ผ่าน | ไม่ผ่าน | ข้าม |
| -------------------------------------------------- | ---: | ------: | ---: |
| Order                                              |  377 |       0 |    4 |
| Support                                            |  109 |       0 |    3 |
| Chat                                               |  202 |       0 |    1 |
| Gateway                                            |   14 |       0 |    0 |
| Scripts (รวม reference-code database tests 6 กรณี) |   29 |       0 |    5 |
| Auth                                               |  247 |       1 |    1 |
| Product                                            |  535 |       5 |    2 |
| Shared                                             |   67 |       1 |    0 |

รายการที่ไม่ผ่านของ Auth/Product/Shared อธิบายไว้ด้านล่าง จึงไม่รายงานว่า Backend ทั้ง repository ผ่านทั้งหมด

คำว่า UUID ใน runtime product check รวม legacy ID ที่ไม่ใช่ UUID มาตรฐานด้วย เช่นข้อมูล demo `p51`; ไม่ได้บังคับแปลง ID เก่าให้เป็น UUID ก่อนใช้ referenceCode

## ขอบเขตและสิ่งที่ไม่ควรนับว่าผ่าน

- ไม่ได้ deploy production; อัปเดตเฉพาะระบบ Docker และฐานข้อมูลในเครื่องตาม .env
- Browser automation เปิดไม่ได้ เพราะเครื่องมือแจ้ง `failed to write kernel assets` จึงไม่อ้างว่าทำ visual browser acceptance ครบ ผล UI ข้างต้นมาจาก component tests และ production build
- Historical free-text notifications/audit payloads ไม่ได้ถูกเขียนทับเพื่อเปลี่ยนข้อความเก่า รหัสใหม่ถูกส่งใน entity responses และข้อความใหม่ตาม flow ที่ต่อไว้
- ไม่ได้จำลองธุรกรรมซื้อจริงครบทุกสถานะผ่าน browser ในรอบนี้; runtime smoke ใช้การอ่านข้อมูลและ session ของ demo เพื่อยืนยัน identity/authorization

## Regression ทั้ง repository

ชุดทดสอบทั้งหมดไม่ได้เป็นสีเขียวตั้งแต่ต้นรอบ: local dependency ขาด nodemailer, บาง tests ชี้ Docker DNS จาก host, schema ของฐานทดสอบเก่ายังไม่มี migration ใหม่ และ frontend บาง assertion อิงรหัสตัดสั้นเดิม จึงติดตั้ง dependency ตาม manifest และเตรียมฐานทดสอบแยกพร้อม migrations ก่อนตรวจซ้ำ

Assertion ที่เกี่ยวข้องกับงานนี้ถูกปรับให้ตรง contract: schema DisputeCase เพิ่ม reference_code อีก 1 column, Executive dispute/ticket DTO มี referenceCode และ seller search ใช้รหัส persisted ในรอบแรกยังมี fallback ID เต็มทั้งในแถวกับ modal; รอบล่าสุดเปลี่ยน UUID/ObjectId ที่ไม่มี mapping เป็นข้อความ “รหัสอ้างอิงไม่พร้อมใช้งาน” ตามหัวข้อ 14 ของเอกสารออกแบบแล้ว

ข้อจำกัดที่พบในชุดเดิมและแยกออกจากการรับรอง reference-code tests:

- Password reset route test คาด IP แบบ `::ffff:127.0.0.1` แต่ Windows คืน `127.0.0.1`
- Auction cancellation notification test ยังอ้าง seller CTA เดิม `/auctions/:id` ขณะที่ merge ล่าสุดส่งไป `/seller/auctions`
- Article-view และ buyer-profile cross-service tests ต้องมี Product/Auth HTTP services และบัญชี demo ใน environment ทดสอบเพิ่มเติม; runner นี้ไม่ได้ส่งคำขอไปใช้บัญชีในระบบใช้งานแทน
- Marketing audit actor search integration ต้องมี Auth HTTP service จึงได้ 502 เมื่อ dependency ไม่ได้รัน
- Shared service-policy integration มี guard บังคับใช้ชื่อฐาน `reloop_ui_*`; ไม่ข้าม guard ไปใช้ฐาน `reloop_ci_reference_*`
- การรัน Chat ครั้งแรกใน Mongo test database ที่ยังไม่มี contextKey/idempotency indexes ไม่ใช่หลักฐานว่า create-or-open เสียจาก CHT; runner ถูกเพิ่มขั้นเตรียม indexes บนฐานทดสอบใหม่ก่อนตรวจซ้ำ และขยาย rate-limit window เฉพาะ test environment เพื่อไม่ให้ burst ข้ามขอบเวลาเมื่อเครื่อง build Docker พร้อมกัน

ผลแต่ละกลุ่มและรายละเอียด assertion อยู่ใน `coverage/reference-codes/*.txt` ซึ่งเป็นไฟล์ตรวจในเครื่องและถูก Git ignore ไม่ใช่ไฟล์ที่ต้อง deploy


## เพิ่มเติม: การแสดงผลทุก role (อัปเดต 25 ตุลาคม 2026)

- Frontend ผ่าน 171 suites / 1,216 tests หลังเพิ่มกรณี report ตามภาพและการคัดลอก USR ใน Case Workspace; ชุดทดสอบ panel ที่แก้ล่าสุดผ่านอีก 4 suites / 33 tests
- Production build ผ่านครบ 32 หน้า และ lint ของส่วนที่เปลี่ยนผ่าน
- Shared reference display/alias ผ่าน 7 tests: เก็บ ID และข้อความเดิม, เติม persisted code, cache, ปฏิเสธ internal batch ที่ไม่มี token, จำกัด 200 identifiers, ไม่ค้นข้อมูลจากข้อความที่ผู้ใช้พิมพ์ และค้นผ่านรหัสที่คัดลอก
- Runtime ในเครื่องผ่านการอ่านข้อมูลของ Admin, Customer Service, Trust and Safety, Marketing, Executive รวมถึง buyer order, requester ticket และ participant chat ตรวจรหัสผู้เกี่ยวข้องข้ามบริการและตัวกรอง audit ด้วย USR ได้
- รายงานรีวิวที่ยังมีข้อมูลจริงส่ง USR ของผู้รายงาน/คู่กรณี และ REV ของรีวิวได้ รายงาน demo เก่าสองรายการอ้าง review ที่ไม่มีแล้ว จึงตรวจตัวอย่างที่ยังมี entity จริงแทน ไม่สร้าง review หรือแก้ข้อความเก่าเพื่อให้ทดสอบผ่าน
- Regression backend รอบแรก: order 375 ผ่าน/2 ไม่ผ่าน/4 skip; support 107 ผ่าน/2 ไม่ผ่าน/3 skip; chat 202 ผ่าน/0 ไม่ผ่าน/1 skip ข้อไม่ผ่านทั้งสี่เป็น assertion ของ DTO Executive ที่ยังคาดว่าต้องไม่มี reference fields ใหม่
- อัปเดต assertion ให้ตรวจรหัสที่บันทึกจริงและให้ fake internal services รองรับ endpoint ใหม่ จากนั้นรันทดสอบ Executive dispute detail/list, Executive ticket detail/list และ bounded bulk ซ้ำครบทั้ง 5 ผ่าน รวม cap, permission, dry-run, partial failure, concurrency และ idempotency; Bulk preview รับ USR แบบไม่มีขีดโดยยังใช้ internal ID เดิม
- ไม่ได้รัน full Auth/Product regression ซ้ำในรอบ UI นี้ ข้อจำกัดของ browser automation และ baseline integration เดิมข้างต้นยังคงอยู่

หลักฐานล่าสุดอยู่ใน coverage/reference-codes/ui-all-roles-final.txt, roles-final-panels.txt, roles-frontend-build-final.txt, roles-targeted-api-tests.txt, roles-identity-tooltips.txt, roles-audit-final.txt และ roles-runtime-check-final.txt (เป็นไฟล์ตรวจในเครื่อง ไม่ใช่ส่วน deploy)

- หลังอัปเดตบริการรอบสุดท้าย ตรวจ Seller orders และ Bulk preview ผ่านด้วย API ที่กำลังรันจริง (dryRun เท่านั้น) หลักฐานอยู่ใน roles-runtime-check-final.txt; หัวบัญชีเจ้าหน้าที่และ tooltip ออเดอร์ผ่านอีก 6 suites / 43 tests และ Audit Trail ผ่าน 21 tests

- ปรับรายละเอียดรายงานรีวิวให้อ่านเป็นส่วน ๆ (25 ตุลาคม 2026): ReportCasePanel, AdminInboxDecision, AdminInboxSection และ ReferenceCode ผ่าน 4 suites / 14 tests รวมการแยกรหัส/เหตุผล/ข้อความรีวิวเดิมที่มีหลายบรรทัดและเครื่องหมายคำพูด ส่วนต้นฉบับเริ่มพับอยู่ และปุ่มเปิดประวัติยังส่ง internal ID เดิม
