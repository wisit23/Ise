const test = require("node:test");
const assert = require("node:assert/strict");

const calls = { removed: [], audits: [] };
let failTransaction = false;
const tx = {
  sellerProfile: {
    findUnique: async () => ({ kycStatus: "REJECTED" }),
    upsert: async (query) => {
      calls.profile = query;
      return query.create;
    },
  },
  user: {
    update: async (query) => {
      calls.userUpdate = query;
      return query.data;
    },
  },
  kycApplication: {
    create: async (query) => {
      calls.application = query;
      return { id: "application-2", ...query.data };
    },
  },
};
const prisma = {
  $transaction: async (callback) => {
    if (failTransaction) throw new Error("database unavailable");
    return callback(tx);
  },
  kycApplication: {
    findUnique: async () => ({
      id: "application-1",
      userId: "seller-1",
      storageKey: "document.png",
      fileType: "image/png",
    }),
  },
  adminAudit: {
    create: async (query) => {
      calls.audits.push(query);
      return query.data;
    },
  },
};

const prismaPath = require.resolve("../src/models/prismaClient");
const authServicePath = require.resolve("../src/services/authService");
const sessionServicePath = require.resolve("../src/services/sessionService");
const storagePath = require.resolve("../src/features/kyc/kycStorage");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};
require.cache[authServicePath] = {
  id: authServicePath,
  filename: authServicePath,
  loaded: true,
  exports: {
    assignRole: async (userId, role, db) => {
      calls.role = { userId, role, db };
    },
  },
};
require.cache[sessionServicePath] = {
  id: sessionServicePath,
  filename: sessionServicePath,
  loaded: true,
  exports: {
    lockUser: async () => ({ id: "seller-1", role: "BUYER" }),
  },
};
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    persistDocument: async () => "document.png",
    removeDocument: async (key) => calls.removed.push(key),
    assertDocumentExists: async () => "C:\\private\\document.png",
  },
};

const service = require("../src/features/kyc/kycService");
const validSubmission = {
  userId: "seller-1",
  shopName: "Snapshot-free shop",
  idCardNumber: "1234567890123",
  idCardExpiry: "2099-01-01",
  address: "Bangkok",
  bankAccount: "123-456",
  file: {
    buffer: Buffer.from("image"),
    originalname: "id.png",
    mimetype: "image/png",
  },
};

test("KYC submission commits role, profile and application in one transaction", async () => {
  failTransaction = false;
  const result = await service.submitKyc(validSubmission);
  assert.deepEqual(result, {
    kycStatus: "PENDING",
    applicationId: "application-2",
  });
  assert.equal(calls.role.db, tx);
  assert.equal(calls.profile.create.kycStorageKey, "document.png");
  assert.equal(calls.application.data.storageKey, "document.png");
  assert.deepEqual(calls.removed, []);
});

test("KYC submission removes the newly persisted file when DB work fails", async () => {
  failTransaction = true;
  await assert.rejects(
    service.submitKyc(validSubmission),
    /database unavailable/,
  );
  assert.deepEqual(calls.removed, ["document.png"]);
  failTransaction = false;
});

test("authorized document reads create an audit record", async () => {
  const result = await service.viewDocument({
    applicationId: "application-1",
    userId: "reviewer-1",
    permissions: ["admin:kyc:decide"],
    requestId: "request-1",
  });
  assert.equal(result.path, "C:\\private\\document.png");
  assert.deepEqual(calls.audits.at(-1).data, {
    actorId: "reviewer-1",
    action: "KYC_DOCUMENT_VIEWED",
    targetId: "application-1",
    reason: "reviewer viewed KYC document",
    requestId: "request-1",
  });
});
