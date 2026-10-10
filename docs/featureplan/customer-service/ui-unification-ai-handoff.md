# Customer Service UI — Implementation handoff for the next AI

วันที่จัดทำ: 8 ตุลาคม 2026 (Asia/Bangkok)

## 1. อ่านส่วนนี้ก่อนลงมือ

เอกสารนี้เป็น specification และแผน implementation ไม่ใช่รายงานว่างานเสร็จแล้ว ผู้ใช้ขอให้วางแผนแก้ทุกปัญหาที่คุยกัน โดยให้ AI ตัวถัดไปทำตามได้โดยไม่ต้องเดา product direction

**Design ที่เลือก:** ใช้หน้า Ticket แบบสนทนาปัจจุบันเป็นต้นแบบ ปรับข้อบกพร่องของ Ticket แล้วทำ Disputes ให้ใช้ layout และ interaction แบบเดียวกัน โดยเปลี่ยนรายละเอียดเฉพาะ domain และเพิ่มแท็บผู้ซื้อ/ร้านค้า

**ไม่ใช้ design mockup รอบแรกที่รวม Ticket/Dispute ในคิวเดียวและแสดงบริบทสามคอลัมน์ถาวร** ผู้ใช้เห็นว่าทำให้ซับซ้อนเกินจำเป็น ข้อเสนอในเอกสารนี้แทนที่ mockup นั้น

สิ่งที่ต้องคงไว้:

- เมนู Tickets และ Disputes แยกกัน
- แต่ละหน้ามีโหมด “สนทนา / ตาราง”
- โหมดสนทนามีคิวซ้าย แชทขวา และปุ่มเปิดข้อมูลบริบท
- โหมดตารางเป็นอีกมุมมองของคิวเดียวกัน ไม่ใช่ flow จัดการเคสอีกชุด
- Domain state, ownership, financial decisions และ messages ownership เดิม
- Customer Service ทำงานตามสิทธิ์เดิม; Admin/T&S ใช้สิทธิ์ของตนเอง
- ภาษาไทยและ design system / Tailwind / components ที่มีอยู่

สิ่งที่ต้องไม่ทำ:

- ไม่รวม Support Service กับ Order Service หรือฐานข้อมูล
- ไม่ย้ายข้อความออกจาก Chat Service
- ไม่เปลี่ยนผู้มีสิทธิ์ตัดสินข้อพิพาทเป็น CS/T&S เพื่อให้ปุ่มใช้งานได้
- ไม่สร้าง state/status ใหม่เพื่อรองรับหน้าตา หาก lifecycle เดิมรองรับอยู่แล้ว
- ไม่แต่งชื่อคน ยอดเงิน SLA ประวัติ หรือ metrics เมื่อ API ไม่มีข้อมูล
- ไม่ใช้ mockup HTML เป็น production code หรือคัดลอกชื่อ/ยอดเงินตัวอย่างลงระบบจริง
- ไม่แสดงผลว่า “ล็อกแชทแล้ว” ถ้า backend แจ้ง lock failure
- ไม่ลบ/ทับงานเดิมใน workspace; มีไฟล์แก้ไขและ untracked จำนวนมากก่อนงานนี้
- ไม่เปิดสิทธิ์อ่านเคสคนอื่นให้ CS โดยอัตโนมัติ
- ไม่ทำ frontend filter/sort เฉพาะหน้าที่โหลดแล้วอ้างว่าเป็นทั้งคิว

ทำทีละ phase; ถ้า contract ที่พบต่างจากเอกสาร ให้บันทึกความต่างและปรับแผนตาม code จริง อย่าเดา endpoint หรือ field

## 2. เป้าหมายและผลลัพธ์ที่ต้องส่งมอบ

1. CS เรียนรู้ Ticket แล้วใช้ Disputes ได้ทันที เพราะตำแหน่งคิว ค้นหา มุมมอง แชท และบริบทเหมือนกัน
2. สลับสนทนา/ตารางแล้วคำค้น ตัวกรอง scope และเคสที่เลือกคงอยู่
3. กดแถวหรือ “เปิดเคส” จากตารางแล้วเปิดเคสใน workspace เดียวกันทันที
4. UI แสดงสิทธิ์ เจ้าของ สถานะ และ SLA ตามข้อมูลจริง และสอดคล้องหลัง mutation
5. Dispute สลับผู้ซื้อ/ร้านค้าได้โดยไม่ส่งผิดห้องและไม่ทำร่างข้อความหาย
6. ไม่สูญเสียฟอร์มเมื่อ request ล้มเหลว และไม่มี response เก่าเขียนทับเคสใหม่
7. ทดสอบ regression ของ Customer Service, Admin Inbox, T&S และ chat consumers ที่ใช้ components ร่วม

Definition of Done แบบย่อ: implement FR/NFR Must ทั้งหมด, ผ่าน test matrix, มี browser QA จริง, build/lint ตามขอบเขตผ่าน, ส่ง diff summary และข้อจำกัดตามจริง

## 3. Evidence จาก code ที่อ่านในรอบวางแผน

ทุก path ด้านล่าง relative ต่อ repository root `C:/Users/Achir/OneDrive/Desktop/02_Workspace/code/y3_1/ise/t3/Ise` ให้ค้นชื่อ function/component แทนเชื่อ line number เพราะ workspace เปลี่ยนได้

