// Runs prisma/seed.js against a fake Prisma client (no database) to check the
// operator switches for seeding a database that other people can reach.
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const bcrypt = require("bcryptjs");

const seedPath = path.resolve(__dirname, "../prisma/seed.js");
const ENV_KEYS = [
  "RELOOP_DEMO_PASSWORD",
  "RELOOP_SKIP_STAFF",
  "RELOOP_RESEED_DEMO",
];

// Loads the seed with the given env, returns the accounts it tried to create
// and everything it logged. Rejects if loading or running the seed fails.
function runSeed(env) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);

  const created = [];
  const logs = [];
  const originalLog = console.log;
  const originalLoad = Module._load;
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  const fakePrisma = {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => {
        created.push({
          email: data.email,
          role: data.role,
          passwordHash: data.passwordHash,
        });
      },
    },
    $disconnect: async () => finish(),
  };
  Module._load = function (request, ...rest) {
    if (request === "@prisma/client") {
      return {
        PrismaClient: function PrismaClient() {
          return fakePrisma;
        },
      };
    }
    if (request === "./roleCatalog") return { seedRoleCatalog: async () => {} };
    return originalLoad.call(this, request, ...rest);
  };
  console.log = (...args) => logs.push(args.join(" "));
  delete require.cache[seedPath];

  const restore = () => {
    Module._load = originalLoad;
    console.log = originalLog;
    delete require.cache[seedPath];
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };

  try {
    require(seedPath);
  } catch (error) {
    restore();
    return Promise.reject(error);
  }
  return finished.then(() => {
    restore();
    return { created, log: logs.join("\n") };
  });
}

const STAFF_EMAILS = [
  "ceo@example.com",
  "admin@example.com",
  "marketing@example.com",
  "trust.demo@example.com",
  "cs.nan@example.com",
  "cs.beam@example.com",
];

test("default seed is unchanged: every demo account with the documented password", async () => {
  const { created, log } = await runSeed({});
  assert.equal(created.length, 12);
  const emails = created.map((u) => u.email);
  for (const email of STAFF_EMAILS) assert.ok(emails.includes(email), email);
  for (const user of created)
    assert.ok(await bcrypt.compare("password123", user.passwordHash));
  assert.match(log, /password123/);
});

test("RELOOP_SKIP_STAFF=1 with a custom password seeds only sellers and buyers", async () => {
  const secret = "Correct-Horse-Battery-9";
  const { created, log } = await runSeed({
    RELOOP_SKIP_STAFF: "1",
    RELOOP_DEMO_PASSWORD: secret,
  });
  const emails = created.map((u) => u.email).sort();
  assert.deepEqual(emails, [
    "buyer.demo@example.com",
    "buyer.test@example.com",
    "shop.bag@example.com",
    "shop.denim@example.com",
    "shop.sneaker@example.com",
    "shop.vintage@example.com",
  ]);
  assert.deepEqual([...new Set(created.map((u) => u.role))].sort(), [
    "BUYER",
    "SELLER",
  ]);
  for (const user of created) {
    assert.ok(await bcrypt.compare(secret, user.passwordHash));
    assert.equal(await bcrypt.compare("password123", user.passwordHash), false);
  }
  assert.ok(!log.includes(secret), "log must not print the chosen password");
  assert.ok(!log.includes("password123"));
  assert.match(log, /RELOOP_SKIP_STAFF=1/);
});

test("a short or empty RELOOP_DEMO_PASSWORD stops the seed instead of using the default", async () => {
  for (const value of ["", "short-11-ch"]) {
    await assert.rejects(
      runSeed({ RELOOP_DEMO_PASSWORD: value }),
      /at least 12 characters/,
    );
  }
});
