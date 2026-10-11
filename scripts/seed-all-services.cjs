const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const baseSeed = require("./seed-local-workflows.cjs");
const { env, label, output, request, step, state } = baseSeed;
const base = "http://127.0.0.1:" + (env.GATEWAY_PORT || 8080);
function localUrl(key) {
  const url = new URL(env[key]);
  assert.ok(url.pathname.startsWith("/reloop_demo_" + label + "_"));
  url.hostname = "127.0.0.1";
  if (key === "DATABASE_URL_CHAT")
    url.searchParams.set("directConnection", "true");
  return url.toString();
}
const clients = {};
for (const service of ["auth", "product", "order", "support", "chat"]) {
  const Client = require(
    service === "auth"
      ? "@prisma/client"
      : "../backend/services/" +
          service +
          "-service/src/generated/prisma-client",
  ).PrismaClient;
  clients[service] = new Client({
    datasources: {
      db: { url: localUrl("DATABASE_URL_" + service.toUpperCase()) },
    },
  });
}
const coverageFile = path.join(output, "all-service-coverage.json");
const covered = fs.existsSync(coverageFile)
  ? JSON.parse(fs.readFileSync(coverageFile))
  : {};
function coverage(domain, scenarios) {
  covered[domain] = { scenarios, checkedAt: new Date().toISOString() };
  fs.writeFileSync(coverageFile, JSON.stringify(covered, null, 2));
  console.log("COVERED " + domain);
}
async function image(title, lines) {
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const text = [title, ...lines, "DEMO ONLY - NO REAL CUSTOMER DATA"];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="500"><rect width="1100" height="500" fill="#fff"/>' +
    text
      .map(
        (line, index) =>
          '<text x="30" y="' +
          (50 + index * 55) +
          '" font-family="sans-serif" font-size="22">' +
          escape(line) +
          "</text>",
      )
      .join("") +
    "</svg>";
  return new Blob([await require("sharp")(Buffer.from(svg)).png().toBuffer()], {
    type: "image/png",
  });
}
async function binary(route, token, expected = 200) {
  const response = await fetch(base + route, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expected, route);
  const bytes = await response.arrayBuffer();
  if (expected === 200) assert.ok(bytes.byteLength > 0);
  return { status: response.status, bytes: bytes.byteLength };
}
async function customer(key, { authenticate = true } = {}) {
  const email = "demo." + label + "." + key + "@example.com";
  await step("full-account-" + key, async () => {
    const created = await request("/api/auth/register", null, {
      email,
      password: "password123",
      firstName: "Demo",
      lastName: key,
      phone: "0800000000",
    });
    return { user: created.user, email };
  });
  if (!authenticate) return { user: state["full-account-" + key].user };
  return request("/api/auth/login", null, { email, password: "password123" });
}
async function main() {
  await baseSeed.main();
  const emails = {
    buyer: "buyer.demo@example.com",
    seller: "shop.denim@example.com",
    otherSeller: "shop.sneaker@example.com",
    cs: "cs.nan@example.com",
    otherCs: "cs.beam@example.com",
    admin: "admin@example.com",
    trust: "trust.demo@example.com",
    marketing: "marketing@example.com",
    executive: "ceo@example.com",
  };
  const accounts = {};
  for (const [role, email] of Object.entries(emails))
    accounts[role] = await request("/api/auth/login", null, {
      email,
      password: "password123",
    });
  const token = (role) => accounts[role].accessToken;
  const ctx = {
    ...baseSeed,
    accounts,
    token,
    customer,
    image,
    binary,
    coverage,
    ...Object.fromEntries(
      Object.entries(clients).map(([service, client]) => [
        service + "Db",
        client,
      ]),
    ),
  };
  require("./local-dataset/commerce.cjs")(ctx);
  await require("./local-dataset/full-auth.cjs")(ctx);
  await require("./local-dataset/full-auctions.cjs")(ctx);
  await require("./local-dataset/full-product.cjs")(ctx);
  await require("./local-dataset/full-order-chat.cjs")(ctx);
  await require("./local-dataset/full-support.cjs")(ctx);
  await require("./local-dataset/full-access.cjs")(ctx);
  await require("./local-dataset/full-auctions.cjs")(ctx, true);
  console.log("Full-service seed phase completed");
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error(error.stack);
      process.exitCode = 1;
    })
    .finally(() =>
      Promise.all(Object.values(clients).map((client) => client.$disconnect())),
    );
