const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { assertPasswordPolicy, hashPassword } = require("./passwordPolicy");

test("accepts 8 characters up to 72 bytes", () => {
  assert.doesNotThrow(() => assertPasswordPolicy("12345678"));
  assert.doesNotThrow(() => assertPasswordPolicy("a".repeat(72)));
});

test("rejects short, missing and over-long passwords", () => {
  for (const password of [undefined, 12345678, "1234567", "a".repeat(73), "ก".repeat(25)]) {
    assert.throws(() => assertPasswordPolicy(password), { status: 400 });
  }
});

test("hashPassword produces a bcrypt hash of the password", async () => {
  const hash = await hashPassword("correct horse");
  assert.ok(await bcrypt.compare("correct horse", hash));
});
