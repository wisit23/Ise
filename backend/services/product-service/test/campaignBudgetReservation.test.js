const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCampaignRepository,
} = require("../src/features/campaigns/campaignRepository");

function createPrismaFixture() {
  const state = {
    campaign: {
      id: "campaign-1",
      status: "published",
      budget: 250,
      spentBudget: 0,
      reservedBudget: 0,
      discountType: "FIXED",
      discountValue: 100,
    },
    vouchers: new Map(
      ["buyer-1", "buyer-2", "buyer-3"].map((userId) => [
        `${userId}:campaign-1`,
        {
          id: `voucher-${userId}`,
          userId,
          campaignId: "campaign-1",
          status: "CLAIMED",
          usedOrderId: null,
          reservedDiscount: 0,
          usedAt: null,
        },
      ]),
    ),
    audits: [],
  };

  const voucherKey = (where) => {
    const key = where.userId_campaignId;
    return `${key.userId}:${key.campaignId}`;
  };
  const withCampaign = (voucher, include) =>
    include?.campaign ? { ...voucher, campaign: { ...state.campaign } } : { ...voucher };
  const matches = (voucher, where) =>
    (!where.campaignId || voucher.campaignId === where.campaignId) &&
    (!where.status || voucher.status === where.status) &&
    (where.usedOrderId === undefined || voucher.usedOrderId === where.usedOrderId);
  const applyNumericUpdate = (current, change) => {
    if (change?.increment !== undefined) return Number(current) + Number(change.increment);
    if (change?.decrement !== undefined) return Number(current) - Number(change.decrement);
    return change;
  };

  const client = {
    campaign: {
      findUnique: async () => ({ ...state.campaign }),
      update: async ({ data }) => {
        for (const [field, value] of Object.entries(data)) {
          state.campaign[field] = applyNumericUpdate(state.campaign[field], value);
        }
        return { ...state.campaign };
      },
    },
    userVoucher: {
      findUnique: async ({ where, include }) => {
        const voucher = state.vouchers.get(voucherKey(where));
        return voucher ? withCampaign(voucher, include) : null;
      },
      update: async ({ where, data, include }) => {
        const voucher = state.vouchers.get(voucherKey(where));
        Object.assign(voucher, data);
        return withCampaign(voucher, include);
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const voucher of state.vouchers.values()) {
          if (!matches(voucher, where)) continue;
          Object.assign(voucher, data);
          count += 1;
        }
        return { count };
      },
    },
    marketingAuditLog: {
      createMany: async ({ data }) => {
        for (const row of data) {
          if (!state.audits.some((item) => item.idempotencyKey === row.idempotencyKey)) {
            state.audits.push(row);
          }
        }
        return { count: 1 };
      },
      findUnique: async ({ where }) =>
        state.audits.find((row) => row.idempotencyKey === where.idempotencyKey) || null,
    },
  };

  let transactionQueue = Promise.resolve();
  client.$transaction = (fn) => {
    const result = transactionQueue.then(() => fn(client));
    transactionQueue = result.catch(() => {});
    return result;
  };

  return { state, repository: createCampaignRepository(client) };
}

test("campaign budget reservations are atomic, releasable, and payment-idempotent", async () => {
  const { state, repository } = createPrismaFixture();

  const first = await repository.reserveVoucherBudget({
    userId: "buyer-1",
    campaignId: "campaign-1",
    orderId: "order-1",
    discountAmount: 100,
  });
  assert.equal(first.held, true);
  assert.equal(state.campaign.reservedBudget, 100);

  const retry = await repository.reserveVoucherBudget({
    userId: "buyer-1",
    campaignId: "campaign-1",
    orderId: "order-1",
    discountAmount: 100,
  });
  assert.equal(retry.deduplicated, true);
  assert.equal(state.campaign.reservedBudget, 100);

  const competing = await repository.reserveVoucherBudget({
    userId: "buyer-2",
    campaignId: "campaign-1",
    orderId: "order-2",
    discountAmount: 200,
  });
  assert.deepEqual(competing, { held: false, reason: "BUDGET_EXHAUSTED" });

  await repository.releaseVoucher({
    userId: "buyer-1",
    campaignId: "campaign-1",
    orderId: "order-1",
  });
  assert.equal(state.campaign.reservedBudget, 0);

  await repository.reserveVoucherBudget({
    userId: "buyer-2",
    campaignId: "campaign-1",
    orderId: "order-2",
    discountAmount: 100,
  });
  await repository.completeVoucher({
    userId: "buyer-2",
    campaignId: "campaign-1",
    orderId: "order-2",
  });
  await repository.completeVoucher({
    userId: "buyer-2",
    campaignId: "campaign-1",
    orderId: "order-2",
  });
  assert.equal(state.campaign.reservedBudget, 0);
  assert.equal(state.campaign.spentBudget, 100);
  assert.equal(state.campaign.status, "published");

  await repository.reserveVoucherBudget({
    userId: "buyer-1",
    campaignId: "campaign-1",
    orderId: "order-3",
    discountAmount: 100,
  });
  await repository.completeVoucher({
    userId: "buyer-1",
    campaignId: "campaign-1",
    orderId: "order-3",
  });
  assert.equal(state.campaign.spentBudget, 200);
  assert.equal(state.campaign.status, "ended");
  assert.equal(state.campaign.endReason, "BUDGET_EXHAUSTED");
  assert.equal(state.vouchers.get("buyer-3:campaign-1").status, "EXPIRED");
  assert.equal(state.audits.length, 1);
});
