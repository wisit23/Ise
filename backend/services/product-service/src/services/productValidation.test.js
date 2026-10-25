const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePrice,
  validateCreateRequest,
  MAX_DATABASE_PRICE,
} = require("./productValidation");

test("validatePrice accepts valid integer prices within range", () => {
  assert.equal(validatePrice(1), 1);
  assert.equal(validatePrice(100), 100);
  assert.equal(validatePrice(999999), 999999);
  assert.equal(validatePrice(MAX_DATABASE_PRICE), MAX_DATABASE_PRICE);
});

test("validatePrice rejects 0 with Thai error message and 400 status", () => {
  assert.throws(
    () => validatePrice(0),
    (err) =>
      err.status === 400 &&
      err.message ===
        "ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0 และไม่เกิน 2,147,483,647 บาท",
  );
});

test("validatePrice rejects negative prices", () => {
  assert.throws(
    () => validatePrice(-1),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(-1000),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
});

test("validatePrice rejects decimal/float prices", () => {
  assert.throws(
    () => validatePrice(10.5),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(0.01),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
});

test("validatePrice rejects strings and non-number types", () => {
  assert.throws(
    () => validatePrice("100"),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice("abc"),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(""),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(null),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(undefined),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(NaN),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(Infinity),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
});

test("validatePrice rejects prices exceeding database integer range", () => {
  assert.throws(
    () => validatePrice(MAX_DATABASE_PRICE + 1),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
  assert.throws(
    () => validatePrice(999999999999),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );
});

test("validateCreateRequest enforces required fields and valid price", () => {
  assert.throws(
    () => validateCreateRequest({ price: 100, category: "clothes" }),
    (err) =>
      err.status === 400 &&
      err.message === "title, price, category are required",
  );
  assert.throws(
    () => validateCreateRequest({ title: "shirt", category: "clothes" }),
    (err) =>
      err.status === 400 &&
      err.message === "title, price, category are required",
  );
  assert.throws(
    () => validateCreateRequest({ title: "shirt", price: 100 }),
    (err) =>
      err.status === 400 &&
      err.message === "title, price, category are required",
  );

  // Price 0 during create rejects via validatePrice
  assert.throws(
    () =>
      validateCreateRequest({ title: "shirt", price: 0, category: "clothes" }),
    (err) =>
      err.status === 400 &&
      err.message.includes("ราคาต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0"),
  );

  // Valid create request passes
  assert.doesNotThrow(() =>
    validateCreateRequest({ title: "shirt", price: 299, category: "clothes" }),
  );
});
