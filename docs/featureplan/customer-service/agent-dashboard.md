## Rounded chart and icon refinement (10 October 2026)

Metric icons are now 24×24 SVG symbols inside centered fixed-size backgrounds, eliminating font-baseline alignment differences. The historical line chart uses bounded cubic interpolation through every original daily point, including the shaded area; control points stay within each adjacent pair's value range to avoid overshooting peaks or dipping below zero. Dashed Dispute and solid Ticket identity, values and interactions are unchanged.

The priority donut uses SVG arcs with rounded ends and small gaps. Arc length still derives from each priority count; small slices reduce stroke width to avoid oversized caps, and single/empty datasets retain a continuous ring. Center text remains inside the ring hole. Live checks verify all three icon centers and unchanged API/table totals. 21 frontend tests passed, including curve bounds and exact daily endpoints.

## User-requested demo cases (10 October 2026)

Added 32 Ticket cases (20 resolved history, 8 assigned open, 4 unclaimed) and 20 Disputes (14 assigned, 6 unclaimed) to local runtime databases for visual inspection. These use deterministic preview IDs and the subject/reason/product-title prefix [ทดลอง Dashboard]. Associated mock orders clone only demo product/customer identity; no payment, inventory, external notification or production service actions are invoked. Conversation messages are fixture records with public customer/staff roles so the awaiting-reply metric uses real Chat data. Historical receipt/completion events cover 14 days and use the corresponding effective Ticket SLA policies.

Verified current dashboard: 24 assigned open cases, 4 overdue, 12 awaiting reply and 10 unclaimed. All four priority levels appear. Every personal open/overdue/reply count matches the actual filtered table API. Screenshot: ui-verification/agent-overview-demo-cases.png.

Manifest: tmp/dashboard-preview-manifest.json. Cleanup is prepared in tmp/remove-dashboard-preview.cjs and has NOT been run; it deletes only manifest IDs after checking preview labels and matching conversation contexts. Run it only when the user requests removal of this fixture set.

## Visual redesign: focused agent overview (10 October 2026)

The dashboard now uses AgentOverview.module.css, preserving the previous stylesheet for the older unused chart components. Three summary cards use a consistent type/spacing system, with a restrained red overdue state, evergreen reply card and neutral unclaimed queue. Source counts replace decorative composition bars; arrows show that cards open tables. The daily receipt graph is the main wide panel, with lightly shaded areas beneath the original series and unchanged values/toggles. A slimmer priority ring and a 2×2 grid of actionable priority counts form the narrower side panel. The shared date dropdown remains unchanged. All data fetching and navigation scopes are preserved.

Verified: 19 frontend tests, ESLint and production build pass. Live browser/API interactions and screenshot checks pass at 1280×720, 1366×768, 1440×900, 1920×1080, plus mobile without horizontal overflow. Browser-only fixtures verify empty data and a fifth legacy priority level; no production data was altered. Final default 14-day screenshots: ui-verification/agent-overview-redesign-1366.png and agent-overview-redesign-1920.png.

## Adaptive screen proportions (10 October 2026)

The CS dashboard now uses the workspace width instead of the general 1280px content cap. Chart panels flex to the remaining viewport height, ending at the same bottom edge; the line plotting area caps at 460px to keep its shape readable. Cards, typography, priority circle and legend scale at larger desktop sizes. No additional metrics were added to fill space. Live browser checks verify no overflow and panel bottoms within 35px of the main viewport at 1280×720, 1366×768, 1440×900 and 1920×1080; mobile remains stacked. Reply/priority/deadline table links continue to pass.

## Live awaiting-reply summary and compact chart layout (10 October 2026)

