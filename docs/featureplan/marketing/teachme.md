# Marketing Feature Teach Me

## Round 0 — Campaign ต้องวัดผลย้อนกลับได้

การแสดงโค้ดส่วนลดใน UI ไม่พิสูจน์ Conversion Campaign contract ต้องมี campaign ID ที่ติดกับ
การใช้โปรโมชันและไหลไปยัง Order event โดยไม่ให้ Marketing แก้ Order database โดยตรง

```text
Campaign publish → Buyer sees offer → Order records attribution
→ order.completed.v1 → Marketing aggregate
```

**Teach-back:** เพราะเหตุใด Conversion ต้องอิง completed order ไม่ใช่จำนวนคลิกอย่างเดียว?

## Round 1 — Requirement owner ไม่จำเป็นต้องเป็น database owner

`UR-11` อยู่ใน Marketing scope แต่ source ของ feed อยู่ใน Seller/Product และหน้าที่ผู้ใช้
อยู่ใน Buyer UI ได้ Marketing ยังต้องกำหนด/ตรวจ acceptance semantics ร่วมกับ provider และ
consumer โดยไม่ย้าย Product database มาเป็นของ Marketing

**Teach-back:** ถ้า feed เปิดดูได้แต่ไม่มี choose event Marketing ควรรายงานเป็น Done หรือ baseline และเพราะอะไร?

## Round 2 — Correctness ของ feed ไม่ได้ปิด Requirement semantics

Refactor แก้ feed ให้แสดงเฉพาะ Product `available` และแก้ชื่อผู้ขายให้เชื่อถือได้แล้ว แต่สิ่งนี้
ยังตอบไม่ได้ว่า “choose” ต้องสร้าง state/event ใด Marketing จึงยังต้อง freeze semantics ก่อน
ยก `UR-11` เป็น Done

## Round 3 — A DB function returning `void` breaks `$queryRaw`, not `$executeRaw`

