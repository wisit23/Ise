# Support Service – class diagram → โค้ดจริง

ชื่อ method ในรูปย่อให้อ่านง่าย ตารางนี้บอกชื่อจริงและไฟล์จริง (ตรวจด้วย script กับ export ในโค้ด)

| class ในรูป | method ในรูป | ไฟล์จริง (support-service/src/…) | ฟังก์ชันจริง |
|---|---|---|---|
| `TicketService` | `create` | `features/tickets/ticketService.js` | `createTicket` |
| `TicketService` | `get` | `features/tickets/ticketService.js` | `getTicket` |
| `TicketService` | `listMine` | `features/tickets/ticketService.js` | `listMine` |
| `TicketService` | `listQueue` | `features/tickets/ticketService.js` | `listQueue` |
| `TicketService` | `dashboardMetrics` | `features/tickets/ticketService.js` | `getDashboardMetrics` |
| `TicketService` | `recordChatEvent` | `features/tickets/ticketService.js` | `recordChatEvent` |
| `TicketService` | `recordChatMessage` | `features/tickets/ticketService.js` | `recordChatMessage` |
| `HelpService` | `createDraft` | `features/help-content/helpService.js` | `createDraft` |
| `HelpService` | `searchPublic` | `features/help-content/helpService.js` | `searchPublic` |
| `HelpService` | `listForAgent` | `features/help-content/helpService.js` | `listForAgent` |
| `SlaMonitor` | `checkAndEscalate` | `features/sla/slaMonitor.js` | `checkAndEscalate` |
| `SlaMonitor` | `runOnce` | `features/sla/slaMonitor.js` | `runOnce` |
| `SlaMonitor` | `start` | `features/sla/slaMonitor.js` | `start` |
| `SlaMonitor` | `stop` | `features/sla/slaMonitor.js` | `stop` |
| `AuditQuery` | `query` | `features/audit/auditQuery.js` | `queryAudit` |
| `ExecutiveTickets` | `list` | `features/executive/executiveTickets.js` | `listExecutiveTickets` |
| `ExecutiveTickets` | `options` | `features/executive/executiveTickets.js` | `getTicketOptions` |
| `ReferenceService` | `listCategories` | `features/reference/referenceService.js` | `listCategories` |
| `SupportTicket` | `reply` | `features/tickets/ticketService.js` | `reply` |
| `SupportTicket` | `assignToSelf` | `features/tickets/ticketService.js` | `assignToSelf` |
| `SupportTicket` | `takeover` | `features/tickets/ticketService.js` | `takeoverTicket` |
| `SupportTicket` | `changeStatus` | `features/tickets/ticketService.js` | `changeStatus` |
| `SupportTicket` | `joinChat` | `features/tickets/ticketService.js` | `joinTicketChat` |
| `SupportTicket` | `getConversation` | `features/tickets/ticketService.js` | `getTicketConversation` |
| `SupportTicket` | `chatAccess` | `features/tickets/ticketService.js` | `getChatAccess` |
| `SupportTicket` | `moderate` | `features/tickets/ticketModeration.js` | `moderateTicket` |
| `SupportTicket` | `capabilities` | `features/tickets/workspacePolicy.js` | `ticketCapabilities` |
| `TicketStatus` | `canTransitionTo` | `features/tickets/ticketState.js` | `canTransition` |
| `HelpArticle` | `revise` | `features/help-content/helpService.js` | `revise` |
| `HelpArticle` | `publish` | `features/help-content/helpService.js` | `publish` |
| `HelpArticle` | `unpublish` | `features/help-content/helpService.js` | `unpublish` |
| `HelpArticle` | `remove` | `features/help-content/helpService.js` | `remove` |

## ฟิลด์ที่จัดกลุ่ม
`Classification` และ `Lifecycle` ไม่ใช่ตารางแยก เป็นการจัดกลุ่มคอลัมน์ของตาราง `support_tickets` (model `SupportTicket`) ให้อ่านง่าย:

- `Classification`: `priorityScore`, `riskReportCount`, `classificationReasonCodes`, `classificationPolicyVersion`, `riskLookupAvailable`
- `Lifecycle`: `closedAt`, `archivedAt`, `deletedAt`, `retentionUntil`

ไม่ได้วาด (ค่าคงที่ภายใน): `ticketState.TRANSITIONS`, `ticketState.STATUSES` (ใช้ใน `TicketStatus.canTransitionTo`)

ฟิลด์ที่ไม่ได้วาด: id, FK (`...Id`), `createdAt`/`updatedAt` ที่ไม่สำคัญต่อการออกแบบ, `version` (กันแก้พร้อมกัน), ฟิลด์ snapshot ของ SLA และ `searchText`
