require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");

const PORT = process.env.ORDER_PORT || 3003;
app.listen(PORT, () => console.log(`[order-service] listening on ${PORT}`));
