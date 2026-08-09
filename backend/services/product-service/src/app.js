const express = require("express");
const { errorHandler } = require("@reloop/shared");
const productRoutes = require("./routes/productRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const reservationRoutes = require("./features/reservations/reservationRoutes");
const { UPLOAD_DIR } = require("./middleware/upload");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "product-service" }),
);

// Uploaded media is served directly as static files; the gateway proxies
// GET /uploads/* to this service without requiring a bearer token (public
// marketplace images), while POST /uploads below still requires auth.
app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/uploads", uploadRoutes);

app.use("/internal/products", reservationRoutes);
app.use("/", productRoutes);

app.use(errorHandler);

module.exports = app;
