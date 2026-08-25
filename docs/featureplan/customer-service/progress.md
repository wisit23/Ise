# Customer Service Feature Progress

> Owner: อชิรวินท์ จรูญกีรติโรจน์ · Reviewer: สิรดนัย กันหา · Updated: 2026-08-25

**Status:** Core implemented — `CSS-000`, `CSS-005`, `CSS-002`, `CSS-003`, `CSS-004` all built and verified.
`CSS-001` (Live Chat) remains Deferred per the 2026-08-25 rescope in `plan.md`

**Plan coverage:** Explicit trace rows cover `UR-17`, `UR-19`, `UR-20`, `UR-21` through FR, active/deferred
NFR, `WF-08`, `WF-10` and `CSS-000`, `CSS-005`, `CSS-002`, `CSS-003`, `CSS-004`. `UR-18` / `WF-06` stay Deferred
with `CSS-001`

**Implementation evidence (2026-08-25):**

- New `support-service` (Express + Prisma, `reloop_support`) — health endpoint, `SupportTicket`/
  `TicketMessage`/`TicketAuditLog`/`HelpArticle` schema, wired into `docker-compose.yml`,
  `infra/postgres/init-databases.sql`, `.env.example`, `scripts/ensurePrismaClients.js`, gateway proxy
  (`/api/support`), and `.github/workflows/ci.yml`
- `Role` enum gained `SUPPORT`; two demo support agents seeded (`cs.nan@example.com`, `cs.beam@example.com`,
  password `password123`, matching the existing demo-account pattern)
- `Order` gained `payoutHeld`/`disputedAt` and lifecycle values `disputed`/`refunded`; the generic
  `PATCH /:id/status` endpoint explicitly excludes these — only `disputeService`'s one-way decision flow
  can set them
- `CSS-005` Ticket Core: full state machine (`ticketState.js`, pure function), optimistic-lock assign
  and status transitions, internal-only agent notes (never visible to the requester), audit log on every
  privileged action
- `CSS-002` Agent Workspace: bounded order search in `order-service` (`orderId`/`buyerId`/`sellerId` —
  narrowed from the plan's "search by name/email" since order-service holds no such fields; see
  `supportService.js`'s comment), rejects an empty search to prevent a full-table dump
- `CSS-003` Dispute/Refund: opening a dispute holds payout atomically (`WF-08` step 3); decision is
  one-way via optimistic lock (`DisputeCase.version`); evidence lives in a **private** storage directory
  (`order-service/private-evidence/`, own Docker volume, own `.gitkeep`) never reachable through
  product-service's public `/uploads/` — every evidence view is authorized and audit-logged
  (`DisputeAuditLog`, `NFR-SP-03`)
- `CSS-004` SLA + FAQ: `calculatePriority()`/`calculateSlaDueAt()` are pure functions; SLA monitor
  escalates overdue tickets via a conditional `updateMany` (`escalatedAt: null` in the `WHERE`) that stays
  correct even if run from multiple instances; FAQ search reuses `MOCK-TRADE-011`'s `pg_trgm` pattern
  (Postgres full-text search still can't index Thai) with its own `search_text` trigger + GIN index
- Frontend: `/help` (public FAQ), `/support/tickets` (+ `[id]` thread), `/support/queue` (agent),
  `/support/cases` (+ `[id]`, agent order search + dispute decision), dispute-open + evidence-upload form
  added to `/orders` for completed orders, `NavBar` links added (help/tickets for everyone,
  queue/case-search for `SUPPORT`/`ADMIN`)
- Evidence viewing is a fetch-with-Bearer-token → `Blob` → `ObjectURL` (`fetchAuthedBlobUrl` in
  `lib/api.js`), **not** a plain `<a href>`/`<img src>` — a bare navigation never carries a custom
  Authorization header, so a naive link would 401 on every click

**Bugs found and fixed during live verification (not caught by unit/integration tests alone):**

1. Decision endpoint frontend called `PATCH`, backend route is `POST` — silent `404`, no test caught it
   because the integration tests call the service directly, not through a separately-authored frontend
   call. Fixed; now cross-checked every frontend `apiFetch` call against its backend route by hand.
2. Two rounds of "edited/created a frontend file, dev server didn't pick it up" — a known Docker Desktop
   on Windows bind-mount file-watcher gap (new files aren't picked up reliably; some edits aren't either).
   Worked around with `docker compose restart frontend`; **anyone continuing this locally should restart
   the frontend container after adding/editing app-router files if a page doesn't reflect a change.**

**Database acceptance:** `REQUIRE_INTEGRATION=1` PostgreSQL tests pass — `support-service`: 12 tests
(`ticket-lifecycle`, `sla-escalation`, `help-content`, `health`); `order-service`: 4 new tests
(`support-lookup`, `dispute-decision` ×2, `evidence-access`) plus its 5 pre-existing tests all still
green. Full repo `npm test`: 67/67. `npm run lint` and `npm run format:check`: clean

**End-to-end verification:** full round trip driven through the real browser against the live Docker
stack (not just `supertest` against the Express app object) — register buyer → order seeded directly →
open dispute with reason → agent logs in, views queue, assigns a separate support ticket, replies,
requester sees the reply and not the internal note → agent opens the dispute case page, approves the
refund → `orders.status` flips to `refunded` and `payout_held` flips to `false` in Postgres, confirmed
by direct query after a full container rebuild

**Deferred:** `CSS-001` Live Chat Console (`UR-18`, `WF-06`) — see `plan.md`'s Scope Revision for the
persist-before-broadcast requirement it must satisfy when picked up. Production staff-access hardening
beyond what's listed above stays in the Security Phase

**Cross-team note:** `buyer/plan.md` → `BUY-004` (`UR-05`, Contact Seller button) still depends on the
deferred `CSS-001` — unchanged by this round, still needs Buyer-owner alignment before anyone builds it

**Next action:** None blocking — Core is feature-complete for this round. Follow-ups if picked back up:
SLA breach notifications to a team lead (WF-10 step 3's "แจ้งเตือนหาหัวหน้าทีม" is only a status flip
today, no actual notification channel exists yet), and `CSS-001` Live Chat per the deferred spec
