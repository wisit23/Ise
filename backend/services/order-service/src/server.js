require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const orderModel = require("./models/orderModel");
const productClient = require("./services/productClient");

const PORT = process.env.ORDER_PORT || 3003;
app.listen(PORT, () => {
  console.log(`[order-service] listening on ${PORT}`);
  const timer = setInterval(() => {
    orderModel.cleanExpiredOrders(productClient).catch((err) => {
      console.warn("[order-service] sweep failed:", err.message);
    });
  }, 15000);
  timer.unref();
});