| ID | Current state ที่พบ | Source | Required fix |
|---|---|---|---|
| G-01 | TicketsSection mount LiveSupportSection และ table flow แยก state; table scope=all | frontend/components/support/sections/TicketsSection.js | One controller/state, two presentations |
| G-02 | Ticket table เปิด CaseDrawer/TicketCasePanel แล้วค่อยเปิด workspace | TicketsSection.js, sections/case/TicketCasePanel.js | Table open -> selected ID + workspace |
| G-03 | TicketCasePanel กับ SupportCaseDetails แสดง actions คนละชุด | sections/case/TicketCasePanel.js, sections/live-support/SupportCaseDetails.js | Shared policy/action definition; keep admin panel compatible |
| G-04 | Table escalation reason optional แต่ backend require reason; workspace memo require 3 fields | TicketsSection.js, SupportCaseDetails.js, ticketService.changeStatus | Shared memo validation and submit flow |
| G-05 | SupportMainChat ใช้ Boolean(ticket.assigneeId) ตัดสินว่าแสดง composer | sections/live-support/SupportMainChat.js | Use current user + role + authoritative read-only state |
| G-06 | LiveSupportSection ใช้ request counters แต่ DisputesSection detail/chat calls ไม่มี equivalent guards | sections/LiveSupportSection.js, sections/DisputesSection.js | Guard every asynchronous state update |
| G-07 | LiveSupportSection ส่ง take=50; parsePagination อ่าน page/limit เท่านั้น | LiveSupportSection.js, backend/shared/src/pagination.js | Send limit; paginate queue correctly |
| G-08 | apiFetch throw new Error(message) ไม่แนบ status; callers ตรวจ err.status===409 | frontend/lib/api.js, DisputesSection.js | Preserve status/code/details with backward-compatible Error |
| G-09 | Dispute header ใช้ selected queue snapshot; body ใช้ separately fetched details | DisputesSection.js, disputes/DisputeDetailPanel.js | Selected ID + one latest entity |
| G-10 | Dispute KPI refetch เฉพาะ token change | DisputesSection.js | Remove KPI from operational workspace; refresh retained stats where used |
| G-11 | Dispute ownership badge maps non-T&S to CS; escalation button T&S แต่ modal/backend Admin | DisputeDetailPanel.js, disputes/DisputesTable.js, backend disputeService.escalate/decide | Explicit role labels; Admin is verdict authority |
| G-12 | Dispute main work is table + detail/chat/order nested overlays | DisputesSection.js, DisputeDetailPanel.js | Ticket-like workspace; context/evidence as deliberate panels |
| G-13 | Dispute reassign requires raw User ID | DisputeDetailPanel.js | Eligible staff picker backed by real authorized data |
| G-14 | Ticket table createdAt header is จัดการ; instructions imply direct chat but actual drawer | tickets/TicketsTable.js | วันที่เปิด; explicit เปิดเคส action |
| G-15 | Ticket SLA projection falls back to completed target; metric/cycle not exposed clearly | backend/support-service/.../ticketShape.js | Add semantic SLA summary; do not count completed target |
| G-16 | Dispute detail findById/byOrder includes evidence but not order; queue includes order | backend/order-service/.../disputeModel.js | Return safe order summary in staff detail; no stale queue fallback |
| G-17 | Dispute queue does not support scope/current user; existing service returns model queue | disputeController.queue, disputeService.listQueue, disputeModel.listQueue | Add access-aware server scope and exact total |
| G-18 | Auth has internal POST /users/display-names | auth-service/src/features/internal/internalRoutes.js | Reuse protected server-to-server batch name lookup |

Important correction to earlier discussion: “ดูแลโดยคนอื่นแบบอ่านอย่างเดียว” cannot mean CS can read other staff's full chat/evidence. Current ticket assertAccess and dispute assertAccess deny that detail access. Preserve this boundary. UI may show available authorized summary; if detail denied show permission state without fetching sensitive content repeatedly.

Ticket queue current `scope=all` for CS means unassigned + self-owned, excludes ESCALATED; CLOSED can retain last assignee. UI labels and filters must describe this truth. `all` never means unrestricted access.

## 4. Target screens

### SCR-01 Ticket conversation

```text
Tickets                                        [สนทนา | ตาราง]
┌───────────────────┬──────────────────────────────────────────┐
│ กล่องงาน          │ หัวข้อ · เลขเคส · สถานะ                  │
│ งานของฉัน         │ เจ้าของ · SLA             [ข้อมูลบริบท]  │
│ รอรับเรื่อง        ├──────────────────────────────────────────┤
│ ทุกงานที่เข้าถึงได้ │ ประวัติสนทนากับผู้แจ้ง                   │
│ ค้นหา / ตัวกรอง   │                                          │
│ รายการเคส         ├──────────────────────────────────────────┤
│ โหลดเพิ่ม / หน้า   │ ตอบถึง: ชื่อผู้แจ้ง                       │
│                   │ ช่องพิมพ์ / แนบไฟล์ / ส่ง                │
└───────────────────┴──────────────────────────────────────────┘
```

Header: compact identity, readable subject, domain status, “คุณรับผิดชอบ” / owner / unassigned, semantic SLA, one context toggle. Show primary next action only if there is a clear next step; keep complete action controls in context. Do not place every transition as equally prominent header buttons.

“ดูตั๋วเต็ม” rename “เปิดหน้าเคส” and preserve existing route `/support/tickets/:id`; context toggle rename consistently “ข้อมูลบริบท”. Do not invent full dispute page if no supported route; keep action absent until real route exists.

Closed composer area: “เคสนี้ปิดแล้ว คุณดูประวัติได้ แต่ส่งข้อความไม่ได้”. No raw CLOSED code in normal product copy. Dates show Thai locale and year for historical grouping. Offline is presence only, never equivalent to permission or case closure.

### SCR-02 Dispute conversation

Same shell, spacing, queue/search and mode control as SCR-01. Page heading “Disputes / ข้อพิพาท” consistent with app naming. Main header includes dispute ID, short reason/title, status, owner/team, deadline. Add a compact order reference when useful, not full party/order cards in chat.

Below header, above transcript: `[ผู้ซื้อ · ชื่อ] [ร้านค้า · ชื่อร้าน]`. Exactly ONE active private conversation rendered at a time. Near composer show “ตอบถึง: ผู้ซื้อ · X เท่านั้น” / “ตอบถึง: ร้านค้า · Y เท่านั้น”. Read-only label instead of writable composer when API says readOnly. Tabs remain usable for authorized read-only inspection.

Before claim: CS can inspect permitted detail/evidence, sees “รับเคสก่อนเริ่มสนทนา”, and should not auto-POST join that backend forbids. After claim join the selected side and show chat. Admin/T&S join response currently readOnly; preserve it even for owned disputes. DECIDED chat remains locked.

### SCR-03 Table mode for each page

Table is a view, not separate case management. Filters shared with conversation. Switching view does not reset scope/query/status/priority/sort/selected ID. Save independent state per Ticket vs Dispute; do not apply Ticket enum to Dispute.

Ticket columns in order:

