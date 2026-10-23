const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../../controllers/orderController");
const orderModel = require("../../models/orderModel");

test("TC_AUC10: an auction winner cannot pay after the 24-hour deadline", async (t) => {
  t.mock.method(orderModel, "findById", async () => ({
    id: "auction-order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: "product-1",
    orderType: "AUCTION",
    status: "pending_payment",
    paymentDeadlineAt: new Date(Date.now() - 1_000),
    version: 1,
    payments: [],
  }));

  let failure;
  await controller.pay(
    { params: { id: "auction-order-1" }, userId: "buyer-1" },
    {},
    (error) => {
      failure = error;
    },
  );

  assert.equal(failure.status, 409);
  assert.match(failure.message, /deadline has expired/);
});