Added งานที่รอฉันตอบ between งานของฉันเกินกำหนด and งานที่ยังไม่มีคนรับ. Each service queries only the signed-in agent's eligible open cases and requests a token-gated batch Chat summary in groups of 200. Chat checks ACTIVE SUPPORT / DISPUTE_BUYER / DISPUTE_SELLER rooms, takes the newest non-deleted public human message ordered by createdAt and ID, and considers a customer sender as awaiting reply. Internal notes and system messages do not clear or create waiting work. Either Dispute party waiting counts that case once. Dashboard aggregates reply IDs against current ownership on its SQL snapshot. Queue work=reply uses the same eligible ID set before pagination; links open the real table with that filter. Chat failures show a disabled dash rather than a false zero.

Desktop charts have a bounded 300–390px height instead of stretching to fill the page. The line chart uses integer ticks suited to the actual maximum, and keeps Ticket/Dispute styling. Mobile remains stacked. Headings stay short, without secondary explanatory captions.

Verified against live services: one real assigned Dispute awaits reply, and its filtered table count matches. MongoDB fixture verification passes staff reply, internal/system/deleted-message handling, locked-room exclusion and two-party deduplication; temporary fixture rooms/messages were removed afterward. Frontend tests and backend/API scope tests pass; desktop/mobile browser verification passes.

## Dashboard drill-through to actual tables (10 October 2026)

Removed the expandable case preview from the agent dashboard. Deadline/claim cards and priority donut levels now navigate to the existing Ticket or Dispute table (view=table) with scope, work, priority and SLA ordering; selected case, search, status and pagination are reset. A group with one nonzero source navigates directly. Mixed or empty groups use a native modal containing two source links and counts, with Escape/cancel and keyboard focus managed by the dialog.

Both queue APIs accept validated work filters open/overdue/soon before pagination. Open work excludes completed cases; deadlines use the active pending Ticket SLA target or current Dispute slaExpiresAt, including the same configured warning minutes. Rows and totals share the filter. The table exposes the active work filter and allows clearing it with the other filters.

Verified: frontend navigation/filter tests, backend queue filter tests, ESLint and production build passed. Live browser/API checks confirm priority and overdue drill-through counts match the dashboard, no duplicate preview remains, and the desktop/mobile overview still fits.

## Agent overview: distinct purposes (10 October 2026)

The main overview restores the original daily receipt line chart (Ticket and Dispute, 7/14/30 days). Source toggles affect only the historical lines. Receipt totals count distinct cases within each day; a case received again on another day can be counted again. Ticket resolved and Dispute escalated outcomes retain separate labels within that same period.

Three cards show personal overdue work, personal due-within-warning work, and unassigned work available to claim. The priority donut shows stored priority for only the signed-in agent's still-open cases, combining both domains; four supported levels remain visible at zero, with legacy CRITICAL shown when present. The API now returns personal.priorities from my_cases on the same SQL snapshot. Validation requires priority totals to match personal open counts. Priority clicks filter the server-side personal list, while deadline and queue cards reset priority so their counts match the opened group.

The age chart and SLA donut are removed from the main view to avoid repeated deadline summaries. Age since creation appears beside each case reference in the expandable list. Default desktop overview keeps the case list collapsed.

Validation: 18 frontend tests and 5 backend/API/PostgreSQL tests passed; ESLint and the production build passed. Live API/browser verification passed at 1440×900, 1366×768 and 1280×720 with the collapsed overview fitting the main viewport; mobile 390×844 has no horizontal overflow. Screenshots: ui-verification/agent-dashboard-priority-trend-*.png.

# CS agent operational dashboard

Aging/priority readability adjustment: paired thin bars and slash-separated values
are replaced with thicker stacked total bars and explicitly headed Ticket/Dispute
number columns. Zero values remain visible. The axis now measures total cases in
each category, while segments and columns preserve per-type counts. Status rows
and received-work trend retain their existing semantics. Verified with live/demo
data, a dense browser fixture, SVG bounds checks and 12 dashboard tests.

## Current UI quality revision

