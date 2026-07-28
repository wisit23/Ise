const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const orderController = require("../controllers/orderController");

const router = Router();

router.post("/", requireAuth, orderController.create);
router.get("/mine", requireAuth, orderController.mine);
router.get("/selling", requireAuth, orderController.selling);
router.get("/:id", requireAuth, orderController.getOne);
router.patch("/:id/status", requireAuth, orderController.updateStatus);
router.patch("/:id/pay", requireAuth, orderController.pay);

module.exports = router;
