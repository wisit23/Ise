const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { Server } = require("socket.io");
const { io } = require("socket.io-client");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

/** A stand-in chat-service (Socket.IO at the same path the real one uses) and
 * frontend behind a real gateway process. */
async function startStack(t) {
  const frontend = http.createServer((req, res) => res.end("frontend"));
  const frontendUrl = await listen(frontend);
  t.after(() => frontend.close());

  const chat = http.createServer();
  const socketServer = new Server(chat, { path: "/api/chat/socket.io" });
  socketServer.on("connection", (socket) => {
    socket.on("probe", (ack) => ack("chat"));
    socket.on("push-me", () => socket.emit("pushed", "from-server"));
  });
  const chatUrl = await listen(chat);
  t.after(() => socketServer.close());

  // server.js logs the configured port, not the bound one, so a free port is
  // reserved and released first (same approach as chatWebSocketProxy.test.js).
  const reservation = http.createServer();
  await listen(reservation);
  const gatewayPort = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const gateway = spawn(process.execPath, [require.resolve("./server")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      JWT_ACCESS_SECRET: "gateway-polling-regression-test",
      GATEWAY_PORT: String(gatewayPort),
      CHAT_SERVICE_URL: chatUrl,
      FRONTEND_SERVICE_URL: frontendUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => gateway.kill());
  let output = "";
  return new Promise((resolve, reject) => {
    gateway.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/listening on (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    gateway.on("error", reject);
    gateway.on("exit", (code) => reject(new Error(`gateway exited: ${code}`)));
  });
}

test(
  "Socket.IO long-polling works through the gateway without a bearer token",
  { timeout: 15000 },
  async (t) => {
    const gatewayUrl = await startStack(t);
    // A UI request first, so the frontend proxy's upgrade listener exists too.
    assert.equal(await (await fetch(gatewayUrl)).text(), "frontend");

    const client = io(gatewayUrl, {
      path: "/api/chat/socket.io",
      transports: ["polling"],
      reconnection: false,
      timeout: 2500,
    });
    t.after(() => client.close());
    await new Promise((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    assert.equal(client.io.engine.transport.name, "polling");

    // Client → server, through a polling POST.
    assert.equal(await client.timeout(2500).emitWithAck("probe"), "chat");

    // Server → client, through a held-open polling GET — the path that makes
    // a new chat message appear without a refresh.
    const pushed = new Promise((resolve) => client.once("pushed", resolve));
    client.emit("push-me");
    assert.equal(await pushed, "from-server");
  },
);

test(
  "the polling handshake answers an HTTP/1.0 request (what the production reverse proxy sends)",
  { timeout: 15000 },
  async (t) => {
    const gatewayUrl = await startStack(t);
    const { hostname, port } = new URL(gatewayUrl);
    const socket = net.connect(Number(port), hostname);
    t.after(() => socket.destroy());
    await once(socket, "connect");
    socket.write(
      "GET /api/chat/socket.io/?EIO=4&transport=polling HTTP/1.0\r\n" +
        `Host: ${hostname}:${port}\r\n\r\n`,
    );
    let raw = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => (raw += chunk));
    await once(socket, "end");

    assert.match(raw, /^HTTP\/1\.[01] 200/);
    // Engine.IO v4 open packet: "0" followed by the handshake JSON.
    const body = raw.slice(raw.indexOf("\r\n\r\n") + 4);
    assert.match(body, /^0\{"sid":"[^"]+"/);
  },
);