1. เลขเคส — ticketNumber, copyable ID if needed.
2. หัวข้อ / ผู้แจ้ง — subject up to 2 lines, customer name underneath; full subject accessible on open and optional tooltip.
3. สถานะ — Thai text with badge.
4. ความสำคัญ — backend priority, not inferred from browser SLA.
5. SLA — metric + remaining/overdue or จบแล้ว / ยังไม่กำหนด.
6. ผู้รับผิดชอบ — คุณ / display name / ยังไม่มี; role when relevant.
7. วันที่เปิด — createdAt rendered clearly e.g. 5 ต.ค. 2569.
8. เปิดเคส — real button/link; keyboard Enter/Space activates.

Dispute columns: เลขเคส, เหตุผล/ออเดอร์, ผู้ซื้อ/ร้านค้า, ยอดเงินในเคส, สถานะ, SLA, ผู้รับผิดชอบ/ทีม, วันที่เปิด, เปิดเคส. Allow horizontal scroll in table container; never page-wide overflow. At narrow widths hide only explicitly optional columns or provide responsive cards with all essential fields accessible. No CSS tiny fonts to fit 9 columns.

Amount uses authoritative `order.finalPrice ?? order.price`, supports decimal/string serialization via a tested formatter; zero is valid. Do not label the amount “ยอดระงับจริง” unless field/contract actually represents held balance. Context shows real hold state separately when available.

Row click opens workspace for that ID. Explicit open action must also work; copying ID and other inner interactive controls must stop propagation. An inaccessible record shows permission feedback; never pretend it opened. Remove misleading footer. Replace if needed with “เลือกเคสเพื่อเปิดในมุมมองสนทนา”.

Ticket table filter “จัดการ” rename วันที่เปิด. All table loading/error/empty states agree with queue. Show total count and pagination; reset page=1 when search/scope/filter/sort changes.

### SCR-04 Context panel

Desktop at >=1280px: context opens docked, without blocking backdrop. Can collapse queue to free space; minimum working chat area 400px, context 360–420px, queue 280–320px depending actual workspace width. Choose by container width if sidebar/browser chrome leaves less space. Do not force 3 narrow columns simply because viewport reaches breakpoint.

Below available width: context drawer overlays, has labelled dialog, focus trap, Escape, background inert, focus return. Mobile: queue -> chat with explicit back; context full width drawer; preserve drafts and selected ID. Default context closed for both domains.

Context sections, top to bottom:

| Ticket | Dispute |
|---|---|
| summary, subject, description, category | reason, order reference, amount/hold state |
| ownership, status, priority, SLA | ownership/team, status, priority if available, SLA |
| requester, optional counterparty/order | buyer + seller + order/product summary |
| internal notes with availability/pagination | buyer/seller evidence with metadata/preview |
| lifecycle actions + escalation memo | claim, permitted reassign, escalation memo; verdict only eligible Admin |
| existing escalation memo when authorized | decision result when decided; Admin audit access via existing authorized UI |

Do not show moderation/ban/warn in CS panels. TicketCasePanel remains used by Admin Inbox: any refactor must preserve optional moderation handlers and auditReadOnly semantics.

Internal notes are staff-only; empty vs chatAvailable=false must be distinct. Existing ticket.messages may be paginated; don't claim full note count if only current message page is available. Fetch internal note pages through actual supported contract or label as loaded notes.

### SCR-05 Evidence inspector

Authenticated fetch only through existing `/api/orders/disputes/:id/evidence/:evidenceId`. No token in URL, no public file URL, no unrestricted image loading.

- Grid grouped by uploader buyer/seller; unknown uploader goes “หลักฐานอื่น” instead of disappearing.
- Thumbnail when securely available; filename/type/uploader/time; per-file loading and errors with retry.
- Selecting file opens focused inspector with larger image/video controls, next/previous and metadata.
- Compare action switches main workspace to evidence inspection, collapses queue as needed; selected buyer and seller files side-by-side on desktop, stacked on small screen. Keep context reachable; return to chat retains room/draft.
- Missing fileType/filename handled; unsupported formats offered authenticated download, never rendered as executable HTML.
- Object URLs revoked on replacement/close/unmount; avoid loading all full-resolution files automatically. Lazy fetch visible/selected evidence and bounded thumbnail work.
- No nested sequence of order drawer + detail drawer + chat drawer. Use inline order summary; fuller order uses existing authorized route when available.

## 5. Functional requirements (Must unless marked)

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | Keep separate Ticket/Dispute pages and two modes each | UAT-01 |
| FR-02 | One queue filter state per domain shared by modes | UAT-02 |
| FR-03 | Table open sets selected ID and mode=workspace directly | UAT-03 |
| FR-04 | Same shell and interaction pattern across domains | UAT-01, screenshots |
| FR-05 | Latest detail is source of header/body/actions after fetch | UAT-09 |
| FR-06 | Permission policy controls claim/reply/status/note/escalate/reassign/verdict | UAT-04/05/06 |
| FR-07 | Private dispute chat tabs and explicit recipient | UAT-07 |
| FR-08 | Draft text scoped per user/domain/case/side survives mode/room/section changes | UAT-08 |
| FR-09 | Protect detail/chat/queue/send/upload callbacks from stale selection | UAT-09/10 |
| FR-10 | Retryable operation keeps user form data until confirmed success | UAT-11 |
| FR-11 | Semantic SLA active metric and completed/unknown states | UAT-12 |
| FR-12 | Backend pagination/filter/sort and count consistency | UAT-13 |
| FR-13 | Correct labels for roles, dates, table actions, locked chat | UAT-14 |
| FR-14 | Display names with honest fallback, protected batch enrichment | UAT-15 |
| FR-15 | Evidence preview/compare, authorization and URL cleanup | UAT-16 |
| FR-16 | Eligible staff picker for allowed reassign | UAT-17 |
| FR-17 | URL supports reload and browser Back/Forward for authorized selection | UAT-18 |
| FR-18 | Mutation refresh entity/queue/retained counters; distinguish partial success | UAT-11/19 |
| FR-19 | Keyboard-accessible controls, tabs, context and modal | UAT-20 |
| FR-20 | Reuse staff audit/financial protections and existing message transport | UAT-06/21 |

## 6. State/data design — implement before styling

Proposed `QueueState` per domain:

