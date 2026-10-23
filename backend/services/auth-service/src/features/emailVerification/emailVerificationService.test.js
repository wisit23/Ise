const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmailVerificationService } = require("./emailVerificationService");
const { hashToken } = require("../../services/oneTimeToken");
const { fakeDb, fakeMailer, verificationConfig, inlineScheduler } = require("../../test/fakes");

const NOW = new Date("2026-10-23T10:00:00.000Z");
const HOUR = 3_600_000;

function setup({ user: overrides = {}, config = verificationConfig, ...seed } = {}) {
  const user = {
    id: "user-1",
    email: "new@example.com",
    firstName: "Mali",
    status: "ACTIVE",
    emailVerifiedAt: null,
    ...overrides,
  };
  const db = fakeDb({ users: [user], ...seed });
  const mailer = fakeMailer();
  const scheduler = inlineScheduler();
  const service = createEmailVerificationService({
    db,
    mailer,
    config,
    now: () => NOW,
    schedule: scheduler.schedule,
    logger: { error() {} },
  });
  return { db, mailer, scheduler, service, user };
}

const tokenFrom = (message) => message.text.match(/#token=([A-Za-z0-9_-]+)/)[1];

async function signUp(ctx) {
  ctx.service.sendForNewAccount(ctx.user, { ipAddress: "203.0.113.9" });
  await ctx.scheduler.flush();
  return tokenFrom(ctx.mailer.sent.at(-1));
}

test("a new account is emailed a single-use link and only its hash is stored", async () => {
  const ctx = setup();
  const token = await signUp(ctx);

  const [mail] = ctx.mailer.sent;
  assert.equal(mail.to, "new@example.com");
  assert.match(mail.subject, /Confirm your email/);
  assert.match(mail.text, /https:\/\/shop\.example\/verify-email#token=/);
  const [row] = ctx.db.emailVerificationToken.rows;
  assert.equal(row.tokenHash, hashToken(token));
  assert.ok(!JSON.stringify(row).includes(token), "raw token must never be persisted");
  assert.equal(+row.expiresAt, +NOW + 24 * HOUR);
  assert.equal(row.requestedIp, "203.0.113.9");
});

test("confirming the link verifies the account and spends the link", async () => {
  const ctx = setup();
  const token = await signUp(ctx);

  await ctx.service.verify(token);
  assert.equal(+ctx.user.emailVerifiedAt, +NOW);
  assert.equal(+ctx.db.emailVerificationToken.rows[0].usedAt, +NOW);
  await assert.rejects(ctx.service.verify(token), { code: "VERIFICATION_TOKEN_INVALID" });
});

test("resending cancels the earlier link", async () => {
  const ctx = setup();
  const first = await signUp(ctx);
  await ctx.service.resend({ email: "new@example.com" });
  await ctx.scheduler.flush();
  const second = tokenFrom(ctx.mailer.sent.at(-1));

  await assert.rejects(ctx.service.verify(first), { code: "VERIFICATION_TOKEN_INVALID" });
  await assert.doesNotReject(ctx.service.verify(second));
});

for (const [label, overrides, email] of [
  ["an unknown email", {}, "nobody@example.com"],
  ["an already verified account", { emailVerifiedAt: NOW }, "new@example.com"],
  ["a suspended account", { status: "SUSPENDED" }, "new@example.com"],
]) {
  test(`resend to ${label} resolves normally but sends nothing`, async () => {
    const ctx = setup({ user: overrides });
    await assert.doesNotReject(ctx.service.resend({ email }));
    await ctx.scheduler.flush();
    assert.equal(ctx.mailer.sent.length, 0);
  });
}

test("expired, unknown and malformed links all fail the same way", async () => {
  const ctx = setup({
    verificationTokens: [
      {
        id: "t1",
        tokenHash: hashToken("expired"),
        userId: "user-1",
        expiresAt: new Date(+NOW - 1),
        usedAt: null,
        revokedAt: null,
      },
    ],
  });
  for (const token of ["expired", "never-issued", "", undefined, "x".repeat(500)]) {
    await assert.rejects(ctx.service.verify(token), {
      status: 400,
      code: "VERIFICATION_TOKEN_INVALID",
    });
  }
  assert.equal(ctx.user.emailVerifiedAt, null);
});

test("sign-in is refused until the email is confirmed", () => {
  const { service } = setup();
  assert.throws(() => service.assertVerifiedForSignIn({ emailVerifiedAt: null }), {
    status: 403,
    code: "EMAIL_NOT_VERIFIED",
  });
  assert.doesNotThrow(() => service.assertVerifiedForSignIn({ emailVerifiedAt: NOW }));
});

test("an unverified, never-used account can be signed up again by the address owner", async () => {
  const { service, user } = setup();
  assert.equal(await service.canReclaim(user), true);
});

test("an account that ever had a session or a verified email cannot be reclaimed", async () => {
  const withSession = setup({ sessions: [{ id: "s1", userId: "user-1" }] });
  assert.equal(await withSession.service.canReclaim(withSession.user), false);

  const withLogin = setup({ loginLogs: [{ id: "l1", userId: "user-1" }] });
  assert.equal(await withLogin.service.canReclaim(withLogin.user), false);

  const verified = setup({ user: { emailVerifiedAt: NOW } });
  assert.equal(await verified.service.canReclaim(verified.user), false);
});

test("with verification off nothing is gated and the endpoints report it disabled", async () => {
  const ctx = setup({ config: { ...verificationConfig, required: false } });
  assert.doesNotThrow(() => ctx.service.assertVerifiedForSignIn({ emailVerifiedAt: null }));
  assert.equal(await ctx.service.canReclaim(ctx.user), false);
  await assert.rejects(ctx.service.resend({ email: "new@example.com" }), { status: 404 });
  await assert.rejects(ctx.service.verify("x"), { status: 404 });
});

test("a mail failure is logged, never thrown at the person signing up", async () => {
  const ctx = setup();
  const errors = [];
  const service = createEmailVerificationService({
    db: ctx.db,
    mailer: {
      send: async () => {
        throw new Error("smtp down");
      },
    },
    config: verificationConfig,
    now: () => NOW,
    schedule: ctx.scheduler.schedule,
    logger: { error: (...args) => errors.push(args.join(" ")) },
  });
  assert.doesNotThrow(() => service.sendForNewAccount(ctx.user));
  await ctx.scheduler.flush();
  assert.match(errors[0], /smtp down/);
});

test("pruneExpired deletes only rows past the retention period", async () => {
  const day = 86_400_000;
  const ctx = setup({
    verificationTokens: [
      { id: "old", createdAt: new Date(+NOW - 31 * day) },
      { id: "recent", createdAt: new Date(+NOW - 1 * day) },
    ],
  });
  assert.equal(await ctx.service.pruneExpired(), 1);
  assert.deepEqual(
    ctx.db.emailVerificationToken.rows.map((r) => r.id),
    ["recent"],
  );
});
