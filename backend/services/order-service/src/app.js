const express = require("express");
const { errorHandler } = require("@reloop/shared");
const orderRoutes = require("./routes/orderRoutes");
const adminDisputeRoutes = require("./features/adminDisputes/adminDisputeRoutes");
const metricsRoutes = require("./features/metrics/metricsRoutes");
const internalMetricsRoutes = require("./features/metrics/internalMetricsRoutes");
const disputeChatAccessRoutes = require("./features/disputes/disputeChatAccessRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "order-service" }),
);

app.use("/executive", metricsRoutes);
app.use("/internal/executive", internalMetricsRoutes);
app.use("/internal", disputeChatAccessRoutes);
app.use("/", orderRoutes);
app.use("/", adminDisputeRoutes);

app.use(errorHandler);

module.exports = app;
