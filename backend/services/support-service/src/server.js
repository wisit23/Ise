require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const app = require("./app");
const slaMonitor = require("./features/sla/slaMonitor");

const PORT = process.env.SUPPORT_PORT || 3006;
app.listen(PORT, () => console.log(`[support-service] listening on ${PORT}`));
slaMonitor.start();
