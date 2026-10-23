const { Router } = require("express");
const { rateLimit } = require("../../middleware/rateLimit");
const { createEmailVerificationController } = require("./emailVerificationController");

const TOO_MANY_REQUESTS = "Too many confirmation emails requested. Please wait a while and try again.";
const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a while and try again.";

/**
 * Public routes, each rate limited:
 * - resend: per client IP and per (lower-cased) email, applied whether or
 *   not the email has an account so a 429 reveals nothing.
 * - verify: per client IP; tokens are 256-bit, so this only bounds load.
 */
function createEmailVerificationRouter({ service, config, rateLimitClient }) {
  const controller = createEmailVerificationController(service);
  const { resend, submit } = config;
  const byIp = (req) => req.ip;
  const byEmail = (req) =>
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;

  const router = Router();
  router.post(
    "/resend",
    rateLimit({
      name: "email-verification-ip",
      limit: resend.perIp,
      windowSeconds: resend.windowSeconds,
      key: byIp,
      client: rateLimitClient,
      message: TOO_MANY_REQUESTS,
    }),
    rateLimit({
      name: "email-verification-email",
      limit: resend.perEmail,
      windowSeconds: resend.windowSeconds,
      key: byEmail,
      client: rateLimitClient,
      message: TOO_MANY_REQUESTS,
    }),
    controller.resend,
  );
  router.post(
    "/verify",
    rateLimit({
      name: "email-verification-submit-ip",
      limit: submit.perIp,
      windowSeconds: submit.windowSeconds,
      key: byIp,
      client: rateLimitClient,
      message: TOO_MANY_ATTEMPTS,
    }),
    controller.verify,
  );
  return router;
}

module.exports = { createEmailVerificationRouter };
