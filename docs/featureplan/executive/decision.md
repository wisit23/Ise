# Executive Feature Decision Log

> รายการนี้เป็น append-only; หากเปลี่ยนคำตัดสินให้เพิ่มรายการใหม่และอ้างถึงรายการเดิม

## CEO-DEC-001 — Vertical Executive ownership

- Date: 2026-08-10
- Status: Accepted
- Decision: Executive Owner รับผิดชอบ `UR-27`–`UR-31` แบบ vertical ตั้งแต่ UI, API, metric rules, PostgreSQL tests และเอกสาร
- Reason: ทำให้นิยาม KPI และ dashboard outcome มี Owner เดียว
- Consequence: Source metric contracts ยังต้อง review ร่วมกับ Buyer, Seller และ Marketing

## CEO-DEC-002 — Read-only analytics boundary

- Date: 2026-08-10
- Status: Accepted
- Decision: Executive Feature เป็น read-only และไม่มีสิทธิ์เปลี่ยน Product, Order หรือ Campaign state
- Reason: ลด coupling และป้องกัน dashboard กลายเป็นช่องทางแก้ข้อมูลธุรกรรม
- Consequence: Action ที่กระทบ source data ต้องส่งไปยัง owner service เท่านั้น

## CEO-DEC-003 — Owner-local aggregates

- Date: 2026-08-10
- Status: Accepted
- Decision: KPI ใช้ owner-local aggregate endpoints/events และห้าม query database ของ service อื่นโดยตรง
- Reason: รักษา data ownership และทำให้ metric trace กลับได้
- Consequence: Dashboard ต้องแสดง unavailable/partial state แทนการปลอมค่าเป็นศูนย์เมื่อ provider มีปัญหา

## CEO-DEC-004 — Security hardening deferred

- Date: 2026-08-10
- Status: Deferred
- Decision: Export/authorization/security hardening แยกไปทำหลัง Core และ Extended behavior
- Reason: ขอบเขตรอบปัจจุบันเน้น functional Feature และ database-backed acceptance
- Consequence: ห้ามรายงาน security NFR ว่า Done ในรอบนี้

## CEO-DEC-005 — GMV is the amount the buyer paid, after coupons

- Date: 2026-10-15
- Status: Accepted
- Decision: GMV, and everything derived from it (platform revenue at the 3% rate, the daily/monthly series and the CSV export), is summed from `orders.orders_amount`, not the pre-coupon `original_amount`. Platform revenue is therefore 3% of what the buyer paid.
- Reason: `orders_amount` is the amount that is actually paid (`payment.payment_amount`) and the net amount campaign attribution records, so the dashboard agrees with the money and with Marketing's figures.
- Consequence: periods that include coupon orders now read lower than they did. `meta.definitionVersion` stays `v1`: it is one constant shared by every Executive endpoint and nothing reads it, so bumping it would also relabel metrics whose definition did not change.

## CEO-DEC-006 — Rankings are built from orders, through an internal API

- Date: 2026-10-15
- Status: Accepted
- Decision: product-service no longer ranks from its own `sold` products. It asks order-service (`GET /internal/executive/product-sales`, service token only) for the completed orders per product, counted exactly like GMV, and adds the product title and category it owns.
- Reason: the rankings now add up to the GMV on the same screen. Previously they summed list prices of products marked sold, bucketed by `updated_at`, which could not agree with order amounts. Calling the owning service's API keeps CEO-DEC-003: no service reads another's database.
- Consequence: if order-service cannot answer, the ranking is unavailable (HTTP 502, shown as "ไม่พร้อมใช้งาน") rather than empty. A product that no longer exists is listed as "สินค้าที่ถูกลบแล้ว" under "ไม่ระบุหมวดหมู่". The ranking `count` is the number of completed orders. The per-product rows are not paged, which is fine at current volume but should be capped if sales grow large.

## CEO-DEC-007 — Web usage adds up the people who came on each day

