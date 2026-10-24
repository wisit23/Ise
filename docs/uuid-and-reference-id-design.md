# UUID และรหัสอ้างอิงของ RE-LOOP

วันที่จัดทำ: 24 ตุลาคม 2026  
อัปเดตล่าสุด: 25 ตุลาคม 2026  
ฐานโค้ดที่ตรวจ: `57e46b0` — ครอบคลุมทั้งระบบ ไม่จำกัดเฉพาะ Trust & Safety

## 1. วัตถุประสงค์และสถานะ

ต้องการให้รหัสที่ผู้ใช้และเจ้าหน้าที่เห็นมีรูปแบบเดียวกัน อ่านง่าย ระบุประเภทข้อมูลได้ และสั้นกว่า UUID ที่แสดงแบบเต็ม เช่น `ORD-7K3M-9X2R-4T6W`

เอกสารนี้รวบรวมรายละเอียดที่คุยกันและแบบออกแบบที่ใช้พัฒนา หลังผู้ใช้อนุมัติได้เพิ่ม schema, ตัวสร้างรหัส, API, UI และ backfill แล้ว ดูรายละเอียด implementation ในหัวข้อ 13 การแสดงผลทุก role ในหัวข้อ 14 และขอบเขตการตรวจจริงใน [ผลตรวจรอบนี้](uuid-reference-id-validation.md) การมีรหัสใน schema ไม่ได้หมายความว่าทุกประเภทมีหน้าจอจัดการแยกครบแล้ว

แนวทางที่แนะนำคือ **เก็บ ID ภายในเดิม แล้วเพิ่มรหัสอ้างอิงที่อ่านง่าย** หากต้องการแทนที่ primary key เดิมทั้งระบบจริง ต้องออกแบบการย้ายความสัมพันธ์และข้อมูลข้ามบริการเพิ่มเติม ไม่ถือว่าการเพิ่มรหัสอ้างอิงคือการแทนที่ primary key

## 2. UUID กับรหัสอ้างอิงต่างกันอย่างไร

| ชนิด                     | หน้าที่                                                          | รูปแบบ                                     |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| Internal ID              | ระบุตัวตนถาวรของแถว/เอกสาร เชื่อม relation และการทำงานข้ามบริการ | UUID เดิม หรือ MongoDB ObjectId เดิม       |
| Reference ID / Public ID | แสดง คัดลอก ค้นหา และแจ้งเจ้าหน้าที่                             | `ORD-7K3M-9X2R-4T6W`                       |
| Security token           | ยืนยันตัวตนหรือสิทธิ์ เช่น reset password                        | ใช้กลไกและความยาวตามความปลอดภัยของแต่ละงาน |

UUID มาตรฐานเป็นค่า 128 บิต รูปแบบข้อความที่คุ้นเคยมี 36 ตัวรวมขีด การสร้างรหัส prefix กับตัวสุ่ม 12 ตัวเป็น **รหัสอ้างอิงแบบกำหนดเอง ไม่ใช่ UUID มาตรฐาน** ในชื่อเอกสารยังมี UUID เพราะเป็นหัวข้อที่ใช้คุยกัน

ตัวอย่างข้อมูลหลังเพิ่มรหัสอ้างอิง:

```json
{
  "id": "e31b58ec-8078-48bb-9e56-1d20e4d3b7bc",
  "referenceCode": "ORD-7K3M-9X2R-4T6W",
  "buyerId": "internal-user-id",
  "productId": "internal-product-id"
}
```

`buyerId` และ `productId` ยังอ้างถึง internal ID ของเจ้าของข้อมูล ไม่เปลี่ยนไปเก็บรหัสที่หน้าจอแสดง และไม่สร้าง reference code ของ entity อื่นขึ้นเอง

## 3. รูปแบบรหัสร่วมกัน

```text
PREFIX-XXXX-XXXX-XXXX
ORD-7K3M-9X2R-4T6W
```

- Prefix ภาษาอังกฤษตัวใหญ่ 3 ตัว ระบุประเภท entity ไม่ใช่ role หรือสถานะ
- ส่วนสุ่ม 12 ตัว แบ่งเป็น 3 กลุ่ม กลุ่มละ 4 ตัว
- ความยาวรวม 18 ตัว: prefix 3 + ขีด 3 + ส่วนสุ่ม 12
  **ชุดที่เสนอใช้จริง:** `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` มี 32 ตัว ตัด `0`, `O`, `1`, `I` และคง `L` ไว้ เพราะไม่มีเลข `1` ให้สับสน ไม่ใช้สัญลักษณ์ในส่วนสุ่ม

ข้อปรับจากการคุย: ก่อนหน้านี้ใช้ 32 แบบเพื่ออธิบายคณิตศาสตร์ และเสนอให้ตัด `L` ด้วย หากตัด `L` เพิ่มจากชุดจริงจะเหลือ 31 แบบ ไม่ควรอ้างว่ามี 32 แบบโดยไม่กำหนด alphabet ให้ตรงกัน เอกสารนี้เลือก **32 แบบและ 12 ตัวสุ่ม** เป็นข้อเสนอที่นำไปพัฒนาได้ชัดเจน ตัวอย่างทั้งหมดใช้ได้กับชุดนี้

ตัวตรวจรูปแบบมาตรฐานสำหรับ prefix ที่กำหนดแล้ว:

```text
^PREFIX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$
```

`PREFIX` ในตัวอย่างต้องแทนด้วยค่าจากทะเบียนด้านล่าง ห้ามรับ prefix ใดก็ได้เพียงเพราะยาว 3 ตัว

