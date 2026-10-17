const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlatformFeeRate } = require("./feeConfig");

test("defaults to 3% when unset or blank", () => {
  assert.equal(getPlatformFeeRate({}), 0.03);
  assert.equal(getPlatformFeeRate({ PLATFORM_FEE_RATE: "  " }), 0.03);
});

test("reads the configured fraction, including 0 and 1", () => {
  assert.equal(getPlatformFeeRate({ PLATFORM_FEE_RATE: "0.05" }), 0.05);
  assert.equal(getPlatformFeeRate({ PLATFORM_FEE_RATE: "0" }), 0);
  assert.equal(getPlatformFeeRate({ PLATFORM_FEE_RATE: "1" }), 1);
});

test("rejects values that are not a fraction instead of guessing", () => {
  for (const bad of ["3", "-0.1", "abc", "NaN", "1.5"]) {
    assert.throws(
      () => getPlatformFeeRate({ PLATFORM_FEE_RATE: bad }),
      /PLATFORM_FEE_RATE/,
      bad,
    );
  }
});
