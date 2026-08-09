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
