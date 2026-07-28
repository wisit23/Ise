require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");

const PORT = process.env.PRODUCT_PORT || 3002;
app.listen(PORT, () => console.log(`[product-service] listening on ${PORT}`));