รหัสไม่มีวันที่ ลำดับต่อเนื่อง ชื่อผู้ใช้ หรือสถานะฝังอยู่ จึงไม่ต้องเปลี่ยนเมื่อข้อมูลเปลี่ยน ไม่ใช้รหัสเรียงเลขเพื่อแสดงจำนวนธุรกรรม และไม่ตัด UUID เดิมมาสร้างรหัสใหม่

## 4. ทำไม 12 ตัวจึงเพียงพอ

ยิ่งตัวสุ่มสั้น จำนวนค่าที่เป็นไปได้ยิ่งน้อย และยิ่งสร้างข้อมูลมาก ก็ยิ่งมีโอกาสเคยสุ่มซ้ำ แม้จะยังใช้รหัสไม่ครบทุกค่าก็ตาม

สูตรสำหรับ alphabet ขนาด `A` และความยาวสุ่ม `k`:

```text
N = A^k
P(เคยชนอย่างน้อยหนึ่งครั้ง) ≈ 1 - exp(-n(n-1)/(2N))
```

`n` คือจำนวนรหัสที่สร้างสะสมใน namespace เดียวกัน สมมติสุ่มแต่ละครั้งอย่างอิสระและสม่ำเสมอ

### ตัวเลขที่ใช้คุยกัน: alphabet 32 แบบ

| จำนวนตัวสุ่ม |      จำนวนค่าที่เป็นไปได้ |
| ------------ | ------------------------: |
| 4            |                 1,048,576 |
| 8            |         1,099,511,627,776 |
| 12           | 1,152,921,504,606,846,976 |

เมื่อมี 1 ล้านรหัสใน prefix เดียวกัน ส่วนสุ่ม 12 ตัวมีโอกาสเคยชนประมาณ **0.000043%** ตามที่อธิบายในบทสนทนา ตัวเลขนี้เป็นโอกาสที่ต้องสุ่มใหม่ ไม่ใช่โอกาสบันทึกรหัสซ้ำสำเร็จเมื่อมี unique constraint

### โอกาสชนของ alphabet 32 แบบที่เสนอใช้จริง

`32^12 = 1,152,921,504,606,846,976` หรือประมาณ 1.15 ล้านล้านล้านค่า ให้ข้อมูลสุ่ม 60 บิต

| จำนวนรหัสสะสมต่อ prefix | โอกาสเคยสุ่มชนโดยประมาณ ก่อน retry |
| ----------------------- | ---------------------------------: |
| 1 ล้าน                  |                         0.0000434% |
| 10 ล้าน                 |                           0.00434% |
| 100 ล้าน                |                             0.433% |
| 1,000 ล้าน              |                              35.2% |

ดังนั้น **12 ตัวเพียงพอสำหรับรหัสอ้างอิงธุรกิจของ RE-LOOP** ภายใต้การสุ่มที่ถูกต้องและ unique + retry ไม่ได้หมายความว่าสุ่มแล้วไม่มีโอกาสชนเลย Prefix กับขีดไม่ได้เพิ่ม entropy ของส่วนสุ่ม และไม่มีคุณสมบัติเป็นรหัสลับ

ข้อความและ event เกิดถี่กว่าออเดอร์มาก เช่น หนึ่งออเดอร์มีหลายสิบข้อความ จึงไม่ควรสร้างรหัสอ้างอิงให้ทุกข้อความหรือทุก event โดยไม่มีการใช้งานจริง ให้คง internal ID เดิมไว้ หากภายหลังจำเป็นต้องมีรหัสที่คนเห็นสำหรับข้อมูลเหล่านี้ ให้ประเมินปริมาณสะสมก่อนเพิ่ม prefix หรือความยาวใหม่

## 5. ทะเบียนรหัสอ้างอิงที่เสนอ

เจ้าของ entity เป็นผู้สร้างรหัสหนึ่งครั้ง และทุก consumer ใช้รหัสเดียวกัน รหัสทั้งชุดต้อง unique ภายใน entity ของบริการเจ้าของ ข้ามประเภทสามารถมีส่วนสุ่มตรงกันได้เพราะ prefix ต่างกัน ห้ามนำ prefix เดียวไปใช้สร้าง entity เดียวกันจากหลายบริการโดยไม่มีเจ้าของกลาง