```js
{
  view: 'workspace', // workspace | table
  scope: 'mine',     // mine | unassigned | all (authorized)
  searchInput: '',
  query: '',
  status: '',
  priority: '',
  sort: 'sla',       // sla | newest | oldest | priority
  page: 1,
  limit: 20,
  selectedId: null,
  contextOpen: false,
  side: 'buyer'      // dispute only
}
```

Separate QueueResult `{items,total,page,limit,totalPages}` and SelectedDetail `{id,data,loading,error,requestGeneration}`. Queue row may provide skeleton/summary while detail loads; no executable action based on stale row before policy/detail confirmed.

Keep selected ID stable if mutation causes item to leave current filter. Show “เคสนี้ไม่อยู่ในตัวกรองปัจจุบันแล้ว” and refreshed list; explicit next/back, never auto-switch to another person's chat. Escalation that removes CS access clears sensitive detail/chat and shows “ส่งต่อให้ Admin แล้ว”; retain safe confirmation ID and no continued joining.

Shared state lives above mode presentation and above section unmount boundary or a scoped provider. Keep separate tickets/disputes entries so changing sidebar sections preserves draft/filter. Do not keep inactive chat sockets mounted just to preserve draft.

URL proposal `/workspace?section=tickets&view=workspace&case=<id>&scope=mine&q=...&status=...&priority=...&sort=sla&page=1`; disputes use section=disputes and side=buyer|seller. Use Next router/searchParams, validate enums, whitelist sections, preserve unrelated params, encode via URLSearchParams. Parse reload once; Back/Forward updates state without loops. Use replace for debounced search, push for explicit view/selection/navigation. Do not put drafts/internal notes/names in URL.

### Async correctness algorithm

For each queue/detail/join/transcript request, capture resource ID + side + request generation. Only apply then/catch/finally if identity/generation still current. Invalidate before changing selection and on unmount. AbortController is optional only after apiFetch supports signal across refresh retry; request generation remains required for mutation callbacks.

Mutations capture original ID/version and payload before await. A successful response may invalidate that resource cache even when user has moved to another case, but must never replace newly selected detail. Busy/error keyed by resource/action, not global bool carried into another selected case.

Room state proposal `{committedSide,committedConversationId,pendingSide,joining,error,readOnly}`. On click:

1. Save current draft; set pendingSide and joining; disable composer/send/upload and tabs if needed.
2. POST join for target side; validate returned side/conversationId; request guard.
3. Commit tab label, receiver, transcript and conversationId atomically. Remount/reset transcript by committed conversation ID.
4. On failure retain previous committed tab/room and draft, show local retry. Never label seller while buyer room remains active.
5. Logout/permission loss/DECIDED applies read-only immediately; capture room for in-flight sends, never retry into currently selected room.

### Drafts and uploads

Draft key: userId + domain + caseId + side (ticket side=requester). Use in-memory provider surviving navigation; optionally sessionStorage for text refresh survival. If sessionStorage used, clear on logout/account switch and remove successful-sent draft; no tokens or file blobs in storage. Restoration after refresh explicitly supported for text.

MessageComposer currently owns local value/pendingFile. Add backward-compatible optional controlled `value/onValueChange` or `draftKey` adapter; don't force unrelated consumers to change. Existing uncontrolled calls continue working. Pending attachment remains in memory by draft key with clear pending indicator; if not kept across switch, show explicit confirmation to discard. Refresh cannot restore File object: explain attachment must be reselected and preserve text.

Disable room/case switching while send/upload actively commits unless operation has captured room and safe detached completion. Prefer the simpler disable while active; show busy state. Switching typing state emits stop for old room. Failed send/upload keeps text/file and receiver. Use existing transport dedupe/idempotency; do not invent a backend retry key without inspecting lib/chat and upload contracts.

## 7. Permissions and business rules

Read actual `ticketService`, `ticketState`, `disputeService`, chat access routes and tests before coding policy. Role set includes primary role + roles array; don't silently collapse multi-role staff inconsistently with backend.

### Ticket

- CS: own/unassigned accessible according to existing service; other owner's detail denied. Escalated detail not accessible to CS. Closed ticket retains last assignee for authorized history.
- Unassigned: permit view where backend permits; require claim before UI exposes public reply, internal note, lifecycle changes as ordinary CS workflow. Add matching backend guards where current endpoints accept mutations on unassigned cases; preserve requester reply behavior and privileged moderation policies. Tests must prove direct POST cannot bypass UI rule.
- Owner CS: allowed next transitions from ticketState, including PENDING_USER action currently missing from workspace buttons. Present plain labels: “เริ่มดำเนินการ”, “รอลูกค้าตอบ”, “แจ้งว่าแก้ไขแล้ว”, “กลับมาดำเนินการ”, “ปิดเคส”, “ส่งต่อให้ Admin”. RESOLVED->IN_PROGRESS label is reopen, not generic start.
- CLOSED: no claim/reply/note/status mutations. Existing closed guard for assignToSelf is insufficient if it only checks assignee; enforce closed check.
- Admin: public customer chat audit read-only per current reply policy; internal staff actions only according to existing authority. T&S behavior must be verified independently, not inferred from Admin UI labels.
- Showing primary action based only on status is insufficient; combine access/ownership/role/closed/room lock.

### Dispute

- CS may inspect unassigned and self-owned authorized disputes; cannot inspect other CS owner's detail or Admin queue detail per current assertAccess.
- CS claim eligible non-decided CS cases; reply only self-owned permitted case, joined room not readOnly, not switching. Escalate self-owned case to Admin with mandatory memo.
- Admin/T&S conversations remain read-only per joinConversation returned readOnly. Do not enable composer because assignedTo===currentUser.
- Verdict only ADMIN with assignedRole=ADMIN, assignedTo=currentUser, eligible status, version and reason. Preserve existing financial service and idempotency protections.
- AssignedRole labels explicit `{CUSTOMER_SERVICE:'Customer Service', TRUST_AND_SAFETY:'Trust & Safety', ADMIN:'Admin'}`; unknown role -> “ไม่ทราบทีม”, not default CS.
- Escalation label “ส่งต่อให้ Admin” everywhere for current endpoint. T&S also has existing escalation authority; preserve server policy. Don't invent sequential CS->T&S->Admin workflow.
- Reassign current permitted actors only; eligible target validation on server remains authoritative.
- DECIDED is final according to current rules; keep decision/result read-only. Don't equate NEEDS_INFO with ticket PENDING_USER internally.

