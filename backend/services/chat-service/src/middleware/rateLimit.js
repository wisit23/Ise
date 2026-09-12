// Redis-backed, NOT in-memory. chat-service is deliberately run as more than
// one instance (CHAT-006's 2-instance scale test), and an in-memory counter
// gives each instance its own budget — the effective limit would silently be
// N times what it says. The counter has to live where every instance can see
// it, which is the Redis that's already here for the Socket.IO adapter.
const IORedis = require("ioredis");
const { AppError } = require("@reloop/shared");

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

// Lazily built, exactly like presence.js: requiring this module must never
// open a connection on its own, so unit tests that don't exercise a limited
// route need no Redis running.
let client = null;
function getClient() {
  if (!client) client = new IORedis(REDIS_URL);
  return client;
}

// INCR-then-EXPIRE is two round trips, and a crash between them leaves a key
// with no TTL — i.e. a user locked out permanently. Done as one Lua script so
// the pair is atomic and that state is unreachable.
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Fixed-window limiter keyed by the authenticated user.
 *
 * `client` is injectable so tests can drive the logic without a Redis
 * running — mocking ioredis's prototype instead would still construct a real
 * client, whose reconnect loop keeps the test process alive forever.
 *
 * Fails OPEN: if Redis is unreachable the request is allowed through rather
 * than rejected. That is the deliberate trade — chat's core job is letting
 * people read and send their own messages, and losing Redis must not take
 * that away. Redis being down already degrades presence and cross-instance
 * delivery; it must not also become an outage.
 */
function rateLimit(name, { limit, windowSeconds }, { client: injected } = {}) {
  return async function rateLimitMiddleware(req, res, next) {
    // Unauthenticated requests never reach here (requireAuth runs first),
    // but if that ever changes, no userId means no key to count against.
    if (!req.userId) return next();

    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ratelimit:${name}:${req.userId}:${window}`;

    let count;
    try {
      const redis = injected || getClient();
      count = await redis.eval(INCR_WITH_TTL, 1, key, windowSeconds);
    } catch (err) {
      console.error(
        `[chat-service] rate limit check failed (${name}):`,
        err.message,
      );
      return next();
    }

    if (count > limit) {
      // Tells a well-behaved client exactly how long to wait instead of
      // making it guess and retry blindly.
      res.setHeader("Retry-After", windowSeconds);
      return next(
        new AppError(429, "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"),
      );
    }

    next();
  };
}

/** Test/shutdown hook — the lazily opened connection would otherwise keep
 * the event loop alive after a test run finishes. */
async function closeRateLimitClient() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = { rateLimit, closeRateLimitClient };
