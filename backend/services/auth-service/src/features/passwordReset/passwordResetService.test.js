const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { createPasswordResetService, hashToken } = require("./passwordResetService");
const { fakeDb, fakeMailer, enabledConfig, inlineScheduler } = require("./testSupport");

const NOW = new Date("2026-10-21T10:00:00.000Z");
const OLD_PASSWORD = "old-password-123";

async function setup({ status = "ACTIVE", config = enabledConfig, ...seed } = {}) {
  const user = {
    id: "user-1",
    email: "buyer@example.com",
    firstName: "Somchai",
    status,
    passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
  };
  const db = fakeDb({ users: [user], ...seed });
  const mailer = fakeMailer();
  const scheduler = inlineScheduler();
  const service = createPasswordResetService({
    db,
    mailer,
    config,
    now: () => NOW,
    schedule: scheduler.schedule,
    logger: { error() {} },
  });
  return { db, mailer, scheduler, service, user };
}

function tokenFromEmail(message) {
  return message.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
}

async function requestLink(ctx, email = "buyer@example.com") {
  await ctx.service.requestReset({ email, ipAddress: "203.0.113.9", userAgent: "test" });
  await ctx.scheduler.flush();
  return ctx.mailer.sent.length ? tokenFromEmail(ctx.mailer.sent.at(-1)) : null;
}

