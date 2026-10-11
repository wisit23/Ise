const test=require("node:test"),assert=require("node:assert/strict");
const productDb=require("../../product-service/src/models/prismaClient"),orderDb=require("../src/models/prismaClient"),chatDb=require("../../chat-service/src/models/prismaClient");const {deleteOrder,ADDRESS}=require("./fixtures");
async function call(base,route,token,body,method=body?"POST":"GET"){const response=await fetch(base+route,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();const data=text?JSON.parse(text):null;assert.ok(response.ok,JSON.stringify({route,status:response.status,data}));return data;}
test("Seller checkout, paid notification, shipping and T&S trading transcript share persisted facts",async t=>{
 if(!process.env.CHAT_SERVICE_URL || !process.env.AUTH_PUBLIC_URL){t.skip("live Auth/Product/Order/Chat required");return;}
 const auth=process.env.AUTH_PUBLIC_URL,orderBase=process.env.ORDER_SERVICE_URL;const buyer=await call(auth,"/login",null,{email:"buyer.demo@example.com",password:"password123"});const seller=await call(auth,"/login",null,{email:"shop.denim@example.com",password:"password123"});const admin=await call(auth,"/login",null,{email:"admin@example.com",password:"password123"});
 const product=await productDb.product.create({data:{sellerId:seller.user.id,title:"Live Seller checkout "+Date.now(),price:101,category:"เสื้อผ้า",status:"available"}});let orderId,addressId,checkoutId,disputeId;
 try{
  const address=await call(auth,"/me/addresses",buyer.accessToken,ADDRESS);addressId=address.id;
  const order=await call(orderBase,"/",buyer.accessToken,{productId:product.id});orderId=order.id;
  const checkout=await call(orderBase,"/checkout-sessions",buyer.accessToken,{orderIds:[order.id],addressId,shippingAddress:ADDRESS});checkoutId=checkout.id;
  const paid=await call(orderBase,"/checkout-sessions/"+checkout.id+"/confirm",buyer.accessToken,{});assert.equal(paid.status,"paid");
  await call(orderBase,"/checkout-sessions/"+checkout.id+"/confirm",buyer.accessToken,{});assert.equal(await orderDb.payment.count({where:{orderId,paymentStatus:"paid"}}),1);
  const room=await chatDb.conversation.findUnique({where:{contextKey:"PRODUCT:"+product.id+":"+buyer.user.id}});assert.ok(room);
  const messages=await chatDb.message.findMany({where:{conversationId:room.id},select:{payload:true}});assert.equal(messages.filter(message=>message.payload?.event==="order.paid").length,1);
  const current=await call(orderBase,"/"+orderId,seller.accessToken);assert.equal(current.shipping.addressSnapshot.recipientName,ADDRESS.recipientName);
  const shipped=await call(orderBase,"/"+orderId+"/status",seller.accessToken,{status:"shipped",company:"Kerry",trackingNumber:"LIVE123",version:current.version},"PATCH");assert.equal(shipped.shipping.trackingNumber,"LIVE123");
  const dispute=await call(orderBase,"/disputes",buyer.accessToken,{orderId,reason:"Live safety transcript verification",disputeType:"ITEM_NOT_AS_DESCRIBED"});disputeId=dispute.id;
  const transcript=await call(orderBase,"/disputes/"+disputeId+"/chat-history",admin.accessToken);assert.equal(transcript.conversation.id,room.id);assert.equal(transcript.conversation.contextType,"PRODUCT");assert.ok(transcript.items.length>=2);
  const legacy=await call(orderBase,"/disputes/"+disputeId+"/chat-history?source=ORDER",admin.accessToken);assert.equal(legacy.available,false);
 }finally{
  const rooms=await chatDb.conversation.findMany({where:{contextId:product.id},select:{id:true}});await chatDb.message.deleteMany({where:{conversationId:{in:rooms.map(room=>room.id)}}});await chatDb.conversation.deleteMany({where:{contextId:product.id}});
  if(orderId)await deleteOrder(orderDb,orderId);if(checkoutId)await orderDb.checkout.deleteMany({where:{id:checkoutId}});
  await productDb.product.delete({where:{id:product.id}});if(addressId)await call(auth,"/me/addresses/"+addressId,buyer.accessToken,undefined,"DELETE");
  await productDb.$disconnect();await orderDb.$disconnect();await chatDb.$disconnect();
 }
});
