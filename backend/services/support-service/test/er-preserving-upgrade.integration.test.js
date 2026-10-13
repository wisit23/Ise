const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("../src/generated/prisma-client");
const { migrate } = require("../prisma/migrateMessagesToChat");
const CONTRACT = "20261014000000_approved_er_event_ownership";

// Explicit opt-in: never run migrations/fixtures on an ordinary DATABASE_URL.
const url = process.env.SUPPORT_ER_UPGRADE_URL;
function cli(args, env) {
  const r = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], { env, encoding: "utf8" });
  return { status: r.status, output: r.stdout + r.stderr };
}

test("populated upgrade guards every message, preserves rounds/snapshots and uses rerunnable Chat import", async t => {
  if (!url) { t.skip("Set SUPPORT_ER_UPGRADE_URL to an empty disposable database"); return; }
  const target = new URL(url);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '55439');
  assert.ok(['/chat_luna_er', '/support_upgrade_final_er'].includes(target.pathname), 'Rehearsal database allowlist');
  const database = target.pathname.slice(1);
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  const [{ existing }] = await db.$queryRaw`SELECT to_regclass('public.support_tickets')::text AS existing`;
  assert.equal(existing, null, "Upgrade fixture DB must start empty");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "support-er-upgrade-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.resolve(__dirname, "../prisma");
  fs.copyFileSync(path.join(source, "schema.prisma"), path.join(temp, "schema.prisma"));
  fs.mkdirSync(path.join(temp, "migrations"));
  for (const name of fs.readdirSync(path.join(source, "migrations"))) {
    if (name !== CONTRACT) fs.cpSync(path.join(source, "migrations", name), path.join(temp, "migrations", name), { recursive: true });
  }
  const env = { ...process.env, DATABASE_URL: url };
  let run = cli(["migrate", "deploy", "--schema", path.join(temp, "schema.prisma")], env);
  assert.equal(run.status, 0, run.output);
  // One round already achieved, another explicitly reopened, and a responder different from assignee.
  await db.$executeRaw`INSERT INTO support_tickets(id,ticket_number,requester_id,subject,description,ticket_category_id,ticket_priority_id,current_status_id,
    priority_score,risk_report_count,chat_responder_id,target_id,created_at,updated_at)
    SELECT 'upgrade-ticket','#CS-900001','buyer','historical ticket','retained',c.ticket_category_id,p.ticket_priority_id,s.ticket_status_id,
      71,9,'responder','counterparty','2020-01-01T00:00:00Z','2020-01-03T00:00:00Z'
    FROM ticket_categories c,ticket_priorities p,ticket_statuses s WHERE c.code='OTHER' AND p.code='NORMAL' AND s.code='IN_PROGRESS'`;
  await db.$executeRaw`INSERT INTO ticket_assignments(assignment_id,ticket_id,assignee_id,assigned_by_id,assigned_at)
    VALUES ('old-assignment','upgrade-ticket','owner','manager','2020-01-01T00:00:00Z')`;
  await db.$executeRaw`INSERT INTO ticket_status_history(status_history_id,ticket_id,from_status_id,to_status_id,changed_by_id,created_at)
    SELECT 'old-reopen','upgrade-ticket',f.ticket_status_id,s.ticket_status_id,'owner','2020-01-03T00:00:00Z'
    FROM ticket_statuses f,ticket_statuses s WHERE f.code='RESOLVED' AND s.code='IN_PROGRESS'`;
  for (const [id, metric, cycle, due, achieved] of [
    ['old-response','FIRST_RESPONSE',1,'2020-01-02T00:00:00Z','2020-01-01T01:00:00Z'],
    ['old-resolution','RESOLUTION',1,'2020-01-02T00:00:00Z','2020-01-02T00:00:00Z'],
    ['new-resolution','RESOLUTION',2,'2020-01-04T00:00:00Z',null],
  ]) {
    await db.$executeRaw`INSERT INTO ticket_sla_targets(sla_target_id,ticket_id,sla_policy_id,metric_type,cycle,due_at,achieved_at,created_at,updated_at)
      VALUES (${id},'upgrade-ticket','sla-default-NORMAL-v1',${metric},${cycle},${new Date(due)},${achieved ? new Date(achieved) : null},'2020-01-03T00:00:00Z','2020-01-03T00:00:00Z')`;
  }
  await db.$executeRaw`INSERT INTO ticket_messages(id,ticket_id,author_id,author_role,body,is_internal,created_at)
    VALUES ('old-public','upgrade-ticket','buyer','REQUESTER','Historical answer',false,'2020-01-01T02:00:00Z'),
      ('old-private','upgrade-ticket','responder','AGENT','Internal secret',true,'2020-01-01T03:00:00Z')`;
  await db.$executeRaw`INSERT INTO help_articles(id,slug,status,created_by_id,created_at,updated_at)
    VALUES ('old-article','old-article','DRAFT','writer','2020-01-01','2020-01-01')`;
  await db.$executeRaw`INSERT INTO help_article_revisions(article_id,version,help_category_id,title,body,author_id,created_at)
    SELECT 'old-article',1,help_category_id,'Old help','Original help body','writer','2020-01-01' FROM help_categories WHERE code='OTHER'`;
  const before = await db.$queryRaw`SELECT sla_target_id,due_at,achieved_at,sla_policy_id FROM ticket_sla_targets ORDER BY sla_target_id`;
  fs.cpSync(path.join(source, "migrations", CONTRACT), path.join(temp, "migrations", CONTRACT), { recursive: true });
  run = cli(["migrate", "deploy", "--schema", path.join(temp, "schema.prisma")], env);
  assert.notEqual(run.status, 0);
  const diagnoseGuard = () => spawnSync('docker', ['exec','-i','ise-er-rehearsal-20261014','psql','-U','er_test','-d',database,'-v','ON_ERROR_STOP=1'],
    { input: fs.readFileSync(path.join(source,'migrations',CONTRACT,'migration.sql'),'utf8'), encoding:'utf8' });
  assert.match(diagnoseGuard().stderr, /Unverified legacy ticket messages/);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_messages`)[0].n, 2);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_audit_events WHERE event_type='TICKET_OPENED'`)[0].n, 0, "Guard rollback is atomic");
  assert.equal((await migrate({ db })).pending, 2);
  await assert.rejects(migrate({ db, apply: true, chatClient: {
    createSupportConversation: async () => ({ id: 'a'.repeat(24) }),
    importTicketMessage: async () => { throw new Error('Chat unavailable'); },
  } }), /Chat unavailable/);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_audit_events WHERE event_type='MESSAGE_MIGRATED'`)[0].n,0);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_messages`)[0].n,2);

  // Exercise the real Chat import HTTP controller and token boundary with isolated storage.
  const request = require("supertest");
  process.env.INTERNAL_SERVICE_TOKEN = "upgrade-rehearsal-token";
  const chatPrisma = require("../../chat-service/src/models/prismaClient");
  const chatApp = require("../../chat-service/src/app");
  const messages = new Map();
  const conversation = { id: "a".repeat(24), contextType: "SUPPORT", contextId: "upgrade-ticket", status: "LOCKED", participants: [] };
  const stub = (target, name, implementation) => {
    const original = target[name]; target[name] = implementation;
    t.after(() => { target[name] = original; });
  };
  stub(chatPrisma.conversation, "findUnique", async () => conversation);
  stub(chatPrisma.message, "findUnique", async ({ where }) => messages.get(where.id) || null);
  stub(chatPrisma.message, "create", async ({ data }) => {
    if (messages.has(data.id)) throw Object.assign(new Error("Duplicate"), { code: "P2002" });
    messages.set(data.id, data); return data;
  });
  const client = {
    createSupportConversation: async () => conversation,
    importTicketMessage: async (id, data) => {
      const response = await request(chatApp).post(`/internal/conversations/${id}/import-support-message`)
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN).send(data);
      if (response.status >= 400) throw new Error(JSON.stringify(response.body));
      return response.body;
    },
  };
  assert.equal((await request(chatApp).post(`/internal/conversations/${conversation.id}/import-support-message`).send({})).status, 403);
  const result = await migrate({ db, chatClient: client, apply: true });
  assert.deepEqual(result, { verified: 2, pending: 0, archiveDeleted: false });
  assert.equal(messages.size, 2);
  assert.deepEqual(await migrate({ db, chatClient: client, apply: true }), result);
  assert.equal(messages.size, 2, "Retry never duplicates Chat history");
  assert.equal([...messages.values()].find(m => m.visibility === 'INTERNAL').body, 'Internal secret');
  assert.equal(+[...messages.values()].find(m => m.visibility === 'INTERNAL').createdAt, +new Date('2020-01-01T03:00:00Z'));
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM ticket_audit_events WHERE event_type='MESSAGE_MIGRATED' AND payload ? 'body'`)[0].n, 0);
  // A source change after verification must block destructive migration again.
  await db.$executeRaw`UPDATE ticket_messages SET body='Changed during import' WHERE id='old-public'`;
  assert.equal(cli(["migrate", "resolve", "--rolled-back", CONTRACT, "--schema", path.join(temp, "schema.prisma")], env).status, 0);
  run = cli(["migrate", "deploy", "--schema", path.join(temp, "schema.prisma")], env);
  assert.notEqual(run.status, 0); assert.match(diagnoseGuard().stderr, /Unverified legacy ticket messages/);
  await db.$executeRaw`UPDATE ticket_messages SET body='Historical answer' WHERE id='old-public'`;
  // No approximate timestamp pairing is permitted for a target whose numeric cycle has no reopen.
  await db.$executeRaw`UPDATE ticket_sla_targets SET cycle=3 WHERE sla_target_id='new-resolution'`;
  assert.equal(cli(["migrate", "resolve", "--rolled-back", CONTRACT, "--schema", path.join(temp, "schema.prisma")], env).status, 0);
  run = cli(["migrate", "deploy", "--schema", path.join(temp, "schema.prisma")], env);
  assert.notEqual(run.status,0);
  assert.match(diagnoseGuard().stderr,/Missing real reopen history/);
  await db.$executeRaw`UPDATE ticket_sla_targets SET cycle=2 WHERE sla_target_id='new-resolution'`;
  assert.equal(cli(["migrate", "resolve", "--rolled-back", CONTRACT, "--schema", path.join(temp, "schema.prisma")], env).status, 0);
  run = cli(["migrate", "deploy", "--schema", path.join(temp, "schema.prisma")], env);
  assert.equal(run.status, 0, run.output);
  assert.equal((await db.$queryRaw`SELECT to_regclass('public.ticket_messages')::text AS archive`)[0].archive, null);
  assert.deepEqual(await db.$queryRaw`SELECT sla_target_id,due_at,achieved_at,sla_policy_id FROM ticket_sla_targets ORDER BY sla_target_id`, before);
  const { toTicket, ticketInclude } = require("../src/features/tickets/ticketShape");
  const ticket = toTicket(await db.supportTicket.findUnique({ where: { id: 'upgrade-ticket' }, include: ticketInclude }));
  assert.equal(ticket.targetId, 'counterparty'); assert.equal(ticket.priorityScore,71); assert.equal(ticket.riskReportCount,9);
  assert.equal(ticket.assigneeId,'owner'); assert.equal(ticket.chatResponderId,'responder'); assert.equal(ticket.sla.cycle,2);
  assert.equal(+ticket.slaDueAt,+new Date('2020-01-04T00:00:00Z'));
  const events = await db.ticketAuditLog.findMany({ where: { ticketId: ticket.id, action: 'TICKET_REOPENED' } });
  assert.equal(events[0].payload.sourceHistoryId,'old-reopen');
  assert.equal(events[0].payload.targets[0].id,'new-resolution');
  const article = await db.helpArticleRevision.findUnique({where:{articleId_version:{articleId:'old-article',version:1}}});
  assert.equal(article.body,'Original help body');
});
