require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");

const PORT = process.env.REVIEW_PORT || 3005;
app.listen(PORT, () => console.log(`[review-service] listening on ${PORT}`));