- Date: 2026-10-15
- Status: Accepted
- Decision: the "ผู้ใช้งานเว็บ" card and report column are the sum, over the days of the period, of the buyers and sellers who came on each day. Staff accounts (executive, admin, customer service, trust and safety, marketing) are not counted, and neither are their sign-ups in `newUsers`: the executive cares about the marketplace's customers. An account's roles are its `user_roles` rows when it has any, else the legacy `users.role`, so a buyer promoted to staff by a role row is staff here too. Someone who returns on three days counts three times, so 3 people on day 1 and 4 on day 2 read as 7. This holds at every level: a month row is the sum of its days, and a year is the sum of its months, so one month with 2 people-days reads 2 as a month and 2 as a year.
- Reason: the executive wants to see how much the site is used in the period chosen, not how many different individuals exist. Using one rule everywhere keeps the overview, the report and every period length in agreement; counting different people per month would show 1 for a year where the month shows 2.
- Consequence: the figure is a volume, not a headcount, and the card says so under its label ("รวมรายวัน · คนที่กลับมาซ้ำนับทุกวัน"). It counts people who logged in (`login_logs`), so it is lower than real site usage: visitors who stay signed in, or never sign in, are not counted. Marketing's activity-based count (logins plus buyer activity) is the closer measure if that matters later. `GET /executive/metrics` still returns the number of different people over a window, but the dashboard does not show it. `metrics-series` with `granularity=month` now returns user-days per month instead of different people per month.

## CEO-DEC-008 — The platform fee rate is configuration owned by order-service

- Date: 2026-10-16
- Status: Accepted
- Decision: the platform fee is no longer written in the frontend. order-service reads `PLATFORM_FEE_RATE` (a fraction, `0.03` = 3%; default `0.03` until Finance confirms a fee schedule), checks it at boot (a value outside 0–1 or not a number stops the service instead of falling back), uses it to compute `platformRevenue`, and returns it as `meta.platformFeeRate` on `GET /executive/metrics` and `/executive/metrics-series`. The overview card label and the report footnote read that value; when the service is unavailable they drop the percentage instead of showing a guess.
- Reason: one source of truth. A frontend constant could drift from the rate the revenue was computed at, and changing the fee meant editing and redeploying the UI.
- Consequence: the rate applies to the whole period asked for, so changing it restates past months at the new rate; it is not a history of fees. If Finance later needs a rate per period (fee changes on a date), the rate must become dated rows in order-service's database, which needs ER approval and an admin screen. The default 3% remains an assumption, not a confirmed fee. `definitionVersion` stays `v1`: the rule is the same, only where the number lives changed.

## CEO-DEC-009 — Most popular categories replace the top-products ranking

- Date: 2026-10-16
- Status: Accepted
- Decision: the overview no longer ranks products. It shows "หมวดหมู่ที่นิยมสุด": each category's name, pieces sold, its share of all pieces sold, and the total paid, ranked by pieces sold (ties by amount paid, then name). The category share donut stays ranked by amount paid. `GET /executive/top-catalog` returns `categories` (by amount), `popularCategories` (by pieces), and `categoryTotal` (everything sold); the `products` list is gone.
- Reason: items here are second-hand and sell once, so "best-selling product" is only the most expensive item sold and nobody can act on it. Categories are what repeat, and pieces sold (popularity) and amount paid (value) can rank them differently.
- Consequence: a share is of all pieces sold in the period, not of the ranked rows, because `categoryTotal` covers every category. A sale whose product was deleted still counts, under "ไม่ระบุหมวดหมู่". Order-service's per-product sales endpoint is unchanged; product-service still needs it to map sales to categories. `definitionVersion` stays `v1`.

## CEO-DEC-010 — Sales are shown as purchases and auctions, not one total

