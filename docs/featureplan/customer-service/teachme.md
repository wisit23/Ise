# Customer Service — teachme

## Current reconciliation — 2026-09-09

Baseline `aad4092`. Owner: อชิรวินท์ จรูญกีรติโรจน์. Reviewer: สิรดนัย กันหา. Requirements: UR-17–UR-21.
**Status: implementation present; whole-role acceptance pending.**

### มีใน source

Shared workspace, ticket queue/assignment/status/replies, SLA monitor, FAQ, order lookup, dispute evidence/decision, support chat and escalation to Admin/Trust & Safety.

### Next phase / handoff

ตรวจ lifecycle และ authorization ข้าม CUSTOMER_SERVICE/ADMIN/TRUST_AND_SAFETY; ตรวจเคสที่มี Admin hold และ CS decision พร้อมกันด้วย isolated database integration tests

เกณฑ์ปิดงาน: owner บันทึก regression test, isolated persistence integration, cross-role negative access, commit/environment และ reviewer sign-off. ไม่มีการกำหนด due date แทนเจ้าของงาน.
ผลตรวจรวม: lint ผ่าน, frontend 131 tests ผ่าน, targeted Product unit tests 37 ผ่าน; ผลรวมนี้ไม่ใช่การรับรองทุกฟีเจอร์ของ role นี้.
ดู [validation](../../validation.md), [known issues](../../known-issues.md), [current contract](../integration.md).

### Source map

- [frontend/app/workspace](../../../frontend/app/workspace)
- [frontend/components/support](../../../frontend/components/support)
- [backend/services/support-service/src](../../../backend/services/support-service/src)
- [backend/services/order-service/src/features/disputes](../../../backend/services/order-service/src/features/disputes)
- [backend/services/order-service/src/features/support](../../../backend/services/order-service/src/features/support)

## Historical baseline / original requirements and task evidence

> เนื้อหาต่อจากนี้เก็บ task IDs, requirement mapping และหลักฐานตามวันที่เดิม ไม่ใช่สถานะ implementation ปัจจุบัน; ใช้ current section ด้านบนเมื่อขัดกัน. Plan checklist เดิมยังไม่ถูกติ๊ก Done โดยอัตโนมัติ.

# Customer Service Feature Teach Me

## Round 0 — Proxy ไม่เท่ากับ Feature

`backend/gateway/src/app.js` ส่ง `/api/chat` ไป Chat service และเปิด WebSocket option แล้ว
แต่ `backend/services/chat-service/src/app.js` ตอบได้เพียง health check จึงยังไม่มี Chat feature

Chat ต้องตรวจสมาชิกห้องที่ server ทุกครั้ง Staff access ต้องมีเหตุผล/audit และห้ามเปิดให้ CS
ค้นบทสนทนาของทุกคนโดยไม่มี case ที่ได้รับมอบหมาย

**Teach-back:** การมี `ws: true` ใน Gateway พิสูจน์ได้เพียงอะไร และยังไม่พิสูจน์อะไร?
