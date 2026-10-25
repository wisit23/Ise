# Class diagram: รูปออกแบบ → โค้ดจริง

รูป `chat-support-class-diagram-design.drawio` ออกแบบแบบ OOP (class มีทั้งข้อมูลและ method).
ในโค้ดจริงใช้ Prisma: ข้อมูลของแต่ละ class อยู่ใน `schema.prisma` และ method อยู่ในไฟล์ service
โดยรับ object หรือ id เป็น parameter แทน `this`. ตารางนี้สร้างและตรวจด้วย script จากโค้ด

## chat-service

| class ในรูป | method ในรูป | อยู่ในโค้ดที่ |
|---|---|---|
| `ConversationService` | `createOrOpenProductConversation(…)` | `chat-service/src/features/conversations/conversationService.js` → `createOrOpenProductConversation` |
| `ConversationService` | `getForParticipant(…)` | `chat-service/src/features/conversations/conversationService.js` → `getForParticipant` |
| `ConversationService` | `withDisplayNames(…)` | `chat-service/src/features/conversations/conversationService.js` → `withDisplayNames` |
| `ConversationService` | `listInbox(…)` | `chat-service/src/features/conversations/conversationService.js` → `listInbox` |
| `MessageService` | `sendMessage(…)` | `chat-service/src/features/messages/messageService.js` → `sendMessage` |
| `MessageService` | `listMessages(…)` | `chat-service/src/features/messages/messageService.js` → `listMessages` |
| `MessageService` | `unreadCount(…)` | `chat-service/src/features/messages/messageService.js` → `unreadCount` |
| `AttachmentService` | `attach(…)` | `chat-service/src/features/attachments/attachmentService.js` → `attach` |
| `AttachmentService` | `resolveForDownload(…)` | `chat-service/src/features/attachments/attachmentService.js` → `resolveForDownload` |
| `AttachmentService` | `resolveForInternalDownload(…)` | `chat-service/src/features/attachments/attachmentService.js` → `resolveForInternalDownload` |
| `NotificationService` | `createNotification(…)` | `chat-service/src/features/notifications/notificationService.js` → `createNotification` |
| `NotificationService` | `listNotifications(…)` | `chat-service/src/features/notifications/notificationService.js` → `listNotifications` |
| `NotificationService` | `unreadCount(…)` | `chat-service/src/features/notifications/notificationService.js` → `unreadCount` |
| `NotificationService` | `markAllRead(…)` | `chat-service/src/features/notifications/notificationService.js` → `markAllRead` |
| `InternalService` | `createCaseConversation(…)` | `chat-service/src/features/internal/internalService.js` → `createCaseConversation` |
| `InternalService` | `getByContext(…)` | `chat-service/src/features/internal/internalService.js` → `getByContext` |
| `InternalService` | `sendSystemMessage(…)` | `chat-service/src/features/internal/internalService.js` → `sendSystemMessage` |
| `InternalService` | `deleteByContext(…)` | `chat-service/src/features/internal/internalService.js` → `deleteByContext` |
| `InternalService` | `broadcastRealtime(…)` | `chat-service/src/features/internal/internalService.js` → `broadcastRealtime` |
| `InternalService` | `awaitingReplyIds(…)` | `chat-service/src/features/internal/internalService.js` → `awaitingReplyIds` |
| `InternalService` | `caseUnreadCounts(…)` | `chat-service/src/features/internal/internalService.js` → `caseUnreadCounts` |
| `SupportMessageService` | `reply(…)` | `chat-service/src/features/internal/supportMessageService.js` → `reply` |
| `SupportMessageService` | `importMessage(…)` | `chat-service/src/features/internal/supportMessageService.js` → `importMessage` |
| `Broadcast` | `broadcastMessage(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastMessage` |
| `Broadcast` | `broadcastActivity(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastActivity` |
| `Broadcast` | `broadcastCaseTyping(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastCaseTyping` |
| `Broadcast` | `broadcastStatusChange(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastStatusChange` |
| `Broadcast` | `broadcastNotification(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastNotification` |
| `Broadcast` | `broadcastConversationDeleted(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastConversationDeleted` |
| `Broadcast` | `broadcastRealtime(…)` | `chat-service/src/realtime/broadcast.js` → `broadcastRealtime` |
| `SupportSyncWorker` | `deliverMessage(…)` | `chat-service/src/features/sync/supportSyncWorker.js` → `deliverMessage` |
| `SupportSyncWorker` | `processPendingMessages(…)` | `chat-service/src/features/sync/supportSyncWorker.js` → `processPendingMessages` |
| `SupportSyncWorker` | `replayFailedMessages(…)` | `chat-service/src/features/sync/supportSyncWorker.js` → `replayFailedMessages` |
| `SupportSyncWorker` | `startSupportSyncWorker(…)` | `chat-service/src/features/sync/supportSyncWorker.js` → `startSupportSyncWorker` |
| `SupportSyncWorker` | `stopSupportSyncWorker(…)` | `chat-service/src/features/sync/supportSyncWorker.js` → `stopSupportSyncWorker` |
| `SupportSyncWorker` | `syncSupportMessage(…)` | `chat-service/src/features/sync/supportSyncWorker.js` → `syncSupportMessage` |
| `Conversation` | `isParticipant(userId)` | `chat-service/src/features/conversations/conversationService.js` → `isParticipant` |
| `Conversation` | `addParticipant(userId, role)` | `chat-service/src/features/internal/internalService.js` → `addParticipant` |
| `Conversation` | `updateStatus(status)` | `chat-service/src/features/internal/internalService.js` → `updateStatus` |
| `Conversation` | `markRead(userId)` | `chat-service/src/features/messages/messageService.js` → `markRead` |
| `Conversation` | `getTranscript(before, limit, includeInternal)` | `chat-service/src/features/internal/internalService.js` → `getTranscript` |
| `Notification` | `markRead(userId)` | `chat-service/src/features/notifications/notificationService.js` → `markRead` |
| `Notification` | `delete(userId)` | `chat-service/src/features/notifications/notificationService.js` → `deleteNotification` |
| `Attachment` | `messageType()` | `chat-service/src/features/attachments/attachmentService.js` → `messageTypeFor` |
| `Attachment` | `preview()` | `chat-service/src/features/attachments/attachmentService.js` → `previewFor` |