- Date: 2026-10-16
- Status: Accepted
- Decision: the overview's "ยอดขายรวม (GMV)" card is replaced by two cards, "ยอดขายจากการสั่งซื้อ" and "ยอดขายจากการประมูล". `GET /executive/metrics` returns `gmvAuction` (completed orders with `order_type = 'AUCTION'`) and `gmvPurchase` (every other completed order), next to the unchanged `gmv`, `platformRevenue` and `completedOrders`. Both use the amount the buyer paid after any coupon, like GMV (CEO-DEC-005).
- Reason: buying now and winning an auction are different ways to sell, and the executive wants to see how much each brings in, each compared with the previous period like the other cards.
- Consequence: `gmvPurchase + gmvAuction = gmv`, always; purchases are defined as "not an auction" so an order type added later still lands in the total. There is no card for the combined figure any more, but the sales trend and platform revenue (3% of the total) still use it. The reports table and CSV are unchanged and still show the total; splitting them is a separate decision. `definitionVersion` stays `v1`: GMV is the same number, shown in two parts.

## CEO-DEC-011 — Anomaly alerts (CEO-004) are not delivered before the deadline

- Date: 2026-10-16
- Status: Accepted
- Decision: `CEO-004` (extended anomaly alerts: a rule, a worker, persisted alert fingerprint/status, notifications) stays in the Executive scope but will not be built before the submission deadline. It is recorded as not delivered, not as removed. What ships for `UR-30`/`FR-6.2.1` is the repeat-complaint warning on the complaints page. In `plan.md` the task now points at `auth-service` (the old `review-service` no longer exists), as does `CEO-005`.
- Reason: the alert system needs a new table and a background worker, which needs ER approval, and there is not enough time left to get that and build it.
- Consequence: nothing in the dashboard promises alerts. The warning banner is computed on request from complaints at or above `EXECUTIVE_REPORT_ANOMALY_THRESHOLD` and stores no state, so a complaint count that falls back below the threshold simply clears it. Reviewers must not read `CEO-004` as Done; picking it up later needs ER approval first.

## CEO-DEC-012 — The server decides what an Executive audit entry says

- Date: 2026-10-16
- Status: Accepted
- Decision: `POST /executive/audit` accepts only actions on a server-side list (today `REPORT_EXPORT_CSV`), and the server fills in the category, target type and wording; it keeps only the metadata keys listed for that action, with type and range checks, and an unknown action, a bad metadata value or a malformed `targetId` is a 400. The actor comes from the verified access token only, never from `x-user-*` headers, and `actor_email` is the email read from the `users` table (the request is refused if that account is missing), not the token's display name. There is no audit viewer page: the executive does not need one, and entries are read by querying `GET /executive/audit` or the database when something goes wrong.
- Reason: an audit trail is only worth trusting if a caller cannot write an entry for something that did not happen, under a made-up name, as someone else.
- Consequence: a new audited action means adding it to `executiveAuditPolicy.js` with its metadata checks and wording. Known limits, not fixed: the entry is still sent by the browser after it exports the CSV, so a failed request or a closed tab leaves a download with no entry; the proper fix is to log on the server when the export runs (which depends on `CEO-005`). The client IP still comes from `x-forwarded-for`, which only the gateway can make trustworthy (shared file, left alone).

## CEO-DEC-013 — The overview can look inside one chosen day

- Date: 2026-10-16
- Status: Accepted
- Decision: the overview's period picker gains "กำหนดเอง": the executive picks one day (today or earlier), and the whole overview shows that day. The sales trend is drawn by the hour, 24 points from 00:00 to 23:00 Bangkok time, with the axis naming every third hour (00:00, 03:00 … 21:00) and the last, 23:00, the cards compare the day with the day before, and the order status, category ring and popular categories cover that day. `GET /executive/metrics-series` on order-service accepts `granularity=hour` for this; auth-service and the other providers still accept only `day` and `month`.
- Reason: to drill into one day, for example to see when in the day the sales came.
- Consequence: a day has 24 hourly points; the points between the named hours are read by pointing at them. Only one day can be picked; there is no custom range. A future day is refused in the picker. Web usage for the day is the people who logged in that day, as in CEO-DEC-007. `definitionVersion` stays `v1`.

## CEO-DEC-014 — The complaints page lists complaints, tickets and disputes, each with its own filters