| บริการเจ้าของ | Entity            | Prefix | ตัวอย่าง/กติกา                                                    |
| ------------- | ----------------- | ------ | ----------------------------------------------------------------- |
| Auth          | User              | `USR`  | `USR-7K3M-9X2R-4T6W`; คนเดียวกันมี BUYER/SELLER ใช้รหัสผู้ใช้เดิม |
| Auth          | KycApplication    | `KYC`  | หนึ่งรหัสต่อคำขอ ไม่ใช่ต่อไฟล์                                    |
| Auth          | Report            | `RPT`  | รหัสร้องเรียนต้นทาง                                               |
| Auth          | ShopChangeRequest | `SCR`  | รหัสคำขอเปลี่ยนข้อมูลร้าน                                         |
| Auth          | BulkActionRun     | `BLK`  | รหัสงานกลุ่มที่เจ้าหน้าที่ต้องติดตาม                              |
| Product       | Product           | `PRD`  | สินค้าเดิมใช้รหัสเดิมเมื่อขายหรือเปลี่ยนสถานะ                     |
| Product       | ProductVideo      | `CLP`  | คลิปใน swipe feed แยกจากไฟล์วิดีโอ                                |
| Product       | AuctionItem       | `AUC`  | รายการประมูล ไม่ใช่ออเดอร์ที่เกิดจากประมูล                        |
| Product       | AuctionRound      | `RND`  | รอบประมูลหนึ่งรอบมีหลาย AUC                                       |
| Product       | Bid               | `BID`  | ใช้เมื่อต้องแสดงเลขอ้างอิงการเสนอราคา                             |
| Product       | Campaign          | `CMP`  | แคมเปญ                                                            |
| Product       | UserVoucher       | `VCH`  | รหัสอ้างอิงสิทธิ์ voucher; ไม่แทนรหัสโปรโมชันที่ใช้แลก            |
| Product       | Article           | `ART`  | บทความ Marketing                                                  |
| Product       | Review            | `REV`  | รีวิว                                                             |
| Order         | Basket            | `BSK`  | เพิ่มเมื่อมีหน้าจอ/งานสนับสนุนที่ต้องใช้จริง                      |
| Order         | Checkout          | `CHK`  | หนึ่ง checkout มีรหัสของตัวเอง ไม่เท่ากับ ORD                     |
| Order         | Order             | `ORD`  | ทุกออเดอร์ รวมออเดอร์ประมูล ใช้ ORD                               |
| Order         | Payment           | `PAY`  | หนึ่ง payment record; ไม่ใช่เลขธุรกรรมจาก provider                |
| Order         | Shipping          | `SHP`  | ไม่ใช่เลขพัสดุจากผู้จัดส่ง                                        |
| Order         | Hold              | `HLD`  | การ hold แต่ละครั้ง                                               |
| Order         | DisputeCase       | `DSP`  | รหัสข้อพิพาทร่วมสำหรับ Buyer/Seller/CS/T&S                        |
| Support       | SupportTicket     | `TKT`  | ticket ที่ลูกค้าหรือเจ้าหน้าที่ติดตาม                             |
| Support       | HelpArticle       | `HLP`  | บทความช่วยเหลือ แยกจาก ART                                        |
| Support       | SlaPolicy         | `SLA`  | เพิ่มถ้าต้องอ้างอิงนโยบายบนหน้าจอ                                 |
| Chat          | Conversation      | `CHT`  | เพิ่มเมื่อต้องให้เจ้าหน้าที่ค้นหาห้องด้วยรหัส                     |

ไม่มี prefix แยกตามฝ่าย เช่น ADMIN/CS/EXECUTIVE สำหรับ User เดียวกัน และไม่มีรหัสร้านแยกใหม่ในข้อเสนอนี้ เพราะ SellerProfile ใช้ userId เป็นตัวตน หากภายหลังมี Store entity แยก ให้กำหนด contract เพิ่มก่อน

ออเดอร์ประมูลแสดง `ORD-...` เป็นรหัสออเดอร์ และแสดง `AUC-...` ในช่องรายการประมูลแยกกัน ไม่ใช้ AUC แทน ORD

## 6. ข้อมูลที่ยังใช้ ID ภายในเดิม

หลักคือ **ทุกจุดที่ใช้ UUID ต้องจัดประเภท แต่ไม่จำเป็นต้องเปลี่ยนทุกค่าเป็นรหัสสั้น** รายการนี้ครอบคลุม model ที่เหลือจาก schema ที่ตรวจในวันที่จัดทำ

| กลุ่ม                      | Model/การใช้งาน                                                                                                                    | กติกา                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Auth profile               | UserAddress, BuyerProfile, BuyerPreference, SellerProfile                                                                          | เก็บ ID/compound key/userId เดิม; หน้า UI อ้าง User ด้วย USR เมื่อจำเป็น        |
| Auth logs                  | LoginLog, BuyerActivityLog, AdminAudit, ExecutiveAuditLog                                                                          | UUID เดิม ไม่สร้างรหัสสั้นอัตโนมัติทุก log                                      |
| Auth security              | RefreshToken, PasswordResetToken, EmailVerificationToken, session ID, JWT jti                                                      | คงรูปแบบและ entropy ตามหน้าที่; ห้ามเปลี่ยน token เป็นรหัส 12 ตัวเพราะเอกสารนี้ |
| Auth relations/evidence    | ReportEvidence, RoleDefinition, UserRole, ShopChangeRequestItem, AutoMessage                                                       | คง UUID/compound key; อ้างรหัส entity แม่เมื่อสื่อสารกับผู้ใช้                  |
| Product media              | Photo, Video, ReviewMedia                                                                                                          | UUID เดิม; CLP หมายถึง ProductVideo ไม่ใช่ทุก Video                             |
| Product lookup             | Category, Condition                                                                                                                | คง ID เดิม; ผู้ใช้เห็นชื่อหรือค่าที่อ่านได้                                     |
| Product relations/activity | RecommendationSearch, ProductFavorite, ProductCategory, ProductVideoComment, SwipeChoice, ArticleView, CampaignAudience, CountView | คง UUID/compound key เดิม ไม่สร้างรหัสธุรกิจเพิ่ม                               |
| Product integration        | CampaignAttribution, MarketingAuditLog, ProductModerationCommand                                                                   | คง event ID, UUID และ idempotency key ตาม contract เดิม                         |
| Order history/evidence     | OrderLog, DisputeCaseLog, DisputeEvidence, Evidence, DisputeAuditLog, SafetyDisputeEvidence, SafetyLog                             | คง UUID เดิม; แสดง ORD/DSP ของ entity แม่                                       |
| Order jobs/snapshots       | AttributionJob, ProductSyncJob, CheckoutAddressSnapshot, ShippingAddressSnapshot                                                   | คง UUID หรือ key ของ checkout/shipping ตามเดิม                                  |
| CSAT                       | CustomerSatisfaction ของ Order และ Support                                                                                         | คง compound key เดิม ไม่สร้างรหัส CSAT ใหม่                                     |
| Support lookup             | TicketCategory, TicketPriority, TicketStatus, HelpCategory                                                                         | คงเลขจำนวนเต็ม auto-increment เดิม                                              |
| Support history            | TicketAssignment, TicketStatusHistory, TicketSlaTarget, TicketAuditLog, TicketSlaRound, HelpArticleRevision                        | คง UUID/compound key เดิม; ค้นหางานผ่าน TKT/HLP/SLA                             |
| Support chat links         | TicketChatLink, TicketChatMessageReceipt                                                                                           | คง key ที่อ้าง ticket/message เดิม                                              |
| Chat                       | Message, Notification                                                                                                              | คง MongoDB ObjectId; ไม่สร้างรหัส 12 ตัวต่อข้อความ/notification                 |
| Chat consistency           | Conversation.contextKey, Message.idempotencyKey                                                                                    | คงความหมายของ create-or-open และ dedup เดิม                                     |
| File storage               | ชื่อไฟล์ upload, KYC, attachment, review media, report/dispute evidence                                                            | คง storage key ที่ระบบสร้าง ไม่เอารหัสอ้างอิงมาแทน path หรือกฎตรวจสิทธิ์        |
| Cross-service references   | userId, sellerId, buyerId, productId, orderId, winningBidId, winningOrderId ฯลฯ                                                    | คง internal ID ของ entity ต้นทาง ไม่ generate ใหม่                              |
| Events/retries             | eventId, requestId, correlation ID, idempotency key และ outbox identifiers                                                         | คง contract เดิม; จะเปลี่ยนต้องวิเคราะห์แยก ไม่ใช้รหัสธุรกิจแทนโดยอัตโนมัติ     |