Overview remains a combined summary, with current counts ordered as open cases,
mine, unassigned and overdue. The period selector explicitly applies to historical
trend, while current cards and distributions remain snapshots. The layout uses a
wide received-work trend beside status, then aging and priority comparisons.
Ticket and Dispute colors remain consistent; labels, units, full accessible chart
descriptions, hover/focus tooltips and visible all-lines-hidden/empty explanations
are included. Zero-count priority categories are omitted from the distribution.

Charts measure their actual containers with ResizeObserver; text uses pixel-sized
labels rather than being shrunk by SVG aspect-ratio scaling. Label truncation retains
the full label in SVG title/description. Paired bar counts use a consistent Ticket /
Dispute order and single-source status rows show one total. The default overview fits
1280x720, 1366x768 and 1440x900; smaller/mobile screens and expanded details scroll.

Refreshes preserve a complete previous snapshot. New case filters clear the previous
list while loading without blanking the summary. During a new period load the chart
continues to identify its previous period accurately. Snapshot identity is checked
against the current user and token; response shapes are validated before rendering.
Initial loading uses a reduced-motion-aware skeleton. Partial/malformed responses
never become a false combined count.

Verification: 12 dashboard tests plus 5 CaseWorkspace tests passed, targeted ESLint
and production build passed. Live browser smoke passed with local demo services,
three desktop resolutions and mobile. Browser-only dense fixtures exercise six
status rows and all five priorities without modifying live records; SVG text bounds
were checked programmatically and screenshots inspected. Build still reports the
repository's existing multiple-lockfile and Next ESLint-plugin configuration warnings.
The dense-fixture screenshot is validation material, not live dashboard data.
Full-system production load testing and business acceptance remain separate checks.

The chronological sections below describe earlier design iterations.

Current UI restored to the combined summary layout at the user's request:
four KPI cards, received-work trend, status, aging and priority charts.
The decision-first alert banner below describes a reverted experiment.
Container-measured SVG sizing and desktop viewport-fit fixes are retained.

## Decision-first hierarchy

The opening insight now selects the highest-priority current condition:
overdue SLA, then due soon, then unassigned, then no outstanding alert/empty.
It shows exact Ticket/Dispute breakdown and a button filtering that condition.
Context metrics are a compact secondary strip. Backlog aging is the main chart,
status is supporting context, and received-work trend is visually secondary.
Priority distribution is omitted from the overview to reduce competing messages.
This layout remains within a desktop viewport at 1366x768 and 1440x900;
expanded details and mobile use scrolling. Eight frontend tests and live-browser
checks passed, including the insight-to-overdue-list action.

## Combined overview — current UI

Ticket and Dispute now load together on the first screen; there are no domain tabs.
Each KPI shows a combined case count with separate Ticket/Dispute subtotals.
The primary trend compares received Ticket vs received Dispute cases per day.
Legend buttons toggle these two lines only, without changing KPI scope or other charts.
Ticket resolutions and Dispute escalations are displayed as separately labelled outcomes.
Status rows retain each domain's status names. Aging and priority use paired bars
with consistent blue Ticket / purple Dispute colors.

Both service responses must succeed before publishing a new combined snapshot.
A first-load source failure shows an error without false totals. A refresh failure
retains the previous complete snapshot with a stale warning. Each source's asOf
timestamp is displayed separately; this is not a cross-database atomic snapshot.

The collapsed detail preview combines each source's first eight SLA-ordered rows,
sorts them and shows at most six. Separate queue links open each full source queue;
the preview is not presented as unified cross-source pagination. Case links retain
the source domain and clear stale workspace filters.

Verified: seven combined-dashboard frontend tests, targeted ESLint, production
build and live desktop/mobile smoke (both sources, legend toggles, period filter,
case navigation). Screenshots: `ui-verification/agent-dashboard-combined.png`
and `ui-verification/agent-dashboard-combined-mobile-charts.png`.

