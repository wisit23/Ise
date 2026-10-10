const express = require("express");
const { errorHandler } = require("@reloop/shared");
const ticketRoutes = require("./features/tickets/ticketRoutes");
const helpRoutes = require("./features/help-content/helpRoutes");
const internalRoutes = require("./features/internal/internalRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "support-service" }),
);

app.use("/internal", internalRoutes);
app.use("/help", helpRoutes);
app.use("/tickets", ticketRoutes);

app.use(errorHandler);

module.exports = app;