Internal UUID ที่กำลังสร้างด้วย Prisma `uuid()` หรือ `crypto.randomUUID()` ยังใช้ต่อได้ ไม่เปลี่ยนเป็น UUIDv7 ในงานนี้โดยปริยาย ส่วน Conversation แม้มี CHT เพิ่ม ก็ยังเก็บ `_id` และ relation แบบ ObjectId เดิม

## 7. ขั้นตอนสร้างรหัส

1. Backend ของบริการเจ้าของรับคำขอและตรวจสิทธิ์/ข้อมูลตามปกติ Client ไม่ส่งรหัสที่ต้องการให้บันทึกเอง
2. เลือก prefix จากทะเบียนที่ผูกกับ entity ฝั่ง server
3. สุ่ม 12 ตัวด้วย cryptographically secure random generator และเลือกแต่ละตัวอย่างสม่ำเสมอจาก alphabet ที่กำหนด ห้ามใช้ `Math.random()`, timestamp อย่างเดียว หรือวิธีเลือกตัวอักษรที่มี bias
4. จัดกลุ่มและบันทึก canonical value เช่น `ORD-7K3M-9X2R-4T6W` พร้อม entity ใน transaction เดียวกัน
5. Database ต้องมี unique constraint/index ของ `referenceCode` การ query ว่ามีแล้วหรือยังก่อน insert เพียงอย่างเดียวไม่กันคำขอพร้อมกัน
6. ถ้าชนเฉพาะ unique constraint ของ referenceCode ให้สุ่มใหม่ จำกัดไม่เกิน 5 attempts; ต้อง retry transaction ให้ถูกกับ database ไม่ใช้ transaction ที่ล้มแล้วต่อ
7. หากหมด attempts ให้จบคำขอด้วย error ที่เหมาะสมและบันทึก metric/log ห้ามบันทึกค่าซ้ำหรือคืนรหัสที่ยังไม่ได้ persist
8. ข้อผิดพลาดของ unique field อื่น เช่น email หรือ idempotency key ต้องใช้กติกาของ field นั้น ไม่เหมาเป็น reference-code collision
9. เมื่อคำขอเดิม retry ให้ใช้กลไก idempotency เดิมและคืน entity/referenceCode เดิม ห้ามสร้างออเดอร์ใหม่เพียงเพื่อได้รหัสใหม่

ส่วน generator และทะเบียน prefix เสนอให้รวมใน shared package แต่การ persist/unique/retry อยู่ที่บริการเจ้าของ ไม่สร้าง global counter หรือบริการกลางเพียงเพื่อสุ่มรหัส

## 8. การเก็บข้อมูล API การแสดงผล และการค้นหา

- ใช้ field `referenceCode` ที่ immutable และ unique ต่อ entity ที่เปิดใช้งาน ตั้งชื่อเดียวกันใน API แต่ reference ของ entity อื่นควรตั้งชัด เช่น `orderReferenceCode`
- ID ที่เป็น FK, JWT subject, Socket.IO room, cursor และ context key ยังใช้ค่าเดิม
- API เดิมยังรับ internal ID ตามเดิม เพิ่ม referenceCode ใน response แบบ additive; หากต้องเปิด route ด้วยรหัส ให้กำหนด lookup endpoint หรือ route ชัดเจน ไม่เปลี่ยนความหมาย `:id` แบบเงียบ ๆ
- UI แสดง referenceCode และมีปุ่มคัดลอกรหัสเต็ม อย่าตัดให้เหลือเฉพาะ 8 ตัวหรือสุ่มรหัสใน browser
- ช่องค้นหาตัดช่องว่างหัวท้าย แปลงเป็นตัวใหญ่ และรับแบบไม่มีขีด เช่น `ord7k3m9x2r4t6w` แล้ว normalize เป็น canonical format โดยคงขอบเขต permission เดิม
- ไม่แปลง O เป็น 0 หรือ I เป็น 1 อัตโนมัติ เพราะชุดตัวอักษรไม่ได้รองรับค่าเหล่านี้
- สำหรับข้อมูลเก่าที่ backfill ไม่ครบ ให้แสดง internal ID เดิมพร้อม label ชัดเจน ห้ามแต่ง referenceCode จากการ slice/hash โดยไม่มีการบันทึกและบังคับ unique
- Backend หนึ่งไม่อ่าน database ของอีกบริการเพื่อหา referenceCode ให้ขอผ่าน API ของเจ้าของ หรือใช้ event payload ที่ตกลง contract แล้ว
- เก็บ internal ID และ referenceCode คู่กันใน log ที่เกี่ยวข้องเพื่อไล่ปัญหา โดยไม่เก็บ secret token
- รหัสไม่ใช่สิทธิ์เข้าถึง ต้องตรวจเจ้าของ/participant/role/permission ทุกครั้ง การค้นหาต้องไม่เปิดข้อมูลของผู้อื่นเพียงเพราะรู้รหัส

