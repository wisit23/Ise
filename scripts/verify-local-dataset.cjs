const fs=require('node:fs'),assert=require('node:assert/strict');
const env=require('dotenv').parse(fs.readFileSync('.env'));
const label=process.env.LOCAL_DATASET_LABEL||'20261011';
const filename='tmp/local-dataset-'+label+'/workflow-checkpoints.json';
const state=JSON.parse(fs.readFileSync(filename));
const localUrl=key=>{const url=new URL(env[key]);url.hostname='127.0.0.1';if(key==='DATABASE_URL_CHAT')url.searchParams.set('directConnection','true');return url.toString();};
const clients={};for(const service of ['auth','product','order','support','chat']){const Client=require(service==='auth'?'@prisma/client':'../backend/services/'+service+'-service/src/generated/prisma-client').PrismaClient;clients[service]=new Client({datasources:{db:{url:localUrl('DATABASE_URL_'+service.toUpperCase())}}});}
async function main(){
 const {auth,product,order,support,chat}=clients;
 const orders=await order.order.findMany({include:{checkout:true,shipping:true,payments:{include:{holds:true}},dispute:{include:{evidence:true,caseLog:true}},logs:true}});
 assert.equal(orders.length,9);assert.equal(await order.checkout.count(),9);
 for(const row of orders){
  assert.ok(row.checkout && row.shipping);assert.equal(row.shipping.addressId,row.checkout.addressId);
  const address=await auth.userAddress.findUnique({where:{id:row.shipping.addressId}});assert.ok(address);assert.equal(address.userId,row.buyerId);
  assert.equal(row.shipping.addressSnapshot.recipientName,address.recipientName);
  const item=await product.product.findUnique({where:{id:row.productId}});assert.ok(item);assert.equal(item.sellerId,row.sellerId);
  if(!['pending','pending_payment','cancelled'].includes(row.status)){assert.equal(row.payments.length,1);assert.equal(Number(row.payments[0].paymentAmount),Number(row.ordersAmount));assert.ok(row.checkout.paidAt);}
  if(row.dispute){assert.equal(row.dispute.evidence.length,1);assert.equal(row.dispute.evidence[0].uploaderId,row.buyerId);assert.ok(row.payments[0].holds.some(hold=>hold.source==='DISPUTE'));}
  const room=await chat.conversation.findUnique({where:{contextKey:'PRODUCT:'+row.productId+':'+row.buyerId}});assert.ok(room);
  const messages=await chat.message.findMany({where:{conversationId:room.id}});
  assert.ok(messages.some(message=>message.senderId===row.buyerId));assert.ok(messages.some(message=>message.senderId===row.sellerId));
  if(row.payments.length)assert.equal(messages.filter(message=>message.payload?.event==='order.paid').length,1);
 }
 const refunded=orders.find(row=>row.id===state['refunded-order'].id);assert.equal(refunded.status,'refunded');assert.equal(refunded.dispute.decidedBy,'40000000-0000-0000-0000-000000000002');assert.ok(refunded.payments[0].holds.every(hold=>hold.holdStatus==='RELEASED'));
 const held=orders.find(row=>row.id===state['safety-order'].id);assert.ok(held.payments[0].holds.some(hold=>hold.source==='TRUST_AND_SAFETY' && hold.holdStatus==='ON_HOLD'));
 const tickets=await support.supportTicket.findMany({include:{currentStatus:true,chatLink:true,assignments:true,auditLog:true}});assert.equal(tickets.length,5);for(const ticket of tickets){assert.ok(ticket.chatLink);const room=await chat.conversation.findUnique({where:{id:ticket.chatLink.conversationId}});assert.equal(room.contextId,ticket.id);assert.equal(ticket.orderId,state['shipped-order'].id);}
 const takeover=tickets.find(ticket=>ticket.id===state['ticket-escalated'].id);assert.equal(takeover.chatResponderId,'20000000-0000-0000-0000-000000000001');assert.ok(takeover.assignments.some(assignment=>assignment.assigneeId==='40000000-0000-0000-0000-000000000003'));
 const campaign=await product.campaign.findUnique({where:{id:state['campaign-draft'].id}});const attribution=await product.campaignAttribution.findFirst({where:{orderId:state['completed-order'].id}});assert.ok(attribution);assert.equal(Number(attribution.netAmount),801);assert.equal(Number(campaign.spentBudget),89);
 assert.equal(await product.review.count(),1);assert.equal(await auth.report.count(),3);assert.equal(await product.auctionItem.count(),2);
 assert.equal(await product.productVideo.count(),2);assert.equal(await product.swipeChoice.count(),2);
 const summary={verifiedAt:new Date().toISOString(),orders:orders.length,checkouts:9,payments:await order.payment.count(),shipping:await order.shipping.count(),disputes:await order.disputeCase.count(),evidence:await order.disputeEvidence.count(),tickets:tickets.length,reports:3,reviews:1,auctions:2,campaigns:1,videos:2,swipeChoices:2,campaignDiscount:89,campaignNetSales:801,conversations:await chat.conversation.count(),messages:await chat.message.count(),status:'ready'};
 fs.writeFileSync('tmp/local-dataset-'+label+'/verification.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>Promise.all(Object.values(clients).map(client=>client.$disconnect())));
