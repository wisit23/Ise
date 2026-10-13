const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const url = process.env.SUPPORT_REAL_UPGRADE_URL;
const chatUrl = process.env.CHAT_SERVICE_URL;
const mongoUrl = process.env.DATABASE_URL_CHAT;
const contract = "20261014000000_approved_er_event_ownership";

test("real PostgreSQL to Chat HTTP/Mongo import preserves history before contract", {
  skip: !url,
  timeout: 120000,
}, async (t) => {
  const target = new URL(url);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.port, "55439");
  assert.equal(target.pathname, "/support_import_er");
  assert.equal(chatUrl, "http://127.0.0.1:56104");
  const mongo = new URL(mongoUrl);
  assert.equal(mongo.hostname, "127.0.0.1");
  assert.equal(mongo.port, "55441");
  assert.equal(mongo.pathname, "/chat_er_live");
  assert.equal(mongo.searchParams.get("replicaSet"), "er-rehearsal");
  // All mutation targets are validated before clients or migration tooling load.
  const { PrismaClient } = require("../src/generated/prisma-client");
  const { PrismaClient: ChatClient } = require("../../chat-service/src/generated/prisma-client");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const chatDb = new ChatClient({ datasources: { db: { url: mongoUrl } } });
  t.after(async () => { await db.$disconnect(); await chatDb.$disconnect(); });
  assert.equal((await db.$queryRaw`SELECT to_regclass('public.support_tickets')::text AS name`)[0].name, null);
  const root = path.resolve(__dirname, "..");
  const source = path.join(root, "prisma");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "support-real-upgrade-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.copyFileSync(path.join(source, "schema.prisma"), path.join(temporary, "schema.prisma"));
  fs.mkdirSync(path.join(temporary, "migrations"));
  for (const name of fs.readdirSync(path.join(source, "migrations"))) {
    if (name !== contract) fs.cpSync(path.join(source, "migrations", name), path.join(temporary, "migrations", name), { recursive: true });
  }
  const environment = { ...process.env, DATABASE_URL: url, DATABASE_URL_SUPPORT: url };
  function cli(args) {
    const result = spawnSync(process.execPath, args, { cwd: root, env: environment, encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  }
  const deploy = () => cli([require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", path.join(temporary, "schema.prisma")]);
  deploy();
  const ticketId = "real-upgrade-" + Date.now();
  await db.$executeRaw`INSERT INTO support_tickets(id,ticket_number,requester_id,subject,description,
    ticket_category_id,ticket_priority_id,current_status_id,priority_score,risk_report_count,created_at,updated_at)
    SELECT ${ticketId},${"#REAL-" + Date.now()},'legacy-buyer','real migration','preserve',c.ticket_category_id,p.ticket_priority_id,s.ticket_status_id,
      42,7,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z'
    FROM ticket_categories c,ticket_priorities p,ticket_statuses s WHERE c.code='OTHER' AND p.code='NORMAL' AND s.code='NEW'`;
  for (const metric of ["FIRST_RESPONSE", "RESOLUTION"]) {
    await db.$executeRaw`INSERT INTO ticket_sla_targets(sla_target_id,ticket_id,sla_policy_id,metric_type,cycle,due_at,created_at,updated_at)
      VALUES (${ticketId + metric},${ticketId},'sla-default-NORMAL-v1',${metric},1,'2020-01-02T00:00:00Z','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z')`;
  }
  await db.$executeRaw`INSERT INTO ticket_messages(id,ticket_id,author_id,author_role,body,is_internal,created_at)
    VALUES (${ticketId + '-public'},${ticketId},'legacy-buyer','REQUESTER','Original public body',false,'2020-01-01T01:02:03.123Z'),
      (${ticketId + '-private'},${ticketId},'legacy-agent','AGENT','Original private body',true,'2020-01-01T02:03:04.456Z')`;
  const before = await db.$queryRaw`SELECT sla_target_id,due_at,achieved_at FROM ticket_sla_targets WHERE ticket_id=${ticketId} ORDER BY sla_target_id`;
  const response = await fetch(chatUrl + "/internal/conversations", {
    method: "POST", headers: { "Content-Type": "application/json", "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN },
    body: JSON.stringify({ contextType: "SUPPORT", contextId: ticketId, createdBy: "migration",
      participants: [{ userId: "legacy-buyer", role: "BUYER" }] }),
  });
  assert.equal(response.status, 201);
  const room = await response.json();
  t.after(async () => {
    await chatDb.message.deleteMany({ where: { conversationId: room.id } });
    await chatDb.conversation.delete({ where: { id: room.id } });
  });
  await db.$executeRaw`INSERT INTO ticket_chat_links(ticket_id,conversation_id) VALUES (${ticketId},${room.id})`;
  assert.match(cli(["prisma/migrateMessagesToChat.js"]), /"pending":2/);
  assert.equal(await chatDb.message.count({ where: { conversationId: room.id } }), 0);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.match(cli(["prisma/migrateMessagesToChat.js", "--apply"]), /"verified":2/);
    assert.equal(await chatDb.message.count({ where: { conversationId: room.id } }), 2);
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_audit_events WHERE ticket_id=${ticketId} AND event_type='MESSAGE_MIGRATED'`)[0].n, 2);
  }
  const history = await chatDb.message.findMany({ where: { conversationId: room.id }, orderBy: { createdAt: "asc" } });
  assert.equal(history[0].body, "Original public body");
  assert.equal(history[0].visibility, "ALL");
  assert.equal(history[0].createdAt.toISOString(), "2020-01-01T01:02:03.123Z");
  assert.equal(history[1].body, "Original private body");
  assert.equal(history[1].visibility, "INTERNAL");
  assert.equal(history[1].createdAt.toISOString(), "2020-01-01T02:03:04.456Z");
  assert.ok(history.every(message => message.syncStatus === "SYNCED"));
  fs.cpSync(path.join(source, "migrations", contract), path.join(temporary, "migrations", contract), { recursive: true });
  deploy();
  assert.equal((await db.$queryRaw`SELECT to_regclass('public.ticket_messages')::text AS name`)[0].name, null);
  assert.deepEqual(await db.$queryRaw`SELECT sla_target_id,due_at,achieved_at FROM ticket_sla_targets WHERE ticket_id=${ticketId} ORDER BY sla_target_id`, before);
  const [{ payload }] = await db.$queryRaw`SELECT payload FROM ticket_audit_events WHERE ticket_id=${ticketId} AND event_type='QUEUE_CLASSIFIED'`;
  assert.equal(payload.priorityScore, 42);
  assert.equal(payload.riskReportCount, 7);
  await chatDb.$disconnect();
  assert.equal(await chatDb.message.count({ where: { conversationId: room.id } }), 2);
});
