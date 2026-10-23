const bcrypt = require("bcryptjs");
const { AppError, badRequest, isRestrictedStatus } = require("@reloop/shared");
const { assertPasswordPolicy, hashPassword } = require("../../services/passwordPolicy");
const { assertActive, lockUser } = require("../../services/sessionService");
const { hashToken, newToken, isPlausibleToken, tokenLink } = require("../../services/oneTimeToken");
const { normalizeEmail } = require("../../services/emailAddress");
const { newReferenceCode } = require("../../services/referenceCode");
const { resetLinkEmail, passwordChangedEmail } = require("./passwordResetEmails");

/** Same rule login uses (sessionService.assertActive): who may sign in may reset. */
function canSignIn(user) {
  return user.status === "ACTIVE" || isRestrictedStatus(user.status);
}

// One message for every unusable token — unknown, expired, used, revoked —
// so the response never tells a caller which of those it hit.
function invalidToken() {
  return Object.assign(
    new AppError(400, "This reset link is invalid or has expired. Please request a new one."),
    { code: "RESET_TOKEN_INVALID" },
  );
}

function readToken(token) {
  if (!isPlausibleToken(token)) throw invalidToken();
  return token;
}

/**
 * Forgot-password flow. Dependencies are injected so the whole flow can be
 * tested without Postgres, SMTP or the wall clock.
 *
 * - `schedule` runs the slow, account-dependent part (lookup, token write,
 *   SMTP) after the HTTP response is sent. The response for a registered
 *   and an unknown email is therefore identical in body AND timing, which is
 *   what stops the endpoint from being an account-existence oracle.
 */
function createPasswordResetService({
  db,
  mailer,
  config,
  now = () => new Date(),
  schedule = (task) => setImmediate(task),
  logger = console,
}) {
  // The token rides in the URL fragment, which browsers never send to any
  // server: it stays out of access logs, proxies and Referer headers.
  const resetUrl = (token) => tokenLink(config.appBaseUrl, "/reset-password", token);

  function assertEnabled() {
    if (!config.enabled) {
      throw new AppError(503, "Password reset is not available right now. Please contact support.");
    }
  }

  async function findUsableToken(tokenHash, client = db) {
    const record = await client.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.revokedAt || record.expiresAt <= now()) {
      throw invalidToken();
    }
    return record;
  }

  async function deliverResetLink({ email, referenceCode, ipAddress, userAgent }) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !canSignIn(user)) return;

    const issuedAt = now();
    const { token, tokenHash } = newToken();
    await db.$transaction([
      // Only the newest link works: asking again cancels the earlier ones.
      db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: issuedAt },
      }),
      db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(+issuedAt + config.tokenTtlMinutes * 60_000),
          requestedIp: ipAddress || null,
          requestedUserAgent: userAgent ? userAgent.slice(0, 512) : null,
          referenceCode,
          createdAt: issuedAt,
        },
      }),
    ]);

    await mailer.send({
      to: user.email,
      ...resetLinkEmail({
        firstName: user.firstName,
        resetUrl: resetUrl(token),
        expiresInMinutes: config.tokenTtlMinutes,
        referenceCode,
      }),
    });
  }

  function runInBackground(label, task) {
    schedule(() =>
      task().catch((err) => logger.error(`[password-reset] ${label} failed:`, err.message)),
    );
  }

  /**
   * Always resolves the same way for any well-formed email, including a
   * fresh reference code: it is generated here, before anyone knows whether
   * an email will actually go out.
   */
  async function requestReset({ email, ipAddress, userAgent }) {
    assertEnabled();
    const normalized = normalizeEmail(email);
    const referenceCode = newReferenceCode();
    runInBackground("reset email delivery", () =>
      deliverResetLink({ email: normalized, referenceCode, ipAddress, userAgent }),
    );
    return referenceCode;
  }

  async function verifyToken(token) {
    assertEnabled();
    const record = await findUsableToken(hashToken(readToken(token)));
    return { expiresAt: record.expiresAt };
  }

  async function resetPassword({ token, password, ipAddress }) {
    assertEnabled();
    const tokenHash = hashToken(readToken(token));
    assertPasswordPolicy(password);

    // bcrypt is deliberately slow, so the compare and hash happen before the
    // transaction instead of while it holds the user's row lock.
    const record = await findUsableToken(tokenHash);
    const current = await db.user.findUnique({ where: { id: record.userId } });
    if (!current) throw invalidToken();
    if (await bcrypt.compare(password, current.passwordHash)) {
      throw badRequest("Choose a password you haven't used for this account.");
    }
    const passwordHash = await hashPassword(password);

    const changedAt = now();
    const user = await db.$transaction(async (tx) => {
      const locked = await lockUser(tx, record.userId);
      assertActive(locked);
      // Conditional update = the token is spent exactly once, even when two
      // requests race with the same link.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: changedAt } },
        data: { usedAt: changedAt, usedIp: ipAddress || null },
      });
      if (consumed.count !== 1) throw invalidToken();

      await tx.user.update({
        where: { id: locked.id },
        // Completing a reset proves the user controls the address, so it
        // also confirms an email that was still waiting for verification.
        data: { passwordHash, ...(locked.emailVerifiedAt ? {} : { emailVerifiedAt: changedAt }) },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: locked.id, usedAt: null, revokedAt: null },
        data: { revokedAt: changedAt },
      });
      // Whoever had the old password may still hold a session: end them all.
      await tx.refreshToken.updateMany({
        where: { userId: locked.id, revokedAt: null },
        data: { revokedAt: changedAt },
      });
      await tx.loginLog.updateMany({
        where: { userId: locked.id, logoutAt: null },
        data: { logoutAt: changedAt },
      });
      return locked;
    });

    runInBackground("password-changed notice", () =>
      mailer.send({
        to: user.email,
        ...passwordChangedEmail({
          firstName: user.firstName,
          changedAt,
          supportUrl: `${config.appBaseUrl}/support`,
        }),
      }),
    );
  }

  async function pruneExpired() {
    const cutoff = new Date(+now() - config.retentionDays * 86_400_000);
    const { count } = await db.passwordResetToken.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }

  return { requestReset, verifyToken, resetPassword, pruneExpired, deliverResetLink };
}

module.exports = { createPasswordResetService };
