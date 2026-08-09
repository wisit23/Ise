# Customer Service Feature Progress

> Owner: อชิรวินท์ จรูญกีรติโรจน์ · Reviewer: สิรดนัย กันหา · Updated: 2026-08-10

**Status:** Planning revised - implementation not started

**Plan coverage:** Explicit trace rows cover `UR-17`–`UR-21` through FR, active/deferred NFR,
`WF-06`, `WF-08`, `WF-10` and `CSS-001`–`CSS-004`

**Confirmed evidence:** Gateway proxy `/api/chat` exists, but Chat service currently has only a
health endpoint and no persisted Room, Message, SupportCase, refund decision or SLA feature

**Database acceptance:** Chat/Order PostgreSQL tests are required; no new
`REQUIRE_INTEGRATION=1` Customer Service test has run in this planning round

**Deferred:** Production staff-access/audit hardening in Security Phase; functional case assignment remains

**Blocker:** Phase 0 functional role contract and Chat Prisma/PostgreSQL setup are not complete

**Next action:** Review `CSS-001`, add Chat Prisma dependencies/schema and write the failing
room/message persistence test
