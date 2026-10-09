const orderModel = require("../src/models/orderModel");
const ADDRESS = {
  recipientName: "Integration Buyer",
  phone: "0800000000",
  addressLine: "Test Road",
  subdistrict: "Test",
  district: "Test",
  province: "Bangkok",
  postalCode: "10110",
};
async function createOrder(prisma, { data }) {
  const pending = ["pending", "pending_payment"].includes(data.status);
  return prisma.order.create({
    data: {
      ...data,
      ...(pending
        ? {
            checkout: {
              create: {
                buyerId: data.buyerId,
                addressId: "test-address",
                addressSnapshot: ADDRESS,
                originalAmount: data.originalAmount,
                ordersAmount: data.ordersAmount,
                status: "pending",
                cancelAt: new Date(Date.now() + 600000),
              },
            },
            shipping: {
              create: {
                addressId: "test-address",
                addressSnapshot: ADDRESS,
                status: "pending",
              },
            },
          }
        : !["cancelled"].includes(data.status)
          ? {
              payments: {
                create: {
                  paymentType: "TEST",
                  paymentStatus: "paid",
                  paymentAmount: data.ordersAmount,
                  paidAt: new Date(),
                },
              },
            }
          : {}),
    },
    include: orderModel.INCLUDE,
  });
}
async function findOrder(prisma, query) {
  return orderModel.view(
    await prisma.order.findUnique({ ...query, include: orderModel.INCLUDE }),
  );
}
async function deleteOrder(prisma, orderId) {
  await prisma.safetyLog.deleteMany({ where: { safety: { orderId } } });
  await prisma.safetyDisputeEvidence.deleteMany({ where: { orderId } });
  await prisma.disputeAuditLog.deleteMany({
    where: { evidence: { dispute: { orderId } } },
  });
  await prisma.disputeEvidence.deleteMany({ where: { dispute: { orderId } } });
  await prisma.disputeCaseLog.deleteMany({ where: { dispute: { orderId } } });
  await prisma.disputeCase.deleteMany({ where: { orderId } });
  await prisma.hold.deleteMany({ where: { payment: { orderId } } });
  await prisma.payment.deleteMany({ where: { orderId } });
  await prisma.shipping.deleteMany({ where: { orderId } });
  await prisma.orderLog.deleteMany({ where: { orderId } });
  await prisma.order.delete({ where: { id: orderId } });
}
module.exports = { createOrder, findOrder, deleteOrder, ADDRESS };
