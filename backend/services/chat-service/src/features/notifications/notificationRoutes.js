const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const notificationController = require("./notificationController");

const router = Router();

router.get("/notifications", requireAuth, notificationController.list);
router.get("/notifications/unread-count", requireAuth, notificationController.unreadCount);
router.patch("/notifications/:id/read", requireAuth, notificationController.markRead);
router.delete("/notifications/:id", requireAuth, notificationController.remove);
router.post("/notifications/read-all", requireAuth, notificationController.markAllRead);

module.exports = router;

