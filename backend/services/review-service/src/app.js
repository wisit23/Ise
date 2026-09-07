const express = require("express");
const { errorHandler } = require("@reloop/shared");
const reviewRoutes = require("./routes/reviewRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { REVIEW_UPLOAD_DIR } = require("./middleware/upload");

const app = express();
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "review-service" }),
);

// Review media belongs to review-service and is persisted in its own Docker
// volume. Reads are public through the gateway; creating files requires auth.
app.use("/review-uploads", express.static(REVIEW_UPLOAD_DIR));
app.use("/uploads", uploadRoutes);

app.use("/", reviewRoutes);

app.use(errorHandler);

module.exports = app;
