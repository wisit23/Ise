# Demo seed review fixes (findings #1 and #2 of support-service/sonnet-review.md)

Scope: `scripts/demo-cs-admin.js` (+ test) and the Support `ticketModel.assign` / `transitionStatus` signatures. No commits, no `.env`, no compose DB writes, no frontend.

## Parent-confirmed findings and disposition

| Finding | Disposition |
| --- | --- |
| #1 `assign` stamped real "now", then the demo closed at `daysAgo(0.5)` → `ended_at < assigned_at` violates `assignment_time_window` | Fixed. `assign` accepts optional `assignedAt` (default `new Date()`, so ordinary callers are unchanged). Demo passes the midpoint between ticket creation and the later status change, so history and assignment stay in order for tickets 2–4. |
| #2 demo's `localComposeUrl` Support client ignored by `assign`/`transitionStatus` | Fixed. Both take an optional second `client` argument (default module client), same pattern as `create(data, client)` / `setConversationId`. Demo passes its `support` client. `ticketService` callers are untouched. |

Not changed: other review findings (#3–#6), `escalateOverdue`, `reassign`, public API/controllers, runtime defaults.

## Evidence (disposable PG `ise-er-rehearsal-20261014`, localhost:55439, db `support_live_er`)

New `backend/services/support-service/test/historical-assignment.integration.test.js`. It points the module-level client at an unreachable port, so any call that ignores the injected client fails.

- Explicit client + `assignedAt` (3d created, 2d assigned, 12h closed): assign and close succeed; stored `assignedAt`/`endedAt`/ASSIGNED history match the given times.
- Without `assignedAt`: assignment time is the current time (default preserved).
- Old demo order (assign now, close 12h ago): rejected with `assignment_time_window` (reproduces finding #1 on a real DB).
- Test rows are deleted after each test.

Commands run: `DATABASE_URL_SUPPORT=…/support_live_er node --test --test-concurrency=1` on the new test + `ticketModel.test.js`, `ticketService.test.js`, `chatOwnership.test.js` → 24 pass, 0 fail; `node --test scripts/demo-cs-admin.test.js` → 3 pass (it now also checks the demo passes `assignedAt` and `support` to both calls; this is a source check only).

## Limits

- Full `demo-cs-admin.js --apply`/reset was not run (explicitly out of scope). The demo's new call sites are verified by the model-level DB test with the same argument shapes, not by executing the demo.
- Escalated demo ticket (`systemEscalation`) uses the same `transitionStatus` path; not separately run.
