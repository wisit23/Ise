const test=require("node:test");const assert=require("node:assert/strict");
const prisma=require("../src/models/prismaClient");const audit=require("../src/features/support/auditService");
function mock(t,obj,key,fn){const old=obj[key];obj[key]=fn;t.after(()=>obj[key]=old);}
test("hold audit keeps the public action contract while querying payment-linked OrderLog",async t=>{
 let query;mock(t,prisma.orderLog,"findMany",async q=>{query=q;return [{id:"event-1",orderId:"o1",actorId:"s1",action:"HOLD_PLACED",detail:"risk",createdAt:new Date()}];});
 mock(t,prisma.orderLog,"count",async()=>2);mock(t,prisma.disputeCase,"findMany",async()=>[{id:"d1",orderId:"o1"}]);
 const result=await audit.queryAudit({kind:"holds",page:2,limit:1,action:"HOLD",targetId:"o1"});
 assert.equal(query.skip,1);assert.deepEqual(query.where,{action:"HOLD_PLACED",orderId:"o1"});assert.equal(result.total,2);assert.equal(result.items[0].caseId,"d1");assert.equal(result.items[0].action,"HOLD");
});
test("case and evidence audit use bound filters and one pagination/count contract",async t=>{
 const queries=[];mock(t,prisma,"$queryRaw",async (strings,...values)=>{queries.push(values);return queries.length===1?[{id:"e1",case_id:"d1",actor_id:"s1",action:"VIEW_EVIDENCE",detail:"file",created_at:new Date(),order_id:"o1"}]:[{total:1}];});
 const result=await audit.queryAudit({kind:"disputes",page:2,limit:10,actorId:"s1",caseId:"d1",targetId:"o1"});
 assert.equal(result.items[0].action,"VIEW_EVIDENCE");assert.equal(result.items[0].caseId,"d1");assert.equal(result.total,1);
 for(const q of queries){const flat=q.flatMap(v=>v?.values || [v]);assert.ok(flat.includes("s1"));assert.ok(flat.includes("d1"));assert.ok(flat.includes("o1"));}
 assert.ok(queries[0].includes(10));
});
test("invalid audit kinds and date ranges fail before querying",async()=>{
 await assert.rejects(audit.queryAudit({kind:"invalid"}),e=>e.status===400);
 await assert.rejects(audit.queryAudit({kind:"holds",from:"bad-date"}),e=>e.status===400);
 await assert.rejects(audit.queryAudit({kind:"disputes",from:"2026-10-11",to:"2026-10-10"}),e=>e.status===400);
});
