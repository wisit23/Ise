# Admin Feature Progress

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-08-10

**Status:** Planning revised - implementation not started

**Plan coverage:** Explicit trace rows cover `UR-22`–`UR-26` through FR, active/deferred NFR,
`WF-01`, `WF-08`, `WF-09` and `ADM-001`–`ADM-005`

**Confirmed evidence:** Auth schema has `ADMIN`, `KycStatus` and `Report`, but current source lacks
the functional multi-role catalog, persisted KYC decision API, moderation workspace and simulated hold flow

**Database acceptance:** Auth/Product/Order PostgreSQL tests are required; no new
`REQUIRE_INTEGRATION=1` Admin test has run in this planning round

**Deferred:** Production privileged-audit, encryption, PDPA and PCI-DSS hardening

**Blocker:** `ADM-001` remains the Phase 0 provider for all six Role Features

**Next action:** Write the failing `ADM-001` role-assignment migration/integration tests against `reloop_auth`