- Date: 2026-10-17
- Status: Accepted
- Decision: the complaints page lists three kinds of case together: complaints about a user or product (auth-service `reports`), support tickets (support-service) and order disputes (order-service). The executive picks "ทั้งหมด" or one kind, and a period: today (default), 7, 15 or 30 days, or a custom range from–to. The period filters by when the case was opened. "ทั้งหมด" has only the period; one kind adds the filters it really has: complaints a status; tickets a status, a category and a priority; disputes a status, a dispute type and a priority. The kinds share no status list, category or priority, so there is no combined filter for them. Complaints have no category filter (their reason is free text); their keyword-guessed category is no longer offered. Each service has a read-only executive endpoint (`GET /api/auth/executive/reports`, `/api/support/executive/tickets`, `/api/orders/executive/disputes`), EXECUTIVE only; the browser calls them through the gateway and merges them, no service reads another's database. Ticket and dispute lists return only what the page shows (no requester, assignee, evidence or chat).
- Reason: the executive wants one place to see what people are raising and to narrow it down, but a ticket, a dispute and a complaint are different cases with different lifecycles.
- Consequence: "ทั้งหมด" takes the newest 50 cases of each kind, merges them newest first and says when a kind has more; choosing one kind pages through all of it. A service that is down is named on the page and the others still show; its count reads "ไม่พร้อมใช้งาน", not 0. A filter value a service does not know is refused with 400 instead of matching nothing. The earlier complaints page's search by shop, sort by most-reported and "filter by target" are gone with this rewrite; the repeat-complaint warning stays. Dispute types are free text on the server (the buyer form offers four), so only those four are offered as a filter. On 2026-10-24 the complaints API dropped what the page no longer uses (search, target filter, keyword category, other sort orders): it takes status, page, limit and the window, newest first. Every executive endpoint refuses an empty or backwards window (`resolveExecutiveRange`) with 400. `CEO-004` remains not delivered (CEO-DEC-011).

## CEO-DEC-015 — Tickets and disputes open a details dialog, without evidence or chat

- Date: 2026-10-22
- Status: Accepted
- Decision: each ticket and dispute row on the complaints page has a "รายละเอียด" button, like complaints. The dialog is loaded when opened, from read-only, EXECUTIVE-only endpoints: `GET /api/orders/executive/disputes/:id` and `GET /api/support/executive/tickets/:id`. A dispute shows its reason, the buyer who opened it, the shop and product, the order and amount, type, priority, status, who is handling it, and, once decided, who decided (labelled "ผู้ตัดสิน", since an Admin or Trust & Safety may decide), the decision, the reason and when; before that, the decision due time (SLA) and whether it is late. A ticket is laid out like a dispute: number and subject, who opened it (ผู้เปิด Ticket) and when, the product only when the ticket names an order (title from the order, which order-service keeps as sold, via `GET /:id/internal`), status, who took the case (the current or last assignee), and who handled it (ผู้ดำเนินการ: whoever last moved it to RESOLVED or CLOSED, or "ยังไม่ได้ดำเนินการ"), the action taken (that status) and the reason. A ticket reopened after RESOLVED shows no handling until it is closed again, so an old outcome never sits next to an open status. Staff names show their team in brackets, e.g. "เจ้าหน้าที่บี (Customer Service)", from the `staffRoles` the display-name API now returns (staff roles only; buyers and sellers get none). The ticket text and the full status history are not returned. People's names come from auth-service (`POST /internal/users/display-names`) and product titles from product-service, both called by the owning service through their APIs; when one cannot answer, the ids still show and the dialog says names are unavailable. Evidence, chat and internal notes are never returned. The dialog frame is shared (`DetailsModal`); each kind has its own content.
- Reason: the executive wants to see how a case was handled and decided without opening the staff tools.
- Consequence: the display-name API gives a seller's shop name or a person's first name, not a full name, so names here can read shorter than on complaints. Ticket star ratings and the ticket category are not shown (cut for now): there is no rating data in the system yet (it needs a table, an API and a customer screen owned by the support team), and a ticket has no type apart from its category and priority.

## CEO-DEC-016 — Export is a CSV of the report, recorded in the audit log

