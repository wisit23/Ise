const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
process.env.DATABASE_URL = process.env.DATABASE_URL_SUPPORT || process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET ||= 'er-test-access';
process.env.INTERNAL_SERVICE_TOKEN ||= 'er-test-internal';
const db = require('../src/models/prismaClient');
const model = require('../src/features/tickets/ticketModel');
const service = require('../src/features/tickets/ticketService');
const chat = require('../src/services/chatClient');
const app = require('../src/app');
const { signAccessToken } = require('@reloop/shared');
app.locals.validateAccessSession = async () => {};
async function ready(t) {
  if (!process.env.DATABASE_URL) { t.skip('Set disposable DATABASE_URL_SUPPORT'); return false; }
  await db.$queryRaw`SELECT 1`; return true;
}
async function ticket(t, extra={}) {
  const row=await model.create({requesterId:'er-buyer',subject:'ER event evidence',category:'OTHER',...extra});
  t.after(()=>db.supportTicket.delete({where:{id:row.id}})); return row;
}
test('log-backed queue/responder works through queue, trend and chat-access consumers',async t=>{
  if(!await ready(t))return;
  const row=await ticket(t,{priorityScore:81,riskReportCount:12});
  await model.assign({id:row.id,version:0,assigneeId:'er-owner',chatResponderId:'er-responder'});
  await model.transitionStatus({id:row.id,version:1,status:'ESCALATED',actorId:'er-owner',reason:'manual'});
  await model.reassign({id:row.id,version:2,assigneeId:'er-safety',assignedById:'er-safety'});
  const current=await model.findById(row.id);
  assert.equal(current.assigneeId,'er-safety');assert.equal(current.chatResponderId,'er-responder');
  assert.equal(current.priorityScore,81);assert.equal(current.riskReportCount,12);
  const queue=await model.listQueue({role:'CUSTOMER_SERVICE',scope:'mine',assigneeId:'er-responder',search:row.ticketNumber});
  assert.equal(queue.items[0].id,row.id);
  assert.equal((await model.listQueue({role:'CUSTOMER_SERVICE',scope:'mine',assigneeId:'er-owner',search:row.ticketNumber})).total,0);
  const access=await request(app).get(`/internal/tickets/${row.id}/chat-access/er-responder`).query({role:'AGENT'}).set('x-internal-token',process.env.INTERNAL_SERVICE_TOKEN);
  assert.deepEqual(access.body,{allowed:true,writable:true});
  const revoked=await request(app).get(`/internal/tickets/${row.id}/chat-access/er-owner`).query({role:'AGENT'}).set('x-internal-token',process.env.INTERNAL_SERVICE_TOKEN);
  assert.equal(revoked.body.allowed,false);
  const {readTicketTrend}=require('../src/features/tickets/ticketTrend');
  assert.ok((await readTicketTrend({role:'CUSTOMER_SERVICE',userId:'er-responder',days:8})).some(r=>r.value>=1));
  assert.equal('auditLog' in current,false);
});
test('reopen preserves target IDs, exact policy snapshot and old outcomes under concurrent retry',async t=>{
  if(!await ready(t))return;
  const category=await db.ticketCategory.findUnique({where:{code:'OTHER'}});
  const priority=await db.ticketPriority.findUnique({where:{code:'NORMAL'}});
  const at=new Date('2026-10-14T00:00:00Z');
  const policy=await db.slaPolicy.create({data:{categoryId:category.id,priorityId:priority.id,firstResponseMinutes:7,resolutionMinutes:23,effectiveFrom:new Date('2026-10-13T00:00:00Z')}});
  const row=await ticket(t,{createdAt:at});
  t.after(()=>db.slaPolicy.delete({where:{id:policy.id}}));
  // Hook order ensures the ticket/FKs are removed before the test policy.
  await model.assign({id:row.id,version:0,assigneeId:'er-owner'});
  await model.transitionStatus({id:row.id,version:1,status:'IN_PROGRESS'});
  await model.transitionStatus({id:row.id,version:2,status:'RESOLVED',at:new Date(+at+600000)});
  const first=await db.ticketSlaTarget.findFirst({where:{ticketId:row.id,metricType:'RESOLUTION'}});
  // Even a later edit to the policy row cannot retroactively change a recorded round's durations.
  await db.slaPolicy.update({where:{id:policy.id},data:{resolutionMinutes:999}});
  const reopenAt=new Date(+at+1200000);
  const results=await Promise.all([1,2].map(()=>model.transitionStatus({id:row.id,version:3,status:'IN_PROGRESS',at:reopenAt})));
  assert.equal(results.filter(Boolean).length,1);
  const rounds=await db.ticketAuditLog.findMany({where:{ticketId:row.id,action:{in:['TICKET_OPENED','TICKET_REOPENED']}},orderBy:{createdAt:'asc'}});
  assert.equal(rounds.length,2); assert.equal(rounds[1].payload.targets.length,1);
  assert.equal(rounds[1].payload.targets[0].policy.resolutionMinutes,23);
  const second=await db.ticketSlaTarget.findUnique({where:{id:rounds[1].payload.targets[0].id}});
  assert.equal(+second.dueAt,+reopenAt+23*60000);
  assert.deepEqual(await db.ticketSlaTarget.findUnique({where:{id:first.id}}),first);
  await model.transitionStatus({id:row.id,version:4,status:'RESOLVED',at:new Date(+reopenAt+60000)});
  assert.deepEqual(await db.ticketSlaTarget.findUnique({where:{id:first.id}}),first,'Resolving current round never overwrites old round');
  assert.equal((await model.findById(row.id)).sla.state,'complete');
  await assert.rejects(db.ticketAuditLog.create({data:{ticketId:row.id,actorId:'replay',action:'TICKET_REOPENED',payload:rounds[1].payload}}),{code:'P2002'});
});
test('Chat message metadata duplicate delivery is atomic; requester INTERNAL API output is filtered',async t=>{
  if(!await ready(t))return;
  const row=await ticket(t);
  await model.setConversationId(row.id,'er-room-'+row.id);
  await model.assign({id:row.id,version:0,assigneeId:'er-owner',chatResponderId:'er-owner'});
  const payload={ticketId:row.id,conversationId:'er-room-'+row.id,chatMessageId:'er-chat-'+row.id,authorId:'er-owner',authorRole:'AGENT',createdAt:new Date(),isInternal:true};
  const delivery=await Promise.all([1,2].map(()=>model.recordChatMessage(payload)));
  assert.equal(delivery.filter(r=>!r.alreadyRecorded).length,1);
  assert.equal((await model.findById(row.id)).firstResponseAt,null);
  assert.equal(await db.ticketAuditLog.count({where:{ticketId:row.id,action:'REPLY'}}),1);
  t.mock.method(chat,'getTicketMessages',async(_id,{includeInternal})=>{
    assert.equal(includeInternal,false);return {messages:[{id:'public',visibility:'ALL',body:'public'},{id:'secret',visibility:'INTERNAL',body:'secret'}],nextCursor:null};
  });
  const token=signAccessToken({sub:'er-buyer',role:'BUYER'});
  const res=await request(app).get('/tickets/'+row.id).set('Authorization','Bearer '+token);
  assert.equal(res.status,200);assert.equal(res.body.messages.length,1);assert.equal(res.body.messages[0].body,'public');
  await assert.rejects(service.getTicket({ticketId:row.id,userId:'er-stranger',role:'SELLER'}),{status:403});
});
test('independent tickets can be created concurrently without cross-ticket round conflicts',async t=>{
  if(!await ready(t))return;
  const rows=await Promise.all(Array.from({length:4},(_,i)=>model.create({requesterId:'er-parallel',subject:'parallel-'+i,category:'OTHER'})));
  t.after(()=>db.supportTicket.deleteMany({where:{id:{in:rows.map(r=>r.id)}}}));
  assert.equal(new Set(rows.map(r=>r.ticketNumber)).size,4);
  for(const row of rows)assert.equal(await db.ticketAuditLog.count({where:{ticketId:row.id,action:'TICKET_OPENED'}}),1);
});
test('public audit pagination excludes storage state and migration receipts', async t => {
  if (!await ready(t)) return;
  const row = await ticket(t, { chatResponderId: 'er-responder' });
  await db.ticketAuditLog.create({ data: {
    ticketId: row.id, actorId: 'migration:chat', action: 'MESSAGE_MIGRATED',
    payload: { legacyMessageId: 'old-message' },
  } });
  const { queryAudit } = require('../src/features/audit/auditQuery');
  const page = await queryAudit({ page: 1, limit: 1, targetId: row.id });
  assert.equal(page.total, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].action, 'STATUS_CHANGE');
  const internal = await queryAudit({ page: 1, limit: 10, targetId: row.id, action: 'MESSAGE_MIGRATED' });
  assert.equal(internal.total, 0);
  assert.deepEqual(internal.items, []);
  assert.ok(await db.ticketAuditLog.count({ where: { ticketId: row.id } }) > page.total);
});

test.after(()=>db.$disconnect());
