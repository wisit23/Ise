const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { installReferenceDisplay } = require("./referenceDisplay");
const { referenceAliases } = require("./referenceAliases");

const id = "65b9f696-6fef-49d7-8047-4f7647d45dde";
const code = "USR-7K3M-9X2R-4T6W";
function fixture() {
  let queries = 0;
  const db = { user: {
    async findMany({ where }) {
      queries++;
      return (where.id?.in.includes(id) || where.referenceCode?.in.includes(code)) ? [{ id, referenceCode: code }] : [];
    },
    async findFirst({ where }) { return where.referenceCode === code ? { id } : null; },
  } };
  const app = express();
  app.use(express.json());
  installReferenceDisplay(app, db, "auth");
  app.use((req, res, next) => { if (req.get("authorization")) req.userId = "staff"; next(); });
  app.get("/allowed", (req, res) => res.json({ reporterId: id, reporter: { id }, reason: `[รายงานรีวิว #${id}]`, secret: "unchanged" }));
  app.get("/denied", (req, res) => res.status(403).json({ targetId: id }));
  app.get("/text", (req, res) => res.json({ message: `user-supplied ${id}` }));
  app.use(referenceAliases(db, "auth"));
  app.get("/search", (req, res) => res.json({ actorId: req.query.actorId, q: req.query.q }));
  return { app, queries: () => queries };
}

test("authorized payloads gain persisted codes without changing IDs or stored text; repeat lookups are cached", async () => {
  const { app, queries } = fixture();
  const response = await request(app).get("/allowed").set("authorization", "staff").expect(200);
  assert.equal(response.body.reporterId, id);
  assert.equal(response.body.reporterReferenceCode, code);
  assert.equal(response.body.reporter.referenceCode, code);
  assert.equal(response.body.reason, `[รายงานรีวิว #${id}]`);
  assert.equal(response.body.displayReferences[id], code);
  const count = queries();
  await request(app).get("/allowed").set("authorization", "staff").expect(200);
  assert.equal(queries(), count);
});

test("anonymous, denied and untrusted free text do not trigger reference lookup", async () => {
  const { app, queries } = fixture();
  assert.equal((await request(app).get("/allowed")).body.reporterReferenceCode, undefined);
  await request(app).get("/denied").set("authorization", "staff").expect(403);
  await request(app).get("/text").set("authorization", "staff").expect(200);
  assert.equal(queries(), 0);
});

test("internal batch lookup requires its secret, returns codes only, and rejects oversized requests", async () => {
  const original = process.env.INTERNAL_SERVICE_TOKEN;
  process.env.INTERNAL_SERVICE_TOKEN = "reference-test-secret";
  try {
    const { app } = fixture();
    await request(app).post("/internal/reference-codes").send({ ids: [id] }).expect(403);
    const result = await request(app).post("/internal/reference-codes").set("x-internal-token", "reference-test-secret").send({ ids: [id, "unknown"] }).expect(200);
    assert.deepEqual(result.body, { [id]: code });
    await request(app).post("/internal/reference-codes").set("x-internal-token", "reference-test-secret").send({ ids: Array(201).fill(id) }).expect(400);
    const reverse = await request(app).post("/internal/reference-codes").set("x-internal-token", "reference-test-secret").send({ codes: [code.toLowerCase()] }).expect(200);
    assert.deepEqual(reverse.body, { [id]: code });
  } finally {
    if (original === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = original;
  }
});

test("typed identifier filters accept copied codes while free-text search remains intact", async () => {
  const { app } = fixture();
  const result = await request(app).get("/search").query({ actorId: code.toLowerCase().replaceAll("-", ""), q: code }).expect(200);
  assert.equal(result.body.actorId, id);
  assert.equal(result.body.q, code);
});
