const express = require("express");
const { errorHandler } = require("@reloop/shared");
const orderRoutes = require("./routes/orderRoutes");
const adminDisputeRoutes = require("./features/adminDisputes/adminDisputeRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "order-service" }),
);

app.use("/", orderRoutes);
app.use("/", adminDisputeRoutes);

app.use(errorHandler);

module.exports = app;
