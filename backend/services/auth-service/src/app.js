const express = require("express");
const { errorHandler } = require("@reloop/shared");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "auth-service" }),
);

app.use("/", authRoutes);

app.use(errorHandler);

module.exports = app;
