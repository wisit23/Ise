# Customer Service UI implementation and verification

Implemented 2026-10-08. This report supplements `ui-unification-ai-handoff.md` and records actual implementation and validation, not production deployment certification.

## Result

- Tickets and Disputes remain separate menus. Both use the Ticket queue/chat pattern and the same conversation/table mode control.
- Table search, scope, status, priority, sorting, pagination and selected case share one state owner with conversation mode. `เปิดเคส` opens the same workspace.
- Disputes has separate private buyer and seller rooms with explicit recipient names. The selected recipient changes only after joining succeeds. Sending/uploading prevents switching the recipient or mode mid-operation.
- Draft text survives switching cases, parties, sections and reload within the session. Files are retained in memory while navigating, not serialized into browser storage. Logout/account changes clear drafts and reject late writes from the old account.
- Context is optional: docked when the actual workspace is wide enough; otherwise an accessible drawer. Mobile shows the selected case with a back-to-queue control.
- The workspace presents current server detail and capabilities. Unassigned CS cases require claiming; closed cases and privileged audit rooms are read-only. Internal notes are excluded from public transcripts.
- SLA uses active/completed/unknown semantics. Closed history no longer counts down an expired deadline. A single shared clock updates visible SLA labels.
- Escalation, reassign and verdict confirmation await the server; failures retain form data. Financial retries retain a frozen payload and idempotency key. Existing money effects and ownership/CAS guards remain in the domain services.
- Evidence is fetched through authenticated endpoints on selection. Inspection supports buyer/seller grouping and comparison, explicit access errors, and blob URL cleanup.
- Eligible staff search is resource-authorized, paginated, limited to active allowed staff, and revalidated by the mutation. Display names are batched through an internal Auth contract with honest ID fallback.

## Code ownership

`frontend/components/support/workspace/CaseWorkspace.js` owns shared presentation and operation dialogs. `useCaseWorkspace.js` owns queue/detail requests, URL restoration, stale-response guards and committed mutation reconciliation. These implement the planned state/controller responsibilities without introducing separate per-mode fetch owners.

`CaseContextPanel`, `EvidenceInspector`, `StaffReassignDialog`, `EscalationMemoDialog` and `SlaIndicator` isolate their respective UI concerns. `TicketsSection` and `DisputesSection` adapt domain props. Existing Admin/requester detail consumers are preserved.

`frontend/lib/caseDrafts.js`, `MessageComposer`, `EmbeddedChat`, `MessageList`, `Modal`, `apiFetch` and `workspace/page.js` integrate drafts, safe room lifecycle, sender labels, focus management, HTTP error metadata and navigation. Upload feedback is indeterminate because the current transport does not report progress or support pause/cancel.

Backend additions are additive workspace projections and guards in Support/Order, internal active staff search in Auth, and `backend/shared/src/staffDisplay.js`. No schema migration or new dependency is required for this UI change. Server pagination and access predicates apply before sorting/page selection; queue totals use the same predicate.

## Automated verification

| Check | Result |
|---|---|
| `npm --workspace frontend run test -- --runInBand --coverage=false` | 55 suites, 260 tests passed; no failures or skips |
| `npm --workspace frontend run build` | Production build passed; /workspace 41.2 kB, first load 186 kB |
| Changed workspace/chat/modal/API and policy ESLint scope | Passed |
| Support ticket state/service/model/policy and Order dispute ownership/chat/access/policy/queue tests | 35 passed; no failures or skips |
| Isolated Postgres integration | 21 passed; no failures or skips |

Backend focused command:

```powershell
node --test backend/services/support-service/src/features/tickets/ticketState.test.js backend/services/support-service/src/features/tickets/ticketService.test.js backend/services/support-service/src/features/tickets/ticketModel.test.js backend/services/support-service/src/features/tickets/workspacePolicy.test.js backend/services/order-service/src/features/disputes/disputeOwnership.test.js backend/services/order-service/src/features/disputes/disputeChat.test.js backend/services/order-service/src/features/disputes/disputeChatAccessRoutes.test.js backend/services/order-service/src/features/disputes/workspacePolicy.test.js backend/services/order-service/src/features/disputes/disputeQueue.test.js
```

Integration runner: `node tmp/cs-host-db-tests.cjs`. It targets only `reloop_ui_support_20261008` and `reloop_ui_order_20261008` on local Postgres. It runs ticket lifecycle, normalization, dispute ownership/hold, verdict and >50-case queue tests. External Auth/Chat/Product notification transport is unavailable in that isolated run, producing expected partial-failure warnings; this is DB/CAS integration coverage, not complete multi-service end-to-end coverage.

Build warnings about multiple lockfiles and the missing Next ESLint plugin predate this change. They do not fail the build. A final label-only change from `เปิดอยู่` to `เลือกอยู่` was linted and verified in the browser after the build to avoid implying that a selected closed case was open.

## Browser verification

Used the running local app with existing authorized CS demo data. No messages, claims, transfers, escalation or verdicts were submitted. Test drafts were cleared. Existing fixtures were not reset or reseeded.

- Ticket closed history loads read-only with completed SLA; conversation and table screenshots saved.
- Dispute buyer/seller histories load separately and recipient text follows the committed room.
- Independent buyer/seller text drafts survive switching and reload; test text cleared afterward.
- Table opens the same selected workspace. Reload, section switching, Back and Forward restore the authorized view.
- The actual staff directory loads; selection dialog was canceled without mutation.
- Context drawer blocks background focus; Escape restores focus to its trigger. Wide-screen context docks without a backdrop.
- Viewports 360, 768, 1024, 1440 and 1920 were checked. Document scroll width did not exceed viewport width. Table overflow is inside its scroll container.

