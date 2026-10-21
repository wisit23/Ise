// Redis-backed fixed-window limiter for unauthenticated endpoints, keyed by
// whatever the route chooses (client IP, a hashed email, ...). Counters live
// in Redis rather than memory so every auth-service instance shares one
// budget.
const crypto = require("crypto");
const IORedis = require("ioredis");
const { AppError } = require("@reloop/shared");

// Opened on first use, so requiring this module (e.g. in unit tests that
// never hit a limited route) does not need a Redis server.
let sharedClient = null;
function getClient() {
  if (!sharedClient) {
    sharedClient = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
      maxRetriesPerRequest: 1,
    });
  }
  return sharedClient;
}

// INCR and EXPIRE in one atomic script: a crash between two separate calls
// would leave a counter with no TTL and lock that key out forever.
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/** Keys never contain raw emails or IPs, so Redis holds no personal data. */
function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/**
 * Fails CLOSED: if Redis is unreachable the request is refused with 503.
 * These limits guard account-recovery endpoints, where letting traffic
 * through unmetered (mail bombing, token guessing) is worse than a short
 * outage of the feature itself.
 */
function rateLimit({ name, limit, windowSeconds, key, client, message }) {
  return async function rateLimitMiddleware(req, res, next) {
    const subject = key(req);
    if (!subject) return next();

    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const redisKey = `ratelimit:${name}:${digest(subject)}:${window}`;

    let count;
    try {
      count = await (client || getClient()).eval(
        INCR_WITH_TTL,
        1,
        redisKey,
        windowSeconds,
      );
    } catch (err) {
      console.error(`[auth-service] rate limit check failed (${name}):`, err.message);
      return next(
        new AppError(503, "This service is temporarily unavailable. Please try again shortly."),
      );
    }

    if (count > limit) {
      res.setHeader("Retry-After", String(windowSeconds));
      return next(new AppError(429, message));
    }
    next();
  };
}

async function closeRateLimitClient() {
  if (sharedClient) {
    await sharedClient.quit();
    sharedClient = null;
  }
}

module.exports = { rateLimit, closeRateLimitClient };
