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
      return mockAutoMessages.filter((m) => {
        if (query.where?.userId && m.userId !== query.where.userId) return false;
        if (query.where?.isActive !== undefined && m.isActive !== query.where.isActive) return false;
        return true;
      });
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
    update: async ({ where, data }) => {
      calls.update = { where, data };
      return { id: where.id, ...data };
    },
    delete: async ({ where }) => {
      calls.delete = where;
      return { id: where.id };
    },
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
});

test("createAutoMessage rejects empty messageText", async () => {
  await assert.rejects(
    () => authService.createAutoMessage("seller-1", { messageText: "  " }),
    /messageText is required/,
  );
});

test("updateAutoMessage toggles isActive and edits text", async () => {
  const item = await authService.updateAutoMessage("seller-1", "msg-1", {
    messageText: "สินค้าสภาพกี่ % ครับ?",
    isActive: false,
  });
  assert.equal(item.messageText, "สินค้าสภาพกี่ % ครับ?");
  assert.equal(item.isActive, false);
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
});
