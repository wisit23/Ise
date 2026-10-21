const { Router } = require("express");
const { rateLimit } = require("../../middleware/rateLimit");
const { createPasswordResetController } = require("./passwordResetController");

const TOO_MANY_REQUESTS = "Too many reset requests. Please wait a while and try again.";
const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a while and try again.";

/**
 * Public (unauthenticated) routes, so every one is rate limited:
 * - forgot: per client IP and per target email (lower-cased), which caps
 *   both one attacker spraying many inboxes and many attackers hammering
 *   one inbox. Applied whether or not the email has an account, so a 429
 *   reveals nothing about account existence.
 * - verify/reset: per client IP; tokens are 256-bit so this only bounds
 *   load, not a realistic guessing attack.
 */
function createPasswordResetRouter({ service, config, rateLimitClient }) {
  const controller = createPasswordResetController(service);
  const { request, submit } = config;
  const byIp = (req) => req.ip;
  const byEmail = (req) =>
    typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;

  const limitSubmit = rateLimit({
    name: "password-reset-submit-ip",
    limit: submit.perIp,
    windowSeconds: submit.windowSeconds,
    key: byIp,
    client: rateLimitClient,
    message: TOO_MANY_ATTEMPTS,
  });

  const router = Router();
  router.post(
    "/forgot",
    rateLimit({
      name: "password-reset-ip",
      limit: request.perIp,
      windowSeconds: request.windowSeconds,
      key: byIp,
      client: rateLimitClient,
      message: TOO_MANY_REQUESTS,
    }),
    rateLimit({
      name: "password-reset-email",
      limit: request.perEmail,
      windowSeconds: request.windowSeconds,
      key: byEmail,
      client: rateLimitClient,
      message: TOO_MANY_REQUESTS,
    }),
    controller.forgot,
  );
  router.post("/reset/verify", limitSubmit, controller.verify);
  router.post("/reset", limitSubmit, controller.reset);
  return router;
}

module.exports = { createPasswordResetRouter };
