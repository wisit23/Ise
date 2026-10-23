const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const prisma = require("../models/prismaClient");
const { service: emailVerification } = require("../features/emailVerification");
const authService = require("./authService");

const SIGN_UP = {
  email: "new@example.com",
  password: "long-enough-1",
  firstName: "Mali",
  lastName: "Dee",
  ipAddress: "203.0.113.9",
};

/** Swaps Prisma delegate methods for the duration of one test. */
function stubPrisma(t, overrides) {
  for (const [model, methods] of Object.entries(overrides)) {
    for (const [name, impl] of Object.entries(methods)) {
      const original = prisma[model][name];
      prisma[model][name] = impl;
      t.after(() => {
        prisma[model][name] = original;
      });
    }
  }
}

function requireVerification(t, { reclaimable = false } = {}) {
  t.mock.method(emailVerification, "isRequired", () => true);
  t.mock.method(emailVerification, "linkLifetimeHours", () => 24);
  t.mock.method(emailVerification, "canReclaim", async () => reclaimable);
  return t.mock.method(emailVerification, "sendForNewAccount", () => {});
}

test("sign-up creates an unverified account, emails it, and returns no session", async (t) => {
  const send = requireVerification(t);
  const created = [];
  stubPrisma(t, {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => {
        created.push(data);
        return { id: "user-1", ...data };
      },
    },
  });

  const result = await authService.register(SIGN_UP);

  assert.deepEqual(result, {
    verificationRequired: true,
    email: "new@example.com",
    expiresInHours: 24,
  });
  assert.equal(created[0].role, "BUYER");
  assert.ok(await bcrypt.compare("long-enough-1", created[0].passwordHash));
  assert.equal(send.mock.calls[0].arguments[0].id, "user-1");
  assert.deepEqual(send.mock.calls[0].arguments[1], { ipAddress: "203.0.113.9" });
});

test("an address already in use is refused unless it is reclaimable", async (t) => {
  requireVerification(t, { reclaimable: false });
  stubPrisma(t, { user: { findUnique: async () => ({ id: "user-1", emailVerifiedAt: new Date() }) } });

  await assert.rejects(authService.register(SIGN_UP), { status: 409 });
});

test("a never-used unverified sign-up is replaced and re-sent, not duplicated", async (t) => {
  const send = requireVerification(t, { reclaimable: true });
  const updates = [];
  stubPrisma(t, {
    user: {
      findUnique: async () => ({ id: "user-1", email: "new@example.com", emailVerifiedAt: null }),
      update: async ({ where, data }) => {
        updates.push({ where, data });
        return { id: where.id, email: "new@example.com", ...data };
      },
      create: async () => assert.fail("must not create a second account"),
    },
  });

  const result = await authService.register(SIGN_UP);

  assert.equal(result.verificationRequired, true);
  assert.equal(updates[0].where.id, "user-1");
  assert.equal(updates[0].data.firstName, "Mali");
  assert.equal(send.mock.callCount(), 1);
});

test("sign-in with the right password is refused until the email is confirmed", async (t) => {
  t.mock.method(emailVerification, "assertVerifiedForSignIn", (user) => {
    if (!user.emailVerifiedAt) {
      throw Object.assign(new Error("confirm first"), { status: 403, code: "EMAIL_NOT_VERIFIED" });
    }
  });
  stubPrisma(t, {
    user: {
      findUnique: async () => ({
        id: "user-1",
        email: "new@example.com",
        status: "ACTIVE",
        emailVerifiedAt: null,
        passwordHash: await bcrypt.hash("long-enough-1", 4),
      }),
    },
  });

  await assert.rejects(
    authService.login({ email: "new@example.com", password: "long-enough-1" }),
    { code: "EMAIL_NOT_VERIFIED" },
  );
});

test("a wrong password still gets the generic error, never the verification one", async (t) => {
  const gate = t.mock.method(emailVerification, "assertVerifiedForSignIn", () => {});
  stubPrisma(t, {
    user: {
      findUnique: async () => ({
        id: "user-1",
        status: "ACTIVE",
        emailVerifiedAt: null,
        passwordHash: await bcrypt.hash("long-enough-1", 4),
      }),
    },
  });

  await assert.rejects(
    authService.login({ email: "new@example.com", password: "wrong-password" }),
    { message: "invalid email or password" },
  );
  assert.equal(gate.mock.callCount(), 0);
});
