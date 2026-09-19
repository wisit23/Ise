const express = require("express");
const {
  errorHandler,
  requireInternalToken,
  verifyAccessToken,
  sessionUnavailable,
} = require("@reloop/shared");
const {
  validateAccessSession,
  revokedSession,
} = require("./services/sessionService");
const authRoutes = require("./routes/authRoutes");
const adminKycRoutes = require("./features/adminKyc/adminKycRoutes");
const kycRoutes = require("./features/kyc/kycRoutes");
const reportRoutes = require("./features/reports/reportRoutes");
const bulkActionRoutes = require("./features/bulkActions/bulkActionRoutes");
const auditRoutes = require("./features/audit/auditRoutes");
const metricsRoutes = require("./features/metrics/metricsRoutes");
const productModerationRoutes = require("./features/productModeration/productModerationRoutes");

const prisma = require("./models/prismaClient");
const authService = require("./services/authService");

const app = express();
app.use(express.json());
app.locals.validateAccessSession = validateAccessSession;

app.post(
  "/internal/sessions/validate",
  requireInternalToken,
  async (req, res, next) => {
    let payload;
    try {
      payload = verifyAccessToken(req.body.accessToken);
    } catch {
      return next(revokedSession());
    }
    try {
      await validateAccessSession(payload);
      res.json({ active: true });
    } catch (error) {
      next(
        error.code === "SESSION_REVOKED" || error.code === "ACCOUNT_SUSPENDED"
          ? error
          : sessionUnavailable(),
      );
    }
  },
);

app.get(
  "/internal/users/:id",
  requireInternalToken,
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      if (!user) return res.status(404).json({ error: "user not found" });
      const roles = await authService.getUserRoles(user.id);
      res.json({
        id: user.id,
        email: user.email,
        status: user.status,
        role: user.role,
        roles,
      });
    } catch (err) {
      next(err);
    }
  },
);

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "auth-service" }),
);

app.use("/executive", metricsRoutes);
app.use("/", authRoutes);
app.use("/admin/kyc", adminKycRoutes);
app.use("/kyc", kycRoutes);
app.use("/", reportRoutes);
app.use("/", bulkActionRoutes);
app.use("/", auditRoutes);
app.use("/", productModerationRoutes);

app.use(errorHandler);

module.exports = app;
