const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { Server } = require("socket.io");
const { io } = require("socket.io-client");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

test(
  "chat WebSockets survive frontend requests through the gateway",
  { timeout: 15000 },
  async (t) => {
    const frontend = http.createServer((req, res) => res.end("frontend"));
    const frontendUrl = await listen(frontend);
    t.after(() => frontend.close());
    const chat = http.createServer();
    const socketServer = new Server(chat, { path: "/api/chat/socket.io" });
    socketServer.on("connection", (socket) => {
      socket.on("probe", (ack) => ack("chat"));
    });
    const chatUrl = await listen(chat);
    t.after(() => socketServer.close());

    const reservation = http.createServer();
    const gatewayUrl = await listen(reservation);
    const gatewayPort = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const gateway = spawn(process.execPath, [require.resolve("./server")], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: "gateway-websocket-regression-test",
        GATEWAY_PORT: String(gatewayPort),
        CHAT_SERVICE_URL: chatUrl,
        FRONTEND_SERVICE_URL: frontendUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => gateway.kill());
    let output = "";
    await new Promise((resolve, reject) => {
      gateway.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/listening on (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      gateway.on("error", reject);
      gateway.on("exit", (code) =>
        reject(new Error(`gateway exited: ${code}`)),
      );
    });

    assert.equal(await (await fetch(gatewayUrl)).text(), "frontend");
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        const client = io(gatewayUrl, {
          path: "/api/chat/socket.io",
          transports: ["websocket"],
          reconnection: false,
          timeout: 2500,
        });
        t.after(() => client.close());
        await new Promise((resolve, reject) => {
          client.once("connect", resolve);
          client.once("connect_error", reject);
        });
        const response = await client.timeout(2500).emitWithAck("probe");
        assert.equal(response, "chat");
      }),
    );
  },
);
