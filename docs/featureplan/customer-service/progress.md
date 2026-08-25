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

**UI Polish / UX Improvements (2026-08-26):**
- Upgraded the Customer Support panels (`/support/panel`) to an "Impeccable" UI standard.
- **Search UI:** Adjusted the search empty state to properly accommodate the search bar without layout overlap and added quick "Copy Full ID" buttons to the Disputes table for seamless ID pasting.
- **FAQ Editor:** Converted the inline FAQ submission form into a beautiful, centralized Glassmorphism Modal.
- **Tickets & Disputes Panels:** Refactored standard modals into premium Slide-over Panels (`max-w-2xl`) emerging from the right, complete with `animate-in`/`animate-out` lifecycle transitions and click-outside-to-close capabilities.
- **Dispute Chat Placeholder:** Implemented a secondary Slide-over chat panel that emerges from the left of the Dispute details modal, readying the UI structure for the deferred `CSS-001` Live Chat feature.

**Bugs found during a follow-up review of the UI Polish commit above, and fixed (2026-08-26):**

1. **Priority filter was a silent no-op.** The panel's Tickets table and the Dashboard's "Tickets by
   Priority" donut both sent `?priority=LOW|NORMAL|HIGH|URGENT` to `GET /api/support/tickets/queue`,
   but `ticketModel.listQueue()` never read that query param — every bucket returned the same unfiltered
   set. Fixed by threading `priority` through `ticketController.js` → `ticketService.listQueue()` →
   `ticketModel.listQueue()`'s Prisma `where` clause. Verified against the live dev DB (`URGENT` and
   `NORMAL` now return disjoint result sets) and live in the browser (donut now shows differentiated
   percentages per bucket instead of an even split).
2. **Ticket slide-over's Assign/Close/"ส่งต่อ Admin" buttons were decorative.** None had an `onClick`;
   there was no way to actually manage a ticket from `/support/panel` (the older
   `/support/tickets/[id]` page was the only functional path). Wired all three to the existing
   `POST /api/support/tickets/:id/assign` and `PATCH /api/support/tickets/:id/status` endpoints,
   reusing the same `AGENT_NEXT_STATUS` transition map as `/support/tickets/[id]/page.js` so each
   button only appears when the current status legally allows it (e.g. Close is hidden on
   `IN_PROGRESS`, which per `ticketState.js` must go through `PENDING_USER`/`RESOLVED`/`ESCALATED`
   first). Assign is hidden once a ticket has an assignee. Both the open slide-over and the underlying
   table refetch after a successful action; errors surface inline instead of failing silently.
   Verified live end-to-end: assigned an unassigned NEW ticket, then closed it, confirming table +
   slide-over state and the "no further actions" fallback on `CLOSED`.

Not addressed (found in the same review, intentionally left alone pending explicit direction): the
Dispute slide-over's "ส่งเรื่องให้ Admin (Escalate)" button calls `handleDecision("ESCALATE")`, but
`disputeService.js`'s `DECISIONS` only allows `APPROVE_REFUND`/`REJECT` — backend will 400 it. The
Dispute chat sub-panel also still shows fabricated placeholder message content (reusing the dispute's
`reason` field as a fake buyer bubble plus a canned agent reply) — cosmetic-only, not wired to any real
data, consistent with the `CSS-001` Live Chat deferral above.

**Next action:** None blocking — Core is feature-complete for this round. Follow-ups if picked back up:
SLA breach notifications to a team lead (WF-10 step 3's "แจ้งเตือนหาหัวหน้าทีม" is only a status flip
today, no actual notification channel exists yet), `CSS-001` Live Chat per the deferred spec, and the
two known-but-unaddressed issues noted directly above (dispute Escalate button, dispute chat
placeholder content)
