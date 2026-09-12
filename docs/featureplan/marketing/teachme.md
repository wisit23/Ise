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




