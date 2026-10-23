const { AppError, conflict, isRestrictedStatus } = require("@reloop/shared");
const { hashToken, newToken, isPlausibleToken, tokenLink } = require("../../services/oneTimeToken");
const { newReferenceCode } = require("../../services/referenceCode");
const { normalizeEmail } = require("../../services/emailAddress");
const { verificationEmail } = require("./emailVerificationEmails");

const PURPOSE = Object.freeze({ SIGNUP: "SIGNUP", EMAIL_CHANGE: "EMAIL_CHANGE" });

function invalidToken() {
  return Object.assign(
    new AppError(400, "This confirmation link is invalid or has expired. Request a new one from the sign-in page."),
    { code: "VERIFICATION_TOKEN_INVALID" },
  );
}

function emailNotVerified() {
  return Object.assign(
    new AppError(403, "Please confirm your email before signing in. Check your inbox for the confirmation link."),
    { code: "EMAIL_NOT_VERIFIED" },
  );
}

function emailTaken() {
  return Object.assign(conflict("That email is already used by another account."), {
    code: "EMAIL_TAKEN",
  });
}

const canSignIn = (user) => user.status === "ACTIVE" || isRestrictedStatus(user.status);

/**
 * Proves a user controls an email address, through a single-use link sent
 * to that address. One mechanism serves both purposes:
 *   SIGNUP       - the address a new account registered with
 *   EMAIL_CHANGE - an address the user wants to switch to; confirming it
 *                  replaces their email
 * Dependencies are injected so the flow can be tested without Postgres,
 * SMTP or the wall clock.
 *
 * Every send returns a reference code at once and mails in the background
 * (`schedule`). Resend therefore answers identically — body, reference
 * format and timing — whether or not the address has an account.
 */