Preferred additive API: staff detail/queue projections expose capabilities `{canViewDetail,canClaim,canReply,canAddNote,canChangeStatus,allowedNextStatuses,canEscalate,canReassign,canDecide,readOnlyReason}` calculated by domain service and same guards used by mutations. Keep old response fields. Validate room readOnly separately. No permission flags alone replace backend checks. Do not expose capabilities/extra staff fields in public requester detail unnecessarily.

## 8. Backend/API work needed

### 8.1 apiFetch error and cancellation contract

Keep Error.message for all existing consumers; append `status=res.status`, safe `code`, safe `details` from established API error envelope. Do not serialize raw response/request/token. If adding signal, accept in options and pass on both original fetch and refresh retry; AbortError isn't a toast. Respect existing refresh singleflight/account suspended behavior.

Test 409 accessible by caller, 403 permission state, 401 refresh once, 5xx transient failure, non-JSON errors, 204, AbortError. Do not rewrite auth refresh while fixing status.

### 8.2 Queue contract

Both endpoints use page/limit (max50 from shared pagination), scope, q, domain-valid status, priority if supported, sort. Ticket currently supports scope/status/priority/q but not sort. Dispute currently supports status/assignedRole/q only. Add remaining parameters through controller->service->model, not client-only slices.

Server computes access restrictions and combines with requested filters. CS Dispute all must contain only inspectable own/unassigned non-Admin cases according to current service, or a deliberate safe-summary-only result with canViewDetail=false; choose **inspectable own/unassigned queue** in this implementation to match Ticket. Don't allow query assignedRole=ADMIN to bypass CS boundary. Admin/T&S continue their authorized wider views.

Scope mine/unassigned default excludes terminal cases; explicit CLOSED/DECIDED filter includes authorized terminal history. all includes terminal history but excludes inaccessible escalation queues for CS. Page resets on filter change. Count uses identical where predicate. Invalid enum/sort returns 400 or documented safe default consistently.

Sort allowed: sla (active deadline ascending, NULLS LAST; priority score desc; stable id), newest (createdAt desc + id), oldest (createdAt asc + id), priority (backend stored priority/score desc + active deadline + id). Sort before LIMIT; no user-supplied SQL identifier interpolation. Ticket uses Prisma.sql static fragments whitelist; Dispute Prisma orderBy whitelist. Keep persisted priority vs dynamically projected priority consistent or document and fix source mismatch before label/order drift.

Conversation queue supports load more with dedupe IDs or paged navigation, using same query state as table. If choose load more, separately track loaded pages while table uses page; restore anchor/selected row rather than pretending both viewport positions identical. Search debounce 300ms both modes, Enter commits immediately, clear resets query; no hidden Enter-only search without cue.

### 8.3 SLA projection

Additive staff shape:

```js
sla: {
  state: 'active', // active | complete | none
  metric: 'FIRST_RESPONSE', // or RESOLUTION; dispute metric only if defined
  dueAt: 'ISO timestamp', // null if no active target
  cycle: 1,
  achievedAt: null
}
```

Ticket select earliest unachieved applicable target; if no pending targets state complete (targets exist) or none. CLOSED/RESOLVED display completion appropriately; verify unresolved first-response edge cases instead of treating old dueAt as active forever. Reopen uses real current cycle. Keep legacy slaDueAt for compatibility but new UI uses sla. Do not change policy durations, business hours, SLA pause/resume rules.

Dispute use existing slaExpiresAt while eligible/non-decided; label “กำหนดดำเนินการ” until business defines precise metric. DECIDED complete. No dueAt -> none. Format days/hours/minutes, not thousands of minutes. One shared clock refreshed every 30s, cleanup; don't refetch all data every clock tick. UTC transport, Thai display/timezone; client clock remaining is informational, server determines authoritative deadlines.

### 8.4 Detail order summary and names

Dispute detail endpoint already GET /api/orders/disputes/:id; use ID not orderId in normal selected flow. Existing by-order route stays for consumers that only have order ID. Include safe authorized order summary `{id,buyerId,sellerId,price,finalPrice,productTitle,...actual available hold fields}`; don't return full internal order/payment records.

Name enrichment: reuse Auth internal display-names route through server clients with existing service auth. Batch unique IDs per page/detail; safe fields only, no email/phone/address. Auth down -> retain cases with fallback `ผู้ใช้ #<shortId>` and expandable/copyable complete ID. Don't make browser call internal endpoint. Avoid N+1 fetch per row. Shop name fetched only through actual available safe contract.

### 8.5 Reassign staff selector

Discover existing staff directory; if absent add minimal authenticated eligible-staff lookup routed through service/gateway. Search by display name/ID, server pagination and role/ACTIVE filtering. CS cannot query all users; return staff only permitted as reassignment targets for selected case. Render name/team + ID secondary, require selection not free text, reason mandatory. Empty / loading / unavailable states with retry; no fake hardcoded staff list. Save form until success; retain server role/ACTIVE/version revalidation.

### 8.6 Financial decision safety / partial success

Existing decision endpoint body `{decision,reason,version,idempotencyKey}`; keep semantics and existing outcomes. Main actions APPROVE_REFUND and RELEASE_ESCROW; don't expose REJECT merely because enum exists until actual documented product meaning supported.

Open review dialog: case/order, authoritative amount, recipient buyer/seller, selected outcome, reason, consequence (final decision per policy). One confirm button. Confirm captures frozen payload/version/key. Retry same attempt with same key/payload; never generate new key on every retry. State mismatch -> show conflict and reload, ask user review again. If financial action succeeded but chat lock failed: show success + separate warning/recovery; don't repeat financial decision. Backend current notice/lock recovery must be preserved.

Ticket close same distinction: returned chatLockError means case closed but chat locking unavailable. UI locks composer from case state and accurately reports partial failure; cannot promise cross-service atomic success.

## 9. Component implementation map

Names are recommended; use equivalent repository naming if needed and document it. Do not create generalized workflow engine.

