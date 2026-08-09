# Seller Feature Progress

> Owner: เอกตระการ บุญญกาศ · Reviewer: วิศิษฏ์ เจียมสันต์ · Updated: 2026-08-10

**Status:** Planning revised - implementation not started

**Plan coverage:** Explicit trace rows cover `UR-32`–`UR-39` and shared `UR-03` through FR,
active/deferred NFR, Workflows and `SEL-001`–`SEL-005`

**Confirmed evidence:** Seller registration, listing/media upload, store page and seller dashboard
have partial implementation, but persisted Synthetic KYC application, four-image rule,
safe listing transitions and server-side insight contracts have not passed this plan

**Database acceptance:** Auth/Product/Order PostgreSQL tests are required; no new
`REQUIRE_INTEGRATION=1` Seller test has run in this planning round

**Deferred:** KYC encryption/PDPA and other Security hardening; Synthetic KYC content is allowed

**Blocker:** Phase 0 KYC/Product/Order contracts and database fixture policy are not frozen

**Next action:** Review `SEL-001` and write the failing `KycApplication` PostgreSQL persistence test