test("a registered email gets a single-use link and only the token's hash is stored", async () => {
  const ctx = await setup();
  const token = await requestLink(ctx);

  assert.equal(ctx.mailer.sent.length, 1);
  assert.equal(ctx.mailer.sent[0].to, "buyer@example.com");
  assert.match(ctx.mailer.sent[0].text, /https:\/\/shop\.example\/reset-password#token=/);
  const [row] = ctx.db.passwordResetToken.rows;
  assert.equal(row.tokenHash, hashToken(token));
  assert.ok(!JSON.stringify(row).includes(token), "raw token must never be persisted");
  assert.equal(+row.expiresAt, +NOW + 30 * 60_000);
  assert.equal(row.requestedIp, "203.0.113.9");
});

test("an unknown email resolves exactly like a known one but sends nothing", async () => {
  const ctx = await setup();
  await assert.doesNotReject(requestLink(ctx, "nobody@example.com"));
  assert.equal(ctx.mailer.sent.length, 0);
  assert.equal(ctx.db.passwordResetToken.rows.length, 0);
});

test("a suspended account is not sent a reset link", async () => {
  const ctx = await setup({ status: "SUSPENDED" });
  await requestLink(ctx);
  assert.equal(ctx.mailer.sent.length, 0);
});

test("requesting again revokes the earlier link", async () => {
  const ctx = await setup();
  const first = await requestLink(ctx);
  const second = await requestLink(ctx);

  await assert.rejects(ctx.service.verifyToken(first), { code: "RESET_TOKEN_INVALID" });
  assert.deepEqual(await ctx.service.verifyToken(second), {
    expiresAt: new Date(+NOW + 30 * 60_000),
  });
});

test("malformed emails are rejected before any work is scheduled", async () => {
  const ctx = await setup();
  for (const email of [undefined, 42, "", "not-an-email", `${"a".repeat(250)}@x.co`]) {
    await assert.rejects(ctx.service.requestReset({ email }), { status: 400 });
  }
  await ctx.scheduler.flush();
  assert.equal(ctx.mailer.sent.length, 0);
});

test("expired, used, unknown and malformed tokens all fail the same way", async () => {
  const expired = { tokenHash: hashToken("expired"), userId: "user-1", expiresAt: new Date(+NOW - 1), usedAt: null, revokedAt: null };
  const used = { tokenHash: hashToken("used"), userId: "user-1", expiresAt: new Date(+NOW + 60_000), usedAt: NOW, revokedAt: null };
  const ctx = await setup({ tokens: [expired, used] });

  for (const token of ["expired", "used", "never-issued", "", null, "x".repeat(500)]) {
    await assert.rejects(ctx.service.verifyToken(token), {
      status: 400,
      code: "RESET_TOKEN_INVALID",
      message: "This reset link is invalid or has expired. Please request a new one.",
    });
  }
});

test("resetting changes the password, spends the token and signs out every session", async () => {
  const ctx = await setup({
    sessions: [
      { id: "s1", userId: "user-1", revokedAt: null },
      { id: "s2", userId: "user-2", revokedAt: null },
    ],
    loginLogs: [{ id: "l1", userId: "user-1", logoutAt: null }],
  });
  const token = await requestLink(ctx);

  await ctx.service.resetPassword({ token, password: "brand-new-pass-1", ipAddress: "198.51.100.4" });
  await ctx.scheduler.flush();

  assert.ok(await bcrypt.compare("brand-new-pass-1", ctx.user.passwordHash));
  const [row] = ctx.db.passwordResetToken.rows;
  assert.equal(+row.usedAt, +NOW);
  assert.equal(row.usedIp, "198.51.100.4");
  assert.equal(+ctx.db.refreshToken.rows[0].revokedAt, +NOW);
  assert.equal(ctx.db.refreshToken.rows[1].revokedAt, null, "other users keep their sessions");
  assert.equal(+ctx.db.loginLog.rows[0].logoutAt, +NOW);

  const notice = ctx.mailer.sent.at(-1);
  assert.match(notice.subject, /password was changed/);
  assert.match(notice.text, /https:\/\/shop\.example\/support/);
});

test("a link cannot be used twice", async () => {
  const ctx = await setup();
  const token = await requestLink(ctx);
  await ctx.service.resetPassword({ token, password: "brand-new-pass-1" });
  await assert.rejects(
    ctx.service.resetPassword({ token, password: "another-pass-22" }),
    { code: "RESET_TOKEN_INVALID" },
  );
});

test("losing a race for the same link fails cleanly instead of resetting twice", async () => {
  const ctx = await setup();
  const token = await requestLink(ctx);
  // Simulate the other request consuming the token between read and write.
  const realUpdateMany = ctx.db.passwordResetToken.updateMany;
  ctx.db.passwordResetToken.updateMany = async (args) =>
    args.data.usedAt ? { count: 0 } : realUpdateMany(args);

  await assert.rejects(
    ctx.service.resetPassword({ token, password: "brand-new-pass-1" }),
    { code: "RESET_TOKEN_INVALID" },
  );
  assert.ok(await bcrypt.compare(OLD_PASSWORD, ctx.user.passwordHash));
});

test("the new password must meet the policy and differ from the current one", async () => {
  const ctx = await setup();
  const token = await requestLink(ctx);

  await assert.rejects(ctx.service.resetPassword({ token, password: "short" }), { status: 400 });
  await assert.rejects(ctx.service.resetPassword({ token, password: "ก".repeat(25) }), {
    message: /at most 72 bytes/,
  });
  await assert.rejects(ctx.service.resetPassword({ token, password: OLD_PASSWORD }), {
    message: /haven't used/,
  });
  // None of the failures spent the link.
  await assert.doesNotReject(ctx.service.verifyToken(token));
});

test("an account suspended after the link was sent cannot use it", async () => {
  const ctx = await setup();
  const token = await requestLink(ctx);
  ctx.user.status = "SUSPENDED";
  await assert.rejects(
    ctx.service.resetPassword({ token, password: "brand-new-pass-1" }),
    { code: "ACCOUNT_SUSPENDED" },
  );
});

test("a mail failure is logged, never surfaced to the requester", async () => {
  const ctx = await setup();
  const errors = [];
  const service = createPasswordResetService({
    db: ctx.db,
    mailer: { send: async () => { throw new Error("smtp down"); } },
    config: enabledConfig,
    now: () => NOW,
    schedule: ctx.scheduler.schedule,
    logger: { error: (...args) => errors.push(args.join(" ")) },
  });
  await assert.doesNotReject(service.requestReset({ email: "buyer@example.com" }));
  await ctx.scheduler.flush();
  assert.match(errors[0], /smtp down/);
});

test("every endpoint answers 503 while the feature is disabled", async () => {
  const ctx = await setup({ config: { ...enabledConfig, enabled: false } });
  await assert.rejects(ctx.service.requestReset({ email: "buyer@example.com" }), { status: 503 });
  await assert.rejects(ctx.service.verifyToken("x"), { status: 503 });
  await assert.rejects(ctx.service.resetPassword({ token: "x", password: "whatever-123" }), {
    status: 503,
  });
});

test("pruneExpired deletes only rows older than the retention period", async () => {
  const day = 86_400_000;
  const ctx = await setup({
    tokens: [
      { id: "old", createdAt: new Date(+NOW - 31 * day) },
      { id: "recent", createdAt: new Date(+NOW - 29 * day) },
    ],
  });
  assert.equal(await ctx.service.pruneExpired(), 1);
  assert.deepEqual(ctx.db.passwordResetToken.rows.map((r) => r.id), ["recent"]);
});
