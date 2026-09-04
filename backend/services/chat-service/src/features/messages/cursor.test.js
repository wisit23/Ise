const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidCursor, buildPageQuery, paginate } = require("./cursor");

test("isValidCursor accepts a 24-char hex ObjectId string", () => {
  assert.equal(isValidCursor("507f1f77bcf86cd799439011"), true);
});

test("isValidCursor rejects garbage", () => {
  assert.equal(isValidCursor("not-an-object-id"), false);
  assert.equal(isValidCursor(""), false);
  assert.equal(isValidCursor(undefined), false);
  assert.equal(isValidCursor(123), false);
});

test("buildPageQuery with no cursor has no id filter and takes limit+1", () => {
  const q = buildPageQuery({
    conversationId: "c1",
    before: undefined,
    limit: 30,
  });
  assert.deepEqual(q.where, { conversationId: "c1", deletedAt: null });
  assert.deepEqual(q.orderBy, { id: "desc" });
  assert.equal(q.take, 31);
});

test("buildPageQuery with a cursor filters id < cursor", () => {
  const q = buildPageQuery({
    conversationId: "c1",
    before: "507f1f77bcf86cd799439011",
    limit: 10,
  });
  assert.deepEqual(q.where, {
    conversationId: "c1",
    deletedAt: null,
    id: { lt: "507f1f77bcf86cd799439011" },
  });
  assert.equal(q.take, 11);
});

test("paginate returns nextCursor=null when there is no extra row", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  const result = paginate(rows, 5);
  assert.deepEqual(result.items, rows);
  assert.equal(result.nextCursor, null);
});

test("paginate drops the overflow probe row and derives nextCursor from the last kept row", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const result = paginate(rows, 2);
  assert.deepEqual(result.items, [{ id: "a" }, { id: "b" }]);
  assert.equal(result.nextCursor, "b");
});

test("paginate with exactly limit rows (no overflow) does not treat the last one as a probe", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  const result = paginate(rows, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.nextCursor, null);
});
