# Seller Feature Changelog

## 2026-07-30 — Planning Round 0

- Trace `UR-32`–`UR-39` และ Buyer `UR-03` มายัง Seller ownership
- แยก listing/inventory Core ออกจาก recommendation/auction Extended
- ไม่มี application code ถูกเปลี่ยน

## 2026-08-10 — Traceability and Database Acceptance Revision

- เพิ่ม explicit rows `UR-32`–`UR-39` พร้อม FR, NFR, Workflow และ Task/Phase
- คง `UR-03` เป็น shared requirement โดย Seller `SEL-002` เป็น provider
- กำหนด Synthetic KYC content แต่ให้ application/reference/status/decision persist ใน `reloop_auth`
- เพิ่ม PostgreSQL acceptance สำหรับ listing/media, inventory/shipping, insight และ extended tools
- ระบุว่า `UR-39` ไม่มี Workflow ประมูลเฉพาะใน Req Doc
- ย้าย KYC encryption/PDPA และ Security hardening ไป Deferred Security Phase
- สถานะยังเป็น Planning revised; ไม่มี Seller implementation/database change ในรอบนี้

## 2026-08-10 — Handoff and Decision Records

- เพิ่ม `handoff.md` สำหรับส่งต่อ `SEL-001`–`SEL-005`, dependency และ acceptance evidence
- เพิ่ม `decision.md` สำหรับ Vertical ownership, Synthetic KYC, Product ownership และ deferred security decisions
- ไม่มี Seller implementation/database change ในรายการนี้

## 2026-08-10 — Post-Pull ProductVideo Provider Audit

- พบ Prisma `ProductVideo`, public feed, authenticated create route, Product ownership check,
  seller upload UI และ integration-test cases ใน source ที่ pull มา
- บันทึก conflict เรื่อง allowed Product states และ client-supplied `sellerName`
- ปรับ `SEL-005`, progress, handoff และ decision โดยไม่ยก baseline เป็น Seller acceptance
- Auth demo seller seed ไม่ถูกนับเป็น Synthetic KYC
- ไม่ได้แก้ Seller application code หรือ rerun Seller PostgreSQL acceptance test ในรอบเอกสารนี้

## 2026-08-10 — ProductVideo Provider Refactor

- แยก ProductVideo ออกจาก general Product controller/model เป็น route/controller/service/repository
- feed query เฉพาะ Product `available`; create flow ตรวจ role, required fields และ Product owner ใน service
- Auth ใส่ database-derived `displayName` ใน signed access token และ Product service ไม่รับรอง
  `sellerName` จาก client อีกต่อไป
- เพิ่ม repository/service/auth tests และ integration assertions สำหรับ spoofed name กับ sold-product feed
- เพิ่ม `ProductVideo.createdAt` index ใน Prisma schema แต่ยังไม่ได้ apply กับ PostgreSQL จริง
- backend ล่าสุด 41 tests: 38 ผ่าน, 3 database tests ข้าม, 0 fail; Synthetic KYC ยังไม่ได้ implement

## 2026-08-25 — Upload 500 Fix + Auto-Refresh Access Token

