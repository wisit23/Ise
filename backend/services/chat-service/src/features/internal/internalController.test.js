const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../../models/prismaClient");
const { getTranscript } = require("./internalController");

test("getTranscript excludes internal notes from public transcript by default", async () => {
  const origFindById = prisma.conversation.findUnique;
  const origFindMany = prisma.message.findMany;

  let capturedWhere = null;

  prisma.conversation.findUnique = () => {
    return Promise.resolve({ id: "conv-1", contextType: "SUPPORT" });
  };
  prisma.message.findMany = (args) => {
    capturedWhere = args.where;
    return Promise.resolve([
      { id: "msg-1", body: "Customer visible", visibility: "ALL" },
    ]);
  };

  const req = {
    params: { id: "conv-1" },
    query: {},
  };
  let sentJson = null;
  const res = {
    json: (data) => {
      sentJson = data;
    },
  };
  let errorCaught = null;
  const next = (err) => {
    errorCaught = err;
  };

  try {
    await getTranscript(req, res, next);
    assert.equal(errorCaught, null);
    assert.ok(capturedWhere);
    assert.deepEqual(capturedWhere.visibility, { not: "INTERNAL" });
    assert.equal(capturedWhere.deletedAt, null);
    assert.equal(sentJson.messages.length, 1);
  } finally {
    prisma.conversation.findUnique = origFindById;
    prisma.message.findMany = origFindMany;
  }
});

test("getTranscript includes internal notes when includeInternal is true", async () => {
  const origFindById = prisma.conversation.findUnique;
  const origFindMany = prisma.message.findMany;

  let capturedWhere = null;

  prisma.conversation.findUnique = () => {
    return Promise.resolve({ id: "conv-1", contextType: "SUPPORT" });
  };
  prisma.message.findMany = (args) => {
    capturedWhere = args.where;
    return Promise.resolve([
      { id: "msg-1", body: "Customer visible", visibility: "ALL" },
      { id: "msg-2", body: "Internal note", visibility: "INTERNAL" },
    ]);
  };

  const req = {
    params: { id: "conv-1" },
    query: { includeInternal: "true" },
  };
  let sentJson = null;
  const res = {
    json: (data) => {
      sentJson = data;
    },
  };
  let errorCaught = null;
  const next = (err) => {
    errorCaught = err;
  };

  try {
    await getTranscript(req, res, next);
    assert.equal(errorCaught, null);
    assert.ok(capturedWhere);
    assert.equal(capturedWhere.visibility, undefined);
    assert.equal(capturedWhere.deletedAt, null);
    assert.equal(sentJson.messages.length, 2);
  } finally {
    prisma.conversation.findUnique = origFindById;
    prisma.message.findMany = origFindMany;
  }
});