| File | Action / responsibility |
|---|---|
| frontend/app/workspace/page.js | Equal full-height host for both sections; separate domain view/filter state; URL navigation; pass currentUser/roles |
| sections/TicketsSection.js | Ticket controller + mode switch; remove CS duplicate drawer action flow |
| sections/LiveSupportSection.js | Refactor into presentation or shared controller consumer, not independent second queue/detail fetch |
| sections/live-support/SupportQueueSidebar.js | Shared queue visual pattern, filters, honest totals, pagination, loading/errors |
| sections/live-support/SupportMainChat.js | Extract/reuse header/body pattern, correct permissions, recipient and draft control |
| sections/live-support/SupportCaseDetails.js | Full permitted transition set, SLA/name projection, awaited escalation, note handling |
| sections/tickets/TicketsTable.js | New columns, shared filters, open action, correct date header |
| sections/DisputesSection.js | Replace table-only entry + multi-drawer lifecycle with workspace/table controller |
| sections/disputes/DisputesTable.js | Shared table behavior, roles/amount/SLA, remove main KPI row |
| sections/disputes/DisputeChatPanel.js | Adapt private chat tabs/body to workspace; remove standalone left slide-over requirement |
| sections/disputes/DisputeDetailPanel.js | Split context/content from drawer shell; keep existing authorized consumers working |
| components/support/EmbeddedChat.js | Reuse transcript/socket core where practical, draft/readOnly/request guards backward compatible |
| components/chat/MessageComposer.js | Optional controlled draft support, room safety, failed send/file preservation |
| components/ui/DataTable.js | Minimal compatible support for open actions; inner control propagation; keep semantic table |
| components/ui/Modal.js, ConfirmDialog.js | Reuse accessible dialogs; add needed async/exit/focus behavior centrally only if safe |
| components/support/sections/case/CaseDrawer.js | Preserve admin consumers; central accessible drawer if retained |
| frontend/lib/api.js | Structured Error + optional signal, refresh regression tests |
| frontend/lib/supportConstants.js | Role/status/category labels; no independent backend policy divergence |
| NEW components/support/workspace/CaseWorkspaceLayout.js | Visual shell, responsive context, mode placement, no API calls |
| NEW hooks/support/useTicketWorkspace.js | Ticket fetch/action lifecycle per ID/query |
| NEW hooks/support/useDisputeWorkspace.js | Dispute lifecycle and committed chat side |
| NEW components/support/workspace/CaseHeader.js | Shared identity/status/owner/SLA layout |
| NEW components/support/workspace/QueueToolbar.js | Scope/search/domain filters/sort |
| NEW components/support/workspace/CaseContextPanel.js | Docked vs accessible modal shell |
| NEW components/support/workspace/EscalationMemoDialog.js | Shared 3 fields/awaited submit/error retention |
| NEW components/support/workspace/SlaIndicator.js | Semantic state + shared formatting |
| NEW components/support/workspace/CaseDraftProvider.js | Drafts scoped by user/case/side, clear/logout lifecycle |
| NEW components/support/sections/disputes/EvidenceInspector.js | Secure preview/compare |
| backend/support-service ticketController/Service/Model/Shape | Queue contract, SLA/names/capabilities, backend guards |
| backend/order-service disputeController/Service/Model | Access-aware queue scopes/sort, order summary/capabilities/names |
| backend Auth/service clients/gateway | Minimal staff picker and batch display name integration if needed |

Find all imports before removing/renaming any old component. Particularly AdminInboxSection, AdminDisputeAuditPanel, support detail pages, OrdersSection, ChatSocketProvider and MessageComposer consumers. Keep audit features working.

## 10. Ordered implementation phases

### Phase A — baseline, contracts, safety fixes

1. Read root/ancestor/nested AGENTS.md if present. Run git status/diff; record pre-existing changes without undoing them.
2. Read this entire file, relevant feature docs and actual service/route/tests listed. Inspect imports and mounted gateway prefixes.
3. Reproduce Ticket conversation/table, Dispute, Admin Inbox on real app with existing authorized demo/test data. Record screenshots at desktop and mobile. Do not seed or reset production data.
4. Baseline focused tests; note existing failures/skips separately.
5. Fix apiFetch error metadata first and test 409 path.
6. Verify permission matrix against backend; add capabilities/shared guards and fix unassigned/closed mutation gaps with tests.
7. Add queue contract/scopes/sorts/page counts, SLA projection, detail safe order summary, batched names. Test backend before UI depends on them.

Exit gate: contracts documented in code/tests, valid/invalid role and pagination tests pass. No financial/ownership regression.

### Phase B — improve Ticket without changing visual concept

