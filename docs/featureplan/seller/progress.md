# Seller Feature Progress

> Owner: เอกตระการ บุญญกาศ · Reviewer: วิศิษฏ์ เจียมสันต์ · Updated: 2026-08-10

**Status:** ProductVideo provider refactored and locally tested; Seller plan acceptance incomplete

**Plan coverage:** Explicit trace rows cover `UR-32`–`UR-39` and shared `UR-03` through FR,
active/deferred NFR, Workflows and `SEL-001`–`SEL-005`

**Confirmed evidence:** Seller registration, listing/media upload, store page and seller dashboard
have partial implementation, but persisted Synthetic KYC application, four-image rule,
safe listing transitions and server-side insight contracts have not passed this plan

**Current implementation evidence:** ProductVideo now has separate route/controller/service/repository,
available-only feed filtering, Product ownership validation, signed-token seller display name and
focused unit/integration test cases. Synthetic KYC is still absent

**Database acceptance:** Auth/Product/Order PostgreSQL tests are required. ProductVideo unit tests
pass, but no new `REQUIRE_INTEGRATION=1` Seller test or schema apply ran in this refactor

**Deferred:** KYC encryption/PDPA and other Security hardening; Synthetic KYC content is allowed

**Blocker:** Phase 0 KYC/Product/Order and ProductVideo response/choose contracts plus database fixture policy are not frozen

**Next action:** Review `SEL-001` and write the failing `KycApplication` PostgreSQL persistence test