ก่อน implementation `frontend/lib/orders.js` เคยมี `formatOrderId()` ที่ตัด ID มาแสดงเป็น ORD/AUC แบบสั้น โดยไม่มีหลักประกัน uniqueness ปัจจุบันเปลี่ยนให้ใช้ referenceCode ที่ persist จริงแล้ว หากเป็น UUID/ObjectId ที่ยังหารหัสไม่ได้ จะแสดง “รหัสอ้างอิงไม่พร้อมใช้งาน” ตามหัวข้อ 14 ไม่สร้างรหัสจากการตัด ID และไม่แสดง UUID ยาวเป็น fallback ส่วน legacy ID ที่ไม่ใช่ UUID/ObjectId ยังคงรองรับเพื่อความเข้ากันได้

## 9. การนำไปใช้กับข้อมูลเดิม

1. สำรวจทุกจุดสร้าง/ตรวจ/แสดง/ส่งต่อ ID ทั้ง source, Prisma, SQL, scripts, seed, tests, URL, notifications, chat payload และ jobs ไม่ค้นหาเฉพาะคำว่า UUID
2. เพิ่ม field แบบ nullable และ unique index ตามวิธีที่ database รองรับ; MongoDB ที่ field ยังขาดต้องวาง partial unique index/backfill ให้ถูกต้อง ไม่ใช้ unique nullable แบบเหมารวมข้าม database
3. Deploy backend ที่สร้าง referenceCode สำหรับข้อมูลใหม่ และอ่านข้อมูลที่ยังไม่มีรหัสได้
4. Backfill แบบ batch, resumable, ไม่เปลี่ยนค่าเดิม และ retry เมื่อชน โดยไม่แก้ primary key หรือความสัมพันธ์
5. ตรวจทุก entity ที่เปิดใช้ว่ามีรหัสครบ ไม่มีรหัสซ้ำ และไม่มี reference ข้ามบริการเสีย
6. บังคับ required/non-null หลังตรวจพร้อม สำหรับ MongoDB ให้ตรวจ field/index และ client generation ตาม connector ที่ใช้จริง
7. เปลี่ยน UI, exports, search, notifications และ consumer ที่เกี่ยวข้องให้แสดงรหัสใหม่ โดยลิงก์เดิมยังเปิดได้
8. Rollback ด้วยการกลับไปใช้ UI/backend ที่รองรับ field เพิ่มเติมได้ คงรหัสที่สร้างแล้ว ไม่ลบคอลัมน์หรือสุ่มใหม่เพื่อ rollback

ต้องแยก backfill ออกจากการส่ง business event ห้ามทำให้เกิดการจ่ายเงิน ส่ง notification หรือเปลี่ยนสถานะประมูลซ้ำเพียงเพราะเพิ่มรหัสอ้างอิง

## 10. สิ่งที่ต้องตรวจรับเมื่อพัฒนา

- รูปแบบ prefix/alphabet/ความยาวถูกต้อง และไม่มีอักขระต้องห้าม
- บังคับสร้างและตรวจข้อมูลจาก backend; client แก้ referenceCode เองไม่ได้
- บังคับ collision ใน test แล้ว retry ได้จริง รวมกรณี concurrent insert และ retry หมด attempts
- Retry ไม่ซ่อน error ของ unique field อื่น และไม่ทำให้ transaction หรือ business action ซ้ำ
- Idempotent request และข้อมูลที่ backfill แล้วได้รหัสเดิมเสมอ
- ค้นหาตัวเล็ก/ไม่มีขีดได้ และปฏิเสธรูปแบบผิดอย่างชัดเจน
- ผู้ใช้ที่ไม่มีสิทธิ์ยังอ่านข้อมูลไม่ได้เมื่อใช้รหัสจริงของผู้อื่น
- UUID/ObjectId/FK/cursor/contextKey/event replay และลิงก์เก่ายังใช้ได้
- ออเดอร์ประมูลแสดง ORD กับ AUC ของคนละ entity ถูกต้อง รวมหลังเปลี่ยนผู้ได้รับสิทธิ์
- UI, exports และ notification แสดงรหัส persisted เดียวกัน ข้อมูลที่ไม่มีรหัสใช้ fallback ที่ตกลงไว้
- ตรวจ migration/backfill กับ PostgreSQL และ MongoDB จริงตามขอบเขตที่แก้ ไม่สรุปจาก unit test อย่างเดียว

## 11. สรุปข้อตกลงที่คุยและข้อเสนอที่ต้องใช้ให้ตรงกัน

