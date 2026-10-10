const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("./helpModel");
const service = require("./helpService");
const prisma = require("../../models/prismaClient");

test("only staff can delete FAQ and missing articles return 404", async (t) => {
  const remove = t.mock.method(model, "remove", async () => true);
  await assert.rejects(service.remove({ role: "BUYER", id: "a1" }), {
    status: 403,
  });
  assert.equal(remove.mock.callCount(), 0);
  await service.remove({ role: "CUSTOMER_SERVICE", id: "a1" });
  remove.mock.mockImplementation(async () => false);
  await assert.rejects(service.remove({ role: "ADMIN", id: "missing" }), {
    status: 404,
  });
});
test("deleted FAQ is archived and excluded from the default management list", async (t) => {
  const original = {
    updateMany: prisma.helpArticle.updateMany,
    findMany: prisma.helpArticle.findMany,
    count: prisma.helpArticle.count,
  };
  const update = t.mock.fn(async () => ({ count: 1 }));
  const find = t.mock.fn(async () => []);
  prisma.helpArticle.updateMany = update;
  prisma.helpArticle.findMany = find;
  prisma.helpArticle.count = async () => 0;
  t.after(() => Object.assign(prisma.helpArticle, original));
  assert.equal(await model.remove("a1"), true);
  assert.deepEqual(update.mock.calls[0].arguments[0].data, {
    status: "ARCHIVED",
    publishedVersion: null,
  });
  await model.listAll({});
  assert.deepEqual(find.mock.calls[0].arguments[0].where, {
    status: { not: "ARCHIVED" },
  });
});
