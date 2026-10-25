# Chat Service – class diagram → โค้ดจริง

ชื่อ method ในรูปย่อให้อ่านง่าย ตารางนี้บอกชื่อจริงและไฟล์จริง (ตรวจด้วย script กับ export ในโค้ด)

| class ในรูป | method ในรูป | ไฟล์จริง (chat-service/src/…) | ฟังก์ชันจริง |
|---|---|---|---|
| `ConversationService` | `openProductChat` | `features/conversations/conversationService.js` | `createOrOpenProductConversation` |
| `ConversationService` | `getForParticipant` | `features/conversations/conversationService.js` | `getForParticipant` |
| `ConversationService` | `listInbox` | `features/conversations/conversationService.js` | `listInbox` |
| `ConversationService` | `withDisplayNames` | `features/conversations/conversationService.js` | `withDisplayNames` |
| `MessageService` | `send` | `features/messages/messageService.js` | `sendMessage` |
| `MessageService` | `list` | `features/messages/messageService.js` | `listMessages` |
| `MessageService` | `unreadCount` | `features/messages/messageService.js` | `unreadCount` |
| `AttachmentService` | `attach` | `features/attachments/attachmentService.js` | `attach` |
| `AttachmentService` | `download` | `features/attachments/attachmentService.js` | `resolveForDownload` |
| `AttachmentService` | `downloadForStaff` | `features/attachments/attachmentService.js` | `resolveForInternalDownload` |
| `NotificationService` | `create` | `features/notifications/notificationService.js` | `createNotification` |
| `NotificationService` | `list` | `features/notifications/notificationService.js` | `listNotifications` |
| `NotificationService` | `unreadCount` | `features/notifications/notificationService.js` | `unreadCount` |
| `NotificationService` | `markAllRead` | `features/notifications/notificationService.js` | `markAllRead` |
| `InternalService` | `createCaseChat` | `features/internal/internalService.js` | `createCaseConversation` |
| `InternalService` | `findByContext` | `features/internal/internalService.js` | `getByContext` |
| `InternalService` | `sendSystemMessage` | `features/internal/internalService.js` | `sendSystemMessage` |
| `InternalService` | `deleteCaseChats` | `features/internal/internalService.js` | `deleteByContext` |
| `InternalService` | `pushRealtime` | `features/internal/internalService.js` | `broadcastRealtime` |
| `InternalService` | `awaitingReply` | `features/internal/internalService.js` | `awaitingReplyIds` |
| `InternalService` | `caseUnread` | `features/internal/internalService.js` | `caseUnreadCounts` |
| `SupportMessageService` | `reply` | `features/internal/supportMessageService.js` | `reply` |
| `SupportMessageService` | `importLegacy` | `features/internal/supportMessageService.js` | `importMessage` |
| `Broadcast` | `pushMessage` | `realtime/broadcast.js` | `broadcastMessage` |
| `Broadcast` | `pushActivity` | `realtime/broadcast.js` | `broadcastActivity` |
| `Broadcast` | `pushCaseTyping` | `realtime/broadcast.js` | `broadcastCaseTyping` |
| `Broadcast` | `pushStatusChange` | `realtime/broadcast.js` | `broadcastStatusChange` |
| `Broadcast` | `pushNotification` | `realtime/broadcast.js` | `broadcastNotification` |
| `Broadcast` | `pushConversationDeleted` | `realtime/broadcast.js` | `broadcastConversationDeleted` |
| `Broadcast` | `pushCustom` | `realtime/broadcast.js` | `broadcastRealtime` |
| `SupportSyncWorker` | `sync` | `features/sync/supportSyncWorker.js` | `syncSupportMessage` |
| `SupportSyncWorker` | `deliver` | `features/sync/supportSyncWorker.js` | `deliverMessage` |
| `SupportSyncWorker` | `processPending` | `features/sync/supportSyncWorker.js` | `processPendingMessages` |
| `SupportSyncWorker` | `replayFailed` | `features/sync/supportSyncWorker.js` | `replayFailedMessages` |
| `SupportSyncWorker` | `start` | `features/sync/supportSyncWorker.js` | `startSupportSyncWorker` |
| `SupportSyncWorker` | `stop` | `features/sync/supportSyncWorker.js` | `stopSupportSyncWorker` |
| `Conversation` | `isParticipant` | `features/conversations/conversationService.js` | `isParticipant` |
| `Conversation` | `addParticipant` | `features/internal/internalService.js` | `addParticipant` |
| `Conversation` | `updateStatus` | `features/internal/internalService.js` | `updateStatus` |
| `Conversation` | `markRead` | `features/messages/messageService.js` | `markRead` |
| `Conversation` | `getTranscript` | `features/internal/internalService.js` | `getTranscript` |
| `Attachment` | `messageType` | `features/attachments/attachmentService.js` | `messageTypeFor` |
| `Attachment` | `preview` | `features/attachments/attachmentService.js` | `previewFor` |
| `Notification` | `markRead` | `features/notifications/notificationService.js` | `markRead` |
| `Notification` | `delete` | `features/notifications/notificationService.js` | `deleteNotification` |

ไม่ได้วาด (ตัวช่วยภายใน): `broadcast.setIo`, `broadcast.roomName`, `broadcast.userRoomName`, `supportSyncWorker.calculateBackoffMs`, `supportMessageService.keyedId`

ฟิลด์ที่ไม่ได้วาด: id, FK, contextKey, updatedAt, payload, storageKey และฟิลด์ sync ภายในของ Message
