# Test-feedback fixes: Google Doc items 1–8

## Agreement
- Mode: implement and verify; approved in conversation with “เริ่มได้”.
- Source: https://docs.google.com/document/d/1bjHiMe6vIThxu_KlbRJfJSQiHl58DVaPj0v-XD4xaRs/edit?tab=t.h3v8sxecuak0
- Preserve pre-existing post-purchase chat/review-edit work and unrelated image files.
- Cancellation decision B: buyers may cancel pending, pending_payment, or paid orders; seller confirmation (`confirmed`) begins preparation and stops buyer cancellation. Existing holds/disputes and optimistic concurrency still apply.
- Refunds use the existing simulated-payment ledger, not a real payment gateway.
- No deployment, live-data mutation, dependency upgrade, or destructive database operation.

## Route
| Item | Result | State | Evidence |
| --- | --- | --- | --- |
| 1 | Preserve post-purchase seller chat | done | postPurchaseChat.test.js, orderClient.test.js, frontend OrderLine/chat tests |
| 2 | Preserve review editing | done | reviewEdit.test.js, reviewEditModel.test.js, MyOrders.review.test.js |
| 3 | Separate status notifications and independent unread state, including socket replay handling | done | notificationService.test.js, NotificationBell.test.js, chatNotifications.test.js |
| 4 | Book opening and closing jobs; notify on successful opening and auction-order creation | done | auctionCloseQueue.test.js, auctionService.test.js, auction-notification.test.js, chatNotifications.test.js |
| 5/8 | Buyer cancellation before preparation only, simulated refund, relist, confirmation UI | done | orderLifecycle.test.js, orderModel.test.js, MyOrders.cancel.test.js |
| 6 | Keep saved CSAT visible when ticket returns to IN_PROGRESS | done | shared csat.test.js and frontend app/support/tickets/[id]/page.test.js |
| 7 | Include report reason without reporter identity | done | report-pending-notifications.test.js; report modal displays reportReason separately from admin reason |

## Decisions and checks
- Reproduced notification overwrite and missing report reason with failing regression assertions before the fixes.
- Initial order lifecycle test execution was blocked by a missing generated Prisma client (not a behavior failure). Ran the repository's `node scripts/ensurePrismaClients.js`; generation succeeded without migrations or database access.
- Final backend regression run: **278 tests passed, zero failures**, across 18 files. Includes chat, reviews, notifications, order controller/lifecycle/shipping, model-level refund/concurrency, report reasons, CSAT, opening/closing queue jobs, restoration of previously scheduled auctions, auction service and schedule policy.
- Final frontend regression run: **11 suites / 71 tests passed**, including live notification history and read-preserving socket replays, cancellation confirmation and seller-preparation conflict, review editing, saved CSAT after reopening, report-reason display, order details and prior chat changes.
- Scoped ESLint: **46 changed/new JavaScript files, zero errors and zero warnings**; final replay changes also linted cleanly.
- `git diff --check`: passed. Self-review checked the cancellation preparation boundary, optimistic version/status guard before refunds, separate notification identity/read state, startup rebooking of existing auction schedules and preservation of pre-existing work.

## Continue from here
- Implementation and scoped automated regression checks are complete. No deployment performed.
- Product-service startup now rebooks both boundaries of existing scheduled auctions; new/edited schedules book both immediately. Scheduled-to-open uses a conditional update so concurrent jobs/page visits do not duplicate the opening notification.
- Not verified: deployed website, browser-driven end-to-end flow, real PostgreSQL/Redis integration or real refunds. Automated checks use service/controller/queue fixtures and React component tests; they are not live end-to-end proof.
- Notification history that was overwritten before this change cannot be reconstructed by this fix.
