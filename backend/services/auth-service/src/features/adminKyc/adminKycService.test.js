const test = require("node:test");
const assert = require("node:assert/strict");

const calls = {};
const prisma = {
  $transaction: async (callback) => { calls.transactions = (calls.transactions || 0) + 1; return callback(prisma); },
  kycApplication: {
    findUnique: async () => ({ id: "kyc-1", userId: "seller-1", ...calls.application }),
    updateMany: async ({ where, data }) => { calls.where = where; calls.application = data; return { count: calls.claimCount ?? 1 }; },
  },
  sellerProfile: { update: async ({ data }) => { calls.profile = data; return { userId: "seller-1", ...data }; } },
  adminAudit: { create: async ({ data }) => { calls.audit = data; } },
};
const prismaPath = require.resolve("../../models/prismaClient");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const chatPath = require.resolve("../../services/chatClient");
require.cache[chatPath] = { id: chatPath, filename: chatPath, loaded: true, exports: {
  sendSystemNotification: async (notification) => { calls.notification = notification; },
} };
const { decideKyc } = require("./adminKycService");
const input = { applicationId: "kyc-1", decision: "VERIFIED", version: 3, adminId: "staff-1" };

test("KYC approval accepts omitted, blank and whitespace notes while retaining the audit and version lock", async () => {
  for (const reason of [undefined, "", "   "]) {
    const outcome = await decideKyc({ ...input, reason });
    assert.equal(outcome.application.status, "VERIFIED");
    assert.equal(outcome.sellerStatus.kycStatus, "VERIFIED");
    assert.equal(calls.application.reason, "");
    assert.equal(calls.audit.action, "KYC_VERIFIED");
    assert.equal(calls.audit.actorId, "staff-1");
    assert.equal(calls.audit.reason, "");
    assert.deepEqual(calls.where, { id: "kyc-1", status: "PENDING", version: 3 });
    assert.equal(calls.notification.message.includes("หมายเหตุ"), false);
  }
});

test("KYC rejection still requires an explicit reason before starting the transaction", async () => {
  const before = calls.transactions;
  for (const reason of [undefined, "", "   "]) {
    await assert.rejects(decideKyc({ ...input, decision: "REJECTED", reason }), (error) => error.status === 400 && error.message === "reason is required");
  }
  assert.equal(calls.transactions, before);
  await decideKyc({ ...input, decision: "REJECTED", reason: " เอกสารไม่ชัดเจน " });
  assert.equal(calls.audit.reason, "เอกสารไม่ชัดเจน");
  assert.equal(calls.application.reason, "เอกสารไม่ชัดเจน");
  assert.equal(calls.audit.action, "KYC_REJECTED");
});

test("an optional approval note is preserved and stale approvals still conflict", async () => {
  await decideKyc({ ...input, reason: " ตรวจเอกสารแล้ว " });
  assert.equal(calls.application.reason, "ตรวจเอกสารแล้ว");
  assert.equal(calls.audit.reason, "ตรวจเอกสารแล้ว");
  assert.match(calls.notification.message, /ตรวจเอกสารแล้ว/);
  calls.claimCount = 0;
  try { await assert.rejects(decideKyc(input), (error) => error.status === 409); }
  finally { delete calls.claimCount; }
});
