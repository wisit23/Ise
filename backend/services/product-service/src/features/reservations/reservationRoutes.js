const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const controller = require("./reservationController");

const router = Router({ mergeParams: true });

router.use(requireInternalToken);
router.post("/", controller.reserve);
router.delete("/:reservationId", controller.release);
router.post("/:reservationId/confirm", controller.confirm);

module.exports = router;
