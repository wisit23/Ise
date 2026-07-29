const { Router } = require("express");
const { requireAuth } = require("@reloop/shared");
const authController = require("../controllers/authController");

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.patch("/me", requireAuth, authController.updateMe);
router.get("/users/:id/public", authController.publicProfile);

module.exports = router;
