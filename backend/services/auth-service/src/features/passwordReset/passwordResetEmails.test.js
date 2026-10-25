const test = require("node:test");
const assert = require("node:assert/strict");
const { resetLinkEmail, passwordChangedEmail } = require("./passwordResetEmails");

const RESET_URL = "https://shop.example/reset-password#token=abc_DEF-123";

test("the reset email carries the link and expiry in both languages", () => {
  const email = resetLinkEmail({ firstName: "Somchai", resetUrl: RESET_URL, expiresInMinutes: 30 });
  assert.match(email.subject, /Reset your password/);
  for (const body of [email.text, email.html]) {
    assert.ok(body.includes(RESET_URL));
    assert.match(body, /30 นาที/);
    assert.match(body, /30 minutes/);
  }
});

test("a user-controlled first name cannot inject markup", () => {
  const firstName = `<img src=x onerror="alert(1)">`;
  for (const email of [
    resetLinkEmail({ firstName, resetUrl: RESET_URL, expiresInMinutes: 30 }),
    passwordChangedEmail({ firstName, changedAt: new Date(0), supportUrl: "https://shop.example/support" }),
  ]) {
    assert.ok(!email.html.includes("<img"));
    assert.ok(email.html.includes("&lt;img"));
  }
});

test("the changed-password notice points the user at support", () => {
  const email = passwordChangedEmail({
    firstName: "",
    changedAt: new Date("2026-10-21T10:00:00.000Z"),
    supportUrl: "https://shop.example/support",
  });
  assert.match(email.text, /2026-10-21T10:00:00\.000Z/);
  assert.ok(email.html.includes('href="https://shop.example/support"'));
});