- Date: 2026-10-24
- Status: Accepted (supersedes the export-job design in `plan.md` Task CEO-005)
- Decision: `CEO-005` is a "ดาวน์โหลด CSV" button on the reports tab. The file holds the month or year breakdown the executive is looking at, built in the browser from the figures the owners' series APIs (`/api/orders/executive/metrics-series`, `/api/auth/executive/metrics-series`) returned, so it always matches the table on screen. Every download is recorded through `POST /api/auth/executive/audit` as `REPORT_EXPORT_CSV`, with the period and row count (CEO-DEC-012). There is no export job table, worker, file expiry or PDF.
- Reason: the Owner wants a CSV to work with and a record of who exported what and when. A report is at most 31 rows, made instantly, so a queued job adds a table, a worker and cleanup without helping anyone, and the audit log already answers "who exported what".
- Consequence: an export cannot be downloaded again later; it is made again (a past period gives the same figures). The audit entry is stored first and the file is handed over only after the server confirms it; if the entry cannot be stored, there is no download and the page asks the executive to try again, so no export leaves without a record. No PDF.

## CEO-DEC-017 — The complaints page searches by reference code

- Date: 2026-10-25
- Status: Accepted
- Decision: the complaints page has one search box, "ค้นหาด้วยรหัส", that finds cases by the reference codes main added (`docs/uuid-and-reference-id-design.md`). Each list endpoint takes `q`: complaints match their own code (RPT-…) or the code of who they are about (USR-…); tickets their code (TKT-…) or ticket number (#CS-000002); disputes their code (DSP-…) or their order's (ORD-…). A whole code or any part of one matches, case does not matter. The search applies within the chosen period and to every kind at once, and it stays when the kind is changed. `q` accepts letters, digits, dashes and a leading `#` only (`referenceQuery` in `backend/shared`, `referenceSearch` in the page); anything else is refused with 400 and is never sent by the page. Rows show each case's code labelled "รหัส".
- Reason: the executive gets a case's code from a colleague or a customer and needs to find it without scrolling.
- Update (2026-10-25, shop names): the same box also finds a shop by name. Complaints match the shop name, the person's name or the user code of who they are about; disputes match the name of the shop that sold the order. Shop names belong to auth-service, so order-service asks its internal `POST /internal/users/search` (account status is not a filter: a suspended shop is one the executive may look up), then keeps the disputes of orders those users sold; if auth-service cannot answer, disputes say they are unavailable rather than "none found". Tickets stay code-only (their code or `#CS-…` number): a ticket is not about a shop. The text is read literally (`%` and `_` are ordinary characters; `escapeLike`, `strpos`), is at most 100 characters, and is sent as typed (matching ignores case). This replaces the code-only rule of the first version.
- Update (2026-10-25): the targets named in the red repeat-complaint warning are buttons. Pressing one lists only the complaints about that user or shop (`GET /executive/reports?targetId=`), every status and whenever they were reported, because the warning counts them over all time and a period would hide some. A bar says so and "ล้างตัวกรอง" (or pressing the name again, or changing the kind) returns to the period list. This brings back the "filter by target" that CEO-DEC-014 dropped, now from the warning only. The search box sits at the right of the period row and is marked red, without a message, when what is typed cannot be a reference.
- Update (2026-10-25): the list header has a sort dropdown at the right, "วันล่าสุด" (default) or "วันเก่าสุด", by when each case was opened, using the shared `RadioSelect`. Each list endpoint takes `sort=newest|oldest` (`listSort` in `backend/shared`; anything else is 400), so a page is ordered by its service; "all" asks every kind in that order and merges the same way. The sort stays when the kind or the period changes. "กำลังโหลด..." sits to the left of it.
- Consequence: a case outside the chosen period is not found; the empty message says to widen the period. Rows created before the reference-code migration need the backfill (`node scripts/reference-codes.cjs --apply`) to have a code. The order-status donut counts `paid` and `delivered` orders as in progress, following main's new order lifecycle.

## CEO-DEC-018 — The overview's custom period is a range of days

- Date: 2026-10-25
- Status: Accepted (extends CEO-DEC-013, which looked inside one chosen day)
- Decision: "กำหนดเอง" on the overview takes two dates, "ตั้งแต่" and "ถึง" (both days included, neither in the future, at most 366 days; the same rules as the complaints page). The numbers are the sums over those days and are compared with the stretch of the same length just before them. The sales chart follows how long the range is: one day is charted by the hour (as before); 2 to 92 days by the day, one point per day, so the further apart the dates are, the more points the line has; more than 92 days by the month. Many points are handled on the chart: the axis names about eight days (always the first and the last), the dots shrink and each point has a hover area as wide as its column. A month point at either end that covers only part of the month says so when pointed at. Web usage is asked by the day, or by the month for a long range (a month is the sum of its days, CEO-DEC-007).
- Reason: the executive wants to look at any stretch (a campaign, a fortnight), not only one day, and a line of 366 daily points is unreadable, so beyond three months it turns monthly.
- Update (2026-10-28): the overview opens on "7 วันล่าสุด" again, compared with the 7 days before, and the buttons are 7 วันล่าสุด, เดือนนี้, ปีนี้ and กำหนดเอง. The "วันนี้" button tried on 2026-10-25 (by the hour, against the same day last week) is gone.
- Update (2026-10-25): the period is named on the four cards only (วันนี้, เดือนนี้, ปีนี้ or, for a custom range, "(ช่วงที่เลือก)" instead of its dates, which ran to two lines); the charts carry no period in their names. The dates are in the date fields beside the buttons and in the caption under the trend line.
- Consequence: picking only "ตั้งแต่" keeps a one-day range; the 92-day limit is `DAILY_POINTS_MAX_DAYS`. The series endpoints and their 366-point cap are unchanged.

## CEO-DEC-019 — A report of a review is shown as one

- Date: 2026-10-28
- Status: Accepted
- Decision: when a seller reports a customer's review, auth-service stores it in the same `reports` table as a report of a user (`POST /api/auth/reports`, the review checked with product-service), so the complaints page lists it. It has no column of its own: it is told apart by the marker `[รายงานรีวิว #<review id>]` that starts its `reason`, followed by the topic the seller picked in brackets, what they added and `(เนื้อหารีวิว: "…")`. The page reads that (`describeReport`). In the list a review report shows a grey "รายงานรีวิว" label, the same as the "Ticket" and "ข้อพิพาท" labels, and the topic only, and names the person reported as "ผู้เขียนรีวิว" by their own name; never the marker or the review id. The topic, what the seller wrote and the review text are in the details dialog, which names the person who wrote the review and leaves out the shop they may also run (it is not who was reported). Every other report is shown exactly as before.
- Update (2026-10-28): the details dialog lists "วันเวลาที่แจ้ง" beside "หัวข้อปัญหา" for a review report (for any other report it stays beside the reporter) and has a "สินค้า" heading, the way the date has one: the product's name, with its code beneath, instead of a code line under who was reported. The name comes from product-service, which soft-deletes (a sold listing keeps its row; a deleted one only gets `deleted_at`), so it asks for the names with its own batch endpoint, `POST /internal/executive/product-names` (internal token, up to 100 ids), which returns sold and deleted products too, a deleted one flagged. auth-service asks it once per page of complaints (`productNameClient`) and adds `productTitle`, `productDeleted` (shown as "สินค้าถูกลบแล้ว") and, when product-service cannot be asked, `productUnavailable` ("ไม่พร้อมใช้งาน"); an id that was never a product shows "ไม่พบสินค้า". The first version used product-service's moderation lookup, which skips deleted listings, and would have said "not found" for a product the seller deleted after being reported.
- Reason: the raw text read "[รายงานรีวิว #รหัสอ้างอิงไม่พร้อมใช้งาน] …" (reviews have no reference code to turn their id into) and "เป้าหมาย: GG SHOP" made it look as if the shop had been reported.
- Consequence: the page depends on the wording auth-service writes; a stored `type` on the report (owned by auth-service) would be the sound way to tell a review report apart, and the category and topic would then not need parsing. Until then, a reason that merely contains the marker later in the text is not taken for a review report.
