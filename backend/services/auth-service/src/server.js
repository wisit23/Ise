require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]);

const app = require("./app");

const PORT = process.env.AUTH_PORT || 3001;
app.listen(PORT, () => console.log(`[auth-service] listening on ${PORT}`));
