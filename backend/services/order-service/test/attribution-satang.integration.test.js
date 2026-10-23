const test=require("node:test");const assert=require("node:assert/strict");
const orderDb=require("../src/models/prismaClient");const productDb=require("../../product-service/src/models/prismaClient");
const {createOrder,deleteOrder}=require("./fixtures");const orderModel=require("../src/models/orderModel");
const outbox=require("../src/services/attributionOutboxService");const metrics=require("../../product-service/src/features/campaigns/campaignMetrics");
test("Buyer satang survive atomic completion, Product attribution, audit and duplicate delivery",async t=>{
 if(!process.env.DATABASE_URL_ORDER || !process.env.DATABASE_URL_PRODUCT){if(process.env.REQUIRE_INTEGRATION==="1")throw Error("test databases required");t.skip("test databases required");return;}
 const campaign=await productDb.campaign.create({data:{code:"SATANG_"+Date.now(),name:"Precision campaign",discountType:"FIXED",discountValue:1,status:"published",startsAt:new Date(),endsAt:new Date(Date.now()+86400000),createdById:"money-test",budget:100}});
 const orders=[];
 try{
  for(const [gross,net] of [["100.75","100.50"],["0.30","0.20"]]){
   const order=await createOrder(orderDb,{data:{buyerId:"money-buyer",sellerId:"money-seller",productId:"money-product",price:gross,finalPrice:net,campaignId:campaign.id,status:"in_transit"}});orders.push(order.id);
   const {attributionEvent}=await orderModel.transitionStatusWithProductSync({id:order.id,status:"completed",expectedVersion:order.version,expectedStatuses:["in_transit"],productSync:{action:"SET_STATUS",productId:order.productId,targetStatus:"sold"}});
   assert.equal(attributionEvent.grossAmount.toFixed(2),gross);
   const client={recordOrderCompleted:payload=>metrics.recordOrderCompletedEvent(payload)};
   await outbox.deliver(attributionEvent,client);const replay=await outbox.deliver(attributionEvent,client);assert.equal(replay.deduplicated,true);
  }
  const result=await metrics.getCampaignMetrics({campaignId:campaign.id});assert.equal(result.grossRevenue,101.05);assert.equal(result.totalDiscount,0.35);assert.equal(result.netRevenue,100.70);assert.equal(result.completedOrders,2);
  const stored=await productDb.campaignAttribution.aggregate({where:{campaignId:campaign.id},_sum:{discountAmount:true}});assert.equal(stored._sum.discountAmount.toFixed(2),"0.35");
  await assert.rejects(metrics.recordOrderCompletedEvent({eventId:"bad-precision",orderId:"bad",campaignId:campaign.id,grossAmount:"1.001",discountAmount:0,netAmount:"1.001"}),e=>e.status===400);
 }finally{
  for(const id of orders){await deleteOrder(orderDb,id);}
  await productDb.campaignAttribution.deleteMany({where:{campaignId:campaign.id}});await productDb.campaign.delete({where:{id:campaign.id}});await orderDb.$disconnect();await productDb.$disconnect();
 }
});
