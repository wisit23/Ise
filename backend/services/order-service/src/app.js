const express = require("express");
const { errorHandler } = require("@reloop/shared");
const orderRoutes = require("./routes/orderRoutes");
const metricsRoutes = require("./features/metrics/metricsRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "order-service" }),
);

app.use("/executive", metricsRoutes);
app.use("/", orderRoutes);

app.use(errorHandler);

module.exports = app;
