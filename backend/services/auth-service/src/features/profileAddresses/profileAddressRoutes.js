const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const profileAddressController = require("./profileAddressController");

const router = Router();

router.use(requireAuth);
router.get("/", profileAddressController.list);
router.post("/", profileAddressController.create);
router.patch("/:id", profileAddressController.update);
router.patch("/:id/default", profileAddressController.setDefault);
router.delete("/:id", profileAddressController.remove);

module.exports = router;
