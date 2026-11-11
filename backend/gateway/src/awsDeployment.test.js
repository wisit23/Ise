const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { spawn } = require("node:child_process");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

test(
  "AWS API mode forwards API/media, checks upstream readiness and supports credentialed CORS",
  { timeout: 20000 },
  async (t) => {
    let healthy = true;
    const upstream = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/ready") res.statusCode = healthy ? 200 : 503;
      res.end(JSON.stringify({ path: req.url }));
    });
    const target = await listen(upstream);
    t.after(() => {
      upstream.closeAllConnections();
      upstream.close();
    });
    const reservation = http.createServer();
    await listen(reservation);
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(process.execPath, [require.resolve("./server")], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: "aws-gateway-test-only",
        GATEWAY_PORT: String(port),
        GATEWAY_FRONTEND_PROXY: "false",
        GATEWAY_CHECK_UPSTREAMS: "true",
        FRONTEND_ORIGINS: "https://app.example.com",
        RELEASE_ID: "test-release",
        ...Object.fromEntries(
          ["AUTH", "PRODUCT", "ORDER", "CHAT", "SUPPORT"].map((name) => [
            `${name}_SERVICE_URL`,
            target,
          ]),
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => child.kill());
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("listening on")) resolve();
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Gateway exited: ${code}`)),
      );
    });
    const base = `http://127.0.0.1:${port}`;
    let response = await fetch(base + "/ready");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ready");
    response = await fetch(base + "/", {
      headers: { Origin: "https://app.example.com" },
    });
    assert.equal(response.status, 404);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://app.example.com",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
    response = await fetch(base + "/health", {
      headers: { Origin: "https://other.example.com" },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal((await response.json()).release, "test-release");
    response = await fetch(base + "/api/products/feed");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).path, "/feed");
    response = await fetch(base + "/review-uploads/photo.jpg");
    assert.equal((await response.json()).path, "/review-uploads/photo.jpg");
    healthy = false;
    response = await fetch(base + "/ready");
    assert.equal(response.status, 503);
    await response.body.cancel();
  },
);
