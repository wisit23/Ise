# รายงานก่อนแก้: ER ข้อ 1 เทียบฐานข้อมูลที่ backend ใช้จริง

## สถานะและขอบเขต

- ผู้ใช้เลือกแนวทาง 2: ตรง ER ทุกตาราง/คอลัมน์ และให้รายงานชื่อที่ไม่ตรง/ขาด/เกินก่อนแก้
- ยังไม่ได้แก้ ER, schema, migration, backend หรือข้อมูลจริง รายงานและเครื่องมือวิเคราะห์อยู่ในโฟลเดอร์ชั่วคราวนอก repository
- ตรวจไฟล์ draw.io/XML ข้อ 1 ของ Auth, Customer, Order และ Product ทุก entity ที่เชื่อมกับ attribute รวม 61 entity รวม weak entities ที่วาดกรอบซ้อน
- Customer Service อยู่ใน backend/services/support-service ไม่ใช่ customer-service
- schema ที่ใช้เทียบคือ backend/services/<service>/prisma/schema.prisma ไม่ใช่ไฟล์สำเนา database/*.prisma
- จำนวน model: Auth 16, Support 14, Order 14, Product 19 รวม 63
- พบ entity ที่ไม่มี model 3 รายการ: auto_messages, evidence, Count Views
- พบ model ที่ไม่มี entity ใน ER 5 รายการ: ticket_messages, attribution_outbox_events, product_moderation_commands, review_photos, review_videos
- หลังจับคู่ entity ตามหน้าที่ ชุดคอลัมน์ของ 35/61 entity เหมือนกัน แต่ไม่ได้แปลว่า type, constraint หรือชื่อ physical table ตรงทั้งหมด
- การจับคู่ชื่อ เช่น TICKET_CATEGORY → ticket_categories หรือ Products → products เป็นเพียงคู่สำหรับตรวจสอบ ยังไม่ใช่การอนุมัติให้เปลี่ยนชื่อแบบนั้น
- ไม่อ่านหรือเปิดเผยรหัสผ่านจาก environment

## A. ประเด็นที่ต้องตัดสินใน ER ก่อนเขียน migration

### A1. ชื่อ physical table กับชื่อ entity

Customer ใช้ชื่อ entity แบบตัวใหญ่เอกพจน์ ขณะที่ SQL ใช้ตัวเล็ก/พหูพจน์; Product ใช้ชื่อที่มีช่องว่าง เช่น Auction Items, Marketing Audit Logs; Order ใช้ checkout แต่ SQL ใช้ checkouts

ต้องยืนยันว่าป้ายชื่อเหล่านี้เป็นชื่อแนวคิด หรือเป็นชื่อ physical table ที่ต้องใช้ตรงตัวจริง ๆ PostgreSQL ชื่อที่มีช่องว่าง/ตัวใหญ่ใช้ quoted identifiers ได้ แต่ไม่ควรเดาว่าผู้ใช้ตั้งใจให้ใช้รูปแบบนั้น

### A2. ชื่อคอลัมน์ที่คล้ายกันแต่ยังไม่ได้อนุมัติว่าเท่ากัน

- Order: order id / order_id, basket  id / basket_id, dispute_case _id / id, dispute_evidence _id / dispute_evidence_id, safety_ id / safety_id, verify _at / verify_at, update_at / updated_at, companny / company, campane_id / campaign_id, version / dispute_case_version, ref_id / reference_id, hold_type / source
- Customer: ticket_id / id, target_user_id / target_id, audit_event_id / id, article_id / id
- Product: Products.crated_at / created_at, Videos Swipe.crated_at / created_at, reservation_expires / reservation_expires_at, pre_removal / pre_removal_status, Reviews.date / reviews.created_at

รายการนี้เป็นคู่ที่ควรพิจารณา ไม่ใช่ข้อสรุปว่าความหมายและข้อมูลเหมือนกัน โดยเฉพาะ dispute_id, evidence_id, ref_id และ hold_type ต้องเลือกความหมายก่อน

### A3. คีย์และชื่อซ้ำ

- Products.id และ Marketing Audit Logs.id มีในแบบจริง โดยเส้น attribute ใช้ free-coordinate endpoint ไม่ใช่ source/target node ID จึงไม่ถือว่าขาดหรือเป็นคอลัมน์นอก ER
- Auction Rounds มี created_at สองวงรีเชื่อม entity เดียวกัน ต้องระบุว่าซ้ำโดยผิดพลาดหรือวงใดตั้งใจเป็นฟิลด์อื่น
- Count Views ระบุ viewer_id (PK) และ product_id (PK, FK): คาดว่าเป็นคีย์ผสม แต่ยังต้องยืนยัน พร้อมกำหนดความหมาย count และวิธีนับซ้ำ
- dispute_case มี created_by สองวงรี เป็นชื่อคอลัมน์ซ้ำจริงใน XML ต้องระบุว่าซ้ำโดยผิดพลาดหรือวงใดต้องเปลี่ยนชื่อ
- dispute_audit_log ขีดเส้นใต้ทั้ง id และ dispute_audit_log_id ต้องกำหนดคีย์จริง ไม่ควรเลือกแทนผู้ใช้
- shop_change_request_items ขีดเส้นใต้ทั้ง id และ requests_id; schema ใช้ id เป็น PK และ requests_id เป็น FK พร้อม unique(requests_id,field_name) จึงต้องยืนยันความหมายของเครื่องหมาย
- HELP_ARTICLE_REVISION แสดง article_id แบบขีดเส้นใต้ แต่ version ไม่ได้มีเครื่องหมายเดียวกันอย่างชัดเจน; schema ใช้ PK(article_id,version) ต้องยืนยันว่าแบบตั้งใจใช้ weak entity/composite key เช่นนี้
- safety_log ไม่ระบุ PK ในวงรี ขณะที่ backend ใช้ safety_log_id; evidence ไม่ทำเครื่องหมาย PK ของ evidence_id ชัดเจน
- role, Photo, Videos, Videos Swipe และ hold มี attribute ที่อาจเป็นคีย์ แต่เครื่องหมายในแบบยังไม่ชัดเจนพอที่จะรับรองกฎ PK/UK จากรูปเพียงอย่างเดียว
- ขีดเส้นใต้หรือ [UK] เป็นหลักฐานเครื่องหมายเท่านั้น ต้องไม่ถือว่าทุกคอลัมน์ที่ขีดเส้นใต้เป็น PK โดยอัตโนมัติ

### A4. เส้นความสัมพันธ์และ cardinality ที่ต้องยืนยันด้วยภาพ/แบบที่ตกลง

- Order: relation verify และ relation record ของ dispute_case_log ใช้ endpoint แบบพิกัดบางด้าน ตรวจพิกัดแล้วจับคู่กับ safety_dispute_evidence และ dispute_case ได้ ไม่ถือว่าเส้นขาด
- dispute_evidence มีทั้ง status และ dispute_status ใน ER แต่ schema มี status เท่านั้น ต้องยืนยันว่าเป็นสองความหมายหรือชื่อซ้ำเชิงความหมาย
- Order: label cardinality จำนวนมากตั้ง parent เป็น edge id เดียวกัน aiJ4QOfwXch2im6GLksC-7 ทำให้ไม่สามารถจับคู่ cardinality กับแต่ละ relation ได้อย่างน่าเชื่อถือด้วย XML อย่างเดียว
- Product: relation Products ↔ Auction Items และ Products ↔ Count Views ใช้ endpoint แบบพิกัดบางด้าน ตรวจแล้วจับคู่กับ entity ได้ ไม่ถือว่าเส้นขาด
- Product: labels ของ Conditions ↔ Products และ Products ↔ Categories แสดง M ที่ฝั่งตาราง setup และ 1 ที่ฝั่ง Products ตาม XML ต้องยืนยันว่าตั้งใจเช่นนั้นหรือกลับด้าน ก่อนเลือก FK/cardinality
- Product: schema เก็บ category และ condition เป็น String ไม่มี @relation/FK ไป categories/conditions ไม่ใช่เพียงเปลี่ยนชื่อคอลัมน์
- Auth: auto_messages เชื่อม seller_profiles ด้วย user_id ต้องยืนยันชนิดคีย์และ cardinality ก่อนเพิ่ม FK
- Order: ER แยก evidence เก็บ ref_path แต่ backend เก็บ evidence_path ใน dispute_evidence และ safety_dispute_evidence.evidence_id อ้าง DisputeEvidence ไม่ใช่ entity evidence ที่ ER แยกไว้ ต้องตกลงว่า safety ตรวจ record ไหน
- References ข้าม service เช่น user_id/product_id ในแต่ละฐานข้อมูล ไม่ใช่ FK ข้าม PostgreSQL database ที่ Prisma สร้างให้ได้โดยตรง ต้องกำหนดว่าจะเป็น logical reference ที่ตรวจผ่าน API หรือมีการเปลี่ยน architecture ห้ามเพิ่ม FK ข้ามฐานข้อมูลโดยเดาเอง

### A5. สิ่งที่แบบไม่ได้ระบุครบ

ตรวจเส้นครบทั้ง source/target IDs และ free-coordinate sourcePoint/targetPoint ที่ปลายเส้นสัมผัส node อย่างไม่กำกวม (คลาดเคลื่อนไม่เกิน 5px) พบ attribute ครบทุกวงรี ไม่เหลือวงรีที่จับคู่ entity ไม่ได้ รายงานแนบการจับคู่พิกัดที่ใช้ไว้ด้วย

ER ไม่ได้ให้ SQL type, length, nullable, default, enum values, unique constraints, onDelete/onUpdate และ index ของทุกคอลัมน์ รายงานแนบ type/constraint ปัจจุบันไว้ทั้งหมด แต่ไม่รับรองว่าตรง requirement ที่ไม่ได้เขียนไว้

ชื่อ name_th varchar(100), [UK], (FK), (PK, FK) ถือเป็น annotation ไม่ใช่ตัวอักษรในชื่อคอลัมน์; whitespace ที่อยู่ภายในชื่อ เช่น order id ไม่ถูกแปลงเป็น underscore ระหว่างตรวจ

PDF ในโฟลเดอร์เดียวกันยังไม่ได้ตรวจภาพ/อ่านข้อความครบ จึงยังไม่รับรองว่า PDF และ draw.io เป็น revision เดียวกัน ข้อสรุปเรื่องชื่อและ attribute ในรายงานนี้อ้าง draw.io/XML เท่านั้น

## B. ผลกระทบต่อ backend หากตัดทุกส่วนที่ไม่มีใน ER

1. Order.status มีใน ER จริง ไม่ต้องตัด แต่ pre_dispute_status ไม่มีใน ER และเกี่ยวกับการคืนสถานะหลัง dispute ต้องกำหนดวิธีทดแทน
2. Checkout.orders_amount/original_amount/address_snapshot และ Shipping.address_snapshot: checkout serializer อ่านยอดและที่อยู่จากข้อมูลเหล่านี้ ถ้าตัด snapshot ออก ต้องตัดสินเรื่องที่อยู่ย้อนหลังเมื่อผู้ใช้แก้ address และการคำนวณยอดย้อนหลัง
3. attribution_outbox_events: attributionOutboxService.js อ้าง model นี้ตรง ๆ และใช้ processedAt, attempts, nextAttemptAt สำหรับส่งซ้ำ/ติดตามผล ต้องกำหนดกลไกส่งข้อมูล Product ที่คงความถูกต้องก่อนตัดตาราง
4. DisputeCase ฟิลด์ status, assigned_role, priority/risk/SLA/deadline/escalation: workflow ข้อพิพาทใช้งานอยู่ ต้องตัดสินสิ่งที่ยังต้องรองรับภายใต้ ER ที่ไม่มีคอลัมน์เหล่านี้
5. SupportTicket.priority_score/risk_report_count/chat_responder_id, ticket_sla_targets.cycle, ticket_messages: เกี่ยวข้องกับจัดคิว การติดตาม SLA หลายรอบ และข้อความ/ผู้ตอบแชต ต้องตรวจ consumer และกำหนดพฤติกรรมใหม่ก่อนตัด
6. Campaign.status/discount_type/min_order_price/description มีใน ER จริง ส่วน spent_budget เท่านั้นที่เป็นคอลัมน์นอก ER ของ Campaign ต้องกำหนดวิธีรักษาการบังคับงบ/คำนวณยอดใช้โดยไม่ใช้คอลัมน์นี้
7. Auction fields cancellation_reason/cancelled_at/cancelled_by และ Auction Rounds.title/categories ไม่มีใน ER และมี consumer เดิม ส่วน closed_at ของ Auction Items และ submission_ends_at ของ Auction Rounds มีใน ER จริง ไม่ต้องตัด
8. review_photos/review_videos: reviewModel.js ใช้ nested create และ include photos/videos จริง การตัดตารางทำให้รีวิวมีสื่อไม่ได้ตามเดิม เว้นแต่ตกลงวิธีจัดเก็บใหม่ที่อยู่ใน ER
9. product_moderation_commands: เป็นบันทึกคำสั่งสำหรับ deduplication/idempotency ต้องกำหนดกลไกทดแทนก่อนลบ
10. auto_messages/Count Views/evidence: แบบระบุโครงสร้าง แต่ยังไม่กำหนด API/trigger การสร้างข้อมูล/สิทธิ์/การ retention ครบ การสร้างตารางอย่างเดียวไม่พิสูจน์ว่าฟีเจอร์ใช้งานได้จริง

หลักฐาน backend ที่เปิดตรวจ:
- backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:18-22,62,88,108
- backend/services/order-service/src/services/attributionOutboxService.js:41-61
- backend/services/product-service/src/features/campaigns/campaignService.js:24-25,54-76
- backend/services/product-service/src/features/reviews/models/reviewModel.js:3-29
- Appendix แนบรายการ textual references ของทุก schema-only column เป็นจุดตามตรวจต่อ ไม่ใช่การยืนยัน dataflow ของทุก occurrence

## C. Migration, สำเนา schema และหลักฐานทดสอบ

- Prisma validate รอบตรวจนี้ผ่านทั้ง Auth, Support, Order, Product
- Prisma migrate diff --from-empty --to-schema-datamodel ... --script รันสำเร็จสำหรับ Order/Product โดยไม่ได้เชื่อม/เปลี่ยน database
- เทียบ DDL CREATE TABLE/column ของ Order baseline ทั้ง 14 table และ Product baselineทั้ง 19 table กับ SQL ที่ Prisma สร้าง: เท่ากันในขอบเขตที่ตรวจ
- เทียบชุด FK และ CREATE INDEX statements ของสอง baseline: เท่ากัน
- ผลนี้พิสูจน์ความสอดคล้องระหว่าง baseline กับ schema ปัจจุบัน ไม่ได้พิสูจน์ความตรงกับ ER หรือว่ามีการ apply จริงแล้ว
- migration helper ของ Order/Product บล็อกฐานข้อมูลเก่าที่ไม่มีกลุ่ม baseline ที่ยอมรับ ต้องออกแบบ migration preserving data ใหม่ ไม่ควรใช้ db push หรือ resolve applied เพื่อข้าม guard
- Auth/Support มี migration ต่อเนื่องและ helper bootstrap/baseline ไม่ได้ทดลอง deploy บนฐานข้อมูลใหม่หรืออัปเกรดฐานข้อมูลเก่าในรอบนี้
- ไม่มีฐานข้อมูลของโปรเจกต์ที่รันพร้อมสำหรับทดสอบ integration จึงยังไม่มีหลักฐาน fresh install, upgrade, CRUD/API/transaction/rollback/concurrency กับ DB จริง
- ไม่ใช้ตัวเลขเทสต์จากรอบก่อนเป็นหลักฐานใหม่ของ revision นี้ และไม่ถือ skipped tests ว่าผ่าน
- database/auth-service.prisma, product-service.prisma, order-service.prisma มี model definitions ต่างจาก runtime จริง ไม่ใช่แค่ comment/format ต้องจัดการให้มี canonical source ที่ชัดเจนในแผนแก้
- git status ตอนก่อน/หลังรอบตรวจนี้ clean ไม่มีการแก้ tracked/untracked repository files โดยงานตรวจ

## D. ข้อสรุปก่อนอนุมัติแก้

**แก้ข้อสังเกตจาก progress message ก่อนหน้า:** Products.id, Marketing Audit Logs.id, Order.status, Campaign.discount_type/min_order_price/status/description, Auction Items.closed_at, Auction Rounds.submission_ends_at และ TICKET_SLA_TARGET.updated_at มีในแบบจริง เมื่ออ่าน endpoint แบบพิกัดแล้ว ไม่ถือว่าขาด/เกิน รายงานนี้แทนรายการที่ได้จากการอ่านเฉพาะ node IDs ก่อนหน้า

ยังไม่พร้อมเขียน migration แบบ strict เพราะ requirement สองข้อคือ 'ตรง ER ทุกตาราง/คอลัมน์' กับ 'backend ทำงานเดิมได้' มีจุดที่ขัดกัน การตัดข้อมูลออกไม่สามารถรักษาฟังก์ชันเดิมได้โดยอัตโนมัติ

ต้องตกลงอย่างน้อย:
1. ใช้ชื่อในภาพเป็น physical identifier ตรงตัวหรืออนุญาต canonical naming mapping ที่ระบุชัด
2. แก้/ยืนยันชื่อสะกดผิด, duplicate attribute, ambiguous PK และ cardinality
3. พฤติกรรม backend ที่จะยังคงไว้ และสิ่งที่ยอมตัดเมื่อ ER ไม่มีที่เก็บข้อมูล
4. baseline ที่เป็นข้อกำหนดจริง (draw.io หรือ PDF revision ไหน)
5. อนุญาต environment ชั่วคราวแยกสำหรับ fresh migration/API integration/rollback/upgrade โดยไม่แตะข้อมูลจริง

เมื่อข้อเหล่านี้ตกลงแล้วจึงสรุป manifest การเปลี่ยนแปลงให้ยืนยันก่อนแก้จริง ไม่แก้ source หรือฐานข้อมูลล่วงหน้า


## E. Inventory สรุป

|Service|ER entity|Schema model|ไม่มี model|Model นอก ER|ชุดคอลัมน์เท่ากันหลังจับคู่|
|---|---:|---:|---:|---:|---:|
|Auth Service|17|16|1|0|16|
|Customer Service|13|14|0|1|9|
|Order Service|14|14|1|1|0|
|Product Service|17|19|1|3|10|

## F. ความต่างทุก entity (ไม่รวม type/constraint ที่ ER ไม่ระบุ)

ER-only = มีชื่อในแบบแต่ไม่มี physical column ชื่อนั้น; Schema-only = มีใน schema แต่ไม่มีชื่อในแบบ ทั้งสองฝั่งอาจเป็นการ rename แต่ยังไม่อนุมัติว่าแทนกันได้


### Auth Service

|ER entity|SQL table ที่จับคู่เพื่อตรวจ|ER-only|Schema-only|
|---|---|---|---|
|`users`|`users`|—|—|
|`executive_audit_logs`|`executive_audit_logs`|—|—|
|`shop_change_requests`|`shop_change_requests`|—|—|
|`reports`|`reports`|—|—|
|`admin_audits`|`admin_audits`|—|—|
|`seller_profiles`|`seller_profiles`|—|—|
|`bulk_action_runs`|`bulk_action_runs`|—|—|
|`user_addresses`|`user_addresses`|—|—|
|`buyer_profiles`|`buyer_profiles`|—|—|
|`user_roles`|`user_roles`|—|—|
|`kyc_applications`|`kyc_applications`|—|—|
|`buyer_activity_logs`|`buyer_activity_logs`|—|—|
|`refresh_tokens`|`refresh_tokens`|—|—|
|`login_logs`|`login_logs`|—|—|
|`role`|`role`|—|—|
|`shop_change_request_items`|`shop_change_request_items`|—|—|
|`auto_messages`|**ไม่มี model**|`message_text`, `message_id`, `is_active`, `user_id`|—|

### Customer Service

|ER entity|SQL table ที่จับคู่เพื่อตรวจ|ER-only|Schema-only|
|---|---|---|---|
|`TICKET_CATEGORY`|`ticket_categories`|—|—|
|`TICKET_PRIORITY`|`ticket_priorities`|—|—|
|`TICKET_STATUS`|`ticket_statuses`|—|—|
|`SLA_POLICY`|`sla_policies`|—|—|
|`TICKET_ASSIGNMENT`|`ticket_assignments`|—|—|
|`SUPPORT_TICKET`|`support_tickets`|`target_user_id`, `ticket_id`|`chat_responder_id`, `id`, `priority_score`, `risk_report_count`, `target_id`|
|`TICKET_STATUS_HISTORY`|`ticket_status_history`|—|—|
|`TICKET_SLA_TARGET`|`ticket_sla_targets`|—|`cycle`|
|`TICKET_AUDIT_EVENT`|`ticket_audit_events`|`audit_event_id`|`id`|
|`TICKET_CHAT_LINK`|`ticket_chat_links`|—|—|
|`HELP_CATEGORY`|`help_categories`|—|—|
|`HELP_ARTICLE`|`help_articles`|`article_id`|`id`, `published_at`|
|`HELP_ARTICLE_REVISION`|`help_article_revisions`|—|—|

Model/table นอก ER:
- `ticket_messages`: `id`, `ticket_id`, `author_id`, `author_role`, `body`, `is_internal`, `chat_message_id`, `created_at`

### Order Service

|ER entity|SQL table ที่จับคู่เพื่อตรวจ|ER-only|Schema-only|
|---|---|---|---|
|`dispute_audit_log`|`dispute_audit_log`|`dispute_id`, `id`|`dispute_evidence_id`|
|`dispute_evidence`|`dispute_evidence`|`dispute_evidence _id`, `dispute_status`, `update_at`|`dispute_evidence_id`, `evidence_path`, `updated_at`|
|`dispute_case`|`dispute_case`|`dispute_case _id`, `version`|`assigned_role`, `created_at`, `decided_at`, `decided_by`, `decision_due_at`, `decision_reason`, `dispute_case_version`, `escalated_by`, `escalation_note`, `first_review_due_at`, `first_reviewed_at`, `id`, `priority`, `priority_score`, `risk_report_count`, `sla_expires_at`, `sla_policy_version`, `status`, `verdict_key`|
|`safety_dispute_evidence`|`safety_dispute_evidence`|`safety_ id`, `verify _at`|`safety_id`, `verify_at`|
|`orders`|`orders`|`campane_id`, `order id`|`auction_id`, `basket_id`, `campaign_code`, `campaign_id`, `checkout_id`, `order_id`, `pre_dispute_status`, `product_title`|
|`basket`|`basket`|`basket  id`|`basket_id`|
|`payment`|`payment`|—|`created_at`|
|`shipping`|`shipping`|`companny`, `order id`|`address_snapshot`, `company`, `order_id`, `updated_at`|
|`hold`|`hold`|`hold_type`, `ref_id`|`hold_at`, `hold_by`, `payment_id`, `reference_id`, `released_by`, `source`|
|`order_log`|`order_log`|—|`actor_id`, `order_id`|
|`safety_log`|`safety_log`|`evidence_id`|`action`, `safety_id`, `safety_log_id`|
|`checkout`|`checkouts`|—|`address_snapshot`, `orders_amount`, `original_amount`, `updated_at`|
|`dispute_case_log`|`dispute_case_log`|—|`from_assigned_role`, `to_assigned_role`|
|`evidence`|**ไม่มี model**|`ref_path`, `dispute_evidence _id`, `evidence_id`|—|

Model/table นอก ER:
- `attribution_outbox_events`: `id`, `order_id`, `campaign_id`, `gross_amount`, `discount_amount`, `net_amount`, `completed_at`, `attempts`, `last_error`, `next_attempt_at`, `processed_at`, `created_at`, `updated_at`

### Product Service

|ER entity|SQL table ที่จับคู่เพื่อตรวจ|ER-only|Schema-only|
|---|---|---|---|
|`Products`|`products`|`crated_at`, `pre_removal`, `reservation_expires`|`created_at`, `pre_removal_status`, `reservation_expires_at`|
|`Auction Items`|`auction_items`|—|`cancellation_reason`, `cancelled_at`, `cancelled_by`|
|`Auction Rounds`|`auction_rounds`|—|`cancellation_reason`, `cancelled_at`, `cancelled_by`, `categories`, `title`|
|`Photo`|`photos`|—|—|
|`Bids`|`bids`|—|—|
|`Videos`|`videos`|—|—|
|`Campaign Attributions`|`campaign_attributions`|—|—|
|`Videos    Swipe`|`product_videos`|`crated_at`|`created_at`|
|`Marketing Audit Logs`|`marketing_audit_logs`|—|—|
|`Swipe Choices`|`swipe_choices`|—|—|
|`Campaigns`|`campaigns`|—|`spent_budget`|
|`User Vouchers`|`user_vouchers`|—|—|
|`Articles`|`articles`|—|—|
|`Count Views`|**ไม่มี model**|`viewer_id`, `product_id`, `count`|—|
|`Reviews`|`reviews`|`date`|`created_at`|
|`Conditions`|`conditions`|—|—|
|`Categories`|`categories`|—|—|

Model/table นอก ER:
- `product_moderation_commands`: `idempotency_key`, `action`, `product_id`, `payload_hash`, `result`, `created_at`
- `review_photos`: `id`, `review_id`, `url`, `position`, `created_at`
- `review_videos`: `id`, `review_id`, `url`, `position`, `created_at`

## G. Appendix: คอลัมน์ คีย์ constraint และ references ครบทุก entity

นี่เป็น inventory จากไฟล์ ไม่ใช่ข้อเสนอแก้ที่ได้รับอนุมัติ


### Auth Service

ER source: `C:/ise/Ise/database/erdesign\Auth Service\ข้อ 1/ER_auth.drawio`

Runtime source: `C:/ise/Ise/backend/services/auth-service/prisma/schema.prisma`


#### users

Diagram node: `User`; aliases: `User`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `User_attr_id`
- `email [UK]` → ชื่อที่แยก annotation แล้ว `email`; ขีดเส้นใต้/มี key annotation; node `User_attr_email`
- `password_hash` → ชื่อที่แยก annotation แล้ว `password_hash`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_password_hash`
- `f_name` → ชื่อที่แยก annotation แล้ว `f_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_f_name`
- `l_name` → ชื่อที่แยก annotation แล้ว `l_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_l_name`
- `phone` → ชื่อที่แยก annotation แล้ว `phone`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_phone`
- `role` → ชื่อที่แยก annotation แล้ว `role`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_role`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_status`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_created_at`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `User_attr_updated_at`

Model `User` / table `users`, schema line 28

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id           String   @id @default(uuid())
email        String   @unique
passwordHash String   @map("password_hash")
firstName    String   @map("f_name")
lastName     String   @map("l_name")
phone        String?
role         String   @default("BUYER")
status       String   @default("ACTIVE")
createdAt    DateTime @default(now()) @map("created_at")
updatedAt    DateTime @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
buyerProfile       BuyerProfile?
sellerProfile      SellerProfile?
loginLogs          LoginLog[]
buyerActivityLogs  BuyerActivityLog[]
refreshTokens      RefreshToken[]
reports            Report[]
roles              UserRole[]
kycApplications    KycApplication[]
addresses          UserAddress[]
shopChangeRequests ShopChangeRequest[]
adminAudits        AdminAudit[]        @relation("AdminAuditActor")
bulkActionRuns     BulkActionRun[]     @relation("BulkActionActor")
executiveAuditLogs ExecutiveAuditLog[] @relation("ExecutiveAuditActor")
@@map("users")
```

#### executive_audit_logs

Diagram node: `ExecutiveAuditLog`; aliases: `ExecutiveAuditLog`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `ExecutiveAuditLog_attr_id`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_actor_id`
- `actor_email` → ชื่อที่แยก annotation แล้ว `actor_email`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_actor_email`
- `actor_role` → ชื่อที่แยก annotation แล้ว `actor_role`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_actor_role`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_action`
- `category` → ชื่อที่แยก annotation แล้ว `category`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_category`
- `target_type` → ชื่อที่แยก annotation แล้ว `target_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_target_type`
- `target_id` → ชื่อที่แยก annotation แล้ว `target_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_target_id`
- `description` → ชื่อที่แยก annotation แล้ว `description`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_description`
- `metadata` → ชื่อที่แยก annotation แล้ว `metadata`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_metadata`
- `ip_address` → ชื่อที่แยก annotation แล้ว `ip_address`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_ip_address`
- `user_agent` → ชื่อที่แยก annotation แล้ว `user_agent`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_user_agent`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ExecutiveAuditLog_attr_created_at`

Model `ExecutiveAuditLog` / table `executive_audit_logs`, schema line 283

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id          String   @id @default(uuid())
actorId     String   @map("actor_id")
actorEmail  String?  @map("actor_email")
actorRole   String?  @map("actor_role")
action      String // e.g. "REPORT_EXPORT_CSV", "COMPLAINT_ACTIONED", "COMPLAINT_DISMISSED", "FINANCIAL_VIEW"
category    String // e.g. "DATA_EXPORT", "MODERATION", "FINANCIAL", "SECURITY"
targetType  String?  @map("target_type") // e.g. "report", "complaint", "order"
targetId    String?  @map("target_id")
description String
metadata    Json?
ipAddress   String?  @map("ip_address")
userAgent   String?  @map("user_agent")
createdAt   DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
actor User @relation("ExecutiveAuditActor", fields: [actorId], references: [id])
@@index([actorId])
@@index([action])
@@index([category])
@@index([createdAt])
@@map("executive_audit_logs")
```

#### shop_change_requests

Diagram node: `ShopChangeRequest`; aliases: `ShopChangeRequest`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `requests_id` → ชื่อที่แยก annotation แล้ว `requests_id`; ขีดเส้นใต้/มี key annotation; node `ShopChangeRequest_attr_id`
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_seller_id`
- `comment` → ชื่อที่แยก annotation แล้ว `comment`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_comment`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_status`
- `admin_note` → ชื่อที่แยก annotation แล้ว `admin_note`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_admin_note`
- `reviewed_by` → ชื่อที่แยก annotation แล้ว `reviewed_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_reviewed_by`
- `reviewed_at` → ชื่อที่แยก annotation แล้ว `reviewed_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_reviewed_at`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ShopChangeRequest_attr_created_at`

Model `ShopChangeRequest` / table `shop_change_requests`, schema line 310

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id         String                  @id @default(uuid()) @map("requests_id")
sellerId   String                  @map("seller_id")
comment    String
status     String                  @default("PENDING")
adminNote  String?                 @map("admin_note")
reviewedBy String?                 @map("reviewed_by")
reviewedAt DateTime?               @map("reviewed_at")
createdAt  DateTime                @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
seller     User                    @relation(fields: [sellerId], references: [id])
items      ShopChangeRequestItem[]
@@index([sellerId])
@@index([status])
@@map("shop_change_requests")
```

#### reports

Diagram node: `Report`; aliases: `Report`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `Report_attr_id`
- `reporter_id` → ชื่อที่แยก annotation แล้ว `reporter_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_reporter_id`
- `target_id` → ชื่อที่แยก annotation แล้ว `target_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_target_id`
- `product_id` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_product_id`
- `reason` → ชื่อที่แยก annotation แล้ว `reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_reason`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_status`
- `reported_at` → ชื่อที่แยก annotation แล้ว `reported_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_reported_at`
- `reviewed_at` → ชื่อที่แยก annotation แล้ว `reviewed_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_reviewed_at`
- `reviewed_by` → ชื่อที่แยก annotation แล้ว `reviewed_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_reviewed_by`
- `action_taken` → ชื่อที่แยก annotation แล้ว `action_taken`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Report_attr_action_taken`

Model `Report` / table `reports`, schema line 176

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id          String       @id @default(uuid())
reporterId  String       @map("reporter_id")
targetId    String?      @map("target_id")
productId   String?      @map("product_id")
reason      String
status      ReportStatus @default(OPEN)
reportedAt  DateTime     @default(now()) @map("reported_at")
reviewedAt  DateTime?    @map("reviewed_at")
reviewedBy  String?      @map("reviewed_by")
actionTaken String?      @map("action_taken")
```
Relations + model-level constraints:
```prisma
reporter    User         @relation(fields: [reporterId], references: [id])
@@map("reports")
```

#### admin_audits

Diagram node: `AdminAudit`; aliases: `AdminAudit`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `AdminAudit_attr_id`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `AdminAudit_attr_actor_id`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `AdminAudit_attr_action`
- `target_id` → ชื่อที่แยก annotation แล้ว `target_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `AdminAudit_attr_target_id`
- `reason` → ชื่อที่แยก annotation แล้ว `reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `AdminAudit_attr_reason`
- `request_id` → ชื่อที่แยก annotation แล้ว `request_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `AdminAudit_attr_request_id`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `AdminAudit_attr_created_at`

Model `AdminAudit` / table `admin_audits`, schema line 195

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid())
actorId   String   @map("actor_id")
action    String
targetId  String   @map("target_id")
reason    String
requestId String?  @map("request_id")
createdAt DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
actor User @relation("AdminAuditActor", fields: [actorId], references: [id])
@@index([targetId])
@@map("admin_audits")
```

#### seller_profiles

Diagram node: `SellerProfile_inner`; aliases: `SellerProfile_inner`, `SellerProfile`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ขีดเส้นใต้/มี key annotation; node `SellerProfile_attr_user_id`
- `shop_name` → ชื่อที่แยก annotation แล้ว `shop_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_shop_name`
- `id_card_number` → ชื่อที่แยก annotation แล้ว `id_card_number`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_id_card_number`
- `id_card_expiry` → ชื่อที่แยก annotation แล้ว `id_card_expiry`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_id_card_expiry`
- `address` → ชื่อที่แยก annotation แล้ว `address`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_address`
- `bank_account` → ชื่อที่แยก annotation แล้ว `bank_account`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_bank_account`
- `kyc_status` → ชื่อที่แยก annotation แล้ว `kyc_status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_kyc_status`
- `kyc_storage_key` → ชื่อที่แยก annotation แล้ว `kyc_storage_key`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_kyc_storage_key`
- `verified_at` → ชื่อที่แยก annotation แล้ว `verified_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_verified_at`
- `last_active_at` → ชื่อที่แยก annotation แล้ว `last_active_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SellerProfile_attr_last_active_at`

Model `SellerProfile` / table `seller_profiles`, schema line 96

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
userId        String    @id @map("user_id")
shopName      String    @map("shop_name")
idCardNumber  String?   @map("id_card_number")
idCardExpiry  DateTime? @map("id_card_expiry")
address       String?
bankAccount   String?   @map("bank_account")
kycStatus     KycStatus @default(NONE) @map("kyc_status")
kycStorageKey String?   @map("kyc_storage_key")
verifiedAt    DateTime? @map("verified_at")
lastActiveAt  DateTime? @map("last_active_at")
```
Relations + model-level constraints:
```prisma
user          User      @relation(fields: [userId], references: [id])
@@map("seller_profiles")
```

#### bulk_action_runs

Diagram node: `BulkActionRun`; aliases: `BulkActionRun`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `BulkActionRun_attr_id`
- `idempotency_key [UK]` → ชื่อที่แยก annotation แล้ว `idempotency_key`; ขีดเส้นใต้/มี key annotation; node `BulkActionRun_attr_idempotency_key`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BulkActionRun_attr_actor_id`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BulkActionRun_attr_action`
- `reason` → ชื่อที่แยก annotation แล้ว `reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BulkActionRun_attr_reason`
- `requested_ids` → ชื่อที่แยก annotation แล้ว `requested_ids`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BulkActionRun_attr_requested_ids`
- `results` → ชื่อที่แยก annotation แล้ว `results`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BulkActionRun_attr_results`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BulkActionRun_attr_created_at`

Model `BulkActionRun` / table `bulk_action_runs`, schema line 214

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id             String   @id @default(uuid())
idempotencyKey String   @unique @map("idempotency_key")
actorId        String   @map("actor_id")
action         String
reason         String
requestedIds   String[] @map("requested_ids")
results        Json
createdAt      DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
actor User @relation("BulkActionActor", fields: [actorId], references: [id])
@@map("bulk_action_runs")
```

#### user_addresses

Diagram node: `UserAddress`; aliases: `UserAddress`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `UserAddress_attr_id`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_user_id`
- `recipient_name` → ชื่อที่แยก annotation แล้ว `recipient_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_recipient_name`
- `phone` → ชื่อที่แยก annotation แล้ว `phone`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_phone`
- `address_line` → ชื่อที่แยก annotation แล้ว `address_line`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_address_line`
- `subdistrict` → ชื่อที่แยก annotation แล้ว `subdistrict`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_subdistrict`
- `district` → ชื่อที่แยก annotation แล้ว `district`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_district`
- `province` → ชื่อที่แยก annotation แล้ว `province`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_province`
- `postal_code` → ชื่อที่แยก annotation แล้ว `postal_code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_postal_code`
- `is_default` → ชื่อที่แยก annotation แล้ว `is_default`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_is_default`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_created_at`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserAddress_attr_updated_at`

Model `UserAddress` / table `user_addresses`, schema line 61

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id            String   @id @default(uuid())
userId        String   @map("user_id")
recipientName String   @map("recipient_name")
phone         String
addressLine   String   @map("address_line")
subdistrict   String
district      String
province      String
postalCode    String   @map("postal_code")
isDefault     Boolean  @default(false) @map("is_default")
createdAt     DateTime @default(now()) @map("created_at")
updatedAt     DateTime @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
@@index([userId])
@@index([userId, isDefault])
@@map("user_addresses")
```

#### buyer_profiles

Diagram node: `BuyerProfile_inner`; aliases: `BuyerProfile`, `BuyerProfile_inner`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ขีดเส้นใต้/มี key annotation; node `BuyerProfile_attr_user_id`
- `style_preference` → ชื่อที่แยก annotation แล้ว `style_preference`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerProfile_attr_style_preference`
- `size_preference` → ชื่อที่แยก annotation แล้ว `size_preference`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerProfile_attr_size_preference`
- `brand_preference` → ชื่อที่แยก annotation แล้ว `brand_preference`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerProfile_attr_brand_preference`
- `favorite_category` → ชื่อที่แยก annotation แล้ว `favorite_category`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `VQ6EYKtVVacwPCIFwlOz-2`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `VQ6EYKtVVacwPCIFwlOz-6`

Model `BuyerProfile` / table `buyer_profiles`, schema line 83

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
userId           String   @id @map("user_id")
favoriteCategory String?  @map("favorite_category")
stylePreference  String?  @map("style_preference")
sizePreference   String?  @map("size_preference")
brandPreference  String?  @map("brand_preference")
updatedAt        DateTime @default(now()) @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
user             User     @relation(fields: [userId], references: [id])
@@map("buyer_profiles")
```

#### user_roles

Diagram node: `UserRole`; aliases: `UserRole`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `UserRole_attr_id`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserRole_attr_user_id`
- `role_code` → ชื่อที่แยก annotation แล้ว `role_code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserRole_attr_role`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `UserRole_attr_created_at`

Model `UserRole` / table `user_roles`, schema line 244

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String         @id @default(uuid())
userId    String         @map("user_id")
role      String         @map("role_code")
createdAt DateTime       @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
user      User           @relation(fields: [userId], references: [id])
roleEntry RoleDefinition @relation(fields: [role], references: [code])
@@unique([userId, role], map: "user_roles_user_id_role_key")
@@map("user_roles")
```

#### kyc_applications

Diagram node: `KycApplication`; aliases: `KycApplication`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `KycApplication_attr_id`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_user_id`
- `storage_key` → ชื่อที่แยก annotation แล้ว `storage_key`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_storage_key`
- `file_type` → ชื่อที่แยก annotation แล้ว `file_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_file_type`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_status`
- `reason` → ชื่อที่แยก annotation แล้ว `reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_reason`
- `version` → ชื่อที่แยก annotation แล้ว `version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_version`
- `submitted_at` → ชื่อที่แยก annotation แล้ว `submitted_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_submitted_at`
- `decided_at` → ชื่อที่แยก annotation แล้ว `decided_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_decided_at`
- `decided_by` → ชื่อที่แยก annotation แล้ว `decided_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `KycApplication_attr_decided_by`

Model `KycApplication` / table `kyc_applications`, schema line 262

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id          String    @id @default(uuid())
userId      String    @map("user_id")
storageKey  String    @map("storage_key")
fileType    String    @map("file_type")
status      KycStatus @default(PENDING)
reason      String?
version     Int       @default(1)
submittedAt DateTime  @default(now()) @map("submitted_at")
decidedAt   DateTime? @map("decided_at")
decidedBy   String?   @map("decided_by")
```
Relations + model-level constraints:
```prisma
user        User      @relation(fields: [userId], references: [id])
@@map("kyc_applications")
```

#### buyer_activity_logs

Diagram node: `BuyerActivityLog`; aliases: `BuyerActivityLog`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `BuyerActivityLog_attr_id`
- `buyer_id` → ชื่อที่แยก annotation แล้ว `buyer_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_buyer_id`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_action`
- `source` → ชื่อที่แยก annotation แล้ว `source`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_source`
- `target_type` → ชื่อที่แยก annotation แล้ว `target_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_target_type`
- `target_id` → ชื่อที่แยก annotation แล้ว `target_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_target_id`
- `metadata` → ชื่อที่แยก annotation แล้ว `metadata`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_metadata`
- `request_id [UK]` → ชื่อที่แยก annotation แล้ว `request_id`; ขีดเส้นใต้/มี key annotation; node `BuyerActivityLog_attr_request_id`
- `ip_address` → ชื่อที่แยก annotation แล้ว `ip_address`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_ip_address`
- `user_agent` → ชื่อที่แยก annotation แล้ว `user_agent`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_user_agent`
- `occurred_at` → ชื่อที่แยก annotation แล้ว `occurred_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_occurred_at`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `BuyerActivityLog_attr_created_at`

Model `BuyerActivityLog` / table `buyer_activity_logs`, schema line 138

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id         String   @id @default(uuid())
buyerId    String   @map("buyer_id")
action     String
source     String
targetType String?  @map("target_type")
targetId   String?  @map("target_id")
metadata   Json?
requestId  String?  @unique @map("request_id")
ipAddress  String?  @map("ip_address")
userAgent  String?  @map("user_agent")
occurredAt DateTime @default(now()) @map("occurred_at")
createdAt  DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
buyer      User     @relation(fields: [buyerId], references: [id])
@@index([buyerId, occurredAt])
@@index([action, occurredAt])
@@index([targetType, targetId])
@@map("buyer_activity_logs")
```

#### refresh_tokens

Diagram node: `RefreshToken`; aliases: `RefreshToken`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `RefreshToken_attr_id`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RefreshToken_attr_user_id`
- `token [UK]` → ชื่อที่แยก annotation แล้ว `token`; ขีดเส้นใต้/มี key annotation; node `RefreshToken_attr_token`
- `expires_at` → ชื่อที่แยก annotation แล้ว `expires_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RefreshToken_attr_expires_at`
- `revoked_at` → ชื่อที่แยก annotation แล้ว `revoked_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RefreshToken_attr_revoked_at`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RefreshToken_attr_created_at`

Model `RefreshToken` / table `refresh_tokens`, schema line 160

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String    @id @default(uuid())
userId    String    @map("user_id")
token     String    @unique
expiresAt DateTime  @map("expires_at")
revokedAt DateTime? @map("revoked_at")
createdAt DateTime  @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
user      User      @relation(fields: [userId], references: [id])
@@map("refresh_tokens")
```

#### login_logs

Diagram node: `LoginLog`; aliases: `LoginLog`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `LoginLog_attr_id`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `LoginLog_attr_user_id`
- `session_id [UK]` → ชื่อที่แยก annotation แล้ว `session_id`; ขีดเส้นใต้/มี key annotation; node `LoginLog_attr_session_id`
- `login_at` → ชื่อที่แยก annotation แล้ว `login_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `LoginLog_attr_login_at`
- `logout_at` → ชื่อที่แยก annotation แล้ว `logout_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `LoginLog_attr_logout_at`
- `ip_address` → ชื่อที่แยก annotation แล้ว `ip_address`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `LoginLog_attr_ip_address`
- `user_agent` → ชื่อที่แยก annotation แล้ว `user_agent`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `LoginLog_attr_user_agent`

Model `LoginLog` / table `login_logs`, schema line 121

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String    @id @default(uuid())
userId    String    @map("user_id")
sessionId String?   @unique @map("session_id")
loginAt   DateTime  @default(now()) @map("login_at")
logoutAt  DateTime? @map("logout_at")
ipAddress String?   @map("ip_address")
userAgent String?   @map("user_agent")
```
Relations + model-level constraints:
```prisma
user      User      @relation(fields: [userId], references: [id])
@@index([userId, loginAt])
@@map("login_logs")
```

#### role

Diagram node: `uzZGCME6mqKVsLGSZIf6-5`; aliases: `uzZGCME6mqKVsLGSZIf6-5`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `role_id` → ชื่อที่แยก annotation แล้ว `role_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `uzZGCME6mqKVsLGSZIf6-12`
- `role_code` → ชื่อที่แยก annotation แล้ว `role_code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `uzZGCME6mqKVsLGSZIf6-11`

Model `RoleDefinition` / table `role`, schema line 235

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id   String @id @default(uuid()) @map("role_id")
code String @unique @map("role_code")
```
Relations + model-level constraints:
```prisma
userRoles UserRole[]
@@map("role")
```

#### shop_change_request_items

Diagram node: `Neexiyz8ivCbqaFBrd0P-13`; aliases: `Neexiyz8ivCbqaFBrd0P-13`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `Neexiyz8ivCbqaFBrd0P-14`
- `requests_id` → ชื่อที่แยก annotation แล้ว `requests_id`; ขีดเส้นใต้/มี key annotation; node `Neexiyz8ivCbqaFBrd0P-15`
- `new_value` → ชื่อที่แยก annotation แล้ว `new_value`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Neexiyz8ivCbqaFBrd0P-18`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Neexiyz8ivCbqaFBrd0P-19`
- `field_name` → ชื่อที่แยก annotation แล้ว `field_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Neexiyz8ivCbqaFBrd0P-20`
- `old_value` → ชื่อที่แยก annotation แล้ว `old_value`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `Neexiyz8ivCbqaFBrd0P-21`

Model `ShopChangeRequestItem` / table `shop_change_request_items`, schema line 331

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String            @id @default(uuid())
requestId String            @map("requests_id")
fieldName String            @map("field_name")
oldValue  String?           @map("old_value")
newValue  String            @map("new_value")
createdAt DateTime          @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
request   ShopChangeRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
@@unique([requestId, fieldName])
@@index([requestId])
@@map("shop_change_request_items")
```

#### auto_messages

Diagram node: `-e9kEy85HbYlB3IO1F2W-11`; aliases: `-e9kEy85HbYlB3IO1F2W-11`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `message_text` → ชื่อที่แยก annotation แล้ว `message_text`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `-e9kEy85HbYlB3IO1F2W-13`
- `message_id` → ชื่อที่แยก annotation แล้ว `message_id`; ขีดเส้นใต้/มี key annotation; node `-e9kEy85HbYlB3IO1F2W-15`
- `is_active` → ชื่อที่แยก annotation แล้ว `is_active`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `-e9kEy85HbYlB3IO1F2W-21`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `-e9kEy85HbYlB3IO1F2W-24`

**ไม่พบ model/table ใน runtime schema ของ service นี้**

#### Model/table นอก ER — definitions ครบ


#### Free-coordinate endpoint resolutions

รายการนี้เป็นการจับคู่ปลายเส้นที่ไม่ใช้ source/target ID กับกรอบ node ที่พิกัดสัมผัสอย่างไม่กำกวม ไม่ได้แก้ไฟล์ ER

- edge `rel_SellerProfile_entity_inner` source point [3295.175328106039, 1411.459628488752] → node `rel_SellerProfile`, distance 0px
- edge `rel_SellerProfile_entity_inner` target point [4051.002131147541, 1148] → node `SellerProfile`, distance 0px
- edge `rel_BuyerProfile_entity_inner` source point [1495.6113529765482, 2137.729404690319] → node `rel_BuyerProfile`, distance 0px
Unassigned oval attributes: 0

#### Relationships ที่อ่านได้จาก XML

Cardinality labels ต่อไปนี้เป็นข้อความจาก XML ไม่ใช่การยืนยันทางภาพ; ข้อจำกัดเกี่ยวกับ labels/endpoints อยู่ใน A4; entity ที่ซ้ำในรายการปลายเส้นของ weak entity มาจากกรอบนอก/ใน ไม่ได้แปลว่าเป็น ternary relationship

- node `rel_ExecutiveAuditLog` / label `performs`: `users` [edge `rel_ExecutiveAuditLog_user`; labels ['']] ↔ `executive_audit_logs` [edge `rel_ExecutiveAuditLog_entity`; labels ['']]
- node `rel_ShopChangeRequest` / label `requests`: `users` [edge `rel_ShopChangeRequest_user`; labels ['']] ↔ `shop_change_requests` [edge `rel_ShopChangeRequest_entity`; labels ['']]
- node `rel_Report` / label `reports`: `users` [edge `rel_Report_user`; labels ['']] ↔ `reports` [edge `rel_Report_entity`; labels ['']]
- node `rel_AdminAudit` / label `performs`: `users` [edge `rel_AdminAudit_user`; labels ['']] ↔ `admin_audits` [edge `rel_AdminAudit_entity`; labels ['']]
- node `rel_SellerProfile` / label `has`: `users` [edge `rel_SellerProfile_user`; labels ['']] ↔ `seller_profiles` [edge `rel_SellerProfile_entity`; labels ['']] ↔ `seller_profiles` [edge `rel_SellerProfile_entity_inner`; labels ['']]
- node `rel_BulkActionRun` / label `runs`: `users` [edge `rel_BulkActionRun_user`; labels ['']] ↔ `bulk_action_runs` [edge `rel_BulkActionRun_entity`; labels ['']]
- node `rel_UserAddress` / label `has`: `users` [edge `rel_UserAddress_user`; labels ['']] ↔ `user_addresses` [edge `rel_UserAddress_entity`; labels ['']]
- node `rel_BuyerProfile` / label `has`: `users` [edge `rel_BuyerProfile_user`; labels ['']] ↔ `buyer_profiles` [edge `rel_BuyerProfile_entity`; labels ['']] ↔ `buyer_profiles` [edge `rel_BuyerProfile_entity_inner`; labels ['']]
- node `rel_UserRole` / label `holds`: `users` [edge `rel_UserRole_user`; labels ['']] ↔ `user_roles` [edge `rel_UserRole_entity`; labels ['']]
- node `rel_KycApplication` / label `submits`: `users` [edge `rel_KycApplication_user`; labels ['']] ↔ `kyc_applications` [edge `rel_KycApplication_entity`; labels ['']]
- node `rel_BuyerActivityLog` / label `records`: `users` [edge `rel_BuyerActivityLog_user`; labels ['']] ↔ `buyer_activity_logs` [edge `rel_BuyerActivityLog_entity`; labels ['']]
- node `rel_RefreshToken` / label `owns`: `users` [edge `rel_RefreshToken_user`; labels ['']] ↔ `refresh_tokens` [edge `rel_RefreshToken_entity`; labels ['']]
- node `rel_LoginLog` / label `logs in`: `users` [edge `rel_LoginLog_user`; labels ['']] ↔ `login_logs` [edge `rel_LoginLog_entity`; labels ['']]
- node `uzZGCME6mqKVsLGSZIf6-6` / label `Is`: `user_roles` [edge `uzZGCME6mqKVsLGSZIf6-8`; labels ['']] ↔ `role` [edge `uzZGCME6mqKVsLGSZIf6-10`; labels ['']]
- node `Neexiyz8ivCbqaFBrd0P-25` / label `Have`: `shop_change_request_items` [edge `Neexiyz8ivCbqaFBrd0P-26`; labels ['']] ↔ `shop_change_requests` [edge `Neexiyz8ivCbqaFBrd0P-27`; labels ['']]
- node `-e9kEy85HbYlB3IO1F2W-16` / label `have`: `seller_profiles` [edge `-e9kEy85HbYlB3IO1F2W-17`; labels ['']] ↔ `auto_messages` [edge `-e9kEy85HbYlB3IO1F2W-18`; labels ['']]

### Customer Service

ER source: `C:/ise/Ise/database/erdesign\Customer Service\ข้อ 1/customer-service-คน-er.drawio`

Runtime source: `C:/ise/Ise/backend/services/support-service/prisma/schema.prisma`


#### TICKET_CATEGORY

Diagram node: `ticket-category`; aliases: `ticket-category`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `ticket_category_id` → ชื่อที่แยก annotation แล้ว `ticket_category_id`; ขีดเส้นใต้/มี key annotation; node `ticket-category-attr-1`
- `code` → ชื่อที่แยก annotation แล้ว `code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-category-attr-2`
- `name_th  varchar(100)` → ชื่อที่แยก annotation แล้ว `name_th`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-category-attr-3`
- `name_en` → ชื่อที่แยก annotation แล้ว `name_en`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-category-attr-4`
- `is_active` → ชื่อที่แยก annotation แล้ว `is_active`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-category-attr-5`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-category-attr-6`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-category-attr-7`

Model `TicketCategory` / table `ticket_categories`, schema line 13

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        Int             @id @default(autoincrement()) @map("ticket_category_id") @db.SmallInt
code      String          @unique @db.VarChar(30)
nameTh    String          @map("name_th") @db.VarChar(100)
nameEn    String?         @map("name_en") @db.VarChar(100)
isActive  Boolean         @default(true) @map("is_active")
createdAt DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt DateTime        @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
tickets   SupportTicket[]
policies  SlaPolicy[]
@@map("ticket_categories")
```

#### TICKET_PRIORITY

Diagram node: `ticket-priority`; aliases: `ticket-priority`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `ticket_priority_id` → ชื่อที่แยก annotation แล้ว `ticket_priority_id`; ขีดเส้นใต้/มี key annotation; node `ticket-priority-attr-1`
- `code` → ชื่อที่แยก annotation แล้ว `code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-priority-attr-2`
- `name` → ชื่อที่แยก annotation แล้ว `name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-priority-attr-3`
- `rank` → ชื่อที่แยก annotation แล้ว `rank`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-priority-attr-4`
- `is_active` → ชื่อที่แยก annotation แล้ว `is_active`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-priority-attr-5`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-priority-attr-6`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-priority-attr-7`

Model `TicketPriority` / table `ticket_priorities`, schema line 27

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        Int             @id @default(autoincrement()) @map("ticket_priority_id") @db.SmallInt
code      String          @unique @db.VarChar(20)
name      String          @db.VarChar(100)
rank      Int             @unique @db.SmallInt
isActive  Boolean         @default(true) @map("is_active")
createdAt DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt DateTime        @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
tickets   SupportTicket[]
policies  SlaPolicy[]
@@map("ticket_priorities")
```

#### TICKET_STATUS

Diagram node: `ticket-status`; aliases: `ticket-status`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `ticket_status_id` → ชื่อที่แยก annotation แล้ว `ticket_status_id`; ขีดเส้นใต้/มี key annotation; node `ticket-status-attr-1`
- `code` → ชื่อที่แยก annotation แล้ว `code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-attr-2`
- `name` → ชื่อที่แยก annotation แล้ว `name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-attr-3`
- `is_terminal` → ชื่อที่แยก annotation แล้ว `is_terminal`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-attr-4`
- `sort_order` → ชื่อที่แยก annotation แล้ว `sort_order`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-attr-5`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-attr-6`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-attr-7`

Model `TicketStatus` / table `ticket_statuses`, schema line 41

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id              Int                   @id @default(autoincrement()) @map("ticket_status_id") @db.SmallInt
code            String                @unique @db.VarChar(30)
name            String                @db.VarChar(100)
isTerminal      Boolean               @default(false) @map("is_terminal")
sortOrder       Int                   @map("sort_order") @db.SmallInt
createdAt       DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt       DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
tickets         SupportTicket[]
transitionsFrom TicketStatusHistory[] @relation("FromStatus")
transitionsTo   TicketStatusHistory[] @relation("ToStatus")
@@map("ticket_statuses")
```

#### SLA_POLICY

Diagram node: `sla-policy`; aliases: `sla-policy`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `sla_policy_id` → ชื่อที่แยก annotation แล้ว `sla_policy_id`; ขีดเส้นใต้/มี key annotation; node `sla-policy-attr-1`
- `ticket_category_id` → ชื่อที่แยก annotation แล้ว `ticket_category_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-2`
- `ticket_priority_id` → ชื่อที่แยก annotation แล้ว `ticket_priority_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-3`
- `first_response_minutes` → ชื่อที่แยก annotation แล้ว `first_response_minutes`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-4`
- `resolution_minutes` → ชื่อที่แยก annotation แล้ว `resolution_minutes`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-5`
- `effective_from` → ชื่อที่แยก annotation แล้ว `effective_from`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-6`
- `effective_to` → ชื่อที่แยก annotation แล้ว `effective_to`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-7`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `sla-policy-attr-8`

Model `SlaPolicy` / table `sla_policies`, schema line 56

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id                   String            @id @default(uuid()) @map("sla_policy_id")
categoryId           Int?              @map("ticket_category_id") @db.SmallInt
priorityId           Int               @map("ticket_priority_id") @db.SmallInt
firstResponseMinutes Int               @map("first_response_minutes")
resolutionMinutes    Int               @map("resolution_minutes")
effectiveFrom        DateTime          @map("effective_from") @db.Timestamptz(3)
effectiveTo          DateTime?         @map("effective_to") @db.Timestamptz(3)
createdAt            DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
category             TicketCategory?   @relation(fields: [categoryId], references: [id], onDelete: Restrict)
priority             TicketPriority    @relation(fields: [priorityId], references: [id], onDelete: Restrict)
targets              TicketSlaTarget[]
@@index([categoryId, priorityId, effectiveFrom])
@@index([priorityId])
@@map("sla_policies")
```

#### TICKET_ASSIGNMENT

Diagram node: `ticket-assignment`; aliases: `ticket-assignment`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `assignment_id` → ชื่อที่แยก annotation แล้ว `assignment_id`; ขีดเส้นใต้/มี key annotation; node `ticket-assignment-attr-1`
- `ticket_id` → ชื่อที่แยก annotation แล้ว `ticket_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-assignment-attr-2`
- `assignee_id` → ชื่อที่แยก annotation แล้ว `assignee_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-assignment-attr-3`
- `assigned_by_id` → ชื่อที่แยก annotation แล้ว `assigned_by_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-assignment-attr-4`
- `assigned_at` → ชื่อที่แยก annotation แล้ว `assigned_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-assignment-attr-5`
- `ended_at` → ชื่อที่แยก annotation แล้ว `ended_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-assignment-attr-6`
- `end_reason` → ชื่อที่แยก annotation แล้ว `end_reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-assignment-attr-7`

Model `TicketAssignment` / table `ticket_assignments`, schema line 110

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id           String        @id @default(uuid()) @map("assignment_id")
ticketId     String        @map("ticket_id")
assigneeId   String        @map("assignee_id")
assignedById String        @map("assigned_by_id")
assignedAt   DateTime      @default(now()) @map("assigned_at") @db.Timestamptz(3)
endedAt      DateTime?     @map("ended_at") @db.Timestamptz(3)
endReason    String?       @map("end_reason")
```
Relations + model-level constraints:
```prisma
ticket       SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
@@index([ticketId, assignedAt])
@@index([assigneeId, endedAt])
@@map("ticket_assignments")
```

#### SUPPORT_TICKET

Diagram node: `support-ticket`; aliases: `support-ticket`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `ticket_id` → ชื่อที่แยก annotation แล้ว `ticket_id`; ขีดเส้นใต้/มี key annotation; node `support-ticket-attr-1`
- `ticket_number` → ชื่อที่แยก annotation แล้ว `ticket_number`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-2`
- `requester_id` → ชื่อที่แยก annotation แล้ว `requester_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-3`
- `subject` → ชื่อที่แยก annotation แล้ว `subject`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-4`
- `description` → ชื่อที่แยก annotation แล้ว `description`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-5`
- `ticket_category_id` → ชื่อที่แยก annotation แล้ว `ticket_category_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-6`
- `ticket_priority_id` → ชื่อที่แยก annotation แล้ว `ticket_priority_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-7`
- `current_status_id` → ชื่อที่แยก annotation แล้ว `current_status_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-8`
- `order_id` → ชื่อที่แยก annotation แล้ว `order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-9`
- `target_user_id` → ชื่อที่แยก annotation แล้ว `target_user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-10`
- `lock_version` → ชื่อที่แยก annotation แล้ว `lock_version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-11`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-12`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `support-ticket-attr-13`

Model `SupportTicket` / table `support_tickets`, schema line 74

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id              String                @id @default(uuid())
ticketNumber    String                @unique @default(dbgenerated("next_support_ticket_number()")) @map("ticket_number")
requesterId     String                @map("requester_id")
subject         String
description     String                @default("")
categoryId      Int                   @map("ticket_category_id") @db.SmallInt
priorityId      Int                   @map("ticket_priority_id") @db.SmallInt
currentStatusId Int                   @map("current_status_id") @db.SmallInt
orderId         String?               @map("order_id")
chatResponderId String?               @map("chat_responder_id")
targetId        String?               @map("target_id")
priorityScore   Int                   @default(0) @map("priority_score")
riskReportCount Int                   @default(0) @map("risk_report_count")
version         Int                   @default(0) @map("lock_version")
createdAt       DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt       DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
category        TicketCategory        @relation(fields: [categoryId], references: [id], onDelete: Restrict)
priority        TicketPriority        @relation(fields: [priorityId], references: [id], onDelete: Restrict)
currentStatus   TicketStatus          @relation(fields: [currentStatusId], references: [id], onDelete: Restrict)
assignments     TicketAssignment[]
statusHistory   TicketStatusHistory[]
slaTargets      TicketSlaTarget[]
chatLink        TicketChatLink?
messages        TicketMessage[]
auditLog        TicketAuditLog[]
@@index([currentStatusId, priorityId, createdAt])
@@index([chatResponderId], map: "support_tickets_chat_responder_idx")
@@index([requesterId, createdAt])
@@index([categoryId])
@@index([priorityId])
@@map("support_tickets")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `chat_responder_id`: 15 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/internal/internalRoutes.js:21`; `C:/ise/Ise/backend/services/support-service/src/features/internal/internalRoutes.js:28`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:301`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:320`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:366`
- `id`: 172 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:44`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:54`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:55`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpController.js:54`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpController.js:64`
- `priority_score`: 4 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:77`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketService.js:95`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketService.js:105`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketService.js:251`
- `risk_report_count`: 3 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:78`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketService.js:106`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketService.js:242`
- `target_id`: 16 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:16`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:29`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:59`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditRoutes.js:24`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketController.js:13`

#### TICKET_STATUS_HISTORY

Diagram node: `ticket-status-history`; aliases: `ticket-status-history`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `status_history_id` → ชื่อที่แยก annotation แล้ว `status_history_id`; ขีดเส้นใต้/มี key annotation; node `ticket-status-history-attr-1`
- `ticket_id` → ชื่อที่แยก annotation แล้ว `ticket_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-history-attr-2`
- `from_status_id` → ชื่อที่แยก annotation แล้ว `from_status_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-history-attr-3`
- `to_status_id` → ชื่อที่แยก annotation แล้ว `to_status_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-history-attr-4`
- `changed_by_id` → ชื่อที่แยก annotation แล้ว `changed_by_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-history-attr-5`
- `reason` → ชื่อที่แยก annotation แล้ว `reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-history-attr-6`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-status-history-attr-7`

Model `TicketStatusHistory` / table `ticket_status_history`, schema line 126

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id           String        @id @default(uuid()) @map("status_history_id")
ticketId     String        @map("ticket_id")
fromStatusId Int?          @map("from_status_id") @db.SmallInt
toStatusId   Int           @map("to_status_id") @db.SmallInt
changedById  String        @map("changed_by_id")
reason       String?
createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
ticket       SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
fromStatus   TicketStatus? @relation("FromStatus", fields: [fromStatusId], references: [id], onDelete: Restrict)
toStatus     TicketStatus  @relation("ToStatus", fields: [toStatusId], references: [id], onDelete: Restrict)
@@index([ticketId, createdAt])
@@index([fromStatusId])
@@index([toStatusId])
@@map("ticket_status_history")
```

#### TICKET_SLA_TARGET

Diagram node: `ticket-sla-target`; aliases: `ticket-sla-target`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `sla_target_id` → ชื่อที่แยก annotation แล้ว `sla_target_id`; ขีดเส้นใต้/มี key annotation; node `ticket-sla-target-attr-1`
- `ticket_id` → ชื่อที่แยก annotation แล้ว `ticket_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-2`
- `sla_policy_id` → ชื่อที่แยก annotation แล้ว `sla_policy_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-3`
- `metric_type` → ชื่อที่แยก annotation แล้ว `metric_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-4`
- `due_at` → ชื่อที่แยก annotation แล้ว `due_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-5`
- `achieved_at` → ชื่อที่แยก annotation แล้ว `achieved_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-6`
- `breached_at` → ชื่อที่แยก annotation แล้ว `breached_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-7`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-8`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-sla-target-attr-9`

Model `TicketSlaTarget` / table `ticket_sla_targets`, schema line 144

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id         String        @id @default(uuid()) @map("sla_target_id")
ticketId   String        @map("ticket_id")
policyId   String        @map("sla_policy_id")
metricType String        @map("metric_type") @db.VarChar(30)
cycle      Int           @default(1)
dueAt      DateTime      @map("due_at") @db.Timestamptz(3)
achievedAt DateTime?     @map("achieved_at") @db.Timestamptz(3)
breachedAt DateTime?     @map("breached_at") @db.Timestamptz(3)
createdAt  DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt  DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
ticket     SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
policy     SlaPolicy     @relation(fields: [policyId], references: [id], onDelete: Restrict)
@@unique([ticketId, metricType, cycle])
@@index([policyId])
@@index([metricType, dueAt])
@@map("ticket_sla_targets")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `cycle`: 4 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:396`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketModel.js:405`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketShape.js:35`; `C:/ise/Ise/backend/services/support-service/src/features/tickets/ticketShape.js:53`

#### TICKET_AUDIT_EVENT

Diagram node: `ticket-audit-event`; aliases: `ticket-audit-event`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `audit_event_id` → ชื่อที่แยก annotation แล้ว `audit_event_id`; ขีดเส้นใต้/มี key annotation; node `ticket-audit-event-attr-1`
- `ticket_id` → ชื่อที่แยก annotation แล้ว `ticket_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-audit-event-attr-2`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-audit-event-attr-3`
- `event_type` → ชื่อที่แยก annotation แล้ว `event_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-audit-event-attr-4`
- `dedupe_key` → ชื่อที่แยก annotation แล้ว `dedupe_key`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-audit-event-attr-5`
- `payload` → ชื่อที่แยก annotation แล้ว `payload`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-audit-event-attr-6`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-audit-event-attr-7`

Model `TicketAuditLog` / table `ticket_audit_events`, schema line 191

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String        @id @default(uuid())
ticketId  String        @map("ticket_id")
actorId   String        @map("actor_id")
action    String        @map("event_type")
dedupeKey String?       @unique @map("dedupe_key")
payload   Json          @default("{}")
createdAt DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
ticket    SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
@@index([ticketId, createdAt])
@@map("ticket_audit_events")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `id`: 172 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:44`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:54`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:55`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpController.js:54`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpController.js:64`

#### TICKET_CHAT_LINK

Diagram node: `ticket-chat-link-inner`; aliases: `ticket-chat-link`, `ticket-chat-link-inner`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `ticket_id` → ชื่อที่แยก annotation แล้ว `ticket_id`; ขีดเส้นใต้/มี key annotation; node `ticket-chat-link-attr-1`
- `conversation_id` → ชื่อที่แยก annotation แล้ว `conversation_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-chat-link-attr-2`
- `linked_at` → ชื่อที่แยก annotation แล้ว `linked_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ticket-chat-link-attr-3`

Model `TicketChatLink` / table `ticket_chat_links`, schema line 164

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
ticketId       String        @id @map("ticket_id")
conversationId String        @unique @map("conversation_id")
linkedAt       DateTime      @default(now()) @map("linked_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
ticket         SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
@@map("ticket_chat_links")
```

#### HELP_CATEGORY

Diagram node: `help-category`; aliases: `help-category`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `help_category_id` → ชื่อที่แยก annotation แล้ว `help_category_id`; ขีดเส้นใต้/มี key annotation; node `help-category-attr-1`
- `code` → ชื่อที่แยก annotation แล้ว `code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-category-attr-2`
- `name_th` → ชื่อที่แยก annotation แล้ว `name_th`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-category-attr-3`
- `name_en` → ชื่อที่แยก annotation แล้ว `name_en`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-category-attr-4`
- `is_active` → ชื่อที่แยก annotation แล้ว `is_active`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-category-attr-5`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-category-attr-6`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-category-attr-7`

Model `HelpCategory` / table `help_categories`, schema line 205

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        Int                   @id @default(autoincrement()) @map("help_category_id") @db.SmallInt
code      String                @unique
nameTh    String                @map("name_th")
nameEn    String?               @map("name_en")
isActive  Boolean               @default(true) @map("is_active")
createdAt DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
revisions HelpArticleRevision[]
@@map("help_categories")
```

#### HELP_ARTICLE

Diagram node: `help-article`; aliases: `help-article`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `article_id` → ชื่อที่แยก annotation แล้ว `article_id`; ขีดเส้นใต้/มี key annotation; node `help-article-attr-1`
- `slug` → ชื่อที่แยก annotation แล้ว `slug`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-attr-2`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-attr-3`
- `published_version` → ชื่อที่แยก annotation แล้ว `published_version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-attr-4`
- `created_by_id` → ชื่อที่แยก annotation แล้ว `created_by_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-attr-5`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-attr-6`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-attr-7`

Model `HelpArticle` / table `help_articles`, schema line 218

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id                String                @id @default(uuid())
slug              String                @unique
status            String                @default("DRAFT")
publishedVersion  Int?                  @map("published_version")
authorId          String                @map("created_by_id")
publishedAt       DateTime?             @map("published_at") @db.Timestamptz(3)
createdAt         DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt         DateTime              @updatedAt @map("updated_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
revisions         HelpArticleRevision[] @relation("ArticleRevisions")
publishedRevision HelpArticleRevision?  @relation("PublishedRevision", fields: [id, publishedVersion], references: [articleId, version], onDelete: NoAction, onUpdate: NoAction)
@@index([status])
@@map("help_articles")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `id`: 172 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:44`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:54`; `C:/ise/Ise/backend/services/support-service/src/features/audit/auditQuery.js:55`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpController.js:54`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpController.js:64`
- `published_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpModel.js:181`; `C:/ise/Ise/backend/services/support-service/src/features/help-content/helpModel.js:193`

#### HELP_ARTICLE_REVISION

Diagram node: `help-article-revision-inner`; aliases: `help-article-revision-inner`, `help-article-revision`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `article_id` → ชื่อที่แยก annotation แล้ว `article_id`; ขีดเส้นใต้/มี key annotation; node `help-article-revision-attr-1`
- `version` → ชื่อที่แยก annotation แล้ว `version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-2`
- `help_category_id` → ชื่อที่แยก annotation แล้ว `help_category_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-3`
- `title` → ชื่อที่แยก annotation แล้ว `title`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-4`
- `body` → ชื่อที่แยก annotation แล้ว `body`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-5`
- `author_id` → ชื่อที่แยก annotation แล้ว `author_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-6`
- `search_text` → ชื่อที่แยก annotation แล้ว `search_text`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-7`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `help-article-revision-attr-8`

Model `HelpArticleRevision` / table `help_article_revisions`, schema line 234

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
articleId    String        @map("article_id")
version      Int
categoryId   Int           @map("help_category_id") @db.SmallInt
title        String
body         String
authorId     String        @map("author_id")
searchText   String        @default("") @map("search_text")
createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
```
Relations + model-level constraints:
```prisma
article      HelpArticle   @relation("ArticleRevisions", fields: [articleId], references: [id], onDelete: Cascade)
category     HelpCategory  @relation(fields: [categoryId], references: [id], onDelete: Restrict)
publishedFor HelpArticle[] @relation("PublishedRevision")
@@id([articleId, version])
@@index([categoryId])
@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
@@map("help_article_revisions")
```

#### Model/table นอก ER — definitions ครบ


##### ticket_messages

Model `TicketMessage`, schema line 175
```prisma
id            String        @id @default(uuid())
ticketId      String        @map("ticket_id")
authorId      String        @map("author_id")
authorRole    String        @map("author_role")
body          String
isInternal    Boolean       @default(false) @map("is_internal")
chatMessageId String?       @unique @map("chat_message_id")
createdAt     DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
ticket        SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
@@index([ticketId, createdAt])
@@map("ticket_messages")
```

#### Free-coordinate endpoint resolutions

รายการนี้เป็นการจับคู่ปลายเส้นที่ไม่ใช้ source/target ID กับกรอบ node ที่พิกัดสัมผัสอย่างไม่กำกวม ไม่ได้แก้ไฟล์ ER

- edge `ticket-sla-target-attr-9-edge` target point [6214, 2500] → node `ticket-sla-target`, distance 3.2015621187164243px
Unassigned oval attributes: 0

#### Relationships ที่อ่านได้จาก XML

Cardinality labels ต่อไปนี้เป็นข้อความจาก XML ไม่ใช่การยืนยันทางภาพ; ข้อจำกัดเกี่ยวกับ labels/endpoints อยู่ใน A4; entity ที่ซ้ำในรายการปลายเส้นของ weak entity มาจากกรอบนอก/ใน ไม่ได้แปลว่าเป็น ternary relationship

- node `relation-1` / label `classifies`: `TICKET_CATEGORY` [edge `relation-1-source`; labels ['1']] ↔ `SUPPORT_TICKET` [edge `relation-1-target`; labels ['N']]
- node `relation-2` / label `prioritizes`: `TICKET_PRIORITY` [edge `relation-2-source`; labels ['1']] ↔ `SUPPORT_TICKET` [edge `relation-2-target`; labels ['N']]
- node `relation-3` / label `current state`: `TICKET_STATUS` [edge `relation-3-source`; labels ['1']] ↔ `SUPPORT_TICKET` [edge `relation-3-target`; labels ['N']]
- node `relation-4` / label `has assignments`: `SUPPORT_TICKET` [edge `relation-4-source`; labels ['1']] ↔ `TICKET_ASSIGNMENT` [edge `relation-4-target`; labels ['N']]
- node `relation-5` / label `has transitions`: `SUPPORT_TICKET` [edge `relation-5-source`; labels ['1']] ↔ `TICKET_STATUS_HISTORY` [edge `relation-5-target`; labels ['N']]
- node `relation-6` / label `uses status`: `TICKET_STATUS` [edge `relation-6-source`; labels ['1']] ↔ `TICKET_STATUS_HISTORY` [edge `relation-6-target`; labels ['N']]
- node `relation-7` / label `policy priority`: `TICKET_PRIORITY` [edge `relation-7-source`; labels ['1']] ↔ `SLA_POLICY` [edge `relation-7-target`; labels ['N']]
- node `relation-8` / label `policy category`: `TICKET_CATEGORY` [edge `relation-8-source`; labels ['0..1']] ↔ `SLA_POLICY` [edge `relation-8-target`; labels ['N']]
- node `relation-9` / label `defines`: `SLA_POLICY` [edge `relation-9-source`; labels ['1']] ↔ `TICKET_SLA_TARGET` [edge `relation-9-target`; labels ['N']]
- node `relation-10` / label `tracks`: `SUPPORT_TICKET` [edge `relation-10-source`; labels ['1']] ↔ `TICKET_SLA_TARGET` [edge `relation-10-target`; labels ['N']]
- node `relation-12` / label `records`: `SUPPORT_TICKET` [edge `relation-12-source`; labels ['1']] ↔ `TICKET_AUDIT_EVENT` [edge `relation-12-target`; labels ['M']]
- node `relation-13` / label ``: `SUPPORT_TICKET` [edge `relation-13-source`; labels ['1']] ↔ `TICKET_CHAT_LINK` [edge `relation-13-target`; labels ['0..1']]
- node `relation-14` / label `categorizes`: `HELP_CATEGORY` [edge `relation-14-source`; labels ['1']] ↔ `HELP_ARTICLE_REVISION` [edge `relation-14-target`; labels ['N']]
- node `relation-15` / label ``: `HELP_ARTICLE` [edge `relation-15-source`; labels ['1']] ↔ `HELP_ARTICLE_REVISION` [edge `relation-15-target`; labels ['N']]

### Order Service

ER source: `C:/ise/Ise/database/erdesign\Order Service\ข้อ 1/คน`

Runtime source: `C:/ise/Ise/backend/services/order-service/prisma/schema.prisma`


#### dispute_audit_log

Diagram node: `aiJ4QOfwXch2im6GLksC-1`; aliases: `aiJ4QOfwXch2im6GLksC-1`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `aiJ4QOfwXch2im6GLksC-2`
- `dispute_id` → ชื่อที่แยก annotation แล้ว `dispute_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-25`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-27`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-29`
- `detail` → ชื่อที่แยก annotation แล้ว `detail`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-32`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-34`
- `dispute_audit_log_id` → ชื่อที่แยก annotation แล้ว `dispute_audit_log_id`; ขีดเส้นใต้/มี key annotation; node `1Akyh_1pekG1t7bbm4vW-51`

Model `DisputeAuditLog` / table `dispute_audit_log`, schema line 211

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id                String          @id @default(uuid()) @map("dispute_audit_log_id")
disputeEvidenceId String          @map("dispute_evidence_id")
actorId           String          @map("actor_id")
action            String
detail            String
createdAt         DateTime        @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
evidence          DisputeEvidence @relation(fields: [disputeEvidenceId], references: [id])
@@index([disputeEvidenceId, createdAt])
@@map("dispute_audit_log")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `dispute_evidence_id`: 5 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:164`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:60`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:64`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:121`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:157`

#### dispute_evidence

Diagram node: `aiJ4QOfwXch2im6GLksC-4`; aliases: `aiJ4QOfwXch2im6GLksC-4`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `dispute_case_id` → ชื่อที่แยก annotation แล้ว `dispute_case_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-10`
- `file_type` → ชื่อที่แยก annotation แล้ว `file_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-16`
- `dispute_evidence _id` → ชื่อที่แยก annotation แล้ว `dispute_evidence _id`; ขีดเส้นใต้/มี key annotation; node `aiJ4QOfwXch2im6GLksC-8`
- `uploader_id` → ชื่อที่แยก annotation แล้ว `uploader_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-12`
- `update_at` → ชื่อที่แยก annotation แล้ว `update_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-20`
- `version` → ชื่อที่แยก annotation แล้ว `version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-119`
- `dispute_status` → ชื่อที่แยก annotation แล้ว `dispute_status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-143`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-150`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-160`
- `evidence_deadline` → ชื่อที่แยก annotation แล้ว `evidence_deadline`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-2`

Model `DisputeEvidence` / table `dispute_evidence`, schema line 192

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id               String                 @id @default(uuid()) @map("dispute_evidence_id")
disputeCaseId    String                 @map("dispute_case_id")
uploaderId       String                 @map("uploader_id")
evidencePath     String                 @map("evidence_path")
fileType         String                 @map("file_type")
status           String
version          Int                    @default(0)
evidenceDeadline DateTime?              @map("evidence_deadline")
createdAt        DateTime               @default(now()) @map("created_at")
updatedAt        DateTime               @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
dispute          DisputeCase            @relation(fields: [disputeCaseId], references: [id])
auditLog         DisputeAuditLog[]
safetyEvidence   SafetyDisputeEvidence?
@@index([disputeCaseId])
@@map("dispute_evidence")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `dispute_evidence_id`: 271 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:45`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:132`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:149`
- `evidence_path`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:11`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:113`
- `updated_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:142`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:849`

#### dispute_case

Diagram node: `aiJ4QOfwXch2im6GLksC-36`; aliases: `aiJ4QOfwXch2im6GLksC-36`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `dispute_case _id` → ชื่อที่แยก annotation แล้ว `dispute_case _id`; ขีดเส้นใต้/มี key annotation; node `aiJ4QOfwXch2im6GLksC-38`
- `order_id` → ชื่อที่แยก annotation แล้ว `order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-37`
- `created_by` → ชื่อที่แยก annotation แล้ว `created_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-41`
- `reason` → ชื่อที่แยก annotation แล้ว `reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-43`
- `decision` → ชื่อที่แยก annotation แล้ว `decision`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-45`
- `version` → ชื่อที่แยก annotation แล้ว `version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-58`
- `created_by` → ชื่อที่แยก annotation แล้ว `created_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-61`
- `dispute_type` → ชื่อที่แยก annotation แล้ว `dispute_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-162`
- `assigned_to` → ชื่อที่แยก annotation แล้ว `assigned_to`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-59`
- `assigned_at` → ชื่อที่แยก annotation แล้ว `assigned_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-60`

**ชื่อซ้ำใน ER:** created_by

Model `DisputeCase` / table `dispute_case`, schema line 141

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id               String            @id @default(uuid())
orderId          String            @unique @map("order_id")
createdBy        String            @map("created_by")
reason           String
decision         String?
disputeType      String            @map("dispute_type")
status           String            @default("OPEN")
decisionReason   String?           @map("decision_reason")
verdictKey       String?           @unique @map("verdict_key")
escalationNote   String?           @map("escalation_note")
escalatedBy      String?           @map("escalated_by")
priority         String            @default("NORMAL")
priorityScore    Int               @default(0) @map("priority_score")
riskReportCount  Int               @default(0) @map("risk_report_count")
slaExpiresAt     DateTime?         @map("sla_expires_at")
slaPolicyVersion String?           @map("sla_policy_version")
firstReviewDueAt DateTime?         @map("first_review_due_at")
firstReviewedAt  DateTime?         @map("first_reviewed_at")
decisionDueAt    DateTime?         @map("decision_due_at")
version          Int               @default(0) @map("dispute_case_version")
createdAt        DateTime          @default(now()) @map("created_at")
decidedBy        String?           @map("decided_by")
decidedAt        DateTime?         @map("decided_at")
assignedTo       String?           @map("assigned_to")
assignedRole     String?           @map("assigned_role")
assignedAt       DateTime?         @map("assigned_at")
```
Relations + model-level constraints:
```prisma
order            Order             @relation(fields: [orderId], references: [id])
evidence         DisputeEvidence[]
caseLog          DisputeCaseLog[]
@@map("dispute_case")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `assigned_role`: 40 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeChatAccessRoutes.js:27`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeController.js:70`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:55`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:56`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:171`
- `created_at`: 26 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:14`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:11`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:5`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:238`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:239`
- `decided_at`: 1 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:531`
- `decided_by`: 8 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:511`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:522`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:530`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:540`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:563`
- `decision_due_at`: 4 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:356`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:391`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:443`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:446`
- `decision_reason`: 7 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:510`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:529`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:565`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:667`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:702`
- `dispute_case_version`: 106 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:172`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:211`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:221`
- `escalated_by`: 3 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:499`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:582`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:584`
- `escalation_note`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:500`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:585`
- `first_review_due_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:355`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:390`
- `first_reviewed_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:442`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:445`
- `id`: 271 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:45`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:132`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:149`
- `priority`: 20 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/agentDashboard.js:10`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeController.js:75`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:181`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:219`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:240`
- `priority_score`: 7 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:235`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:240`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:351`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:386`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:111`
- `risk_report_count`: 4 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:352`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:387`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:112`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:335`
- `sla_expires_at`: 7 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:195`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:198`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:234`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:353`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:388`
- `sla_policy_version`: 3 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:354`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:389`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:441`
- `status`: 218 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/app.js:12`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:26`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:27`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:39`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:50`
- `verdict_key`: 6 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:512`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:528`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:664`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:704`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:709`

#### safety_dispute_evidence

Diagram node: `aiJ4QOfwXch2im6GLksC-72`; aliases: `aiJ4QOfwXch2im6GLksC-72`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `safety_ id` → ชื่อที่แยก annotation แล้ว `safety_ id`; ขีดเส้นใต้/มี key annotation; node `aiJ4QOfwXch2im6GLksC-73`
- `order_id` → ชื่อที่แยก annotation แล้ว `order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-74`
- `evidence_id` → ชื่อที่แยก annotation แล้ว `evidence_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-75`
- `detail` → ชื่อที่แยก annotation แล้ว `detail`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-76`
- `verify_by` → ชื่อที่แยก annotation แล้ว `verify_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-77`
- `verify _at` → ชื่อที่แยก annotation แล้ว `verify _at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-78`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-144`

Model `SafetyDisputeEvidence` / table `safety_dispute_evidence`, schema line 224

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id         String          @id @default(uuid()) @map("safety_id")
orderId    String          @map("order_id")
evidenceId String          @unique @map("evidence_id")
detail     String?
verifyBy   String?         @map("verify_by")
verifyAt   DateTime?       @map("verify_at")
status     String
```
Relations + model-level constraints:
```prisma
order      Order           @relation(fields: [orderId], references: [id])
evidence   DisputeEvidence @relation(fields: [evidenceId], references: [id])
logs       SafetyLog[]
@@index([orderId])
@@map("safety_dispute_evidence")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `safety_id`: 271 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:45`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:132`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:149`
- `verify_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:12`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:147`

#### orders

Diagram node: `aiJ4QOfwXch2im6GLksC-79`; aliases: `aiJ4QOfwXch2im6GLksC-79`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `order id` → ชื่อที่แยก annotation แล้ว `order id`; ขีดเส้นใต้/มี key annotation; node `aiJ4QOfwXch2im6GLksC-80`
- `buyer_id` → ชื่อที่แยก annotation แล้ว `buyer_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-82`
- `version` → ชื่อที่แยก annotation แล้ว `version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-95`
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-83`
- `product_id` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-84`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `bTxIYZdA5oWZktDzVFAN-14`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-91`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-92`
- `order_type` → ชื่อที่แยก annotation แล้ว `order_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-216`
- `orders_amount` → ชื่อที่แยก annotation แล้ว `orders_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-222`
- `original_amount` → ชื่อที่แยก annotation แล้ว `original_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-5`
- `campane_id` → ชื่อที่แยก annotation แล้ว `campane_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `IzRke4kW_GtcddRQiSrl-1`

Model `Order` / table `orders`, schema line 44

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id               String                  @id @default(uuid()) @map("order_id")
checkoutId       String?                 @map("checkout_id")
basketId         String?                 @unique @map("basket_id")
buyerId          String                  @map("buyer_id")
sellerId         String                  @map("seller_id")
productId        String                  @map("product_id")
campaignId       String?                 @map("campaign_id")
productTitle     String?                 @map("product_title")
campaignCode     String?                 @map("campaign_code")
auctionId        String?                 @unique @map("auction_id")
orderType        String                  @map("order_type")
originalAmount   Decimal                 @map("original_amount") @db.Decimal(18, 2)
ordersAmount     Decimal                 @map("orders_amount") @db.Decimal(18, 2)
status           String                  @default("pending_payment")
preDisputeStatus String?                 @map("pre_dispute_status")
version          Int                     @default(1)
createdAt        DateTime                @default(now()) @map("created_at")
updatedAt        DateTime                @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
attributionOutboxEvent AttributionOutboxEvent?
checkout         Checkout?               @relation(fields: [checkoutId], references: [id])
basket           Basket?                 @relation(fields: [basketId], references: [id])
payments         Payment[]
shipping         Shipping?
dispute          DisputeCase?
logs             OrderLog[]
safetyEvidence   SafetyDisputeEvidence[]
@@index([buyerId])
@@index([sellerId])
@@index([checkoutId])
@@map("orders")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `auction_id`: 7 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:290`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:291`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:293`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:300`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:331`
- `basket_id`: 19 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:97`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:99`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:127`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:129`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:176`
- `campaign_code`: 3 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:78`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:131`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:152`
- `campaign_id`: 35 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:60`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:178`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:181`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:8`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:69`
- `checkout_id`: 12 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:251`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:256`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:263`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:268`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:70`
- `order_id`: 271 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:45`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:132`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:149`
- `pre_dispute_status`: 7 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:77`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:85`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:371`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:82`; `C:/ise/Ise/backend/services/order-service/src/services/holdBackfillService.js:84`
- `product_title`: 8 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:332`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:132`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:148`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:137`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:183`

#### basket

Diagram node: `aiJ4QOfwXch2im6GLksC-174`; aliases: `aiJ4QOfwXch2im6GLksC-174`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `basket  id` → ชื่อที่แยก annotation แล้ว `basket  id`; ขีดเส้นใต้/มี key annotation; node `aiJ4QOfwXch2im6GLksC-175`
- `buyer_id` → ชื่อที่แยก annotation แล้ว `buyer_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-176`
- `lock_at` → ชื่อที่แยก annotation แล้ว `lock_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-177`
- `unlock_at` → ชื่อที่แยก annotation แล้ว `unlock_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-178`
- `product_id` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-179`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-208`

Model `Basket` / table `basket`, schema line 12

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid()) @map("basket_id")
buyerId   String   @map("buyer_id")
productId String   @map("product_id")
status    String
lockAt    DateTime @map("lock_at")
unlockAt  DateTime @map("unlock_at")
```
Relations + model-level constraints:
```prisma
order     Order?
@@index([buyerId, status])
@@map("basket")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `basket_id`: 271 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:45`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:132`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:149`

#### payment

Diagram node: `aiJ4QOfwXch2im6GLksC-196`; aliases: `aiJ4QOfwXch2im6GLksC-196`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `paid_at` → ชื่อที่แยก annotation แล้ว `paid_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-199`
- `payment_status` → ชื่อที่แยก annotation แล้ว `payment_status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-201`
- `payment_amount` → ชื่อที่แยก annotation แล้ว `payment_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-200`
- `order_id` → ชื่อที่แยก annotation แล้ว `order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-197`
- `payment_type` → ชื่อที่แยก annotation แล้ว `payment_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `aiJ4QOfwXch2im6GLksC-227`
- `payment_id` → ชื่อที่แยก annotation แล้ว `payment_id`; ขีดเส้นใต้/มี key annotation; node `1Akyh_1pekG1t7bbm4vW-34`

Model `Payment` / table `payment`, schema line 78

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id            String    @id @default(uuid()) @map("payment_id")
orderId       String    @map("order_id")
paymentType   String    @map("payment_type")
paymentStatus String    @map("payment_status")
paymentAmount Decimal   @map("payment_amount") @db.Decimal(18, 2)
paidAt        DateTime? @map("paid_at")
createdAt     DateTime  @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
order         Order     @relation(fields: [orderId], references: [id])
holds         Hold[]
@@index([orderId, createdAt])
@@map("payment")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `created_at`: 26 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:14`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:11`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:5`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:238`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:239`

#### shipping

Diagram node: `1Akyh_1pekG1t7bbm4vW-1`; aliases: `1Akyh_1pekG1t7bbm4vW-1`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `order id` → ชื่อที่แยก annotation แล้ว `order id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-15`
- `tracking_number` → ชื่อที่แยก annotation แล้ว `tracking_number`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-12`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-13`
- `shipping_id` → ชื่อที่แยก annotation แล้ว `shipping_id`; ขีดเส้นใต้/มี key annotation; node `1Akyh_1pekG1t7bbm4vW-14`
- `companny` → ชื่อที่แยก annotation แล้ว `companny`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-11`
- `address_id` → ชื่อที่แยก annotation แล้ว `address_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-21`

Model `Shipping` / table `shipping`, schema line 93

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id              String   @id @default(uuid()) @map("shipping_id")
orderId         String   @unique @map("order_id")
addressId       String   @map("address_id")
addressSnapshot Json     @map("address_snapshot")
company         String?
trackingNumber  String?  @map("tracking_number")
status          String
updatedAt       DateTime @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
order           Order    @relation(fields: [orderId], references: [id])
@@map("shipping")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `address_snapshot`: 15 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:18`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:62`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:108`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:136`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:352`
- `company`: 8 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:212`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:849`; `C:/ise/Ise/backend/services/order-service/src/features/shipping/shippingService.js:108`; `C:/ise/Ise/backend/services/order-service/src/features/shipping/shippingService.js:112`; `C:/ise/Ise/backend/services/order-service/src/features/shipping/shippingService.js:113`
- `order_id`: 141 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:183`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:209`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:361`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js:42`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js:59`
- `updated_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:142`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:849`

#### hold

Diagram node: `1Akyh_1pekG1t7bbm4vW-25`; aliases: `1Akyh_1pekG1t7bbm4vW-25`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `hold_status` → ชื่อที่แยก annotation แล้ว `hold_status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-29`
- `release_amount` → ชื่อที่แยก annotation แล้ว `release_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-30`
- `hold_reason` → ชื่อที่แยก annotation แล้ว `hold_reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-27`
- `release_at` → ชื่อที่แยก annotation แล้ว `release_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-31`
- `hold_id` → ชื่อที่แยก annotation แล้ว `hold_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-28`
- `hold_amount` → ชื่อที่แยก annotation แล้ว `hold_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-47`
- `ref_id` → ชื่อที่แยก annotation แล้ว `ref_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-56`
- `hold_type` → ชื่อที่แยก annotation แล้ว `hold_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-52`

Model `Hold` / table `hold`, schema line 107

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id            String    @id @default(uuid()) @map("hold_id")
paymentId     String    @map("payment_id")
source        String
referenceId   String    @map("reference_id")
holdReason    String    @map("hold_reason")
holdStatus    String    @map("hold_status")
holdAmount    Decimal   @map("hold_amount") @db.Decimal(18, 2)
holdAt        DateTime  @map("hold_at")
holdBy        String    @map("hold_by")
releaseAmount Decimal?  @map("release_amount") @db.Decimal(18, 2)
releaseAt     DateTime? @map("release_at")
releasedBy    String?   @map("released_by")
```
Relations + model-level constraints:
```prisma
payment       Payment   @relation(fields: [paymentId], references: [id])
@@index([paymentId, holdStatus])
@@map("hold")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `hold_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/models/orderModel.js:53`; `C:/ise/Ise/backend/services/order-service/src/services/orderTransitionService.js:26`
- `hold_by`: 6 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:72`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:400`; `C:/ise/Ise/backend/services/order-service/src/models/orderModel.js:52`; `C:/ise/Ise/backend/services/order-service/src/services/holdBackfillService.js:97`; `C:/ise/Ise/backend/services/order-service/src/services/orderTransitionService.js:4`
- `payment_id`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/services/orderTransitionService.js:14`; `C:/ise/Ise/backend/services/order-service/src/services/orderTransitionService.js:19`
- `reference_id`: 19 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:49`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:61`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:70`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:95`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:398`
- `released_by`: 4 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:62`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:540`; `C:/ise/Ise/backend/services/order-service/src/services/orderTransitionService.js:30`; `C:/ise/Ise/backend/services/order-service/src/services/orderTransitionService.js:44`
- `source`: 39 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js:20`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:14`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:48`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:60`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:69`

#### order_log

Diagram node: `1Akyh_1pekG1t7bbm4vW-58`; aliases: `1Akyh_1pekG1t7bbm4vW-58`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-62`
- `buyer_id` → ชื่อที่แยก annotation แล้ว `buyer_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-63`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-61`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-60`
- `order_log_id` → ชื่อที่แยก annotation แล้ว `order_log_id`; ขีดเส้นใต้/มี key annotation; node `1Akyh_1pekG1t7bbm4vW-59`
- `detail` → ชื่อที่แยก annotation แล้ว `detail`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1Akyh_1pekG1t7bbm4vW-64`

Model `OrderLog` / table `order_log`, schema line 126

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid()) @map("order_log_id")
orderId   String   @map("order_id")
sellerId  String   @map("seller_id")
buyerId   String   @map("buyer_id")
actorId   String   @map("actor_id")
action    String
detail    String
createdAt DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
order     Order    @relation(fields: [orderId], references: [id])
@@index([orderId, createdAt])
@@map("order_log")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `actor_id`: 61 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:175`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:210`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js:102`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:26`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:62`
- `order_id`: 141 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:183`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:209`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:361`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js:42`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeRoutes.js:59`

#### safety_log

Diagram node: `SuCgzw45ESCHQzdIUF1W-11`; aliases: `SuCgzw45ESCHQzdIUF1W-11`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `detail` → ชื่อที่แยก annotation แล้ว `detail`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-4`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-3`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-7`
- `evidence_id` → ชื่อที่แยก annotation แล้ว `evidence_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-9`

Model `SafetyLog` / table `safety_log`, schema line 240

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String                @id @default(uuid()) @map("safety_log_id")
safetyId  String                @map("safety_id")
actorId   String                @map("actor_id")
action    String
detail    String
createdAt DateTime              @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
safety    SafetyDisputeEvidence @relation(fields: [safetyId], references: [id])
@@index([safetyId, createdAt])
@@map("safety_log")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `action`: 65 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:30`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:37`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:158`; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:166`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:188`
- `safety_id`: 1 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/adminDisputes/adminDisputeService.js:156`
- `safety_log_id`: 271 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:29`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:36`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:45`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:132`; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:149`

#### checkout

Diagram node: `SuCgzw45ESCHQzdIUF1W-15`; aliases: `SuCgzw45ESCHQzdIUF1W-15`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `buyer_id` → ชื่อที่แยก annotation แล้ว `buyer_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-17`
- `address_id` → ชื่อที่แยก annotation แล้ว `address_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-26`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-28`
- `cancel_at` → ชื่อที่แยก annotation แล้ว `cancel_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-29`
- `paid_at` → ชื่อที่แยก annotation แล้ว `paid_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-38`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-47`
- `checkout_id` → ชื่อที่แยก annotation แล้ว `checkout_id`; ขีดเส้นใต้/มี key annotation; node `SuCgzw45ESCHQzdIUF1W-50`

Model `Checkout` / table `checkouts`, schema line 25

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id              String    @id @default(uuid()) @map("checkout_id")
buyerId         String    @map("buyer_id")
addressId       String    @map("address_id")
addressSnapshot Json      @map("address_snapshot")
originalAmount  Decimal   @map("original_amount") @db.Decimal(18, 2)
ordersAmount    Decimal   @map("orders_amount") @db.Decimal(18, 2)
status          String
paidAt          DateTime? @map("paid_at")
cancelAt        DateTime  @map("cancel_at")
createdAt       DateTime  @default(now()) @map("created_at")
updatedAt       DateTime  @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
orders          Order[]
@@index([buyerId, status])
@@index([status, cancelAt])
@@map("checkouts")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `address_snapshot`: 15 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:18`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:62`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:108`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:136`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:352`
- `orders_amount`: 14 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:329`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:128`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:21`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:22`; `C:/ise/Ise/backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:260`
- `original_amount`: 19 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/controllers/orderController.js:328`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:51`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:53`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:67`; `C:/ise/Ise/backend/services/order-service/src/features/checkout/checkoutService.js:84`
- `updated_at`: 2 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:142`; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeService.js:849`

#### dispute_case_log

Diagram node: `SuCgzw45ESCHQzdIUF1W-66`; aliases: `SuCgzw45ESCHQzdIUF1W-66`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `from_assigned_to` → ชื่อที่แยก annotation แล้ว `from_assigned_to`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-76`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-74`
- `to_assigned_to` → ชื่อที่แยก annotation แล้ว `to_assigned_to`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-77`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-79`
- `detail` → ชื่อที่แยก annotation แล้ว `detail`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-78`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-75`
- `dispute_case_id` → ชื่อที่แยก annotation แล้ว `dispute_case_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `SuCgzw45ESCHQzdIUF1W-73`
- `dispute_case_log_id` → ชื่อที่แยก annotation แล้ว `dispute_case_log_id`; ขีดเส้นใต้/มี key annotation; node `SuCgzw45ESCHQzdIUF1W-72`

Model `DisputeCaseLog` / table `dispute_case_log`, schema line 175

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id               String      @id @default(uuid()) @map("dispute_case_log_id")
disputeCaseId    String      @map("dispute_case_id")
actorId          String      @map("actor_id")
action           String
fromAssignedTo   String?     @map("from_assigned_to")
toAssignedTo     String?     @map("to_assigned_to")
fromAssignedRole String?     @map("from_assigned_role")
toAssignedRole   String?     @map("to_assigned_role")
detail           String
createdAt        DateTime    @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
dispute          DisputeCase @relation(fields: [disputeCaseId], references: [id])
@@index([disputeCaseId, createdAt])
@@map("dispute_case_log")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `from_assigned_role`: 1 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:55`
- `to_assigned_role`: 1 candidate occurrences; `C:/ise/Ise/backend/services/order-service/src/features/disputes/disputeModel.js:56`

#### evidence

Diagram node: `ipx5DExK73B2In1qhP5o-8`; aliases: `ipx5DExK73B2In1qhP5o-8`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `ref_path` → ชื่อที่แยก annotation แล้ว `ref_path`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ipx5DExK73B2In1qhP5o-9`
- `dispute_evidence _id` → ชื่อที่แยก annotation แล้ว `dispute_evidence _id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ipx5DExK73B2In1qhP5o-12`
- `evidence_id` → ชื่อที่แยก annotation แล้ว `evidence_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `ipx5DExK73B2In1qhP5o-14`

**ไม่พบ model/table ใน runtime schema ของ service นี้**

#### Model/table นอก ER — definitions ครบ


##### attribution_outbox_events

Model `AttributionOutboxEvent`, schema line 254
```prisma
id             String    @id @default(uuid())
orderId        String    @unique @map("order_id")
campaignId     String    @map("campaign_id")
grossAmount    Decimal       @map("gross_amount") @db.Decimal(12, 2)
discountAmount Decimal       @map("discount_amount") @db.Decimal(12, 2)
netAmount      Decimal       @map("net_amount") @db.Decimal(12, 2)
completedAt    DateTime  @map("completed_at")
attempts       Int       @default(0)
lastError      String?   @map("last_error")
nextAttemptAt  DateTime  @default(now()) @map("next_attempt_at")
processedAt    DateTime? @map("processed_at")
createdAt      DateTime  @default(now()) @map("created_at")
updatedAt      DateTime  @updatedAt @map("updated_at")
order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
@@index([processedAt, nextAttemptAt])
@@index([orderId, processedAt])
@@map("attribution_outbox_events")
```
Candidate delegate references: `C:/ise/Ise/backend/services/order-service/src/models/orderModel.js:211`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:41`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:47`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:56`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:67`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:76`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:85`, `C:/ise/Ise/backend/services/order-service/src/services/attributionOutboxService.js:91`

#### Free-coordinate endpoint resolutions

รายการนี้เป็นการจับคู่ปลายเส้นที่ไม่ใช้ source/target ID กับกรอบ node ที่พิกัดสัมผัสอย่างไม่กำกวม ไม่ได้แก้ไฟล์ ER

- edge `aiJ4QOfwXch2im6GLksC-35` target point [270, -360] → node `aiJ4QOfwXch2im6GLksC-1`, distance 1px
- edge `aiJ4QOfwXch2im6GLksC-109` source point [1032, 348] → node `bTxIYZdA5oWZktDzVFAN-14`, distance 0px
- edge `aiJ4QOfwXch2im6GLksC-141` source point [933, -494] → node `aiJ4QOfwXch2im6GLksC-139`, distance 1px
- edge `aiJ4QOfwXch2im6GLksC-142` source point [470, -489] → node `aiJ4QOfwXch2im6GLksC-143`, distance 0px
- edge `SuCgzw45ESCHQzdIUF1W-63` source point [207, 295] → node `SuCgzw45ESCHQzdIUF1W-64`, distance 0px
Unassigned oval attributes: 0

#### Relationships ที่อ่านได้จาก XML

Cardinality labels ต่อไปนี้เป็นข้อความจาก XML ไม่ใช่การยืนยันทางภาพ; ข้อจำกัดเกี่ยวกับ labels/endpoints อยู่ใน A4; entity ที่ซ้ำในรายการปลายเส้นของ weak entity มาจากกรอบนอก/ใน ไม่ได้แปลว่าเป็น ternary relationship

- node `aiJ4QOfwXch2im6GLksC-5` / label `record`: `dispute_audit_log` [edge `aiJ4QOfwXch2im6GLksC-6`; labels ['']] ↔ `dispute_evidence` [edge `aiJ4QOfwXch2im6GLksC-7`; labels ['', '1', 'm', '1', '1', '1', '1', '1', '1', '1', 'm', '1', '1', '1', '1', 'm', '1', 'm', '1', 'm', '1', 'm', '1', 'm', 'm', '1', 'm']]
- node `aiJ4QOfwXch2im6GLksC-67` / label `have`: `dispute_case` [edge `aiJ4QOfwXch2im6GLksC-68`; labels ['']] ↔ `dispute_evidence` [edge `aiJ4QOfwXch2im6GLksC-69`; labels ['']]
- node `aiJ4QOfwXch2im6GLksC-139` / label `verify`: `dispute_evidence` [edge `aiJ4QOfwXch2im6GLksC-140`; labels ['']] ↔ `safety_dispute_evidence` [edge `aiJ4QOfwXch2im6GLksC-141`; labels ['']]
- node `aiJ4QOfwXch2im6GLksC-152` / label `report`: `dispute_case` [edge `aiJ4QOfwXch2im6GLksC-153`; labels ['']] ↔ `orders` [edge `aiJ4QOfwXch2im6GLksC-154`; labels ['']]
- node `aiJ4QOfwXch2im6GLksC-190` / label `in`: `orders` [edge `aiJ4QOfwXch2im6GLksC-165`; labels ['']] ↔ `basket` [edge `aiJ4QOfwXch2im6GLksC-191`; labels ['']]
- node `aiJ4QOfwXch2im6GLksC-203` / label `have`: `payment` [edge `aiJ4QOfwXch2im6GLksC-204`; labels ['']] ↔ `orders` [edge `aiJ4QOfwXch2im6GLksC-205`; labels ['']]
- node `1Akyh_1pekG1t7bbm4vW-7` / label `have`: `orders` [edge `1Akyh_1pekG1t7bbm4vW-9`; labels ['']] ↔ `shipping` [edge `1Akyh_1pekG1t7bbm4vW-10`; labels ['']]
- node `1Akyh_1pekG1t7bbm4vW-32` / label `have`: `payment` [edge `1Akyh_1pekG1t7bbm4vW-38`; labels ['']] ↔ `hold` [edge `1Akyh_1pekG1t7bbm4vW-40`; labels ['']]
- node `1Akyh_1pekG1t7bbm4vW-53` / label `record`: `orders` [edge `1Akyh_1pekG1t7bbm4vW-54`; labels ['']] ↔ `order_log` [edge `1Akyh_1pekG1t7bbm4vW-56`; labels ['']]
- node `SuCgzw45ESCHQzdIUF1W-1` / label `record`: `safety_dispute_evidence` [edge `SuCgzw45ESCHQzdIUF1W-2`; labels ['']] ↔ `safety_log` [edge `SuCgzw45ESCHQzdIUF1W-12`; labels ['']]
- node `SuCgzw45ESCHQzdIUF1W-42` / label `have`: `orders` [edge `SuCgzw45ESCHQzdIUF1W-43`; labels ['']] ↔ `checkout` [edge `SuCgzw45ESCHQzdIUF1W-44`; labels ['']]
- node `SuCgzw45ESCHQzdIUF1W-64` / label `record`: `dispute_case` [edge `SuCgzw45ESCHQzdIUF1W-63`; labels ['']] ↔ `dispute_case_log` [edge `SuCgzw45ESCHQzdIUF1W-67`; labels ['']]
- node `ipx5DExK73B2In1qhP5o-6` / label `have`: `dispute_evidence` [edge `ipx5DExK73B2In1qhP5o-5`; labels ['']] ↔ `evidence` [edge `ipx5DExK73B2In1qhP5o-7`; labels ['']]

### Product Service

ER source: `C:/ise/Ise/database/erdesign\Product Service\ข้อ1/Product-Service-คน-1.drawio`

Runtime source: `C:/ise/Ise/backend/services/product-service/prisma/schema.prisma`


#### Products

Diagram node: `pPA2m0y0b1gJxXUfVHl2-1`; aliases: `pPA2m0y0b1gJxXUfVHl2-1`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `price` → ชื่อที่แยก annotation แล้ว `price`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `pPA2m0y0b1gJxXUfVHl2-4`
- `brand` → ชื่อที่แยก annotation แล้ว `brand`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `pPA2m0y0b1gJxXUfVHl2-5`
- `condition` → ชื่อที่แยก annotation แล้ว `condition`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `pPA2m0y0b1gJxXUfVHl2-6`
- `moderated_at` → ชื่อที่แยก annotation แล้ว `moderated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-4`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-6`
- `description` → ชื่อที่แยก annotation แล้ว `description`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-9`
- `search_vector` → ชื่อที่แยก annotation แล้ว `search_vector`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-11`
- `tags` → ชื่อที่แยก annotation แล้ว `tags`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-12`
- `size` → ชื่อที่แยก annotation แล้ว `size`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-13`
- `reservation_id` → ชื่อที่แยก annotation แล้ว `reservation_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-14`
- `reservation_expires` → ชื่อที่แยก annotation แล้ว `reservation_expires`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-15`
- `crated_at` → ชื่อที่แยก annotation แล้ว `crated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-17`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `pPA2m0y0b1gJxXUfVHl2-2`
- `title` → ชื่อที่แยก annotation แล้ว `title`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `pPA2m0y0b1gJxXUfVHl2-3`
- `location` → ชื่อที่แยก annotation แล้ว `location`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-1`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-2`
- `reserved_by` → ชื่อที่แยก annotation แล้ว `reserved_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-3`
- `pre_removal` → ชื่อที่แยก annotation แล้ว `pre_removal`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-5`
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-8`
- `category` → ชื่อที่แยก annotation แล้ว `category`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-10`
- `moderation_reason` → ชื่อที่แยก annotation แล้ว `moderation_reason`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-16`
- `search_text` → ชื่อที่แยก annotation แล้ว `search_text`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-18`

Model `Product` / table `products`, schema line 38

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id                   String                   @id @default(uuid())
sellerId             String                   @map("seller_id")
title                String
description          String                   @default("")
price                Int
category             String
brand                String                   @default("")
searchVector         Unsupported("tsvector")? @map("search_vector")
condition            String                   @default("Good")
tags                 String[]
location             String                   @default("")
size                 String                   @default("Free size")
status               String                   @default("available")
reservationId        String?                  @unique @map("reservation_id")
reservedBy           String?                  @map("reserved_by")
reservationExpiresAt DateTime?                @map("reservation_expires_at")
moderatedAt          DateTime?                @map("moderated_at")
moderationReason     String?                  @map("moderation_reason")
preRemovalStatus     String?                  @map("pre_removal_status")
createdAt            DateTime                 @default(now()) @map("created_at")
updatedAt            DateTime                 @updatedAt @map("updated_at")
searchText String @default("") @map("search_text")
```
Relations + model-level constraints:
```prisma
photos             Photo[]
videos             Video[]
reviewClips        ProductVideo[]
auctions           AuctionItem[]
moderationCommands ProductModerationCommand[]
@@index([sellerId])
@@index([status, category])
@@index([searchVector], type: Gin, map: "products_search_vector_idx")
@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
@@index([status, reservationExpiresAt])
@@map("products")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `created_at`: 19 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:47`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:69`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:232`; `C:/ise/Ise/backend/services/product-service/src/features/audit/marketingAuditRepository.js:118`; `C:/ise/Ise/backend/services/product-service/src/features/audit/marketingAuditRepository.js:119`
- `pre_removal_status`: 13 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/controllers/productController.js:232`; `C:/ise/Ise/backend/services/product-service/src/controllers/productController.js:265`; `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:26`; `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:60`; `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:194`
- `reservation_expires_at`: 19 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignService.js:828`; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignService.js:829`; `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:74`; `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:75`; `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:83`

#### Auction Items

Diagram node: `XNhT0xIQCqGi13c74-d6-1`; aliases: `XNhT0xIQCqGi13c74-d6-1`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-3`
- `scheduled_start_at` → ชื่อที่แยก annotation แล้ว `scheduled_start_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-5`
- `opened_at` → ชื่อที่แยก annotation แล้ว `opened_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-6`
- `approved_by` → ชื่อที่แยก annotation แล้ว `approved_by`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-7`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-9`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-15`
- `approved_at` → ชื่อที่แยก annotation แล้ว `approved_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-17`
- `closed_at` → ชื่อที่แยก annotation แล้ว `closed_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-18`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `XNhT0xIQCqGi13c74-d6-2`
- `starting_price` → ชื่อที่แยก annotation แล้ว `starting_price`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-4`
- `winning_bid_id` → ชื่อที่แยก annotation แล้ว `winning_bid_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-13`
- `round_id (FK)` → ชื่อที่แยก annotation แล้ว `round_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-10`
- `product_id (FK)` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-14`
- `bid_increment` → ชื่อที่แยก annotation แล้ว `bid_increment`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-16`
- `scheduled_end_at` → ชื่อที่แยก annotation แล้ว `scheduled_end_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-19`
- `winning_order_id` → ชื่อที่แยก annotation แล้ว `winning_order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-20`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `XNhT0xIQCqGi13c74-d6-21`

Model `AuctionItem` / table `auction_items`, schema line 213

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id               String        @id @default(uuid())
productId        String        @map("product_id")
sellerId         String        @map("seller_id")
status           AuctionStatus @default(draft)
startingPrice    Int           @map("starting_price")
bidIncrement     Int           @map("bid_increment")
scheduledStartAt DateTime?     @map("scheduled_start_at")
scheduledEndAt   DateTime?     @map("scheduled_end_at")
openedAt         DateTime?     @map("opened_at")
closedAt         DateTime?     @map("closed_at")
approvedBy       String?       @map("approved_by")
approvedAt       DateTime?     @map("approved_at")
cancellationReason String?       @map("cancellation_reason")
cancelledAt        DateTime?     @map("cancelled_at")
cancelledBy        String?       @map("cancelled_by")
winningBidId     String?       @unique @map("winning_bid_id")
winningOrderId   String?       @map("winning_order_id")
createdAt        DateTime      @default(now()) @map("created_at")
updatedAt        DateTime      @updatedAt @map("updated_at")
roundId String?       @map("round_id")
```
Relations + model-level constraints:
```prisma
round   AuctionRound? @relation(fields: [roundId], references: [id], onDelete: SetNull)
product Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
bids    Bid[]         @relation("AuctionBids")
@@index([productId])
@@index([sellerId])
@@index([status])
@@index([roundId])
@@map("auction_items")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `cancellation_reason`: 15 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionController.js:69`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionController.js:180`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:874`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:880`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:958`
- `cancelled_at`: 19 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:114`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:135`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:169`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:164`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:236`
- `cancelled_by`: 5 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:960`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:983`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:1262`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:1281`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:1333`

#### Auction Rounds

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-17`; aliases: `fcXe8sSY2NUpqUiIl6Bx-17`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-18`
- `auction_starts_at` → ชื่อที่แยก annotation แล้ว `auction_starts_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-19`
- `submission_starts_at` → ชื่อที่แยก annotation แล้ว `submission_starts_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-20`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-21`
- `auction_ends_at` → ชื่อที่แยก annotation แล้ว `auction_ends_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-24`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-25`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-22`
- `submission_ends_at` → ชื่อที่แยก annotation แล้ว `submission_ends_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-23`

**ชื่อซ้ำใน ER:** created_at

Model `AuctionRound` / table `auction_rounds`, schema line 251

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id                 String   @id @default(uuid())
title              String
categories         String[] @default([])
submissionStartsAt DateTime @map("submission_starts_at")
submissionEndsAt   DateTime @map("submission_ends_at")
auctionStartsAt    DateTime @map("auction_starts_at")
auctionEndsAt      DateTime @map("auction_ends_at")
cancellationReason String?   @map("cancellation_reason")
cancelledAt        DateTime? @map("cancelled_at")
cancelledBy        String?   @map("cancelled_by")
createdAt          DateTime @default(now()) @map("created_at")
updatedAt          DateTime @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
auctions AuctionItem[]
@@map("auction_rounds")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `cancellation_reason`: 15 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionController.js:69`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionController.js:180`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:874`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:880`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:958`
- `cancelled_at`: 19 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:114`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:135`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:169`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:164`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:236`
- `cancelled_by`: 5 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:960`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:983`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:1262`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:1281`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:1333`
- `categories`: 16 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/controllers/productController.js:175`; `C:/ise/Ise/backend/services/product-service/src/controllers/productController.js:176`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:23`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:306`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionService.js:577`
- `title`: 38 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/controllers/articleController.js:86`; `C:/ise/Ise/backend/services/product-service/src/controllers/articleController.js:88`; `C:/ise/Ise/backend/services/product-service/src/controllers/articleController.js:89`; `C:/ise/Ise/backend/services/product-service/src/controllers/articleController.js:102`; `C:/ise/Ise/backend/services/product-service/src/controllers/articleController.js:156`

#### Photo

Diagram node: `RjEVtsosJLOomzOdlkXN-51`; aliases: `RjEVtsosJLOomzOdlkXN-51`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `position` → ชื่อที่แยก annotation แล้ว `position`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-60`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-53`
- `url` → ชื่อที่แยก annotation แล้ว `url`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-54`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-55`
- `product_id(FK)` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-59`

Model `Photo` / table `photos`, schema line 107

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid())
productId String   @map("product_id")
url       String
position  Int      @default(0)
createdAt DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
@@index([productId])
@@map("photos")
```

#### Bids

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-42`; aliases: `fcXe8sSY2NUpqUiIl6Bx-42`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `auction_id (FK)` → ชื่อที่แยก annotation แล้ว `auction_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-44`
- `amount` → ชื่อที่แยก annotation แล้ว `amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-48`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-47`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-43`
- `bidder_id` → ชื่อที่แยก annotation แล้ว `bidder_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-45`
- `idempotency_key` → ชื่อที่แยก annotation แล้ว `idempotency_key`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-46`

Model `Bid` / table `bids`, schema line 270

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id             String   @id @default(uuid())
auctionId      String   @map("auction_id")
bidderId       String   @map("bidder_id")
amount         Int
idempotencyKey String   @unique @map("idempotency_key")
createdAt      DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
auction AuctionItem @relation("AuctionBids", fields: [auctionId], references: [id], onDelete: Cascade)
@@index([auctionId, amount])
@@index([bidderId])
@@map("bids")
```

#### Videos

Diagram node: `RjEVtsosJLOomzOdlkXN-67`; aliases: `RjEVtsosJLOomzOdlkXN-67`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-72`
- `url` → ชื่อที่แยก annotation แล้ว `url`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-73`
- `position` → ชื่อที่แยก annotation แล้ว `position`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-74`
- `caption` → ชื่อที่แยก annotation แล้ว `caption`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-75`
- `product_id(FK)` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-77`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-76`

Model `Video` / table `videos`, schema line 121

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid())
productId String   @map("product_id")
url       String
caption   String   @default("")
position  Int      @default(0)
createdAt DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
@@index([productId])
@@map("videos")
```

#### Campaign Attributions

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-59`; aliases: `fcXe8sSY2NUpqUiIl6Bx-59`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `event_id` → ชื่อที่แยก annotation แล้ว `event_id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-65`
- `campaign_id` → ชื่อที่แยก annotation แล้ว `campaign_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-66`
- `completed_at` → ชื่อที่แยก annotation แล้ว `completed_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-68`
- `order_id` → ชื่อที่แยก annotation แล้ว `order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-69`
- `gross_amount` → ชื่อที่แยก annotation แล้ว `gross_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-70`
- `net_amount` → ชื่อที่แยก annotation แล้ว `net_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-71`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-72`
- `discount_amount` → ชื่อที่แยก annotation แล้ว `discount_amount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-67`

Model `CampaignAttribution` / table `campaign_attributions`, schema line 438

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
eventId        String   @id @map("event_id")
orderId        String   @unique @map("order_id")
campaignId     String   @map("campaign_id")
grossAmount    Decimal      @map("gross_amount") @db.Decimal(12, 2)
discountAmount Decimal      @map("discount_amount") @db.Decimal(12, 2)
netAmount      Decimal      @map("net_amount") @db.Decimal(12, 2)
completedAt    DateTime @map("completed_at")
createdAt      DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
@@index([campaignId])
@@index([completedAt])
@@map("campaign_attributions")
```

#### Videos    Swipe

Diagram node: `RjEVtsosJLOomzOdlkXN-90`; aliases: `RjEVtsosJLOomzOdlkXN-90`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-93`
- `description` → ชื่อที่แยก annotation แล้ว `description`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-94`
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-101`
- `videoUrl` → ชื่อที่แยก annotation แล้ว `videoUrl`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-99`
- `product_id(FK)` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-100`
- `seller_name` → ชื่อที่แยก annotation แล้ว `seller_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-95`
- `crated_at` → ชื่อที่แยก annotation แล้ว `crated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-98`

Model `ProductVideo` / table `product_videos`, schema line 163

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id          String   @id @default(uuid())
videoUrl    String
description String?
sellerId    String   @map("seller_id")
sellerName  String?  @map("seller_name")
productId   String   @map("product_id")
createdAt   DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
product Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
choices SwipeChoice[]
@@index([productId])
@@index([sellerId])
@@index([createdAt])
@@map("product_videos")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `created_at`: 19 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:47`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:69`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:232`; `C:/ise/Ise/backend/services/product-service/src/features/audit/marketingAuditRepository.js:118`; `C:/ise/Ise/backend/services/product-service/src/features/audit/marketingAuditRepository.js:119`

#### Marketing Audit Logs

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-82`; aliases: `fcXe8sSY2NUpqUiIl6Bx-82`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `actor_role` → ชื่อที่แยก annotation แล้ว `actor_role`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-84`
- `entity_type` → ชื่อที่แยก annotation แล้ว `entity_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-85`
- `metadata` → ชื่อที่แยก annotation แล้ว `metadata`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-88`
- `actor_id` → ชื่อที่แยก annotation แล้ว `actor_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-90`
- `entity_id` → ชื่อที่แยก annotation แล้ว `entity_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-93`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-83`
- `previous_state` → ชื่อที่แยก annotation แล้ว `previous_state`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-87`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-89`
- `action` → ชื่อที่แยก annotation แล้ว `action`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-91`
- `new_state` → ชื่อที่แยก annotation แล้ว `new_state`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-92`
- `idempotency_key` → ชื่อที่แยก annotation แล้ว `idempotency_key`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-95`

Model `MarketingAuditLog` / table `marketing_audit_logs`, schema line 454

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id             String   @id @default(uuid())
actorId        String   @map("actor_id")
actorRole      String   @map("actor_role")
action         String
entityType     String   @map("entity_type")
entityId       String   @map("entity_id")
previousState  Json?    @map("previous_state")
newState       Json?    @map("new_state")
metadata       Json?
idempotencyKey String?  @unique @map("idempotency_key")
createdAt      DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
@@index([createdAt])
@@index([entityType, entityId])
@@index([action])
@@index([actorId])
@@map("marketing_audit_logs")
```

#### Swipe Choices

Diagram node: `RjEVtsosJLOomzOdlkXN-109`; aliases: `RjEVtsosJLOomzOdlkXN-109`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `RjEVtsosJLOomzOdlkXN-111`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-112`
- `product_video_id(FK)` → ชื่อที่แยก annotation แล้ว `product_video_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-114`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `RjEVtsosJLOomzOdlkXN-115`

Model `SwipeChoice` / table `swipe_choices`, schema line 184

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id             String   @id @default(uuid())
productVideoId String   @map("product_video_id")
userId         String   @map("user_id")
createdAt      DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
productVideo ProductVideo @relation(fields: [productVideoId], references: [id], onDelete: Cascade)
@@unique([productVideoId, userId])
@@index([userId])
@@map("swipe_choices")
```

#### Campaigns

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-107`; aliases: `fcXe8sSY2NUpqUiIl6Bx-107`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `name` → ชื่อที่แยก annotation แล้ว `name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-108`
- `usage_limit` → ชื่อที่แยก annotation แล้ว `usage_limit`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-112`
- `applicable_category` → ชื่อที่แยก annotation แล้ว `applicable_category`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-113`
- `approved_by_id` → ชื่อที่แยก annotation แล้ว `approved_by_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-115`
- `code` → ชื่อที่แยก annotation แล้ว `code`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-121`
- `max_discount` → ชื่อที่แยก annotation แล้ว `max_discount`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-124`
- `budget` → ชื่อที่แยก annotation แล้ว `budget`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-125`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-129`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-109`
- `discount_type` → ชื่อที่แยก annotation แล้ว `discount_type`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-110`
- `min_order_price` → ชื่อที่แยก annotation แล้ว `min_order_price`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-111`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-117`
- `ends_at` → ชื่อที่แยก annotation แล้ว `ends_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-116`
- `version` → ชื่อที่แยก annotation แล้ว `version`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-114`
- `description` → ชื่อที่แยก annotation แล้ว `description`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-123`
- `discount_value` → ชื่อที่แยก annotation แล้ว `discount_value`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-122`
- `used_count` → ชื่อที่แยก annotation แล้ว `used_count`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-126`
- `starts_at` → ชื่อที่แยก annotation แล้ว `starts_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-128`
- `approved_at` → ชื่อที่แยก annotation แล้ว `approved_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-131`
- `target_segment` → ชื่อที่แยก annotation แล้ว `target_segment`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-130`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-120`
- `created_by_id` → ชื่อที่แยก annotation แล้ว `created_by_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-127`

Model `Campaign` / table `campaigns`, schema line 337

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id                 String         @id @default(uuid())
code               String         @unique
name               String
description        String?        @db.Text
discountType       DiscountType   @default(PERCENT) @map("discount_type")
discountValue      Int            @map("discount_value")
minOrderPrice      Int            @default(0) @map("min_order_price")
maxDiscount        Int?           @map("max_discount")
applicableCategory String?        @map("applicable_category")
budget             Int?
spentBudget        Decimal        @default(0) @map("spent_budget") @db.Decimal(12, 2)
usageLimit         Int?           @map("usage_limit")
usedCount          Int            @default(0) @map("used_count")
status             CampaignStatus @default(draft)
startsAt           DateTime       @map("starts_at")
endsAt             DateTime       @map("ends_at")
createdById        String         @map("created_by_id")
approvedById       String?        @map("approved_by_id")
approvedAt         DateTime?      @map("approved_at")
version            Int            @default(1)
targetSegment      Json?          @map("target_segment")
createdAt          DateTime       @default(now()) @map("created_at")
updatedAt          DateTime       @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
vouchers UserVoucher[]
@@index([status])
@@index([code])
@@index([startsAt, endsAt])
@@map("campaigns")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `spent_budget`: 10 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignMetrics.js:193`; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignMetrics.js:201`; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignMetrics.js:287`; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignMetrics.js:291`; `C:/ise/Ise/backend/services/product-service/src/features/campaigns/campaignRepository.js:353`

#### User Vouchers

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-159`; aliases: `fcXe8sSY2NUpqUiIl6Bx-159`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-160`
- `claimed_at` → ชื่อที่แยก annotation แล้ว `claimed_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-162`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-165`
- `used_at` → ชื่อที่แยก annotation แล้ว `used_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-166`
- `user_id` → ชื่อที่แยก annotation แล้ว `user_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-161`
- `used_order_id` → ชื่อที่แยก annotation แล้ว `used_order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-163`
- `campaign_id (FK)` → ชื่อที่แยก annotation แล้ว `campaign_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-164`

Model `UserVoucher` / table `user_vouchers`, schema line 371

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id          String        @id @default(uuid())
campaignId  String        @map("campaign_id")
userId      String        @map("user_id")
status      VoucherStatus @default(CLAIMED)
claimedAt   DateTime      @default(now()) @map("claimed_at")
usedAt      DateTime?     @map("used_at")
usedOrderId String?       @map("used_order_id")
```
Relations + model-level constraints:
```prisma
campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
@@unique([userId, campaignId])
@@index([userId])
@@index([campaignId])
@@index([status])
@@map("user_vouchers")
```

#### Articles

Diagram node: `fcXe8sSY2NUpqUiIl6Bx-178`; aliases: `fcXe8sSY2NUpqUiIl6Bx-178`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `content` → ชื่อที่แยก annotation แล้ว `content`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-183`
- `category` → ชื่อที่แยก annotation แล้ว `category`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-184`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `fcXe8sSY2NUpqUiIl6Bx-179`
- `cover_image` → ชื่อที่แยก annotation แล้ว `cover_image`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-190`
- `status` → ชื่อที่แยก annotation แล้ว `status`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-192`
- `published_at` → ชื่อที่แยก annotation แล้ว `published_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-195`
- `slug` → ชื่อที่แยก annotation แล้ว `slug`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-182`
- `author_id` → ชื่อที่แยก annotation แล้ว `author_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-186`
- `search_text` → ชื่อที่แยก annotation แล้ว `search_text`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-187`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-188`
- `title` → ชื่อที่แยก annotation แล้ว `title`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-189`
- `summary` → ชื่อที่แยก annotation แล้ว `summary`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-191`
- `author_name` → ชื่อที่แยก annotation แล้ว `author_name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-193`
- `updated_at` → ชื่อที่แยก annotation แล้ว `updated_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `fcXe8sSY2NUpqUiIl6Bx-194`

Model `Article` / table `articles`, schema line 287

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id          String        @id @default(uuid())
title       String
slug        String?       @unique
summary     String?       @db.Text
content     String        @db.Text
coverImage  String?       @map("cover_image")
category    String        @default("general")
status      ArticleStatus @default(draft)
authorId    String        @map("author_id")
authorName  String?       @map("author_name")
searchText  String        @default("") @map("search_text")
publishedAt DateTime?     @map("published_at")
createdAt   DateTime      @default(now()) @map("created_at")
updatedAt   DateTime      @updatedAt @map("updated_at")
```
Relations + model-level constraints:
```prisma
@@index([status])
@@index([category])
@@index([status, category])
@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
@@map("articles")
```

#### Count Views

Diagram node: `17ALRlZXJw6gpSFkRTBB-1`; aliases: `17ALRlZXJw6gpSFkRTBB-1`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `viewer_id (PK)` → ชื่อที่แยก annotation แล้ว `viewer_id`; ขีดเส้นใต้/มี key annotation; node `17ALRlZXJw6gpSFkRTBB-13`
- `product_id (PK, FK)` → ชื่อที่แยก annotation แล้ว `product_id`; ขีดเส้นใต้/มี key annotation; node `17ALRlZXJw6gpSFkRTBB-5`
- `count` → ชื่อที่แยก annotation แล้ว `count`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-10`

**ไม่พบ model/table ใน runtime schema ของ service นี้**

#### Reviews

Diagram node: `17ALRlZXJw6gpSFkRTBB-96`; aliases: `17ALRlZXJw6gpSFkRTBB-96`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `17ALRlZXJw6gpSFkRTBB-100`
- `buyer_id` → ชื่อที่แยก annotation แล้ว `buyer_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-101`
- `rating` → ชื่อที่แยก annotation แล้ว `rating`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-106`
- `seller_id` → ชื่อที่แยก annotation แล้ว `seller_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-104`
- `order_id` → ชื่อที่แยก annotation แล้ว `order_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-105`
- `date` → ชื่อที่แยก annotation แล้ว `date`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-107`
- `product_id(FK)` → ชื่อที่แยก annotation แล้ว `product_id`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-102`
- `comment` → ชื่อที่แยก annotation แล้ว `comment`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `17ALRlZXJw6gpSFkRTBB-103`

Model `Review` / table `reviews`, schema line 391

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid())
orderId   String   @unique @map("order_id")
buyerId   String   @map("buyer_id")
sellerId  String   @map("seller_id")
productId String?  @map("product_id")
rating    Int
comment   String   @default("")
createdAt DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
photos ReviewPhoto[]
videos ReviewVideo[]
@@index([sellerId])
@@index([productId])
@@map("reviews")
```
Textual references ของ schema-only columns (ค้น property name; อาจมี occurrence ที่เป็น entity อื่นชื่อเหมือนกัน จึงไม่ถือเป็น dataflow proof):
- `created_at`: 19 candidate occurrences; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:47`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:69`; `C:/ise/Ise/backend/services/product-service/src/features/auctions/auctionRepository.js:232`; `C:/ise/Ise/backend/services/product-service/src/features/audit/marketingAuditRepository.js:118`; `C:/ise/Ise/backend/services/product-service/src/features/audit/marketingAuditRepository.js:119`

#### Conditions

Diagram node: `1fOL0HeOEAJoQGzzceYv-2`; aliases: `1fOL0HeOEAJoQGzzceYv-2`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `1fOL0HeOEAJoQGzzceYv-4`
- `label` → ชื่อที่แยก annotation แล้ว `label`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1fOL0HeOEAJoQGzzceYv-6`
- `value` → ชื่อที่แยก annotation แล้ว `value`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1fOL0HeOEAJoQGzzceYv-8`
- `sort_order` → ชื่อที่แยก annotation แล้ว `sort_order`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1fOL0HeOEAJoQGzzceYv-10`

Model `Condition` / table `conditions`, schema line 148

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String @id @default(uuid())
value     String @unique
label     String
sortOrder Int    @default(0) @map("sort_order")
```
Relations + model-level constraints:
```prisma
@@map("conditions")
```

#### Categories

Diagram node: `1fOL0HeOEAJoQGzzceYv-17`; aliases: `1fOL0HeOEAJoQGzzceYv-17`

ER attributes (ทุกวงรี ตามลำดับที่เชื่อมใน XML):
- `name` → ชื่อที่แยก annotation แล้ว `name`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1fOL0HeOEAJoQGzzceYv-22`
- `id` → ชื่อที่แยก annotation แล้ว `id`; ขีดเส้นใต้/มี key annotation; node `1fOL0HeOEAJoQGzzceYv-19`
- `created_at` → ชื่อที่แยก annotation แล้ว `created_at`; ไม่พบ marker ที่ parser ใช้ตรวจ; node `1fOL0HeOEAJoQGzzceYv-21`

Model `Category` / table `categories`, schema line 138

Scalar fields (type/nullability/default/map/PK/UK ปัจจุบัน):
```prisma
id        String   @id @default(uuid())
name      String   @unique
createdAt DateTime @default(now()) @map("created_at")
```
Relations + model-level constraints:
```prisma
@@map("categories")
```

#### Model/table นอก ER — definitions ครบ


##### product_moderation_commands

Model `ProductModerationCommand`, schema line 91
```prisma
idempotencyKey String   @id @map("idempotency_key")
action         String
productId      String   @map("product_id")
payloadHash    String   @map("payload_hash")
result         Json
createdAt      DateTime @default(now()) @map("created_at")
product        Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
@@index([productId, createdAt])
@@map("product_moderation_commands")
```
Candidate delegate references: `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:117`, `C:/ise/Ise/backend/services/product-service/src/features/moderation/moderationService.js:140`

##### review_photos

Model `ReviewPhoto`, schema line 409
```prisma
id        String   @id @default(uuid())
reviewId  String   @map("review_id")
url       String
position  Int      @default(0)
createdAt DateTime @default(now()) @map("created_at")
review Review @relation(fields: [reviewId], references: [id], onDelete: Cascade)
@@index([reviewId])
@@map("review_photos")
```
Confirmed nested relations are used at backend/services/product-service/src/features/reviews/models/reviewModel.js:3-29 (direct delegate search alone would miss this).

##### review_videos

Model `ReviewVideo`, schema line 422
```prisma
id        String   @id @default(uuid())
reviewId  String   @map("review_id")
url       String
position  Int      @default(0)
createdAt DateTime @default(now()) @map("created_at")
review Review @relation(fields: [reviewId], references: [id], onDelete: Cascade)
@@index([reviewId])
@@map("review_videos")
```
Confirmed nested relations are used at backend/services/product-service/src/features/reviews/models/reviewModel.js:3-29 (direct delegate search alone would miss this).

#### Free-coordinate endpoint resolutions

รายการนี้เป็นการจับคู่ปลายเส้นที่ไม่ใช้ source/target ID กับกรอบ node ที่พิกัดสัมผัสอย่างไม่กำกวม ไม่ได้แก้ไฟล์ ER

- edge `RjEVtsosJLOomzOdlkXN-46` source point [-280, 955] → node `XNhT0xIQCqGi13c74-d6-1`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-13` target point [-265, 940] → node `XNhT0xIQCqGi13c74-d6-1`, distance 0px
- edge `RjEVtsosJLOomzOdlkXN-19` target point [426.47, 370] → node `pPA2m0y0b1gJxXUfVHl2-1`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-29` target point [-544.55, 420] → node `fcXe8sSY2NUpqUiIl6Bx-17`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-32` target point [-459.55, 380] → node `fcXe8sSY2NUpqUiIl6Bx-17`, distance 0px
- edge `RjEVtsosJLOomzOdlkXN-103` target point [1349.15, 700] → node `RjEVtsosJLOomzOdlkXN-90`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-96` target point [-450, 2560] → node `fcXe8sSY2NUpqUiIl6Bx-82`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-138` target point [374.95000000000005, 2685] → node `fcXe8sSY2NUpqUiIl6Bx-107`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-139` target point [362.3699999999999, 2685] → node `fcXe8sSY2NUpqUiIl6Bx-107`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-142` target point [364.70000000000005, 2725] → node `fcXe8sSY2NUpqUiIl6Bx-107`, distance 0px
- edge `fcXe8sSY2NUpqUiIl6Bx-148` target point [476.06999999999994, 2685] → node `fcXe8sSY2NUpqUiIl6Bx-107`, distance 0px
- edge `17ALRlZXJw6gpSFkRTBB-3` target point [430, 370] → node `pPA2m0y0b1gJxXUfVHl2-1`, distance 0px
Unassigned oval attributes: 0

#### Relationships ที่อ่านได้จาก XML

Cardinality labels ต่อไปนี้เป็นข้อความจาก XML ไม่ใช่การยืนยันทางภาพ; ข้อจำกัดเกี่ยวกับ labels/endpoints อยู่ใน A4; entity ที่ซ้ำในรายการปลายเส้นของ weak entity มาจากกรอบนอก/ใน ไม่ได้แปลว่าเป็น ternary relationship

- node `RjEVtsosJLOomzOdlkXN-43` / label `Have`: `Products` [edge `RjEVtsosJLOomzOdlkXN-44`; labels ['', '1']] ↔ `Auction Items` [edge `RjEVtsosJLOomzOdlkXN-46`; labels ['', 'M']]
- node `RjEVtsosJLOomzOdlkXN-49` / label `Have`: `Products` [edge `RjEVtsosJLOomzOdlkXN-50`; labels ['', '1']] ↔ `Photo` [edge `RjEVtsosJLOomzOdlkXN-52`; labels ['', 'M']]
- node `fcXe8sSY2NUpqUiIl6Bx-35` / label `Have`: `Auction Rounds` [edge `fcXe8sSY2NUpqUiIl6Bx-38`; labels ['', '1']] ↔ `Auction Items` [edge `fcXe8sSY2NUpqUiIl6Bx-39`; labels ['', 'M']]
- node `fcXe8sSY2NUpqUiIl6Bx-40` / label `Have`: `Auction Items` [edge `fcXe8sSY2NUpqUiIl6Bx-41`; labels ['', '1']] ↔ `Bids` [edge `fcXe8sSY2NUpqUiIl6Bx-50`; labels ['', 'M']]
- node `RjEVtsosJLOomzOdlkXN-63` / label `Have`: `Products` [edge `RjEVtsosJLOomzOdlkXN-64`; labels ['', '1']] ↔ `Videos` [edge `RjEVtsosJLOomzOdlkXN-68`; labels ['', 'M']]
- node `RjEVtsosJLOomzOdlkXN-85` / label `Have`: `Videos    Swipe` [edge `RjEVtsosJLOomzOdlkXN-91`; labels ['', 'M']] ↔ `Products` [edge `RjEVtsosJLOomzOdlkXN-87`; labels ['', '1']]
- node `RjEVtsosJLOomzOdlkXN-107` / label `Have`: `Videos    Swipe` [edge `RjEVtsosJLOomzOdlkXN-108`; labels ['', '1']] ↔ `Swipe Choices` [edge `RjEVtsosJLOomzOdlkXN-116`; labels ['', 'M']]
- node `fcXe8sSY2NUpqUiIl6Bx-174` / label `Have`: `Campaigns` [edge `fcXe8sSY2NUpqUiIl6Bx-176`; labels ['', '1']] ↔ `User Vouchers` [edge `fcXe8sSY2NUpqUiIl6Bx-175`; labels ['', 'M']]
- node `17ALRlZXJw6gpSFkRTBB-2` / label `Have`: `Products` [edge `17ALRlZXJw6gpSFkRTBB-3`; labels ['', '1']] ↔ `Count Views` [edge `17ALRlZXJw6gpSFkRTBB-4`; labels ['', 'M']]
- node `17ALRlZXJw6gpSFkRTBB-97` / label `Have`: `Products` [edge `17ALRlZXJw6gpSFkRTBB-98`; labels ['', '1']] ↔ `Reviews` [edge `17ALRlZXJw6gpSFkRTBB-99`; labels ['M']]
- node `1fOL0HeOEAJoQGzzceYv-13` / label `Have`: `Conditions` [edge `1fOL0HeOEAJoQGzzceYv-11`; labels ['', 'M']] ↔ `Products` [edge `1fOL0HeOEAJoQGzzceYv-14`; labels ['', '1']]
- node `1fOL0HeOEAJoQGzzceYv-23` / label `Have`: `Products` [edge `1fOL0HeOEAJoQGzzceYv-24`; labels ['', '1']] ↔ `Categories` [edge `1fOL0HeOEAJoQGzzceYv-25`; labels ['', 'M']]

## H. Provenance

เวลาสร้างรายงาน (local): 2026-10-12T19:28:06
Git HEAD: `625931170ccdbf095091824d02dd1478859a1eb5`
- `C:/ise/Ise/database/erdesign\Auth Service\ข้อ 1/ER_auth.drawio` SHA256 `f569fe984c8a24873626a33453ab4482d4269cc3eac85512490949d4f1b57f5f`
- `C:/ise/Ise/backend/services/auth-service/prisma/schema.prisma` SHA256 `2e239cf3f4da51b0f17440180be3c0f9e3581d9b8a6b0113e688431da77ad214`
- `C:/ise/Ise/database/erdesign\Customer Service\ข้อ 1/customer-service-คน-er.drawio` SHA256 `b3d95f6327c64ef835dc9d43fdb2315f1dc8ae6d67f4a296c7fd6f1a8ccc2155`
- `C:/ise/Ise/backend/services/support-service/prisma/schema.prisma` SHA256 `809baae4bad5c4fdd438a7eb943cd3aefad7b4367b232725afcb735fdc1c0924`
- `C:/ise/Ise/database/erdesign\Order Service\ข้อ 1/คน` SHA256 `05bdfee5fd807bd5b22d7373da79ca64f664e673a6a727d2d2bc1ed6e16fda2c`
- `C:/ise/Ise/backend/services/order-service/prisma/schema.prisma` SHA256 `1eba3c9023978cb983672df2cd1d1eab7062e3d1a49d2ce579167402d26fc00b`
- `C:/ise/Ise/database/erdesign\Product Service\ข้อ1/Product-Service-คน-1.drawio` SHA256 `149945c6518a0109a65c9d4430a8797d6bd9e1d30f72f85cc1195db019246151`
- `C:/ise/Ise/backend/services/product-service/prisma/schema.prisma` SHA256 `d30824074c7a95efc5a07fc408dd177351ca58b7788dcbd51cea6e3fc7971db0`

JSON inventory ที่ใช้สร้าง appendix: `C:/Users/nes/AppData/Local/Temp/ise-er-audit/audit.json`