Screenshots in `ui-verification/`:

| File | Content |
|---|---|
| ticket-conversation.png | Closed Ticket read-only history |
| ticket-table.png | Ticket table with SLA, owner and explicit open action |
| dispute-buyer-desktop.png | Buyer private conversation |
| dispute-seller-desktop.png | Seller private conversation |
| dispute-table.png | Dispute table |
| dispute-mobile.png | Selected case on mobile |
| dispute-context-mobile.png | Mobile context drawer |
| dispute-context-desktop.png | Docked context including actual payout hold status |
| staff-picker.png | Staff directory, captured before final friendly role-label polish |

## Requirement evidence

| Requirements | Implementation / evidence |
|---|---|
| FR-01–04 | Shared workspace/controller; CaseWorkspace filter/open test; Ticket/Dispute screenshots |
| FR-05,09 | Request generations and authoritative detail; out-of-order detail test; busy switching test |
| FR-06,20 | Server workspace policy; existing ownership/chat access tests; 21 DB/CAS integration tests; financial retry test |
| FR-07 | Join-then-commit room logic and failed-switch test; browser buyer/seller histories |
| FR-08 | Draft storage/composer tests; browser independent drafts and reload |
| FR-10 | Memo/reassign failure retention tests; verdict frozen retry test |
| FR-11 | Semantic projection and SlaIndicator tests; closed Ticket screenshot |
| FR-12 | Queue/count predicate tests; real Postgres 57-case fixture pagination/access test |
| FR-13,14 | Safe names, friendly role labels, explicit action/date columns; browser directory/queue/context |
| FR-15 | Evidence authenticated comparison/access-denied/URL cleanup tests; browser empty-evidence state |
| FR-16 | Resource-authorized directory, reassign validation; dialog test and real directory load |
| FR-17 | URL validation/restoration; browser reload/Back/Forward/section restoration |
| FR-18 | Captured operation detail, queue reconciliation and partial success; claim/lock failure tests |
| FR-19 | Accessible tabs, modal/drawer focus; browser Escape focus return and responsive checks |
| NFR-01,02 | Domain authorization, internal-message visibility test, stale-response/draft/error tests |
| NFR-03–05 | Accessible controls/focus and responsive browser checks; no formal contrast audit |
| NFR-06,07 | Server pagination, batched name fetch, lazy evidence, shared request owner and SLA clock |
| NFR-08 | Existing safe service error reporting preserved; no new message/token logging |
| NFR-09,10 | Full frontend suite, backend regression suite, explicit retry/loading/partial success |

## Remaining validation before production rollout

### Follow-up UI/chat fixes — 2026-10-08

User requested reduced filter clutter, reuse of existing dropdowns, safe motion, continuous typing after send, working peer typing, image enlargement and downloads.

- Added shared `CaseFilters`: collapsed by default in both modes; small filter count, current sort summary and explicit reset. Status/priority share a row in the queue; table uses three columns on desktop. Reuses existing `RadioSelect`, with labelled triggers, click-only opening and keyboard focus return. Expanding/collapsing animates height/opacity; OS reduced-motion is respected. Table entry and docked context use brief entrance motion; existing modal/dropdown/chat animations are retained.
- Composer restores focus after a completed text/file send once the input is enabled. It does not steal focus if the user moved elsewhere. IME composition does not submit prematurely. Typing refreshes at a throttled interval, stops on idle/send/unmount, and has receiver expiry to avoid a stuck indicator.
- Fixed backend case typing: authorized case joins are tracked without joining stale conversation rooms; each sender event rechecks current writable access, and each recipient is reauthorized before user-room delivery. Events now carry `conversationId`, which receivers check. Socket event handlers register before the asynchronous initial inbox lookup; immediate client joins can no longer disappear during that lookup.
- Image attachments now open in the shared accessible Modal with Escape/focus return, and have download buttons in the transcript and viewer. Both use authenticated blob bytes. Failed image loading can retry; download failure does not discard the image preview. File downloads remain lazy.

Validation after these changes: **56 frontend suites / 264 tests passed**, changed-file lint passed, production build passed. Final dropdown keyboard polish additionally passed 5 focused suites / 34 tests and browser Escape return. Two focused backend access/broadcast tests passed. `node tmp/cs-typing-smoke.cjs` verified **CS → buyer and buyer → CS typing start/stop through the real local gateway**, without sending messages or changing ownership. Browser checked expanded shared dropdowns on desktop and 360px mobile (no horizontal page overflow). Image enlargement/download and post-send focus were verified through automated component tests; no new attachments or messages were posted to live local cases during this pass.

New screenshots: `ui-verification/filters-table-refined.png`, `filters-sidebar-refined.png`, `filters-mobile-refined.png`. Local chat-service was updated/restarted with the corrected realtime code. Existing rollout limitations below still apply.

1. Run populated image/video evidence and real upload/send failures against a representative staging environment. Local fixtures contain no evidence files; comparison/error cleanup is covered by automated mocked transport tests only.
2. Conduct manual Admin/T&S/requester acceptance testing of existing consumers with the latest build. Automated regression and DB role/CAS tests pass; this browser pass used CS only.
3. Conduct formal accessibility/contrast and multi-browser checks plus realistic queue-volume/load testing. Responsive and selected keyboard flows were verified, not a complete accessibility certification.

Local Auth/Order/Support containers were updated and restarted with their existing server-only command (`tmp/cs-ui-runtime.yml`) to avoid startup migration/seed commands. Source changes are in the repository; runtime copies are not a production release. Pre-existing staged/unstaged work remains untouched. No commit, push or deployment was performed.
