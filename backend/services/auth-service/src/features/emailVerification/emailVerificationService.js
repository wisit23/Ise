const { AppError, isRestrictedStatus } = require("@reloop/shared");
const { hashToken, newToken, isPlausibleToken, tokenLink } = require("../../services/oneTimeToken");
const { normalizeEmail } = require("../../services/emailAddress");
const { verificationEmail } = require("./emailVerificationEmails");

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

/**
 * Sign-up email verification. Dependencies are injected so the flow can be
 * tested without Postgres, SMTP or the wall clock.
 *
 * Mail goes out through `schedule`, after the HTTP response: resend answers
 * identically (body and timing) whether or not the address has an account,
 * so the endpoint can't be used to discover who is registered.
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

  async function issueAndSend(user, { ipAddress } = {}) {
    const issuedAt = now();
    const { token, tokenHash } = newToken();
    await db.$transaction([
      // Only the newest link works: sending again cancels the earlier ones.
      db.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: issuedAt },
      }),
      db.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(+issuedAt + config.tokenTtlHours * 3_600_000),
          requestedIp: ipAddress || null,
          createdAt: issuedAt,
        },
      }),
    ]);
    await mailer.send({
      to: user.email,
      ...verificationEmail({
        firstName: user.firstName,
        verifyUrl: verifyUrl(token),
        expiresInHours: config.tokenTtlHours,
      }),
    });
  }

  /** Called right after sign-up creates (or reclaims) an unverified account. */
  function sendForNewAccount(user, context) {
    runInBackground("verification email", () => issueAndSend(user, context));
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

  /** Always resolves the same way for any well-formed email. */
  async function resend({ email, ipAddress }) {
    assertEnabled();
    const normalized = normalizeEmail(email);
    runInBackground("verification resend", async () => {
      const user = await db.user.findUnique({ where: { email: normalized } });
      const signInAllowed = user && (user.status === "ACTIVE" || isRestrictedStatus(user.status));
      if (!signInAllowed || user.emailVerifiedAt) return;
      await issueAndSend(user, { ipAddress });
    });
  }

  async function verify(token) {
    assertEnabled();
    if (!isPlausibleToken(token)) throw invalidToken();
    const verifiedAt = now();
    await db.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!record) throw invalidToken();
      // Conditional update = the link is spent exactly once, even when two
      // tabs open it at the same moment.
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: verifiedAt } },
        data: { usedAt: verifiedAt },
      });
      if (consumed.count !== 1) throw invalidToken();
      await tx.user.updateMany({
        where: { id: record.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: verifiedAt },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId: record.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: verifiedAt },
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
    canReclaim,
    assertVerifiedForSignIn,
    resend,
    verify,
    pruneExpired,
  };
}

module.exports = { createEmailVerificationService };
