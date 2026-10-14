const { Router } = require("express");
const { requireAuth, requireCustomerAccount } = require("@reloop/shared");
const controller = require("./styleProfileController");

const router = Router();
router.use(requireAuth, requireCustomerAccount);
router.get("/", controller.get);
router.patch("/", controller.update);

module.exports = router;