Earlier sections below record the prior UI and backend contract evolution.

## Visualization revision — 2026-10-09

The primary content is now four charts after compact KPI cards:
daily personal activity, current workload status, backlog aging and priority.
The paginated case list is collapsed below the charts; KPI clicks expand it.
Historical periods are 7, 14 (default), or 30 days; current backlog always remains a current snapshot.

Ticket historical activity counts assignments to the agent and RESOLVED transitions
performed by that agent, using assignment/status history, including cases no longer open.
Dispute activity counts CLAIM and ESCALATE events performed by the agent, using audit logs.
Dispute escalation is explicitly labelled sending to Admin, never resolution/decision.
Each series counts distinct case IDs per Bangkok calendar day; repeat events for a case
in the same day count once, and a case appearing on multiple days counts on each day.
Dates without activity are zero-filled; today ends at the snapshot timestamp.
Historical aggregates contain the agent's own events only, independent of current case ownership.
No historical case content is exposed by this query.

The contract additionally includes `days`, `trend` and `priorities`, with a validated
`days=7|14|30` query parameter. Line-chart points support keyboard focus and tooltips;
charts provide accessible text summaries, units and labelled scales.

Revision verification: 4 Node unit/HTTP tests, the real PostgreSQL integration test,
7 frontend tests, targeted ESLint and production build passed. Live local API/browser
smoke verified four charts, collapsed detail list, filters, case navigation and mobile
overflow. Updated desktop/dispute/mobile screenshots are in `ui-verification`;
`agent-dashboard-mobile-charts.png` captures the responsive chart view.

Implemented 2026-10-09. Entry: `/workspace?section=dashboard` for the
`CUSTOMER_SERVICE` workspace role. Admin and Trust & Safety retain their existing dashboard.

## Scope and definitions

- Ticket and Dispute are separate tabs; their counts are never summed as unique customer issues.
- Ticket scope: NEW, ASSIGNED, IN_PROGRESS, PENDING_USER; own active assignment or no active assignment.
- Dispute scope: OPEN, NEEDS_INFO; own assignment or unassigned, with assigned role NULL or CUSTOMER_SERVICE.
  Admin/T&S queues are intentionally excluded even when their summaries may be readable elsewhere.
- Cards and distributions summarize the full eligible population, not a page of queue results.
- Overdue: earliest outstanding SLA deadline <= snapshot time. Multiple outstanding ticket SLA targets count once.
- Due soon: snapshot time < deadline <= snapshot time + 60 minutes. This is a warning window, not a new SLA policy.
- Mine includes cases awaiting customer information. Waiting time is not paused.
- Aging: elapsed time from original case creation, with buckets <24h, [24h,72h), >=72h.
- Resolved/closed/decided and escalated cases do not count as open work. A decrease is not a resolution count.
- Existing case claim, access, assignment and workflow checks remain authoritative when opening a case.

## Data contract

Authenticated GET `/api/support/tickets/agent-dashboard` and
`/api/orders/disputes/agent-dashboard`, available only to accounts holding CUSTOMER_SERVICE.
Identity comes from the verified session; query-string user IDs cannot change scope.

Parameters: `focus=all|overdue|soon|unassigned|mine|waiting`, `page=1..999999`.
Eight rows per page. Each service uses one PostgreSQL statement/snapshot for counts,
status distribution, aging and the selected page. No messages or attachments are read.
Order timestamp columns are interpreted as UTC; Support columns are timestamptz.
Responses use `Cache-Control: private, no-store`.

Payload: `asOf`, `warningMinutes`, `counts`, `statuses`, `aging`, `total`,
`page`, `pageSize`, `items`. Rows sort by outstanding deadline, priority score,
creation timestamp and ID. Counts/distributions do not change with focus; the list does.

## UI behavior