1. Establish domain state above mode/section unmount; remove duplicated queue/detail/action fetch ownership.
2. Correct default mine scope and userId/roles props end-to-end (TicketsSection currently doesn't consume userId despite page passing it).
3. Shared toolbar/state, server paging, names/SLA header, owner read-only label, full transitions.
4. Table column/date/open changes; direct table->workspace; filters remain identical.
5. Context docked on wide screen / accessible drawer otherwise; memo and close behavior await success.
6. Draft provider and backwards-compatible composer integration; URL reload/Back/Forward.

Exit gate: UAT-02/03/04/08/12/13/18/20 pass; old Admin TicketCasePanel behavior remains.

### Phase C — Dispute follows Ticket pattern

1. Put Dispute under same full-height page container (currently inside padded max-w-7xl branch).
2. Default conversation mode; expose same mode control and queue scopes/filters; no top KPI clutter.
3. Fetch detail by dispute ID + order summary; single source of truth; shared header/context.
4. Add buyer/seller tabs with committed room state, request guards, per-side draft; preserve readOnly from API.
5. Remove operational multi-drawer flow only after workspace equivalents complete; preserve external detail/admin imports.
6. Adapt context: evidence, order, memo, owner, staff selector; consistent Admin destination labels.
7. Implement evidence inspector and existing permitted Admin verdict confirmation; no CS decision controls.

Exit gate: UAT-05/06/07/09/10/15/16/17/19/21 pass.

### Phase D — stabilization and delivery

1. Cross-role/closed/unassigned/permission-denied/network/out-of-order tests.
2. Validate all viewports, keyboard, contrast, focus/scroll, long names, missing fields and historic dates.
3. Run frontend targeted suite, relevant backend tests, changed-file lint and frontend build. Follow repository scripts/environment; do not bypass failing tests.
4. Run database integration only against dedicated migrated test DB; report unavailable DB/services and skip truthfully.
5. Final git diff inspection: no unrelated rewrites, no business-policy drift, no fake data or exposed internal endpoint.
6. Update this plan progress section and relevant existing feature handoff docs; return screenshots + tests and limitations.

Do not call phase complete because a screenshot looks right while API access/drafts/conflicts are broken.

## 11. NFR / quality constraints

| ID | Must requirement |
|---|---|
| NFR-01 Security | Server checks actor/resource on every read/mutation; no cross-party room leakage, no INTERNAL messages in public streams |
| NFR-02 Reliability | No stale response after resource switch; drafts retained on failure; retry not duplicate financial operation |
| NFR-03 Accessibility | Native actionable controls, visible focus, accessible tabs with keyboard navigation, labelled form errors, modal focus management, no color-only status |
| NFR-04 Responsive | Verify 360, 768, 1024, 1440, 1920 widths; no page horizontal overflow; tables scroll within container only |
| NFR-05 Readability | Readable existing body text scale; 2-line subject, full details available; touch controls >=44px where appropriate |
| NFR-06 Performance | Server pagination limit<=50, no per-row name fetch, no all-evidence eager full download, no duplicate mode polling/sockets |
| NFR-07 Maintainability | One state owner per domain; presentation components don't independently mutate/load same selected entity |
| NFR-08 Observability | Failures logged with safe case/action/correlation when existing facilities allow; no message body/token/PII logs |
| NFR-09 Regression | Existing Admin moderation/readOnly/ChatSocketProvider and requester chat flows continue working |
| NFR-10 Feedback | Local loading and actionable retry for each subresource, no fake success before server confirmation |

Don't invent production latency SLA without measurement. Record request count and task timing before/after against same test data/network; no new avoidable serial name lookups.

## 12. Error/state specification

| State | Expected UI |
|---|---|
| Queue loading | Skeleton/clear loading; selected detail not wiped unnecessarily |
| Queue empty | ไม่มีเคสในตัวกรองนี้; clear filters button; not network error |
| Queue error | Inline error + retry; retained results marked stale if shown |
| Detail loading | Header summary/skeleton, destructive controls disabled |
| Detail 403 | ไม่มีสิทธิ์เปิดรายละเอียดเคสนี้; no sensitive fallback; back to queue |
| Detail 404 | ไม่พบเคสนี้หรือเคสถูกนำออกแล้ว; back/refresh |
| Detail 5xx | โหลดรายละเอียดไม่ได้; retry same ID; not empty evidence |
| Join failure | Retain committed side, retry; composer not mismatched |
| Transcript failure | Error/retry inside chat; not “ไม่มีข้อความ” |
| 409 claim | มีเจ้าหน้าที่รับเคสนี้แล้ว; reload authorized summary/detail; no owner composer |
| 409 mutation | เคสมีข้อมูลใหม่ กรุณาตรวจสอบก่อนทำรายการอีกครั้ง; keep draft/memo |
| Session expired | Existing refresh/login behavior; clear other-account drafts on switch |
| Send fail | Keep exact text/file and recipient; show retry |
| Escalate fail | Dialog stays open with three memo fields and inline error |
| Escalate success | Show Admin destination; clear inaccessible CS room/detail; refresh queue |
| Close/verdict + lock failure | State success and separate lock warning; composer disabled from case status |
| Auth/name lookup fail | Honest ID fallback; ticket work still available |
| File missing/denied | Per-file error; don't close entire workspace |

## 13. Test matrix / traceability

Use existing Jest + React Testing Library and backend node:test. Tests must cover real branching, not only CSS/classes. UAT below needs browser verification, not just mocks.

| Test | Given / When | Then |
|---|---|---|
| UAT-01 | Open Ticket then Dispute conversation | Same layout; separate queues; only Dispute has recipient tabs |
| UAT-02 | Set scope/status/search/sort then switch modes and sections | Domain filters retained; same authorized result set |
| UAT-03 | Click row or keyboard activate เปิดเคส | Select exact ID, workspace opens directly; copy ID doesn't open |
| UAT-04 | Owner/unassigned/other-owner/closed Ticket under CS | Correct claim/readOnly/no-permission; direct server requests enforce boundary |
| UAT-05 | CS Dispute own/unassigned/Admin queue/other owner | Only permitted detail/chat available; no verdict |
| UAT-06 | Admin/T&S with single/multiple roles | Actual backend permissions; both private chats respect API readOnly; only eligible Admin verdict |
| UAT-07 | Buyer draft then click seller under delayed join | Send disabled during switch; committed receiver+room consistent; failures don't relabel old room |
| UAT-08 | Draft A/buyer, A/seller, Ticket B then modes/section/reload | No draft mixes; refresh text retained if sessionStorage; file restoration limitation disclosed |
| UAT-09 | Detail A slow, switch B fast, A resolves last | Only B header/body/actions; stale A finally doesn't clear B busy |
| UAT-10 | Start send/upload and attempt room/case switch | Prevent switch or complete safely to captured room; no text/file routed to new room |
| UAT-11 | Escalate/reassign/note fails, retry succeeds | Form stays intact; no false toast; closes only after success |
| UAT-12 | First response/resolution/reopen/closed/no SLA/overdue | Correct metric/cycle/state, readable days/hours/minutes; no completed overdue countdown |
| UAT-13 | >50 cases with different deadlines and filter scopes | All pages reachable; sort across full dataset; exact totals and stable pagination |
| UAT-14 | AssignedRole ADMIN/T&S/CS/unknown, long subjects/dates | Correct labels, no default misclassification, วันที่เปิด correct |
| UAT-15 | Name batch success/unavailable/missing user | Safe names, no N+1; honest fallback; no excessive PII response |
| UAT-16 | Evidence image/video/unknown uploader/missing MIME/403 | Correct grouping, preview and retry, object URL cleanup, no unauthorized access |
| UAT-17 | Staff picker no results/inactive/wrong role/stale version | No free-ID fake success; server validates; retained reason |
| UAT-18 | Reload selected URL, Back/Forward, malformed params | Correct authorized view; safe enum fallback; no navigation loop |
| UAT-19 | Mutation success then refresh fails; closed/verdict lock failure | Correct committed outcome; warn refresh/lock separately; no duplicate decision |
| UAT-20 | Keyboard-only at 360/768/1024/1440/1920 | Tabs/row action/drawer/modal usable, proper focus return, no clipped controls |
| UAT-21 | Admin Inbox ticket moderation + dispute audit + requester chat | Existing privileged/readOnly and public/internal separation preserved |
| UAT-22 | apiFetch 409/403/401 refresh/500/204/non-JSON/abort | status metadata correct, refresh intact, abort not normal error toast |

Suggested focused command starting points (verify installed scripts/config first):

```powershell
npm --workspace frontend run test -- --runInBand --coverage=false
npm --workspace frontend run build
npx eslint frontend/components/support frontend/components/chat/MessageComposer.js frontend/lib/api.js frontend/app/workspace/page.js
node --test backend/services/support-service/src/features/tickets/ticketState.test.js backend/services/support-service/src/features/tickets/ticketService.test.js backend/services/support-service/src/features/tickets/ticketModel.test.js
node --test backend/services/order-service/src/features/disputes/disputeOwnership.test.js backend/services/order-service/src/features/disputes/disputeChat.test.js backend/services/order-service/src/features/disputes/disputeChatAccessRoutes.test.js
```

Add new policy/error/hooks/room tests to actual suite; commands above aren't exhaustive proof. Relevant DB integration files: support-service/test/ticket-lifecycle.integration.test.js; order-service/test/dispute-ownership-hold.integration.test.js and dispute-decision.integration.test.js. Read their environment/setup; do not set production DATABASE_URL. No skipped integration reported as passed. Global existing failures documented separately; don't fix unrelated areas just to make whole monorepo green.

## 14. Completion checklist for implementer

- [ ] Reviewed pre-existing diff and preserved unrelated files
- [ ] All FR-01..20 and NFR-01..10 mapped to tests/screenshots
- [ ] Tickets/Disputes separate menus, identical workspace/table behavior
- [ ] CS table actions now open same workspace; no duplicate CS management panel
- [ ] Shared filters/search/paging/selection and URL restoration
- [ ] Backend access policy and readOnly reflected, no widened privilege
- [ ] apiFetch status fix actually makes 409 recovery work
- [ ] Queue limit/scope/sort/count backend tests pass
- [ ] Names and correct SLA field/state work without fabricated fallback
- [ ] Buyer/seller room commit + draft + in-flight operation safety verified
- [ ] Memo/reassign/decision dialogs retain data on error
- [ ] Role labels and Admin destination corrected
- [ ] Evidence inspection secure and usable on desktop/mobile
- [ ] Closed/decided composer locked; partial lock failures accurately described
- [ ] Context docked vs modal behavior and keyboard verified
- [ ] Admin Inbox/T&S/requester/chat consumers regressions covered
- [ ] Build/lint/tests reported with exact commands and skip/failure counts
- [ ] Screenshots included: Ticket conversation/table, Dispute buyer/seller/context/evidence, mobile
- [ ] Final diff contains no unrelated mass format, data reset, or secret

## 15. Decisions, assumptions, and unresolved facts

Decisions fixed by this handoff: separate domains; Ticket layout as base; table direct open; default context closed; CS owns reply work; Admin verdict; private buyer/seller tabs; one latest detail; shared state per domain; active semantic SLA; secure evidence.

Assumptions: primary usage desktop with mobile fallback; reuse existing product style, not new design theme; default scope mine and mode conversation; no new production policy durations; safe display-name enrichment permitted through existing staff authorization.

Facts implementer must inspect before using: exact staff picker API availability; shop-name lookup availability; current chat idempotency/upload cancellation contract; supported audit history routes for ticket timeline; actual hold balance/status field; multi-role ticket effectiveStaffRole details. Resolve through code and tests; if data/API missing implement minimal authorized additive contract or clearly state the remaining blocker. Do not invent timeline events or held amount from order price.

Future optional items outside Must scope: bulk case actions, keyboard shortcuts beyond accessibility, automatic routing, combined domain queue, custom saved views, new SLA policy/business-hours support. Do not expand this task into them.

## 16. Ready-to-paste prompt for the next AI

> Implement Customer Service UI improvements in this repository according to `docs/featureplan/customer-service/ui-unification-ai-handoff.md`. Read the entire document first and inspect actual code/contracts/tests before editing. The user chose to retain separate Ticket and Dispute pages, use the existing Ticket conversation layout as the shared pattern, and add buyer/seller private chat tabs to Disputes. Keep table mode as another view of the same queue; clicking a case opens the same conversation workspace. Do not use the earlier combined-queue mockup. Work through Phase A–D in order with each exit gate. Preserve pre-existing user changes, domain ownership, financial protections, and Admin/T&S audit behavior. Implement every Must requirement, including permissions, error HTTP status, queue pagination/scope/sort, semantic SLA, safe names, drafts, stale-request protection, awaited dialogs, evidence preview, and browser accessibility/responsiveness. Keep a progress checklist in the handoff document. Ask only for genuinely blocking business decisions; resolve ordinary implementation choices using this specification and current code. Report exact tests executed, real browser screenshots, skipped checks, and remaining limitations. Do not claim completion based on mock data or visual-only changes.

## 17. Progress (implementation updated 2026-10-08)

- [x] User design direction consolidated
- [x] Main frontend/backend contract gaps verified from current code
- [x] Detailed screen/state/API/file/phase/test specification written
- [x] Implementation Phase A — contracts, authorization, error metadata and queue tests
- [x] Implementation Phase B — shared Ticket workspace/table, drafts and context
- [x] Implementation Phase C — Dispute private tabs, context, evidence and staff actions
- [x] Implementation Phase D — automated checks, CS browser verification and delivery report

Implementation and actual verification are recorded in [ui-unification-implementation.md](ui-unification-implementation.md), including FR/NFR evidence and browser screenshots. Phase D covers the checks reported there; populated live evidence/upload, manual Admin/T&S/requester acceptance, formal accessibility and load testing remain pre-production validation. The detailed completion checklist above is retained as the original full acceptance checklist rather than marking unperformed checks passed. No production deployment was performed.
