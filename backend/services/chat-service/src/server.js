require("dotenv").config();
const http = require("http");
const app = require("./app");

const PORT = process.env.CHAT_PORT || 3004;
const server = http.createServer(app);
// Socket.IO is attached here once chat rooms/messages land in Phase 4.
server.listen(PORT, () => console.log(`[chat-service] listening on ${PORT}`));