ไม่ได้วาด (ตัวช่วยภายใน ไม่ใช่ use case): `broadcast.setIo`, `broadcast.roomName`, `broadcast.userRoomName`, `supportSyncWorker.calculateBackoffMs`, `supportMessageService.keyedId`

## support-service

| class ในรูป | method ในรูป | อยู่ในโค้ดที่ |
|---|---|---|
| `TicketService` | `getDashboardMetrics(…)` | `support-service/src/features/tickets/ticketService.js` → `getDashboardMetrics` |
| `TicketService` | `createTicket(…)` | `support-service/src/features/tickets/ticketService.js` → `createTicket` |
| `TicketService` | `getTicket(…)` | `support-service/src/features/tickets/ticketService.js` → `getTicket` |
| `TicketService` | `listMine(…)` | `support-service/src/features/tickets/ticketService.js` → `listMine` |
| `TicketService` | `listQueue(…)` | `support-service/src/features/tickets/ticketService.js` → `listQueue` |
| `TicketService` | `recordChatMessage(…)` | `support-service/src/features/tickets/ticketService.js` → `recordChatMessage` |
| `TicketService` | `recordChatEvent(…)` | `support-service/src/features/tickets/ticketService.js` → `recordChatEvent` |
| `HelpService` | `searchPublic(…)` | `support-service/src/features/help-content/helpService.js` → `searchPublic` |
| `HelpService` | `listForAgent(…)` | `support-service/src/features/help-content/helpService.js` → `listForAgent` |
| `HelpService` | `createDraft(…)` | `support-service/src/features/help-content/helpService.js` → `createDraft` |
| `SlaMonitor` | `checkAndEscalate(…)` | `support-service/src/features/sla/slaMonitor.js` → `checkAndEscalate` |
| `SlaMonitor` | `runOnce(…)` | `support-service/src/features/sla/slaMonitor.js` → `runOnce` |
| `SlaMonitor` | `start(…)` | `support-service/src/features/sla/slaMonitor.js` → `start` |
| `SlaMonitor` | `stop(…)` | `support-service/src/features/sla/slaMonitor.js` → `stop` |
| `AuditQuery` | `queryAudit(…)` | `support-service/src/features/audit/auditQuery.js` → `queryAudit` |
| `ExecutiveTickets` | `listExecutiveTickets(…)` | `support-service/src/features/executive/executiveTickets.js` → `listExecutiveTickets` |
| `ExecutiveTickets` | `getTicketOptions(…)` | `support-service/src/features/executive/executiveTickets.js` → `getTicketOptions` |
| `TicketStatus` | `canTransitionTo(status)` | `support-service/src/features/tickets/ticketState.js` → `canTransition` |
| `SupportTicket` | `reply(userId, role, body, isInternal)` | `support-service/src/features/tickets/ticketService.js` → `reply` |
| `SupportTicket` | `assignToSelf(userId, role, version)` | `support-service/src/features/tickets/ticketService.js` → `assignToSelf` |
| `SupportTicket` | `takeover(userId, role, version, reason)` | `support-service/src/features/tickets/ticketService.js` → `takeoverTicket` |
| `SupportTicket` | `changeStatus(userId, role, status, reason, version)` | `support-service/src/features/tickets/ticketService.js` → `changeStatus` |
| `SupportTicket` | `joinChat(userId, role)` | `support-service/src/features/tickets/ticketService.js` → `joinTicketChat` |
| `SupportTicket` | `getConversation(userId, role)` | `support-service/src/features/tickets/ticketService.js` → `getTicketConversation` |
| `SupportTicket` | `chatAccess(userId, role)` | `support-service/src/features/tickets/ticketService.js` → `getChatAccess` |
| `SupportTicket` | `moderate(userId, role, version, action, targetId, reason)` | `support-service/src/features/tickets/ticketModeration.js` → `moderateTicket` |
| `SupportTicket` | `capabilities(userId, role)` | `support-service/src/features/tickets/workspacePolicy.js` → `ticketCapabilities` |
| `HelpArticle` | `revise(role, authorId, title, body, category)` | `support-service/src/features/help-content/helpService.js` → `revise` |
| `HelpArticle` | `publish(role, version)` | `support-service/src/features/help-content/helpService.js` → `publish` |
| `HelpArticle` | `unpublish(role, version)` | `support-service/src/features/help-content/helpService.js` → `unpublish` |
| `HelpArticle` | `remove(role)` | `support-service/src/features/help-content/helpService.js` → `remove` |

ไม่ได้วาด (ตัวช่วยภายใน ไม่ใช่ use case): `ticketState.TRANSITIONS`, `ticketState.STATUSES`

ไม่ได้วาดในรูป: Controller / Route (รับ HTTP แล้วเรียกฟังก์ชันข้างบน), ไฟล์ `*Model.js`, helper, middleware, config

field ที่ตัดออกจาก domain class: FK (`...Id`) เพราะแทนด้วยตัวแปร object / เส้นความสัมพันธ์,
และ field สำหรับ sync ภายในของ Message (`idempotencyKey`, `syncStatus`, `syncedAt`, `syncAttempts`, `nextRetryAt`, `lastSyncError`)