- Card clicks filter the paginated action list. Open case clears stale workspace filters and selects the exact case.
- Refresh on mount, on returning to the tab, manually, and every 60 seconds while visible.
- Requests time out after 15 seconds, do not overlap within the active view, and abort on navigation.
- A refresh error preserves the previous snapshot with an explicit stale warning; an initial error never displays zero counts.
- Display timestamps in Asia/Bangkok. SLA remaining time is explicitly relative to the displayed snapshot.
- Switching Ticket/Dispute resets filters. Empty state, mobile wrapping and keyboard focus are supported.

## Verification

Node tests cover role/identity/input validation and HTTP route authorization.
PostgreSQL integration test uses transaction-local temporary tables (no persisted fixture writes):
60 cases, ownership exclusions, terminal states, multiple SLA targets, boundary times,
historical assignment, age buckets, deterministic pagination and separate dispute permissions.
Set DATABASE_URL_DASHBOARD to a disposable database and REQUIRE_INTEGRATION=1 to run.
Frontend tests cover exact-case navigation, filters, domain switching, initial errors/retry,
stale refresh, empty results and timer cleanup.

Production load/latency acceptance and business acceptance of the 60-minute warning window
remain environment-specific checks. No new migration, seed or SLA business-rule change is required.

### Recorded verification (2026-10-09)

- Four Node unit/HTTP authorization tests passed.
- PostgreSQL integration test passed without skips on the local disposable database,
  using only transaction-local temporary fixtures.
- Eleven frontend tests passed across AgentDashboard and CaseWorkspace.
- Targeted ESLint and production Next.js build passed. Build reports existing
  multiple-lockfile and Next ESLint-plugin configuration warnings.
- Live local gateway/API + headless Chrome smoke passed: demo CS identity,
  Ticket and Dispute data, warning-window filter, selected dispute navigation,
  1440px desktop and 390px mobile, no horizontal page overflow or browser runtime errors.
- Screenshots: `ui-verification/agent-dashboard-desktop.png`,
  `ui-verification/agent-dashboard-disputes.png`, `ui-verification/agent-dashboard-mobile.png`.
- Local Support/Order containers rebuilt with the existing runtime Compose override;
  startup ran server commands only (no seed or migration).
# Personal SLA donut — 2026-10-10

แทนกราฟสถานะรับเรื่องแล้ว/รอข้อมูลด้วยโดนัทงานของฉันตามกำหนด SLA: เกินกำหนด (แดง), ใกล้ครบภายใน warningMinutes (เหลืองอำพัน), ยังมีเวลามากกว่า warningMinutes (เขียว), ไม่มีกำหนดที่ต้องติดตาม (เทา) ตัวเลขกลางวงเป็นงานของฉันที่ยังไม่จบ ยอดทั้งสี่กลุ่มเท่ากับงานของฉันทั้งหมด ไม่รวมคิวรอรับ

API เพิ่ม personal.withoutDeadline จาก due_at IS NULL ใน snapshot เดียว กลุ่มยังมีเวลา = all − overdue − soon − withoutDeadline จึงไม่รวม deadline ที่หายไปไว้ในสีเขียว Frontend ตรวจจำนวนไม่ติดลบและยอดรวมก่อนแสดง ปุ่มกลุ่มเปิดรายการส่วนตัวผ่าน focus mine_overdue / mine_soon / mine_safe / mine_no_deadline ที่กรองฝั่ง server ก่อนแบ่งหน้า

กรณีไม่มีงาน วงเป็นสีเทาอ่อนและแสดง 0 ไม่สร้างสัดส่วนปลอม กรณีทุกงานเกินกำหนดวงแดงทั้งหมดตามข้อมูลจริง พร้อมชื่อและจำนวนของทุกกลุ่มรวมกลุ่มศูนย์เพื่อไม่ใช้สีอย่างเดียวในการสื่อความหมาย

