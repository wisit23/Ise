const express = require("express");
const { errorHandler } = require("@reloop/shared");
const authRoutes = require("./routes/authRoutes");
const internalRoutes = require("./features/internal/internalRoutes");
const adminKycRoutes = require("./features/adminKyc/adminKycRoutes");
const kycRoutes = require("./features/kyc/kycRoutes");
const reportRoutes = require("./features/reports/reportRoutes");
const bulkActionRoutes = require("./features/bulkActions/bulkActionRoutes");
const auditRoutes = require("./features/audit/auditRoutes");
const metricsRoutes = require("./features/metrics/metricsRoutes");
const executiveAuditRoutes = require("./features/executiveAudit/executiveAuditRoutes");
const productModerationRoutes = require("./features/productModeration/productModerationRoutes");
const sellerActivityRoutes = require("./features/sellerActivity/sellerActivityRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "auth-service" }),
);

app.use("/executive", metricsRoutes);
app.use("/executive", executiveAuditRoutes);
app.use("/internal", internalRoutes);
app.use("/", authRoutes);
app.use("/admin/kyc", adminKycRoutes);
app.use("/kyc", kycRoutes);
app.use("/", reportRoutes);
app.use("/", bulkActionRoutes);
app.use("/", auditRoutes);
app.use("/", productModerationRoutes);
// Internal service-to-service endpoints — guarded by INTERNAL_SERVICE_TOKEN,
// not by JWT. Mounted last so a missing token returns 403, not 404.
app.use("/internal", sellerActivityRoutes);

app.use(errorHandler);

module.exports = app;
