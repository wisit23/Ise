const express = require("express");
const { errorHandler } = require("@reloop/shared");
const ticketRoutes = require("./features/tickets/ticketRoutes");
const helpRoutes = require("./features/help-content/helpRoutes");
const internalRoutes = require("./features/internal/internalRoutes");
const auditRoutes = require("./features/audit/auditRoutes");
const executiveRoutes = require("./features/executive/executiveRoutes");

const app = express();
app.use(require("@reloop/shared").referenceAliases(require("./models/prismaClient"), "support"));
app.use(express.json());
require("@reloop/shared").installReferenceDisplay(app, require("./models/prismaClient"), "support");

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "support-service" }),
);

app.use("/internal", internalRoutes);
app.use("/audit", auditRoutes);
app.use("/executive", executiveRoutes);
app.use("/help", helpRoutes);
app.use("/tickets", ticketRoutes);

app.use(errorHandler);

module.exports = app;
