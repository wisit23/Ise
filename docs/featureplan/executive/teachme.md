# Executive Feature Teach Me

## 2026-10-10 — Review pagination and map keys before handoff

จำนวนคำร้องเปลี่ยนได้ระหว่างเปิดหน้า จึงต้องกู้คืน page ที่เกิน totalPages.
รหัสจากข้อมูลภายนอกไม่ควร lookup ผ่าน inherited properties ของ object;
Map แยก key ของข้อมูลออกจาก prototype. ไฟล์ใหม่ที่ยัง untracked ต้องรวมใน commit
และตรวจ secrets เพิ่ม เพราะ secret-scan เดิมอ่านเฉพาะ tracked files

## 2026-10-10 — Type checks complement runtime validation

JSDoc + @ts-check ตรวจโครงสร้าง module ใน JavaScript ได้จริงเมื่อรัน TypeScript checker แต่ payload จาก network ยังต้องตรวจ runtime. Normalize เฉพาะฟิลด์ที่ผ่าน validation และตรวจ pagination ว่าสอดคล้องกัน. Public Next.js environment ต้องส่งตอน production build; environment ที่ตั้งเฉพาะ runtime ไม่เปลี่ยน bundle ที่ build แล้ว

## 2026-10-09 — All is a query mode, not a stored report status

ALL ใช้เฉพาะ API/UI เพื่อไม่กรองสถานะ ไม่เพิ่ม enum ในฐานข้อมูล และไม่เปลี่ยนความหมายของตัวเลือกเดิมที่ยังเปิดอยู่ (OPEN + REVIEWED)

## 2026-10-09 — Keep the search input mounted during loading

Search-as-you-type ต้อง debounce และไม่ unmount ช่องกรอกทุกครั้งที่ API เริ่มโหลด มิฉะนั้น focus จะหลุดระหว่างพิมพ์. ล้าง timer เก่า รอ composition จบ และทิ้ง response ของ request เก่าที่ถูกแทนที่แล้ว

## 2026-10-09 — Search precedes pagination

การกรองเฉพาะ 50 รายการที่ browser โหลดมาไม่ใช่การค้นหาคำร้องทั้งหมด. Query/count ต้องใช้ search/status predicate เดียวกันที่ฐานข้อมูลก่อน LIMIT/OFFSET และเรียงลำดับอย่างคงที่ก่อนแบ่งหน้า. ใช้ Prisma tagged SQL สำหรับค่าค้นหาและ STRPOS เพื่อไม่ตี %/_ เป็น wildcard ของผู้ใช้

## 2026-10-09 — Fixed overlay inside a transformed panel

Animation ที่ใช้ transform ทำให้ fixed overlay อ้างอิงกรอบ parent แทน viewport. Portal ไป body แก้พื้นที่ backdrop และ stacking context; Executive มี scroller ภายในจึงต้องล็อก ancestor panel ควบคู่กับ body และคืน style เดิมเมื่อปิด

## 2026-10-09 — Runtime types and real empty states

JSDoc ช่วยสื่อโครงสร้างในโครงการ JavaScript แต่ข้อมูลจาก API ยังต้องตรวจชนิดจริงก่อน render. Null ระหว่างโหลด/ล้มเหลวต่างจากจำนวนศูนย์จากฐานข้อมูล; ไม่สร้าง KPI เป็นศูนย์เพื่อกลบ error. Domain-code translations เป็นข้อความ UI ไม่ใช่ mock decisions. Environment configuration ต้องตรวจค่าก่อนใช้ และ response เก่าต้องไม่ทับ filter ล่าสุด

## 2026-10-09 — Reviewer and decision actor are different identities

`reviewedBy` ระบุผู้เริ่มตรวจ ส่วนผู้ตัดสินอ่านจาก `REPORT_*` Audit ที่ targetId เท่ากับรหัสคำร้องและ Action ตรงกับ `actionTaken`. USER_* Audit ผูกกับผู้ใช้ จึงห้ามนำเหตุผลจากประวัติผู้ใช้มาแทนเหตุผลของคำร้อง. รายการเก่าที่ไม่มี Audit ต้องแสดงข้อมูลที่ขาดตามจริง

## 2026-10-09 — Complaint detail uses the existing read contract

ข้อมูลเหตุผล ผู้ส่ง เวลา และเป้าหมายอยู่ใน `/executive/reports` แล้ว จึงเปิดรายละเอียดจากรายการที่เลือกได้โดยไม่เพิ่ม request. ใช้ shared Modal เพื่อคงการปิดด้วย Esc การควบคุม focus และการคืน focus ให้ปุ่มเปิด. ระบุ Asia/Bangkok ใน formatter ให้เวลาในรายการและรายละเอียดตรงกัน

## Round 0 — Dashboard ต้องมีนิยามตัวเลข

GMV ไม่ใช่ยอดรวม Order ทุกสถานะ ต้องรวมเฉพาะ transaction state ที่นิยามไว้ เช่น
`completed`; platform revenue ต้องมี fee rule แยก ไม่เดาจากราคา Seller dashboard

Executive endpoint อ่าน aggregate จาก owner service และเป็น read-only หาก dependency
ล้มเหลวต้องแสดง partial/unavailable ไม่แทนด้วย `0`

**Teach-back:** ค่า `0` ต่างจาก `unavailable` อย่างไรต่อการตัดสินใจของผู้บริหาร?
