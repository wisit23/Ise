const test = require("node:test");
const assert = require("node:assert/strict");

const calls = {};
const mockAutoMessages = [
  { id: "msg-1", userId: "seller-1", messageText: "สินค้ายังอยู่ไหมครับ?", isActive: true },
  { id: "msg-2", userId: "seller-1", messageText: "ลดราคาได้ไหมครับ?", isActive: false },
];

const prisma = {
  autoMessage: {
    findMany: async (query) => {
      calls.findMany = query;
      const items = mockAutoMessages.filter((m) => {
        if (query.where?.userId && m.userId !== query.where.userId) return false;
        if (query.where?.isActive !== undefined && m.isActive !== query.where.isActive) return false;
        return true;
      });
      return query.take === undefined ? items : items.slice(0, query.take);
    },
    findFirst: async (query) => {
      calls.findFirst = query;
      return mockAutoMessages.find(
        (m) => m.id === query.where?.id && m.userId === query.where?.userId,
      ) || null;
    },
    create: async ({ data }) => {
      calls.create = data;
      return { id: "msg-3", ...data };
    },
    count: async ({ where }) => {
      calls.count = where;
      return calls.mockCount ?? mockAutoMessages.filter((m) => m.userId === where.userId).length;
    },
    update: async ({ where, data }) => {
      calls.update = { where, data };
      return { id: where.id, ...data };
    },
    delete: async ({ where }) => {
      calls.delete = where;
      return { id: where.id };
    },
  },
  $transaction: async (callback, options) => {
    calls.transactionOptions = options;
    return callback(prisma);
  },
};

const prismaPath = require.resolve("../src/models/prismaClient");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prisma,
};

const authService = require("../src/services/authService");

test("listMyAutoMessages returns seller auto-messages", async () => {
  const result = await authService.listMyAutoMessages("seller-1");
  assert.equal(result.length, 2);
  assert.equal(calls.findMany.where.userId, "seller-1");
});

test("createAutoMessage creates active auto message", async () => {
  const item = await authService.createAutoMessage("seller-1", {
    messageText: "ส่งของวันไหนครับ?",
    isActive: true,
  });
  assert.equal(item.messageText, "ส่งของวันไหนครับ?");
  assert.equal(item.isActive, true);
  assert.deepEqual(calls.count, { userId: "seller-1" });
  assert.equal(calls.transactionOptions.isolationLevel, "Serializable");
});

test("createAutoMessage rejects empty messageText", async () => {
  await assert.rejects(
    () => authService.createAutoMessage("seller-1", { messageText: "  " }),
    /กรุณากรอกคำถามอัตโนมัติ/,
  );
  await assert.rejects(
    () => authService.createAutoMessage("seller-1"),
    /กรุณากรอกคำถามอัตโนมัติ/,
  );
});

test("createAutoMessage rejects non-string and overlong text", async () => {
  await assert.rejects(
    () => authService.createAutoMessage("seller-1", { messageText: 123 }),
    /กรุณากรอกคำถามอัตโนมัติ/,
  );
  await assert.rejects(
    () => authService.createAutoMessage("seller-1", { messageText: "ก".repeat(101) }),
    /ไม่เกิน 100 ตัวอักษร/,
  );
});

test("createAutoMessage rejects a seller already at the limit", async () => {
  calls.mockCount = 20;
  try {
    await assert.rejects(
      () => authService.createAutoMessage("seller-1", { messageText: "คำถามใหม่" }),
      /ไม่เกิน 20 ข้อต่อร้าน/,
    );
  } finally {
    delete calls.mockCount;
  }
});

test("createAutoMessage retries a serialization conflict", async () => {
  const originalTransaction = prisma.$transaction;
  let attempts = 0;
  prisma.$transaction = async (callback, options) => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error("write conflict"), { code: "P2034" });
    return originalTransaction(callback, options);
  };
  try {
    const item = await authService.createAutoMessage("seller-1", { messageText: "ยังอยู่ไหม" });
    assert.equal(item.messageText, "ยังอยู่ไหม");
    assert.equal(attempts, 2);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("updateAutoMessage toggles isActive and edits text", async () => {
  const item = await authService.updateAutoMessage("seller-1", "msg-1", {
    messageText: "สินค้าสภาพกี่ % ครับ?",
    isActive: false,
  });
  assert.equal(item.messageText, "สินค้าสภาพกี่ % ครับ?");
  assert.equal(item.isActive, false);
});

test("updateAutoMessage rejects overlong text without changing activation", async () => {
  await assert.rejects(
    () => authService.updateAutoMessage("seller-1", "msg-1", {
      messageText: "ก".repeat(101), isActive: false,
    }),
    /ไม่เกิน 100 ตัวอักษร/,
  );
});

test("deleteAutoMessage deletes auto message", async () => {
  const result = await authService.deleteAutoMessage("seller-1", "msg-1");
  assert.equal(result.success, true);
  assert.equal(calls.delete.id, "msg-1");
});

test("getPublicAutoMessages returns only active messages for public display", async () => {
  const result = await authService.getPublicAutoMessages("seller-1");
  assert.equal(result.length, 1);
  assert.equal(result[0].messageText, "สินค้ายังอยู่ไหมครับ?");
  assert.equal(calls.findMany.take, 20);
});

test("getPublicAutoMessages caps legacy overlong text", async () => {
  const previous = mockAutoMessages[0].messageText;
  mockAutoMessages[0].messageText = "ก".repeat(150);
  try {
    const result = await authService.getPublicAutoMessages("seller-1");
    assert.equal(result[0].messageText.length, 100);
  } finally {
    mockAutoMessages[0].messageText = previous;
  }
});