- ขอบเขตเป็น RE-LOOP ทั้งระบบ ไม่ใช่เฉพาะ T&S
- ต้องการรหัสอ่านง่าย มี prefix และส่วนสุ่ม 12 ตัว แบ่งกลุ่มละ 4
- 12 ตัวเหมาะสำหรับรหัสอ้างอิงธุรกิจ โดยต้องมี unique + retry และไม่ใช้แทน security token
- ตัวเลข 1.15 ล้านล้านล้านค่าและ 0.000043% ที่คุยกันใช้สมมติฐาน alphabet 32 แบบ
- เอกสารเสนอ alphabet 32 แบบที่ไม่มีสัญลักษณ์ โดยตัด 0/O/1/I แต่คง L ไว้ หากต้องการตัด L เพิ่มต้องปรับการคำนวณและตัวตรวจให้ตรงกับ alphabet 31 แบบ
- แนวทาง internal ID เดิม + referenceCode, ทะเบียน prefix และ alphabet 32 แบบ ถูกนำไปพัฒนาตามหัวข้อ 13 โดยไม่แทน primary key เดิม
- หากเลือกแทน UUID เดิมจริง ต้องจัดทำแผน migration ทั้งระบบต่างหากก่อนเปลี่ยนข้อมูล โดยเฉพาะ soft reference ข้ามบริการและประวัติที่ persist แล้ว

## 12. แหล่งอ้างอิง

