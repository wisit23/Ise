const express = require("express");
const { errorHandler } = require("@reloop/shared");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "review-service" }),
);

app.use("/", reviewRoutes);

app.use(errorHandler);

module.exports = app;
