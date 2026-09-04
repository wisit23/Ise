require("dotenv").config();
const { requireEnv } = require("@reloop/shared");

requireEnv(["DATABASE_URL"]);

const http = require("http");
const app = require("./app");
const { createSocketServer } = require("./realtime/socketServer");

const PORT = process.env.CHAT_PORT || 3004;
// Socket.IO attaches to the raw http.Server, not the Express app directly —
// app.listen() would create one implicitly but not hand back a reference
// this file can pass to createSocketServer, so it's created explicitly here
// instead.
const server = http.createServer(app);
createSocketServer(server);
// close() exists for test harnesses; the long-running process just gets
// killed, so it's intentionally unused here.

server.listen(PORT, () => console.log(`[chat-service] listening on ${PORT}`));
