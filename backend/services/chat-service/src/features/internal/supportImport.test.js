const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../models/prismaClient');
const { importMessage, keyedId } = require('./supportMessages');
const broadcast = require('../../realtime/broadcast');
function stub(t, target, name, implementation) {
  const old = target[name]; target[name] = implementation;
  t.after(() => { target[name] = old; });
}
async function invoke(body) {
  let status, data, error;
  await importMessage({params:{id:'a'.repeat(24)},body},{status(n){status=n;return this;},json(result){data=result;}},e=>{error=e;});
  return {status,data,error};
}
const input={ticketId:'ticket',sourceId:'old',authorId:'staff',authorRole:'AGENT',body:'Historical note',isInternal:true,createdAt:'2020-01-01T00:00:00Z'};
test('concurrent import/retry preserves one historical record without notifications or preview writes',async t=>{
  const store=new Map(); let notifications=0;
  stub(t,prisma.conversation,'findUnique',async()=>({id:'a'.repeat(24),contextId:'ticket',contextType:'SUPPORT',status:'LOCKED'}));
  stub(t,prisma.conversation,'update',async()=>{throw new Error('Import must not touch preview');});
  stub(t,prisma.message,'findUnique',async({where})=>store.get(where.id)||null);
  stub(t,prisma.message,'create',async({data})=>{
    if(store.has(data.id))throw Object.assign(new Error('Duplicate'),{code:'P2002'});
    store.set(data.id,data); return data;
  });
  t.mock.method(broadcast,'broadcastMessage',()=>notifications++);
  const responses=await Promise.all([invoke(input),invoke(input)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
  assert.equal(store.size,1);assert.equal(notifications,0);
  assert.equal(+responses[0].data.createdAt,+new Date(input.createdAt));
  assert.equal(responses[0].data.visibility,'INTERNAL');
  assert.equal((await invoke({...input,body:'changed'})).error.status,409);
  assert.equal((await invoke({...input,authorId:'other'})).error.status,409);
});
test('mirrored originals retain richer staff role and edited attachment content; missing originals block',async t=>{
  const id='b'.repeat(24);
  stub(t,prisma.conversation,'findUnique',async()=>({id:'a'.repeat(24),contextId:'ticket',contextType:'SUPPORT'}));
  stub(t,prisma.message,'findUnique',async({where})=>where.id===id ? {
    id,conversationId:'a'.repeat(24),senderId:'staff',senderRole:'ADMIN',visibility:'INTERNAL',body:'Edited original',type:'FILE',payload:{url:'original'},createdAt:new Date(input.createdAt),
  }:null);
  const original=await invoke({...input,chatMessageId:id});
  assert.equal(original.status,200);assert.equal(original.data.type,'FILE');assert.equal(original.data.senderRole,'ADMIN');
  assert.equal((await invoke({...input,chatMessageId:'c'.repeat(24)})).error.status,409);
  const requester = await invoke({...input,chatMessageId:id,authorRole:'REQUESTER'});
  assert.equal(requester.status,200);
  assert.equal(requester.data.senderRole,'ADMIN');
  assert.equal((await invoke({...input,chatMessageId:id,authorRole:'REQUESTER',authorId:'other'})).error.status,409);
  assert.notEqual(keyedId('room','legacy-support:old'),keyedId('room','legacy-support:other'));
});