Validation: 5 backend tests รวม PostgreSQL และขอบเขต 60 นาที/60 นาทีบวกหนึ่งวินาที/ไม่มี active deadline; 17 frontend tests รวมการแยก deadline ที่หายไปจากงานมีเวลา และ empty state; ESLint / production build ผ่าน ตรวจ APIจริง การกดกลุ่มดูรายการ และหน้าจอ 1440×900, 1366×768, 1280×720, mobile ผ่าน

ภาพข้อมูลจริง: `ui-verification/agent-dashboard-sla-donut-1366.png`; ตอนตรวจมีงานของฉัน 2 เคสและเกิน SLA ทั้งสอง จึงเป็นวงแดงเต็ม ไม่เปลี่ยน priority หรือ deadline ของเคสเพื่อทำให้กราฟมีหลายสี

## Previous personal dashboard — 2026-10-10

หน้าหลักเปลี่ยนเป็น "งานของฉัน" สำหรับ CS ที่กำลังทำงานจริง:

1. การ์ดเรียงงานฉันเกิน SLA, งานฉันใกล้ครบ SLA, งานฉันที่ยังไม่จบ, คิวที่รับเพิ่มได้ ยอดสามใบแรกเฉพาะเจ้าหน้าที่ปัจจุบัน ใบสุดท้ายเฉพาะไม่มีเจ้าหน้าที่รับ รายการเริ่มต้นเป็นงานฉัน ไม่ใช่รวมคิว
2. เรื่อง SLA อยู่บนสุดและใช้สีเตือนเมื่อมีงานผิดกำหนด ชื่อ/คำอธิบายระบุว่าเป็นของฉันและใกล้กำหนดในกี่นาที คิวรับเพิ่มแสดงจำนวนเกิน SLA ของคิวไว้ในคำอธิบายเมื่อมี เพื่อไม่ซ่อนความเสี่ยงของงานที่ยังไม่มีคนรับ
3. กราฟสถานะงานของฉันมีรับเรื่องแล้วและรอข้อมูลเพิ่ม กราฟอายุงานที่ฉันถืออยู่ระบุชัดว่านับตั้งแต่เปิดเคส รวมรอข้อมูล ทั้งคู่ไม่รวมคิวที่ยังไม่มีคนรับ และรวม Ticket/Dispute เป็นสองสีในแถบเดียว
4. ระดับความสำคัญย้ายไปตัวกรองของรายการเคสและป้ายแต่ละเคส รายการย่อพับไว้ กรองฝั่ง server ก่อน paginate ไม่กรองจากแค่หกรายการที่โหลดมา
5. ประวัติรับงานย้อนหลังพับอยู่ส่วนรอง ตัวเลือกวันอยู่ในส่วนนี้พร้อมคำอธิบายกิจกรรมย้อนหลัง แยกจากงานค้างปัจจุบัน และระบุการนับซ้ำต่างวัน ผลลัพธ์ของ Ticket ระบุว่า "บันทึกว่าแก้ไขแล้ว" พร้อมคำอธิบายว่าไม่รวมการปิดโดยตรง

API เพิ่ม personal.counts / personal.workflow / personal.aging ใน SQL snapshot เดียวของแต่ละ source และเพิ่ม focus mine_overdue / mine_soon ตัวกรอง priority ตรวจ code ที่รองรับและ bind parameter ข้อมูลภาพรวมเดิมยังอยู่สำหรับ client เก่า แต่ UI ใหม่ใช้ personal เฉพาะงานฉัน กราฟไม่เปลี่ยนขอบเขตเมื่อกดดูคิวหรือกรองรายการ

Validation: 5 backend tests รวม PostgreSQL temporary tables, 17 frontend tests รวมคิว unassigned ที่เกิน SLA ไม่เพิ่มยอดของฉัน และตัวกรอง priority ส่งทั้งสองแหล่ง; ESLint / Next production build ผ่าน ตรวจ API และหน้า localhost ด้วยข้อมูลจริงที่ 1440×900, 1366×768, 1280×720 และ mobile 390×844 ผ่าน หน้าสรุปพอดีจอ desktop ประวัติ/รายการขยายแล้วเลื่อนได้ตามปกติ