function createEmailVerificationService({
  db,
  mailer,
  config,
  now = () => new Date(),
  schedule = (task) => setImmediate(task),
  logger = console,
}) {
  const verifyUrl = (token) => tokenLink(config.appBaseUrl, "/verify-email", token);

  function runInBackground(label, task) {
    schedule(() =>
      task().catch((err) => logger.error(`[email-verification] ${label} failed:`, err.message)),
    );
  }

  function assertEnabled() {
    if (!config.required) {
      throw new AppError(404, "Email confirmation is not enabled.");
    }
  }

  async function issueAndSend(user, { purpose, email, referenceCode, ipAddress }) {
    const issuedAt = now();
    const { token, tokenHash } = newToken();
    await db.$transaction([
      // Only the newest link for a purpose works: sending again cancels the
      // earlier ones (a pending email change doesn't touch sign-up links).
      db.emailVerificationToken.updateMany({
        where: { userId: user.id, purpose, usedAt: null, revokedAt: null },
        data: { revokedAt: issuedAt },
      }),
      db.emailVerificationToken.create({
        data: {
          userId: user.id,
          purpose,
          email,
          referenceCode,
          tokenHash,
          expiresAt: new Date(+issuedAt + config.tokenTtlHours * 3_600_000),
          requestedIp: ipAddress || null,
          createdAt: issuedAt,
        },
      }),
    ]);
    await mailer.send({
      to: email,
      ...verificationEmail({
        purpose,
        firstName: user.firstName,
        verifyUrl: verifyUrl(token),
        expiresInHours: config.tokenTtlHours,
        referenceCode,
      }),
    });
  }

  /** Sends `purpose`'s link to `email` in the background; returns its reference. */
  function send(user, { purpose, email, ipAddress }) {
    const referenceCode = newReferenceCode();
    runInBackground(`${purpose.toLowerCase()} email`, () =>
      issueAndSend(user, { purpose, email, referenceCode, ipAddress }),
    );
    return referenceCode;
  }

  /** Right after sign-up creates (or reclaims) an unverified account. */
  function sendForNewAccount(user, { ipAddress } = {}) {
    return send(user, { purpose: PURPOSE.SIGNUP, email: user.email, ipAddress });
  }

  /**
   * Starts switching a signed-in user to `newEmail`. Nothing changes until
   * the link sent to the new address is opened, so a typo or someone else's
   * address can never take over the account's email.
   */
  async function startEmailChange({ user, newEmail, ipAddress }) {
    assertEnabled();
    const email = normalizeEmail(newEmail);
    if (email === user.email) throw conflict("That is already your email.");
    if (await db.user.findUnique({ where: { email } })) throw emailTaken();
    return send(user, { purpose: PURPOSE.EMAIL_CHANGE, email, ipAddress });
  }

  /**
   * An unverified address may be signed up again — by its real owner after a
   * typo'd or squatted registration — but only while the account has never
   * had a session. Nothing about it has ever been proven or used, so there
   * is nothing to protect; anything else must go through sign-in instead.
   */
  async function canReclaim(user) {
    if (!config.required || user.emailVerifiedAt) return false;
    const [sessions, logins] = await Promise.all([
      db.refreshToken.count({ where: { userId: user.id } }),
      db.loginLog.count({ where: { userId: user.id } }),
    ]);
    return sessions === 0 && logins === 0;
  }

  /** Sign-in gate, applied after the password has been checked. */
  function assertVerifiedForSignIn(user) {
    if (config.required && !user.emailVerifiedAt) throw emailNotVerified();
  }

  /** Same response for any well-formed email; mails only an unconfirmed sign-up. */
  async function resend({ email, ipAddress }) {
    assertEnabled();
    const normalized = normalizeEmail(email);
    const referenceCode = newReferenceCode();
    runInBackground("signup resend", async () => {
      const user = await db.user.findUnique({ where: { email: normalized } });
      if (!user || !canSignIn(user) || user.emailVerifiedAt) return;
      await issueAndSend(user, {
        purpose: PURPOSE.SIGNUP,
        email: user.email,
        referenceCode,
        ipAddress,
      });
    });
    return referenceCode;
  }

  /** What a confirmed link does to the account, by purpose. */
  async function applyConfirmation(tx, record, user, confirmedAt) {
    if (record.purpose === PURPOSE.SIGNUP) {
      // A sign-up link only ever confirms the address it was sent to.
      if (record.email !== user.email) throw invalidToken();
      if (!user.emailVerifiedAt) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: confirmedAt } });
      }
      return;
    }
    try {
      await tx.user.update({
        where: { id: user.id },
        data: { email: record.email, emailVerifiedAt: confirmedAt },
      });
    } catch (err) {
      // Someone else registered the address after the link was sent.
      if (err.code === "P2002") throw emailTaken();
      throw err;
    }
  }

  async function verify(token) {
    assertEnabled();
    if (!isPlausibleToken(token)) throw invalidToken();
    const confirmedAt = now();
    await db.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!record) throw invalidToken();
      // Conditional update = the link is spent exactly once, even when two
      // tabs open it at the same moment.
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: confirmedAt } },
        data: { usedAt: confirmedAt },
      });
      if (consumed.count !== 1) throw invalidToken();

      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user || !canSignIn(user)) throw invalidToken();
      await applyConfirmation(tx, record, user, confirmedAt);

      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, purpose: record.purpose, usedAt: null, revokedAt: null },
        data: { revokedAt: confirmedAt },
      });
    });
  }

  async function pruneExpired() {
    const cutoff = new Date(+now() - config.retentionDays * 86_400_000);
    const { count } = await db.emailVerificationToken.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }

  return {
    isRequired: () => config.required,
    linkLifetimeHours: () => config.tokenTtlHours,
    sendForNewAccount,
    startEmailChange,
    canReclaim,
    assertVerifiedForSignIn,
    resend,
    verify,
    pruneExpired,
  };
}

module.exports = { createEmailVerificationService, PURPOSE };
