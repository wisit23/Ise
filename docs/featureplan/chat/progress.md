# Chat platform — progress

## Current reconciliation — 2026-09-09

Baseline `aad4092`. Owner: ยังไม่มี owner/reviewer บุคคลแยกที่ยืนยันในทะเบียนหก role. Reviewer: ให้ทีมกำหนดก่อนรับรอง. Requirements: Cross-role Buyer/Seller/CS/Admin.
**Status: implementation present; whole-role acceptance pending.**

### มีใน source

MongoDB conversations/messages, REST writes, Socket.IO notifications/presence/typing, Redis adapter, private attachments, unread badges, internal support/dispute context integration.

### Next phase / handoff

ตรวจ Mongo replica set + Redis integration, reconnect/unread ordering, participant access และ private attachment denial; ไม่ถือ unit/component tests เป็น realtime E2E acceptance

เกณฑ์ปิดงาน: owner บันทึก regression test, isolated persistence integration, cross-role negative access, commit/environment และ reviewer sign-off. ไม่มีการกำหนด due date แทนเจ้าของงาน.
ผลตรวจรวม: lint ผ่าน, frontend 131 tests ผ่าน, targeted Product unit tests 37 ผ่าน; ผลรวมนี้ไม่ใช่การรับรองทุกฟีเจอร์ของ role นี้.
ดู [validation](../../validation.md), [known issues](../../known-issues.md), [current contract](../integration.md).

### Source map

- [backend/services/chat-service/src](../../../backend/services/chat-service/src)
- [backend/services/chat-service/prisma/schema.prisma](../../../backend/services/chat-service/prisma/schema.prisma)
- [frontend/components/chat](../../../frontend/components/chat)
- [frontend/lib/chat.js](../../../frontend/lib/chat.js)
- [backend/gateway/src/server.js](../../../backend/gateway/src/server.js)

## Original task evidence

[Historical record](../../history/pre-2026-09-09/docs/featureplan/chat/progress.md) retains previous task IDs, decisions and results by their original date.