- [RFC 9562: UUID](https://www.rfc-editor.org/rfc/rfc9562.html) — มาตรฐาน UUID และความแตกต่างจากรหัสกำหนดเอง
- [Nano ID documentation](https://github.com/ai/nanoid) — secure random generation, custom alphabet/size และผลต่อ collision; ไม่ได้กำหนดว่าต้องติดตั้ง library นี้ในงานเอกสาร
- Source ที่ใช้สำรวจ: `backend/services/*/prisma/schema.prisma`, `backend/shared/src`, จุดเรียก `crypto.randomUUID()` และ `frontend/lib/orders.js` ที่ฐานโค้ดข้างต้น

## 13. Implementation หลังอนุมัติ

### โครงสร้างที่เพิ่มจริง

- ทะเบียน 25 ประเภทและ helper กลางอยู่ใน `backend/shared/src/referenceCodes.js`; ไม่ติดตั้ง library สุ่ม ID เพิ่ม ใช้ `crypto.randomInt(32)` สำหรับ JavaScript
- PostgreSQL ทั้ง 4 บริการมี forward migration `20261024150000_add_reference_codes` เพิ่ม field `referenceCode` ซึ่ง map เป็น `reference_code` พร้อม unique index และข้อกำหนดตรวจ prefix/รูปแบบ
- แต่ละ PostgreSQL database มีตาราง `_reference_codes` ของตัวเอง ทำหน้าที่จองรหัส ไม่ใช่บริการกลางและไม่ใช่ primary key ใหม่ของ entity
- Trigger สร้างรหัสตอน insert โดยไม่เชื่อรหัสที่ caller ส่งมา และปฏิเสธการเปลี่ยน/ลบรหัสของข้อมูลที่มีรหัสแล้ว
- PostgreSQL ใช้ `gen_random_uuid()` เป็นแหล่งข้อมูลสุ่ม เลือก 12 bytes ที่ไม่มี version/variant bits แล้วแปลงด้วย modulo 32 ซึ่งไม่เกิด bias ได้ข้อมูลสุ่ม 60 บิตเช่นเดียวกับ JavaScript
- การจองใช้ `INSERT ... ON CONFLICT DO NOTHING` พร้อม retry สูงสุด 5 ครั้งใน transaction เดียวกับ entity ถ้า transaction rollback การจองก็ rollback ถ้าลบ entity ภายหลังจะไม่คืนรหัสเก่ามาใช้ซ้ำ
- MongoDB เพิ่ม field ให้ Conversation คง ObjectId เดิม สร้าง CHT ผ่าน model กลางและ seed ที่สร้างห้อง มี partial unique index เฉพาะ field ที่เป็น string เพื่อให้ใช้กับข้อมูลเดิมที่ไม่มี field/เป็น null ได้
- Chat retry เฉพาะ P2002 ของ reference code ไม่กลืนข้อผิดพลาด contextKey หรือ idempotency key จึงคง create-or-open และการส่งซ้ำตามกลไกเดิม

### API และหน้าจอ

- API ที่ส่ง entity เต็มจะมี referenceCode เพิ่ม; DTO ของ user และ executive ticket/dispute/report ถูกเพิ่ม field อย่างชัดเจน
- API paths ของบริการเจ้าของรองรับรหัสมาตรฐาน ตัวพิมพ์เล็ก และแบบไม่มีขีด โดย resolve กลับเป็น internal ID แล้วเข้าตัวตรวจสิทธิ์เดิม ไม่มีการแทน JWT subject, FK, request body, Socket.IO room หรือ cursor อัตโนมัติ
- ค้นหาด้วยรหัสได้ใน catalog, seller inventory/orders, support order lookup, ticket queue, dispute queue, reports, auction items และ auction rounds ตามช่องค้นหาที่มีอยู่ ไม่ได้เพิ่ม global search ที่รวมข้อมูลทุก role
- ตัวแสดงรหัสและปุ่มคัดลอกใช้ค่าที่ persist จริง; `formatOrderId()` รับ entity ได้และเลิกสร้าง ORD/AUC ปลอมจาก UUID ที่ตัดสั้น
- หน้าที่ต่อรหัสแล้วรวม profile, product detail, auction detail/rounds, seller product/video/order lists, checkout/payment, chat room, support tickets/workspace, KYC, campaigns และ executive complaints
- รหัสประจำ entity กับรหัสสำหรับใช้งานธุรกิจอื่นยังแยกกัน เช่น CMP ไม่แทน campaign.code, VCH ไม่แทน coupon redemption code และ SHP ไม่แทน trackingNumber
- ชื่อผู้ซื้อ/ผู้ประมูลที่ปกปิดตัวตนตามกติกาเดิมยังปกปิดเหมือนเดิม ไม่เปิดเผย USR เต็มเพื่อแทน masked label โดยอัตโนมัติ
- Notification ของออเดอร์และ ticket ที่สร้างใหม่ใช้รหัสอ้างอิงในข้อความและ metadata แต่ link/entityId ยังอ้าง ID เดิม ข้อความประวัติที่เป็น free text จะไม่ถูกเขียนทับย้อนหลังเพื่อเปลี่ยน UUID ในเนื้อหา
- CSV Executive ปัจจุบันเป็นยอดรวมตามช่วงเวลาและไม่มี entity ID ให้แทน จึงไม่เพิ่มคอลัมน์รหัสลงในรายงานยอดรวมโดยไม่มีความหมาย

### Deploy และ backfill

รันจาก root ของ repository โดยใช้ URL จาก environment/.env ของ target ที่ตั้งใจเท่านั้น:

```powershell
node scripts/ensurePrismaClients.js
node scripts/deploy-reference-codes.cjs --apply
node scripts/reference-codes.cjs --apply
docker compose up -d --build --no-deps gateway auth-service product-service order-service support-service chat-service
node scripts/reference-codes.cjs
```

- คำสั่ง migrate ทำ forward migration ที่ค้างอยู่ตามประวัติจริง ไม่มี reset/baseline อัตโนมัติ จึงต้องตรวจ pending migrations ของ target ก่อนใช้กับ environment อื่น
- `reference-codes.cjs` ถ้าไม่ใส่ `--apply` จะอ่านจำนวนที่ยังไม่มีรหัสอย่างเดียว เลือกบริการได้ด้วย `--service=auth|product|order|support|chat` หรือ `all`
- `--apply` เติมเฉพาะข้อมูลที่ยังไม่มีรหัส แบบ batch ทำซ้ำได้และไม่เปลี่ยนรหัสที่มีแล้ว; ฝั่ง Chat เพิ่ม partial unique index ก่อน backfill
- Backfill ไม่เรียก business services จึงไม่สร้างการชำระเงิน การเปลี่ยนสถานะ หรือ notification ซ้ำ แต่ MongoDB `updatedAt` ของ Conversation อาจเปลี่ยนตามการอัปเดต metadata; ไม่เปลี่ยนเวลา/เนื้อหาข้อความหรือ lastMessageAt
- Field ใน Prisma ยัง nullable เพื่อรองรับช่วง deploy/backfill และการอ่านข้อมูลเก่าจาก environment ที่ rollout ไม่พร้อมกัน PostgreSQL trigger บังคับให้ข้อมูลใหม่ได้รหัสและห้ามลบรหัสที่มีแล้ว; การแปลงเป็น NOT NULL ทุก environment เป็น rollout ขั้นแยก ไม่ใช้ schema reset บังคับ
- ห้ามรัน `prepare-reference-code-migrations.cjs` ซ้ำเพื่อ deploy เพราะเป็นเครื่องมือสร้างไฟล์ครั้งแรกและมี guard ปฏิเสธ schema/ไฟล์ที่มีอยู่แล้ว ให้ใช้ไฟล์ migration ที่ commit ไปพร้อม source
- ไม่ import entity โดยหวังให้ caller กำหนด referenceCode เองใน PostgreSQL การย้ายระบบที่ต้องรักษารหัสเดิมควรใช้ backup/restore ที่คงตารางและ trigger ตามขั้นตอนที่ตรวจแล้ว

### การตรวจและการรับช่วง

```powershell
node --test backend/shared/src/referenceCodes.test.js backend/shared/src/referenceDisplay.test.js
node scripts/run-reference-regression.cjs
npm --workspace frontend run test -- --runInBand --coverage=false
npm --workspace frontend run build
node scripts/verify-reference-runtime.cjs
```

`run-reference-regression.cjs` ใช้ฐาน PostgreSQL `reloop_ci_reference_*`, Mongo database ใหม่ที่มี suffix เวลา และ Redis DB 15 ไม่ reset ฐานใช้งาน; บันทึกผลใต้ `coverage/reference-codes/` เลือกกลุ่มได้ด้วย `--groups=order-service,support-service,chat-service` บาง integration tests เดิมต้องมี HTTP services/บัญชี demo หรือชื่อฐานเฉพาะเพิ่มเติม จึงต้องแยกผลจาก unit/database tests ที่พร้อมใน runner นี้

`verify-reference-runtime.cjs` ตรวจข้อมูลและ API ของระบบในเครื่องเท่านั้น ใช้บัญชี demo ที่มีอยู่และ logout session ที่ตนสร้าง ไม่สร้างออเดอร์หรือส่งอีเมล ยืนยัน ID เดิมตรงกับรหัสใหม่และตรวจ negative access ของ order/chat ผลการตรวจที่ทำจริงแยกอยู่ใน [uuid-reference-id-validation.md](uuid-reference-id-validation.md)


## 14. การแสดงผลให้เหมือนกันทุก role (อัปเดต 25 ตุลาคม 2026)

- Buyer/Seller, Customer Service, Trust and Safety, Admin, Marketing และ Executive ใช้รหัสที่บันทึกจากเจ้าของข้อมูลชุดเดียวกัน ทั้งหน้ารายการ รายละเอียด คู่กรณี ผู้รับผิดชอบ ประวัติ และปุ่มคัดลอก
- บริการทั้งห้าเพิ่มรหัสเฉพาะ ID ที่มีอยู่แล้วใน JSON response ที่ผ่านการยืนยันตัวตนและสิทธิ์สำเร็จ ไม่เพิ่มข้อมูลจาก request ที่ถูกปฏิเสธ และไม่ใช้ UUID ที่ผู้ใช้พิมพ์ในข้อความเป็นคำสั่งค้นหาข้อมูล
- แต่ละบริการมี POST /internal/reference-codes สำหรับค้นหาเป็นชุด ต้องมี internal service token รับได้ไม่เกิน 200 identifiers และคืนเพียงคู่ internal ID กับ referenceCode ไม่มีชื่อ อีเมล หรือข้อมูลส่วนตัวอื่น
- เพิ่ม referenceCode ให้ entity ที่ถูก select มาเพียงบาง field และเพิ่ม companion เช่น requesterReferenceCode, reporterReferenceCode, targetReferenceCode, orderReferenceCode, assignedToReferenceCode รวมถึง displayReferences สำหรับการแสดงข้อความเดิม ข้อมูล id/foreign key/ข้อความที่บันทึกไว้ไม่ถูกแทนค่า
- การค้นหาข้ามบริการมี timeout 1.5 วินาทีต่อชุด หากบริการใดไม่พร้อมยังเปิดงานได้ รหัสมี cache จำกัด 5,000 รายการต่อบริการ (พบ 5 นาที / ไม่พบ 10 วินาที) การค้นหาใน browser ใช้ cache ในหน่วยความจำจำกัด 10,000 รายการ ไม่บันทึกลง localStorage
- API client จดจำ mapping ก่อนส่งข้อมูลไป render จึงใช้รหัสเดิมได้แม้หน้าจอสร้าง DTO ใหม่ ตัวจัดรูปแบบแสดงรหัสเต็ม ไม่ตัดบางส่วนหรือสร้างรหัสจาก hash ปุ่มคัดลอกใช้ค่าที่แสดงจริง
- UUID/ObjectId ที่ยังหารหัสไม่ได้แสดงข้อความ “รหัสอ้างอิงไม่พร้อมใช้งาน” และปิดการคัดลอกในตัวแสดงรหัสร่วม ไม่ย้อนกลับไปแสดง UUID ยาว ความพร้อมของรหัสไม่ใช่เงื่อนไขอนุมัติสิทธิ์หรือทำรายการ
- ตัวกรอง identifier เช่น actorId, targetId, orderId, buyerId, sellerId และ actorSearch รองรับรหัสเต็ม ตัวพิมพ์เล็ก และแบบไม่มีขีด โดย resolve เป็น ID เดิมก่อนเข้าตัวตรวจสิทธิ์และตัวกรองเดิม ส่วนข้อความค้นหาทั่วไป cursor และ request body ไม่ถูกแปลงอัตโนมัติ
- ค้นหาเจ้าหน้าที่และผู้ใช้งานภายในด้วย USR ได้เพิ่มเติม ชื่อที่ใช้ปกปิดผู้ซื้อหรือผู้ประมูลสาธารณะยังคงนโยบายเดิม ไม่เปิดเผย USR เพื่อแทนชื่อปกปิด
- หน้า Report แสดง USR ของผู้รายงาน คู่กรณี และผู้ตัดสิน รวมถึง REV ของรีวิวที่ฝังใน reason เก่า เฉพาะตอนแสดงผล ปุ่มเปิดประวัติและคำสั่งจัดการยังใช้ ID ภายในเดิม ข้อความ audit ต้นฉบับไม่ถูกเขียนทับ
- รายละเอียดรายงานรีวิวแยกเป็นรหัสรีวิวที่คัดลอกได้ เหตุผลที่รายงาน และข้อความรีวิว ณ วันที่รายงาน โดยคงการขึ้นบรรทัดใหม่ ข้อความต้นฉบับรวมอยู่ในส่วนพับ “ดูรายละเอียดต้นฉบับ” ไม่แก้ reason ในฐานข้อมูล และไม่ใช้ข้อความรีวิวปัจจุบันมาแทนหลักฐานเดิม
- แสดงข้อมูลรีวิวที่ส่วนรายละเอียดด้านบนจุดเดียว ยกเลิกกล่อง “รีวิวที่ถูกรายงาน” ด้านล่างที่แสดงซ้ำ โดยยังใช้ reviewDetail ตรวจสถานะสำหรับคำสั่งลบรีวิวตามเดิม
- หลักฐานที่ไม่มีรหัสธุรกิจใช้ชื่อไฟล์หรือคำว่า “หลักฐานแนบ” สำหรับ request ID/operation ID ที่เป็นข้อมูลวิเคราะห์ปัญหาทางเทคนิค ยังคงค่าเดิมตามข้อยกเว้นในหัวข้อ 6 ไม่สร้าง referenceCode ใหม่ให้ security/session/event identifiers

- Bulk account actions รับ USR แบบเต็ม/ตัวพิมพ์เล็ก/ไม่มีขีด โดย resolve เฉพาะรายการบัญชีในบริการ Auth หลังตรวจสิทธิ์และจำนวนสูงสุดแล้ว ก่อน preview/execute ใช้ internal ID เดิมสำหรับ self-action checks และ idempotency; การ resolve นี้ไม่ใช่การแปลง request body ของ endpoint อื่น