ภาพล่าสุด: `ui-verification/agent-dashboard-personal-1366.png` และ `ui-verification/agent-dashboard-personal-mobile.png` รันตรวจด้วย `tmp/cs-personal-dashboard-smoke.cjs` ระหว่างงานกู้ Docker Desktop ที่หยุดอยู่และเริ่มเฉพาะ container โปรเจกต์นี้ก่อนอัปเดต Support/Order ด้วย runtime override ที่ไม่ reseed ข้อมูลเดิม

## Previous priority-row iteration — 2026-10-09

กราฟความสำคัญแสดงครบสี่ระดับปัจจุบันเสมอ: ด่วนที่สุด สูง ปานกลาง ต่ำ ระดับที่ไม่มีเคสแสดงชื่อ แถบพื้นว่าง และ 0 เคส ไม่ตัดแถวทิ้ง ระดับ CRITICAL แบบเก่าเพิ่มเฉพาะเมื่อมีข้อมูลจริง เพื่อไม่สร้างระดับที่ไม่มีในนโยบายปัจจุบัน กราฟขั้นตอนงานยังแสดงครบสามขั้น และอายุงานครบสามช่วง รวมเมื่อเป็นศูนย์

## Common workflow instead of raw status comparison — 2026-10-09

กราฟสถานะเลิกเทียบ `Ticket · มอบหมายแล้ว` กับ `Dispute · รอตรวจสอบ` ซึ่งมาจากสถานะคนละระบบ ใช้สามขั้นตอนร่วมจาก snapshot ฝั่ง server:

- รอรับเรื่อง: ไม่มีเจ้าหน้าที่รับ และไม่ได้รอข้อมูล
- รับเรื่องแล้ว: มีเจ้าหน้าที่รับ และไม่ได้รอข้อมูล หมายถึงการรับ/มอบหมาย ไม่อ้างว่าเริ่มตรวจจริง
- รอข้อมูลเพิ่ม: Ticket PENDING_USER หรือ Dispute NEEDS_INFO โดยนับขั้นนี้ก่อนเงื่อนไขเจ้าของงาน

แต่ละเคสอยู่ในหนึ่งกลุ่มเท่านั้น รวมสามกลุ่มเท่ากับ counts.all กลุ่มทั้งหมดรวม Ticket/Dispute ในแถบเดียวพร้อมสีแยก และรวมเคสศูนย์เพื่อเห็นขั้นตอนครบ Frontend ตรวจครบสามกลุ่มและยอดรวมก่อนแสดง; ไม่คำนวณจากรายการเคสแค่หน้าแรก API เก็บ statuses เดิมไว้เพื่อ backward compatibility และเพิ่ม workflow

ตรวจ PostgreSQL temp tables รวมกรณีรอข้อมูลแต่ไม่มีเจ้าของงาน: 5 backend tests ผ่าน; 15 frontend tests ผ่าน; ตรวจข้อมูลจริงและ dense fixture ที่ 1440×900 / 1366×768 / 1280×720 และ mobile ผ่าน ไม่มีแถวล้น กฎ role/scope และ SLA เดิมคงไว้ ภาพล่าสุด `ui-verification/agent-dashboard-workflow.png`

## Previous stacked-bar iteration — 2026-10-09

Ticket ใช้ brand-900 เขียวเข้ม และ Dispute ใช้ brand-400 เขียวมิ้นต์ ให้ความเข้มต่างกันชัดในโทนเว็บเดียวกัน ตัวอักษร Dispute ยังคง brand-700 เพื่อให้อ่านบนพื้นขาวได้ชัด เส้น/แถบมิ้นต์มีขอบเขียวเข้มกำกับ

