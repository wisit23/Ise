# RE-LOOP Combined Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้สมาชิก 6 คนพัฒนา Feature ตาม Role ที่สัมภาษณ์แยกกันได้และรวมเป็นระบบเดียวผ่าน contract และ test gate

**Architecture:** แต่ละ Feature เป็น vertical slice และใช้ microservices เดิมผ่าน Gateway ห้ามข้าม database ownership สัญญากลางอยู่ใน `integration.md`; shared-file changes แยกเป็น integration PR ก่อน business implementation

**Tech Stack:** Next.js 15 App Router, React 18, JavaScript, Express, Prisma, PostgreSQL 16, Redis 7, Node.js test runner, Jest, Docker Compose

## Global Constraints

- Node.js `>=22.11.0 <23.0.0`; npm `>=10.0.0`
- Payment เป็น deterministic mock เท่านั้น ห้ามรับข้อมูลบัตร/บัญชีจริง
- KYC ใช้ synthetic test data เท่านั้นและต้องเก็บเป็น private object
- Service ห้ามอ่าน database ของ service อื่นโดยตรง
- Owner ห้าม approve Feature ของตนเอง
- `progress.md` คือสถานะปัจจุบัน; `changelog.md` คือประวัติ; `teachme.md` คือบทเรียนตามหลักฐาน
- งาน prototype เดิมต้องผ่าน acceptance criteria ใหม่ก่อนยกเป็น Done

---

## Round 0 — Integration foundation

- [ ] Admin Owner ทำ `ADM-001` เพื่อสร้าง multi-role/permission contract
- [ ] ทุก Owner review entity/status/error/event shapes ใน `integration.md`
- [ ] เพิ่ม contract fixtures และ negative-permission tests ก่อนแก้ UI consumer
- [ ] Reviewer ทั้งหกยืนยัน Gate 0

## Round 1 — Core vertical slices

ทำพร้อมกันหลัง Gate 0:

- [ ] Buyer: `BUY-001` ถึง `BUY-004`
- [ ] Seller: `SEL-001` ถึง `SEL-004`
- [ ] Customer Service: `CSS-001` ถึง `CSS-003`
- [ ] Admin: `ADM-002` ถึง `ADM-004`
- [ ] Marketing: `MKT-001` ถึง `MKT-003`
- [ ] Executive: `CEO-001` ถึง `CEO-003`

แต่ละ Task ต้องจบด้วย targeted test, full relevant workspace test, เอกสารสามสถานะ/ประวัติ/บทเรียน
และ commit ที่ไม่ปน Feature อื่น

## Round 2 — Core integration

- [ ] Merge provider contracts ก่อน consumer
- [ ] Apply migrations ตามลำดับ Auth → Product → Order → Chat/Review
- [ ] รัน contract, integration, permission-negative และ E2E critical flow
- [ ] ปิด Gate 1 เมื่อ reviewer ครบและ root `progress.md` ตรงกับไฟล์ย่อย

## Round 3 — Extended

- [ ] Buyer: personalization, wishlist, swipe และ auction participation
- [ ] Seller: quick replies, price recommendation และ auction submission
- [ ] Customer Service: FAQ, SLA priority และ support analytics
- [ ] Admin: auction moderation, bounded bulk action และ audit search
- [ ] Marketing: segmentation, knowledge content, auction campaign
- [ ] Executive: anomaly alert, export และ drill-down

## Verification รวมก่อน Merge

Run:

```powershell
npm run lint
npm run format:check
npm run secret-scan
npm test
npm run test:frontend
npm --workspace frontend run build
docker compose config --quiet
```

Expected: ทุกคำสั่ง exit `0`; integration tests ที่ต้องใช้ database ห้าม skip ใน CI

รายละเอียด Task อยู่ใน `plan.md` ของ Feature แต่ละโฟลเดอร์
