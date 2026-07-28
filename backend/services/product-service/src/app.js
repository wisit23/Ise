const express = require("express");
const { errorHandler } = require("@reloop/shared");
const productRoutes = require("./routes/productRoutes");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "product-service" }),
);

app.use("/", productRoutes);

app.use(errorHandler);

module.exports = app;