- Bug report: Seller upload รูปตอนลงขายสินค้าได้ `500` หลัง Clone ใหม่ ตั้งแต่รันครั้งแรก — สาเหตุคือ `uploads/` ถูก `.gitignore` ทั้ง Directory โดยไม่มี Placeholder ค้างไว้ (`multer.diskStorage` เขียนไฟล์ลง Path ที่ไม่มีอยู่จริง → `ENOENT`)
- แก้ `.gitignore` (`uploads/*` + `!uploads/.gitkeep`) และเพิ่ม `fs.mkdirSync(UPLOAD_DIR, { recursive: true })` ใน `product-service/src/middleware/upload.js` เป็น Backstop ถาวร
- เพิ่ม Auto-Refresh Access Token ที่ `frontend/lib/api.js`: เจอ `401` (Access Token หมดอายุ 15 นาที) → เรียก `/api/auth/refresh` อัตโนมัติ → Retry Request เดิม; Refresh ไม่สำเร็จค่อย Force Logout — Endpoint `/refresh` มีอยู่แล้วฝั่ง Auth Service แต่ Frontend ไม่เคยเรียกใช้มาก่อน ทำให้ Seller ที่ Login ทิ้งไว้เกิน 15 นาทีอัปโหลดรูปไม่ได้แบบเงียบๆ (ไม่มี Error ชัดเจน ไม่มีการเด้งออกจากระบบ)
- รายละเอียดและหลักฐานเต็มอยู่ที่ Task `MOCK-TRADE-010` ใน `docs/progress.md`
- ยังไม่ได้ทดสอบ E2E จริงผ่าน Browser + Docker สำหรับ Auto-Refresh, ยังไม่ผ่าน AI Reviewer อิสระ

## 2026-09-02 — UI-SYSTEM-001 (Frontend Design System / Refactor)

- `app/seller/onboarding/page.js` 431 → 207 บรรทัด แตกเป็น `seller/onboarding/KycForm`,
  `KycStatusCard`, `KycDocumentUpload` และ `IdCardField` (พร้อม `formatIdCardDisplay`,
  `isCompleteIdCard`)
- `app/seller/dashboard/page.js` 428 → 239 บรรทัด แตกเป็น `seller/dashboard/SalesSummary`,
  `SellerProductList`, `RecentOrderList` และ `sellerStatus` (status label/style + `baht()`)
- แก้บั๊ก a11y: Drop zone อัปโหลดรูปบัตรประชาชนเป็น `<div onClick>` คีย์บอร์ดเข้าไม่ถึงเลย
  → เปลี่ยนเป็น `<button type="button">`
- Onboarding ยังใช้ emoji เป็นไอคอนสถานะ (⏳ ✓ ⚠️ 🪪) ซึ่งตกค้างจากตอน migrate ไป
  Material Symbols ใน `d98e8a1` → เปลี่ยนครบแล้ว
- ช่องรหัสบัตรประชาชน 13 หลักเคยไม่บอกอะไรเลยจนกดส่ง → นับหลักที่เหลือให้ระหว่างพิมพ์
- "(ไม่บังคับ)" เคยอยู่ใน placeholder ซึ่งหายทันทีที่พิมพ์ → ย้ายเป็น hint ของ Field
- KYC fetch ของหน้า Onboarding ไม่มี Error branch: โหลดพลาดแล้วเรนเดอร์ฟอร์มเปล่าเหมือน
  ยังไม่เคยยื่น ซึ่งชวนให้ยื่นซ้ำ → เพิ่ม `ErrorState` พร้อมปุ่มลองใหม่
- ทั้งสองหน้าเคยขึ้น "กำลังโหลด..." เปล่าๆ แล้ว Layout กระโดดตอนข้อมูลมา → Skeleton ที่มี
  รูปทรงเหมือนของจริง
- รายการสินค้าว่างในแดชบอร์ดเคยเป็นข้อความเทาประโยคเดียว → `EmptyState` พร้อมปุ่ม
  "ลงขายสินค้า"
- ยืนยันด้วย Browser จริงด้วยบัญชี Demo Seller: ฟอร์ม Onboarding เรนเดอร์ครบและตัวนับหลัก
  บัตรประชาชนทำงาน, แดชบอร์ดแสดงยอดขายจริง Sparkline Charts และรายการสินค้าครบ
- รายละเอียดเต็มและผลตรวจอยู่ที่ [`docs/featureplan/changelog.md`](../changelog.md) และ [`docs/progress.md`](../../progress.md) Task `UI-SYSTEM-001`; กติกา UI อยู่ที่ [`docs/ui-conventions.md`](../../ui-conventions.md)