Serializing concurrent bids with `pg_advisory_xact_lock` seemed like the obvious Postgres-native
fix for "two buyers bid the exact same amount at the exact same time" — but calling it through
Prisma's `$queryRaw` failed every time with a deserialization error, because Prisma tries to read
a result row back and `pg_advisory_xact_lock` returns `void`. The fix was mechanical
(`$executeRaw` instead, since we don't need a return value) but it only surfaced by actually
placing two real bids against a running Postgres instance — the mocked unit tests never call the
real database, so they could not have caught it. Manual verification against the real stack
found this in minutes; skipping it would have shipped a 500 on every single bid.

**Teach-back:** ทำไมเทสที่ mock repository ทั้งหมดถึงจับบั๊กนี้ไม่ได้ และควรตรวจอะไรเพิ่มก่อนเชื่อว่า
"ผ่านเทสแล้ว" เท่ากับ "ใช้งานได้จริง"?

## Round 4 — Requirement owner ≠ pricing owner

Marketing เดิมถูกเสนอให้ตั้งราคาเริ่มต้น/เรทการบิดของ auction ด้วย แต่ Product owner ทักว่า Seller
ควรเป็นคนตั้งราคาสินค้าของตัวเองเหมือนตอนลงขายปกติ — ปรับ scope ให้ Marketing คุมแค่ตาราง
เวลา (schedule/cancel) ส่วน Seller ตั้ง `startingPrice`/`bidIncrement` ตอน submit สิ่งนี้สอดคล้อง
กับหลักการเดิมของ Feature นี้ที่ว่า **requirement owner ไม่จำเป็นต้อง own ทุกฟิลด์** (เหมือน Round 1
ที่ `UR-11` ก็ไม่ใช่ Marketing owns ทุกอย่าง) — ดู `MKT-005` ใน `plan.md` และ `decision.md`

## Round 5 — สินค้าประมูลต้องไม่ใช้สถานะ 'available' ปะปนกับสินค้าหน้าร้านทั่วไป

เมื่อสร้างสินค้าเข้าสู่กระบวนการประมูล หากยังคงใช้ `status: "available"` ตัวสินค้าจะหลุดเข้าไปอยู่ใน Catalog ปกติ (ทั้งฟีดหน้าแรก `/feed`, ผลการค้นหา `/search` และหน้าร้านค้าของผู้ขาย `/store/:id`) ทำให้ลูกค้าเข้าใจผิดและสามารถกดสั่งซื้อผ่านระบบตะกร้าทั่วไปได้

การแก้ปัญหาเชิงสถาปัตยกรรมคือแยกสถานะสินค้าประมูลเป็น `status: "auction"` ตั้งแต่ตอนสร้าง และบริหาร State Machine ร่วมกับ Auction Lifecycle (เปลี่ยนกลับเป็น `available` เมื่อปฏิเสธหรือยกเลิก หรือปิดโดยไม่มีผู้บิด) ซึ่งทำให้อัลกอริทึมฝั่ง Catalog ที่กรอง `status = "available"` สามารถคัดแยกสินค้าประมูลออกจากสินค้าทั่วไปได้โดยอัตโนมัติ ไม่ต้องแก้ Schema หลายตาราง

**Teach-back:** ทำไมการกำหนดสถานะของ Entity ให้ตรงกับวงจรชีวิตจริง (Domain State) จึงปลอดภัยและลด Side Effect มากกว่าการพึ่งพา Frontend ซ่อนการแสดงผล?

## Round 6 — Auction Rounds: Time-bounded Intake & Marketing Approval Ownership

การเปิดให้ Seller ลงสินค้าประมูลอย่างอิสระโดยไม่มี "รอบ" ทำให้เกิดความกระจัดกระจายและไม่สามารถจัดแคมเปญกระตุ้นยอดขาย (FOMO / Event-based Engagement) ได้อย่างมีประสิทธิภาพ

การแก้ปัญหาเชิงสถาปัตยกรรม:
1. **Time-bounded Intake (Submission Window):** รวมการเปิดรับสินค้าเข้าเป็นอีเวนต์เดียว โดย Marketing ระบุทั้งช่วงเปิดรับสินค้า และช่วงเวลาประมูลจริงไว้ใน `AuctionRound`
2. **Double Gating (Backend + Frontend):** ฝั่ง UI แสดง Countdown/Deadline และล็อกฟอร์มเมื่อหมดเวลา ส่วนฝั่ง API ตรวจสอบเวลาจริง (`now`) หากอยู่นอกช่วงเวลา จะปฏิเสธคำขอทันทีเพื่อป้องกันการยิงข้าม Interface
3. **Decoupling from Admin:** โอนความรับผิดชอบในการตรวจรับสินค้าเข้าประมูลให้ Marketing ซึ่งเป็น Requirement Owner เพื่อลด Bottleneck และทำให้กระบวนการ Approve → Scheduled เกิดขึ้นได้ในคลิกเดียวโดยใช้เวลาที่ตั้งไว้ล่วงหน้าจากรอบประมูล

**Teach-back:** การใช้ Event-driven / Round-based Architecture ดีกว่าการให้อิสระในการสร้างรายการแบบไร้ข้อจำกัดเวลาอย่างไรในเชิงธุรกิจและการจัดการทรัพยากรระบบ?

## Round 7 — Anti-Sniping & Soft Close Mechanism

ในระบบประมูลแบบดั้งเดิมที่มีกำหนดเวลาสิ้นสุดแบบตายตัว (Hard Cutoff) มักจะเกิดปัญหา "Auction Sniping" ซึ่งผู้ใช้อาจใช้บอตหรือแอบเคาะราคาในเสี้ยววินาทีสุดท้าย ทำให้ผู้ร่วมประมูลรายอื่นไม่สามารถตอบสนองได้ทัน ซึ่งส่งผลเสียต่อความเป็นธรรมและทำให้ผู้ขายเสียโอกาสได้ราคาสูงสุด

การแก้ปัญหาเชิงสถาปัตยกรรม:
1. **Dynamic Soft Close:** เมื่อมีการเคาะราคาในช่วง 5 นาทีสุดท้าย ระบบจะคำนวณและเลื่อน `scheduledEndAt` เพิ่มขึ้น 5 นาทีโดยอัตโนมัติ
2. **Job Queue Synchronization:** เมื่อเวลาสิ้นสุดถูกเลื่อน ระบบต้อง reschedule งานปิดประมูลใน BullMQ ด้วยเวลาใหม่ทันที เพื่อให้งานเบื้องหลังปิดประมูลตรงกับเวลาจริง
3. **Idempotency Safeguard:** ตรวจสอบให้แน่ใจว่าการส่งคำขอเคาะราคาซ้ำ (Retry request ด้วย idempotencyKey เดิม) จะไม่ทำให้เวลาถูกเลื่อนซ้ำซ้อน

## Round 8 — Seed Script Resilience: Upsert by Unique Fields vs Fixed Primary Keys

เมื่อระบบไมโครเซอร์วิสมี Seed script ที่รันอัตโนมัติตอน Container Startup หากเขียน `upsert` โดยอิงตาม Primary Key (`id`) เพียงอย่างเดียว แต่โมเดลในฐานข้อมูลมีฟิลด์อื่นที่เป็น Unique (`email`) อาจเกิดปัญหา **Unique Constraint Collision (`P2002`)**:

```text
Database มีอยู่แล้ว:  id = "e8d2-random", email = "marketing@example.com"
Seed พยายาม upsert:  where: { id: "40000000-0001" }
ผลลัพธ์:             Prisma ไม่เจอ id "40000000-0001" -> จึงสั่ง INSERT
                    -> ชน Unique constraint บน email! -> Container พังทันที
```

การแก้ปัญหาเชิงสถาปัตยกรรม:
1. **Dual-check Upsert Pattern:** ตรวจสอบจาก Unique Identifier เชิงธุรกิจ (`email`) ก่อนเสมอ หากมีอยู่แล้วให้ทำ `update` รหัสผ่าน, บทบาท และข้อมูลโปรไฟล์
2. **Fallback to PK:** หากไม่พบค่อยตรวจตาม `id` และสร้างใหม่หากไม่พบทั้งคู่
3. **Multi-role Alignment:** อัปเดตตารางเชื่อมโยงสิทธิ์ (`user_roles`) ให้สอดคล้องกับ `role` เสมอ เพื่อให้ Token Claims และ Permission Gating ทำงานได้อย่างถูกต้อง

**Teach-back:** ทำไมการ `upsert` ข้อมูลตั้งต้น (Seed Data) ในฐานข้อมูลที่มีทั้ง Surrogate Key (UUID) และ Natural/Unique Key (Email) จึงไม่ควรยึดติดกับ Surrogate Key เพียงอย่างเดียว?

## Round 9 — Media URL Resolution in Microservices & Static Assets (`mediaUrl` helper)

ในระบบสถาปัตยกรรม Microservices ที่แยกส่วนระหว่าง Frontend Web App (Next.js บนพอร์ต 3000) และ API Gateway / Storage Backend (พอร์ต 8080):
- ไฟล์มีเดียที่ถูกอัปโหลด (รูปภาพ/วิดีโอ) จะถูกจัดเก็บบน File Storage / Disk และบันทึกลงใน Database (PostgreSQL) เป็น Relative Path เสมอ เช่น `"/uploads/b08d8e8e-1c5a.jpg"` เพื่อให้ย้าย Domain หรือ Storage Provider ได้ง่ายโดยไม่ต้อง Migration ข้อมูลใน DB
- เมื่อเขียนโค้ดแสดงผลในหน้าเว็บ หากนำค่าจาก Database ไปใส่ในแท็ก `<img src={coverImage} />` โดยตรง เบราว์เซอร์จะ Resolve เข้ากับ Origin ของหน้าเว็บเอง กลายเป็น `http://localhost:3000/uploads/...` ซึ่งเซิร์ฟเวอร์ Next.js ไม่มีโฟลเดอร์นี้ ทำให้เกิด HTTP 404 (ภาพไม่ขึ้น)
- ในขณะที่ข้อมูล Seed ตัวอย่างมักใช้ Full External URL เช่น `https://images.unsplash.com/...` ซึ่งมี Domain ในตัว จึงแสดงผลได้ปกติ ทำให้การทดสอบด้วยข้อมูล Seed เพียงอย่างเดียวอาจตรวจไม่พบบั๊กนี้

การแก้ปัญหาเชิงสถาปัตยกรรม:
1. **Universal Media URL Helper (`mediaUrl`):** ใช้ฟังก์ชันตัวแปลงกลางที่ตรวจจับรูปแบบ URL:
   - หากขึ้นต้นด้วย `http://` หรือ `https://` $\rightarrow$ ส่งคืน URL เดิมทันที
   - หากขึ้นต้นด้วย `/uploads/...` $\rightarrow$ เติม Prefix `NEXT_PUBLIC_API_URL` (`http://localhost:8080`) ให้โดยอัตโนมัติ
2. **Apply Uniformly:** นำ `mediaUrl()` ไปครอบให้กับรูปภาพทุกจุด (รูป Thumbnail ในตาราง, รูป Preview ในฟอร์มอัปโหลด, รูปการ์ดบนหน้ารวมบทความ, รูปภาพหน้าปกขนาดใหญ่ และรูปภาพที่แทรกใน Markdown)

**Teach-back:** ทำไมจึงไม่ควรเก็บ Full URL ที่มีโดเมน (`http://localhost:8080/uploads/...`) ลงในฐานข้อมูลตรงๆ ตั้งแต่ตอนอัปโหลดภาพ?

## Round 10 — Distributed Race Conditions & Idempotency in Multi-trigger Lifecycle Transitions

ในระบบไมโครเซอร์วิส การเปลี่ยนสถานะของ Lifecycle ที่สำคัญ (เช่น การปิดประมูลและสร้าง Order ให้ผู้ชนะ) มักจะมี Trigger มากกว่าหนึ่งทางเพื่อความแน่นอน:
1. **Active Trigger:** Job Queue เบื้องหลัง เช่น BullMQ Worker ที่ตั้งเวลาไว้ตรงกับเวลาปิด
2. **Passive / Lazy Trigger:** การตรวจสอบเงื่อนไขเวลาเมื่อมีผู้ใช้เปิดเข้ามาดูหน้าเว็บ (`maybeAdvance`) เผื่อกรณีที่ Redis หรือ Worker ล่ม

เมื่อเวลาสิ้นสุดมาถึง ทั้งสองกลไกสามารถถูกเรียกขึ้นมาพร้อมกันในระดับมิลลิวินาที:
- หาก Service ต้นทาง (`product-service`) ยิง HTTP Request ข้าม Service ไปยัง Service ปลายทาง (`order-service`) **ก่อน** ที่จะอัปเดตสถานะในฐานข้อมูลของตนเองเป็น `closed` ทั้งสองฝั่งจะเห็นว่าการประมูลยังเปิดอยู่ (`open`) และยิงคำสั่งสร้าง Order ไปพร้อมกัน
- หาก Service ปลายทาง (`order-service`) ออกแบบเป็นแบบ Non-idempotent (สั่ง Create ทื่อๆ โดยไม่ตรวจและไม่มี Unique Constraint) ผลลัพธ์คือจะเกิด Order ซ้ำซ้อน 2 รายการสำหรับผู้ใช้คนเดียวกันทันที

การแก้ปัญหาเชิงสถาปัตยกรรม (Defense in Depth):
1. **Downstream Idempotency:** ฝั่งผู้รับคำขอ (`order-service`) ต้องทำให้ฟังก์ชันเป็น Idempotent เสมอ — ตรวจสอบ `findByAuctionId` ก่อนสร้าง หากมีอยู่แล้วให้คืนค่า Order เดิมทันที
2. **Database-level Constraint:** เพิ่ม `@unique` ให้กับ `auctionId` บนตาราง `orders` ใน PostgreSQL เพื่อเป็นแนวป้องกันด่านสุดท้าย หากคำขอหลุดเข้ามาพร้อมกันในมิลลิวินาทีเดียวกัน ฐานข้อมูลจะสกัดคำขอที่สองด้วย Unique Violation (`P2002`) ทันที
3. **Upstream Concurrency Guard:** ฝั่งผู้ส่งคำขอ (`product-service`) ดึงสถานะล่าสุด (`findById`) มาเช็กซ้ำก่อนเริ่มปิดประมูล เพื่อลด Network Call ที่ไม่จำเป็น

**Teach-back:** ทำไมการป้องกัน Race Condition จึงต้องทำทั้งฝั่งต้นทาง (Caller) และฝั่งปลายทาง (Receiver พร้อม Unique Constraint ใน Database) แทนที่จะเลือกทำเพียงฝั่งใดฝั่งหนึ่ง?

## Round 11 — Voucher Wallet State Machine, Claim Uniqueness & Smart Eligibility Filtering

ในการพัฒนาระบบคูปองส่วนลดและแคมเปญการตลาด (`MKT-001` / `UR-15` / `UR-16` / `WF-11`):
1. **วงจรชีวิตสถานะ (State Machine Guard):** แคมเปญโปรโมชันมีความเสี่ยงสูงต่อผลประโยชน์ทางการเงินของแพลตฟอร์ม จึงไม่อนุญาตให้เปลี่ยนสถานะแบบกระโดดข้ามขั้น เช่น จาก `draft` ข้ามไป `published` ทันทีไม่ได้ ต้องผ่าน `pending_approval` -> `approved` -> `published` เสมอ และห้ามแก้ไขข้อมูลแคมเปญเมื่อหลุดจากสถานะ `draft` แล้ว
2. **การป้องกันการเก็บคูปองซ้ำ (Claim Uniqueness):** ระบบกระเป๋าคูปองต้องป้องกันผู้ซื้อกดเคลมคูปองใบเดิมซ้ำๆ เพื่อกักตุนสิทธิ์ การตรวจสอบด้วยการคิวรีแบบ `findVoucher` ในโค้ดเพียงอย่างเดียวไม่เพียงพอต่อกรณีการกดคลิกเบิ้ล (Double-click) หรือส่งคำขอแบบ Concurrent
   - **โซลูชัน:** กำหนด `@@unique([userId, campaignId])` ในระดับ PostgreSQL เมื่อคำขอชนกัน ฐานข้อมูลจะส่งคืน `P2002` และ Service จะแปลงเป็น HTTP 409 Conflict อย่างปลอดภัย
3. **ระบบคัดกรองคูปองอัจฉริยะ (Smart Eligibility Filtering):** ผู้ซื้อไม่ควรต้องมานั่งคำนวณหรือเดาเองว่าคูปองใบไหนใช้ได้กับสินค้าชิ้นไหน
   - Backend ให้บริการ Endpoint `POST /applicable` รับ `{ price, category }` แล้วนำคูปองในกระเป๋าของลูกค้ารายนั้นมาคำนวณ:
     - กรองสถานะแคมเปญต้องเป็น `published` และอยู่ในช่วงเวลาที่กำหนด
     - ตรวจสอบยอดซื้อขั้นต่ำ (`orderPrice >= minOrderPrice`)
     - ตรวจสอบหมวดหมู่สินค้า (`applicableCategory`)
     - คำนวณส่วนลดโดยประมาณ (`estimatedDiscount`) ทั้งแบบเปอร์เซ็นต์ (พร้อมคิดเพดาน `maxDiscount`) และแบบมูลค่าคงที่
     - จัดเรียงผลลัพธ์โดยเอาคูปองที่ช่วยให้ลูกค้าประหยัดเงินได้มากที่สุดขึ้นเป็นอันดับแรก (Best Savings First)

**Teach-back:** ทำไมการคำนวณ Smart Compatibility Filter และส่วนลดควรทำที่ Backend แทนที่จะส่งคูปองทั้งหมดไปให้ Frontend คำนวณในเบราว์เซอร์ของผู้ใช้?

## Round 11 — Server-Side Source of Truth & Anti-Price-Tampering

ในระบบอีคอมเมิร์ซแบบกระจาย (Distributed e-Commerce) การคำนวณราคาส่วนลดและราคาสุทธิที่หน้าบ้าน (Front End) มีประโยชน์เฉพาะในแง่การแสดงผลพรีวิวให้ผู้ซื้อเห็น (User Experience) เท่านั้น แต่ **ห้ามเชื่อถือตัวเลขที่ส่งมาจาก Client โดยเด็ดขาด**:
- หาก Client ส่ง `discountAmount: 99999` และ `finalPrice: 0` ระบบ Backend ต้องไม่รับค่านั้น
- Backend (`order-service` และ `product-service`) ต้องเป็นผู้คำนวณราคาส่วนลดจากข้อมูลในฐานข้อมูลจริงเท่านั้น
- สิ่งที่ Client มีสิทธิ์ส่งเข้ามาคือเพียงความประสงค์ที่จะใช้คูปอง (`campaignId`) เท่านั้น

**Teach-back:** ทำไมการที่ Frontend คำนวณราคาถูกอยู่แล้ว จึงยังไม่เพียงพอต่อความมั่นคงปลอดภัยของระบบการเงิน?

## Round 12 — Atomic Concurrency Control with `updateMany` (Voucher Double-Spending Guard)

เมื่อผู้ซื้อกดสั่งซื้อสินค้าด้วยคูปองใบเดียวกันพร้อมกัน 2 หน้าต่าง (Race Condition) หากใช้วิธี `findUnique` แล้วค่อยตามด้วย `update` จะเกิดช่องว่างระหว่างคำสั่งที่ทั้งสองคำขอเห็นว่าคูปองว่างพร้อมกัน:
- การใช้คำสั่งเดียวแบบ Atomic:
  ```javascript
  prisma.userVoucher.updateMany({
    where: { userId, campaignId, status: "CLAIMED", OR: [{ usedOrderId: null }, { usedOrderId: orderId }] },
    data: { usedOrderId: orderId }
  })
  ```
- ฐานข้อมูลจะประมวลผลคำขอแรกสำเร็จ (`count: 1`) และคำขอถัดไปจะไม่ตรงเงื่อนไขทันที (`count: 0`)
- เมื่อ `count === 0` ระบบตอบกลับ `409 Conflict` ทันที ป้องกันการใช้คูปองซ้ำซ้อน 100%

## Round 13 — Distributed Compensation in Checkout (Saga Rollback)

เมื่อมีขั้นตอนที่ต้องล็อกทรัพยากรข้าม 2 โดเมน (1. ล็อกสินค้าใน Product Service 2. ล็อกคูปองใน Campaign Domain):
- หากขั้นตอนที่ 3 คือการบันทึกคำสั่งซื้อ (`Order.create`) ล้มเหลว
- ระบบต้องมีกลไกย้อนกลับ (Compensating Transactions) เพื่อคืนทรัพยากรทั้งสองฝั่ง:
  1. `releaseVoucher(campaignId, { userId, orderId })` เพื่อคืนคูปองกลับสู่กระเป๋าผู้ซื้อ
  2. `releaseProductReservation(productId, reservationId)` เพื่อปลดล็อกสินค้าคืนสู่ระบบ
- หากขาดการ Compensation ผู้ซื้อจะเสียคูปองไปโดยไม่ได้สินค้า และสินค้าจะค้างสถานะจองจนหมดเวลา 10 นาที

## Round 14 — Claim Quota Concurrency: Read-then-Increment vs Conditional Atomic Update

ในการจำกัดสิทธิ์การกดรับคูปอง (Usage Limit / Quota Cap) เช่น จำกัดเพียง 100 สิทธิ์แรก:
- หากเขียนโค้ดแบบเดิมที่อ่านค่ามาก่อน (`campaign.usedCount >= campaign.usageLimit`) แล้วค่อยตามด้วย `campaign.update({ data: { usedCount: { increment: 1 } } })`
- เมื่อมีผู้ใช้ 50 คนกดเก็บคูปองพร้อมกันในมิลลิวินาทีสุดท้ายที่สิทธิ์เหลือ 1 สิทธิ์ ทั้ง 50 คนจะอ่านค่าและเห็นว่าสิทธิ์ยังเหลือ จากนั้นทุกคนจะสั่ง `increment: 1` ส่งผลให้ตัวนับสิทธิ์ทะลุเพดาน (Overselling / Quota Leak)
- **การแก้ปัญหาเชิงสถาปัตยกรรม:** ใช้คำสั่ง Conditional Atomic Update ในฐานข้อมูล:
  ```javascript
  prisma.campaign.updateMany({
    where: { id: campaignId, usedCount: { lt: usageLimit } },
    data: { usedCount: { increment: 1 } }
  });
  ```
  ฐานข้อมูลจะตรวจสอบเงื่อนไข `usedCount < usageLimit` ในระดับ Row Lock/Transaction ทันที หากมีคำขอเกินโควต้า ผลลัพธ์ `count` จะเป็น 0 ซึ่งทำให้เรารู้ได้ทันทีว่าโควต้าเต็มแล้ว และตอบกลับ HTTP `409 Conflict` ได้อย่างแม่นยำ 100%

**Teach-back:** ทำไมการใช้ `updateMany` ที่มีเงื่อนไข `usedCount: { lt: usageLimit }` จึงป้องกัน Overselling ได้ดีกว่าการใช้ `findUnique` แล้วคำนวณใน Node.js?

## Round 15 — Information Leakage & Gating Non-Published Campaigns

ในการจัดแคมเปญการตลาด โปรโมชันล่วงหน้า เช่น "Flash Sale 11.11 ลด 50%" มักถูกสร้างขึ้นในสถานะ `draft` หรือ `pending_approval` ก่อนวันจริง:
- หากระบบปล่อยให้ Public Endpoint เช่น `GET /api/products/campaigns/:id` คืนข้อมูลแคมเปญได้ทุกสถานะ เพียงแค่ผู้ใช้รู้ ID หรือคาดเดา UUID
- ผู้ซื้อหรือคู่แข่งจะสามารถเข้าดูเงื่อนไขส่วนลด, โค้ดลับ, งบประมาณ, และวันเริ่มแคมเปญได้ล่วงหน้าก่อนที่การตลาดจะเปิดตัว (Information Leakage)
- **การแก้ปัญหาเชิงสถาปัตยกรรม (Gating Strategy):**
  1. ใช้ `optionalAuth` middleware บนเส้นทาง `GET /campaigns/:id` เพื่ออ่าน Token ของผู้ส่งคำขอโดยไม่บังคับให้ต้องล็อกอิน
  2. หากแคมเปญไม่ได้อยู่ในสถานะ `published` (เป็น `draft`, `pending_approval`, `rejected`, หรือ `ended`):
     - ถ้าผู้ใช้ไม่ได้ล็อกอิน (Guest) หรือล็อกอินเป็นบทบาท `BUYER` $\rightarrow$ ส่งคืน HTTP `404 Not Found` (เสมือนแคมเปญนี้ไม่มีตัวตนในระบบ)
     - ถ้าผู้ใช้ล็อกอินด้วยบทบาท `MARKETING` $\rightarrow$ ส่งคืนข้อมูลแคมเปญครบถ้วนเพื่อให้ตรวจสอบและจัดการได้

**Teach-back:** ทำไมการคืนค่า `404 Not Found` แทนที่จะเป็น `403 Forbidden` ให้แก่บุคคลภายนอกสำหรับทรัพยากรที่ยังไม่เผยแพร่ จึงเป็นแนวปฏิบัติด้านความปลอดภัยที่ดีกว่า?

## Round 16 — Event Replay Idempotency & Attribution Fact Model

เมื่อมีอีเวนต์สำคัญเกิดขึ้นข้ามระบบ เช่น `order.completed.v1` ส่งมาจาก Order Service มายัง Product Service เพื่อบันทึกประสิทธิภาพของแคมเปญ:
- เครือข่ายแบบ Distributed อาจส่งอีเวนต์ซ้ำ (Duplicate Delivery) หรือเกิดการ Replay จากคิว/Retry mechanism
- หากฝั่งรับ (Marketing Metrics) นำยอดขายไปบวกสะสมแบบ Stateless ทื่อๆ ตัวเลขรายได้รวมและ Conversion Rate จะเบิ้ลและคลาดเคลื่อนทันที
- **การแก้ปัญหาเชิงสถาปัตยกรรม:**
  1. **Attribution Fact Table:** สร้างตารางบันทึกความจริงเชิงประวัติศาสตร์ (`campaign_attributions`) โดยกำหนด `order_id` เป็น Unique Constraint
  2. **Idempotent Ingestion:** เมื่อได้รับอีเวนต์ ให้ลองบันทึกด้วย `order_id` หากพบว่าเคยบันทึกไปแล้ว (ตรวจพบใน DB หรือ Unique Violation `P2002`) ให้ข้ามการประมวลผลทันทีและส่งคืนสำเร็จ (`{ ok: true, status: "ignored_duplicate" }`)
  3. **Event-Driven Aggregation:** ตัวเลขในแดชบอร์ดการตลาดจะถูกสรุป (Aggregate) จาก Fact Table นี้เสมอ ทำให้สามารถคำนวณย้อนหลังตามช่วงวันที่ได้อย่างแม่นยำ

**Teach-back:** การมีตาราง Fact Table เก็บประวัติระดับคำสั่งซื้อ ดีกว่าการใช้ตัวนับรวมสะสม (Running Total) ในตาราง `campaigns` อย่างไร?

## Round 17 — Separation of Claim Count vs Redemption Count

ในระบบ Voucher Marketing มักเกิดความสับสนระหว่างคำสองคำ:
1. **Claimed Count (จำนวนการเก็บคูปอง):** จำนวนผู้ซื้อที่กดเก็บคูปองเข้าไปในกระเป๋าคูปองของตนเอง (วัดความสนใจและความต้องการของผู้บริโภค)
2. **Redeemed Count (จำนวนการใช้คูปองจริง):** จำนวนคำสั่งซื้อที่นำคูปองไปใช้ชำระเงินจนเสร็จสิ้น (วัดยอดขายและความสำเร็จจริงของแคมเปญ)
- การนำสองคำนี้มาปนกันเป็นตัวนับเดียวจะทำให้การคำนวณ **Conversion Rate** ผิดพลาดอย่างสิ้นเชิง:
  $$\text{Conversion Rate} = \left(\frac{\text{Redeemed Count}}{\text{Claimed Count}}\right) \times 100$$
- การแยกสองมิตินี้ออกจากกันอย่างชัดเจนใน Data Layer และ UI Dashboard ช่วยให้ฝ่ายการตลาดวิเคราะห์ Funnel ได้ว่า แคมเปญนี้มีคนเก็บเยอะแต่ไม่ยอมใช้ (แสดงว่าเงื่อนไขขั้นต่ำสูงเกินไป) หรือเก็บแล้วใช้ทันที (แสดงว่าส่วนลดน่าดึงดูดใจมาก)

## Round 18 — Safe Idempotency Key Scoping & Strict Teardown Order in Asynchronous Queue Integrations

1. **Idempotency Key Scoping (ขอบเขตความปลอดภัยของ Idempotency Key):**
   - การมีฟิลด์ `idempotencyKey` เป็น Unique ในตาราง ไม่ได้หมายความว่าเราจะส่งคืนข้อมูลเดิมกลับไปได้ทันทีเมื่อคีย์ซ้ำ
   - หากผู้ใช้ส่งคีย์เดิม แต่เปลี่ยน `auctionId`, `bidderId`, หรือ `amount` (เช่น จงใจส่งซ้ำหรือเกิดบั๊กในฝั่งไคลเอนต์) หากระบบส่งคืน Bid เดิมโดยไม่ตรวจสอบ จะทำให้เกิดการสับสนของข้อมูลและอาจนำไปสู่ช่องโหว่ด้านความปลอดภัย
   - **แนวทางที่ถูกต้อง:** เมื่อพบคีย์เดิม ต้องตรวจสอบว่าพารามิเตอร์หลักทั้งหมดตรงกันทุกประการ หากไม่ตรงกันต้องตอบกลับ HTTP `409 Conflict` ทันที และต้องนำการตรวจสอบนี้ไปใช้ใน `P2002` (Unique Constraint Race Condition) Recovery Path ด้วยเช่นกัน

2. **Strict Teardown Ordering in Integration Tests (ลำดับการล้างข้อมูลในชุดทดสอบที่มี Worker และคิว):**
   - ในการทดสอบ Integration ร่วมกับ BullMQ และ PostgreSQL:
     - หากลบข้อมูลในฐานข้อมูลก่อนปิด Worker: Worker ที่กำลังประมวลผลงานในคิวอาจพยายามอ่านข้อมูลที่ถูกลบไปแล้ว ทำให้เกิด Error ที่ไม่จำเป็น
     - หาก swallow error ด้วย `.catch(() => {})`: เมื่อเกิดปัญหา Connection ค้างหรือลบข้อมูลไม่หมด ชุดทดสอบจะรายงานว่าผ่าน แต่จะทิ้งขยะตกค้างและค้าง process ไว้ในระบบ
   - **ลำดับที่ถูกต้อง:**
     1. ปิด Worker (`stopWorker`)
     2. ลบ Delayed Job ออกจาก Redis (`cancelClose`)
     3. ลบข้อมูลในฐานข้อมูลตามลำดับ Reverse-Dependency (`Bid` -> `AuctionItem` -> `Product` -> `AuctionRound`)
     4. ปิด Queue และตัดการเชื่อมต่อ Prisma
     5. รวบรวม Error ทั้งหมดลงใน Array เพื่อ throw รายงานผลรวมหากมีข้อผิดพลาด

## Round 19 — Half-Open Interval Boundary Enforcement, Advisory Lock Namespace Isolation & Safe Future-Offset Integration Testing

1. **Half-Open Interval Boundary (`[Start, End)`) Consistency:**
   - ในการจัดการตารางเวลาหรือทรัพยากรที่มีช่วงเวลา (Time-bounded intervals) หากใช้ Closed interval (`[Start, End]`) การตรวจสอบ Overlap จะทำให้รอบที่เชื่อมต่อกันพอดี (Back-to-back rounds: รอบ A จบ 12:00, รอบ B เริ่ม 12:00) ถูกมองว่าชนกัน ณ วินาทีที่ 12:00
   - การใช้ Half-open interval $[S, E)$ โดยที่ $S \le t < E$ แก้ปัญหานี้ได้อย่างสมบูรณ์:
     - เงื่อนไข Overlap ระหว่างสองช่วง $[S_1, E_1)$ และ $[S_2, E_2)$ คือ $S_1 < E_2 \land S_2 < E_1$
     - หาก $E_1 = S_2$ ค่า $S_1 < S_2 \land S_2 < E_1$ จะเป็นเท็จ $\rightarrow$ ไม่ชนกัน อนุญาตให้จัดรอบต่อเนื่องกันได้ทันที
     - ทุกจุดในระบบต้องยึดหลักเกณฑ์เดียวกัน: เช่น `submission` ต้องเป็น `submissionStartsAt <= now && now < submissionEndsAt` (ห้ามใช้ `<= submissionEndsAt`)

2. **PostgreSQL Advisory Lock Namespace Isolation:**
   - PostgreSQL มีฟังก์ชัน Advisory Lock ทั้งแบบ 64-bit int (`pg_advisory_xact_lock(bigint)`) และแบบคู่ 32-bit int (`pg_advisory_xact_lock(int, int)`)
   - ในระบบที่มีการล็อกหลายส่วน: การล็อกประมูลรายชิ้น (`withAuctionLock`) ใช้ `hashtext(auctionId)` ซึ่งเป็น Single 64-bit int
   - หากการล็อกรอบประมูล (`withRoundLock`) ใช้ตัวเลขสุ่มในสเปซเดียวกัน อาจเกิดความเสี่ยงที่จะเกิด Lock Collision ข้ามโดเมน
   - การใช้ฟังก์ชันแบบสองพารามิเตอร์ `pg_advisory_xact_lock(1001, 1)` เป็นการสร้าง Namespace เฉพาะ (Application Key = 1001, Subkey = 1) ทำให้มั่นใจได้ว่า Lock ของ Round จะไม่ชนกับ Lock ของ Entity อื่นๆ ในระบบอย่างเด็ดขาด
   - **Transaction Client Continuity:** ตัวล็อกต้องทำงานร่วมกับ Transaction (`$transaction`) และส่ง `tx` ไปยังคิวรีตรวจจับและสร้างข้อมูลภายใน callback เดียวกันเสมอ หากเผลอใช้ Global Prisma Client คิวรีจะหลุดออกจาก Transaction Context และทำให้การล็อกไร้ความหมาย

3. **Safe Future-Offset Integration Testing Against Shared/Persistent Databases:**
   - ในการรัน Integration Test ร่วมกับฐานข้อมูลจริงที่มี Seed Data หรือประวัติการทดสอบเดิมตกค้างอยู่:
   - หากสร้าง Test Fixture โดยใช้เวลา `Date.now() + 1 hour` อาจเกิดการชนกับรอบประมูลที่เคยสร้างไว้ในการรันครั้งก่อนหน้า ทำให้ Test ล้มเหลวด้วย 409 Conflict
   - **โซลูชัน:** ก่อนเริ่มทดสอบ ให้ค้นหาเวลาสิ้นสุดสูงสุด (`MAX(auctionEndsAt)`) จากฐานข้อมูลจริงก่อน:
     `testBaseMs = Math.max(Date.now(), maxExistingEnd) + 24 * 60 * 60 * 1000`
     จากนั้นจึงสร้าง Test Rounds ทั้งหมดอิงจาก `testBaseMs` สิ่งนี้ทำให้ชุดทดสอบสามารถรันซ้ำกี่ครั้งก็ได้ (Idempotent Test Execution) โดยไม่มีวันเกิดปัญหาเวลาชนกับข้อมูลเดิมในฐานข้อมูล

**Teach-back:** ทำไมการกำหนดนิยามช่วงเวลาแบบ Half-Open Interval $[S, E)$ จึงเป็นมาตรฐานอุตสาหกรรมสำหรับระบบ Scheduling และ Time-series?


