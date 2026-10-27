const express = require("express");
const { errorHandler } = require("@reloop/shared");
const orderRoutes = require("./routes/orderRoutes");
const adminDisputeRoutes = require("./features/adminDisputes/adminDisputeRoutes");
const metricsRoutes = require("./features/metrics/metricsRoutes");
const marketingMetricsRoutes = require("./features/metrics/marketingMetricsRoutes");
const internalMetricsRoutes = require("./features/metrics/internalMetricsRoutes");
const disputeChatAccessRoutes = require("./features/disputes/disputeChatAccessRoutes");

const app = express();
app.use((req, res, next) => {
  const json = res.json;
  res.json = function (body) {
    res.set("X-Server-Time", new Date().toISOString());
    return json.call(this, body);
  };
  next();
});
app.use(require("@reloop/shared").referenceAliases(require("./models/prismaClient"), "order"));
app.use(express.json());
require("@reloop/shared").installReferenceDisplay(app, require("./models/prismaClient"), "order");

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "order-service" }),
);

app.use("/executive", metricsRoutes);
app.use("/marketing", marketingMetricsRoutes);
app.use("/internal/executive", internalMetricsRoutes);
app.use("/internal", disputeChatAccessRoutes);
app.use("/", orderRoutes);
app.use("/", adminDisputeRoutes);

app.use(errorHandler);

module.exports = app;
