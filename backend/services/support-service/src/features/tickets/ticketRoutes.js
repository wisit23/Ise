const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const ticketController = require("./ticketController");

const router = Router();

// "/mine" and "/queue" must come before "/:id" so Express doesn't read them as an id.
router.get("/mine", requireAuth, ticketController.mine);
router.get("/queue", requireAuth, ticketController.queue);

router.post("/", requireAuth, ticketController.create);
router.get("/:id", requireAuth, ticketController.getOne);
router.post("/:id/messages", requireAuth, ticketController.reply);
router.post("/:id/assign", requireAuth, ticketController.assign);
router.patch("/:id/status", requireAuth, ticketController.changeStatus);

module.exports = router;