แถบอายุงานและความสำคัญแบ่ง Ticket ทางซ้ายและ Dispute ทางขวาในแถบเดียว ขนาดแต่ละส่วนเป็นสัดส่วนจำนวนจริง ยอดรวมยังอยู่ปลายแถบ พร้อม legend ชื่อประเภทใต้กราฟ ชี้ กด หรือ Tab เพื่อดูจำนวนแยก เคสศูนย์ไม่แสดงส่วนสีที่ไม่มีข้อมูล

ตรวจด้วยข้อมูลจำลอง 34 Ticket + 10 Dispute ว่าสัดส่วนที่ render ตรง 34/44 และ 10/44; ตรวจ desktop/mobile รวมครบห้าระดับ ไม่มีแถวล้นกรอบ Frontend 14 tests และ ESLint ผ่าน ภาพข้อมูลจริงล่าสุด: `ui-verification/agent-dashboard-green-stacked.png`; `agent-dashboard-dense-fixture.png` เป็นข้อมูลจำลองสำหรับ QA เท่านั้น

## Previous combined-bar iteration — 2026-10-09

ใช้ brand tokens สีเขียวของเว็บ: Ticket brand-900 เส้นทึบ, Dispute brand-600 เส้นประ; ข้อความ Dispute ใช้ brand-700 เพื่อให้อ่านชัดบนพื้นขาว ป้ายประเภทใช้ brand-50 และสีเตือน SLA คงความหมายเดิม

อายุงานและความสำคัญเปลี่ยนเป็นแถบยอดรวมต่อหมวด พร้อมจำนวนเคสปลายแถบ ไม่มีส่วนแบ่งสี/คอลัมน์ Ticket กับ Dispute ที่ต้องอ่านพร้อมกัน ป้ายรวมทุกประเภทแสดงแม้จอเตี้ยซ่อนคำอธิบาย ชี้ กด หรือ Tab เพื่อดูรายละเอียดประเภทใต้กราฟ กดเลือกค้างได้และ Escape ปิดรายละเอียด ยอดรายละเอียดอ่านจากข้อมูลรอบล่าสุดหลัง polling

ตรวจหน้าจอจริง desktop 1440×900, 1366×768, 1280×720 และ mobile 390×844; ตรวจข้อมูลจำลองครบห้าระดับที่ 1366×768 และ 1280×720 ไม่มีแถวล้นกรอบ ปรับพื้นที่กราฟล่างให้พอแทนการลดขนาดตัวอักษร Frontend tests 14 ผ่าน, ESLint และ production build ผ่าน

ภาพล่าสุด: `ui-verification/agent-dashboard-green-total.png` และ `ui-verification/agent-dashboard-green-breakdown.png`; ภาพข้อมูลจำลองเป็นการทดสอบใน browser ไม่มีการเปลี่ยนข้อมูลจริง

## Previous palette experiment — 2026-10-09

Ticket ใช้น้ำเงินเข้ม `#1e3a5f`; Dispute ใช้ส้มอมน้ำตาล `#b45309` แทนฟ้า/ม่วง ใช้ palette กลางเดียวกันสำหรับเส้น แถบ ตัวเลข legend และป้ายประเภทเคส คง label ชื่อประเภทและรูปแบบเส้นเดิมเพื่อไม่อาศัยสีอย่างเดียว

ตรวจภาพจาก localhost 1440×900 แล้ว: `ui-verification/agent-dashboard-navy-amber.png`; contrast ของข้อความบนพื้นหลังที่ใช้จริงอยู่ที่ 4.62–11.50:1 ไม่มี browser runtime error รูปแบบ bar และข้อมูลยังเหมือนเดิม แนวทางเสนอถัดไปคือ bar ยอดรวมต่อหมวด พร้อมรายละเอียดประเภทเมื่อดูเพิ่มเติม เพื่อลดการแยกสีซ้ำทุกแถว
