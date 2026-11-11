/** Keep the legacy public CORS behavior unless a deployment supplies origins. */
function createCorsOptions(env = process.env) {
  const origins = (env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
      throw new Error("FRONTEND_ORIGINS must contain exact HTTP(S) origins");
  }
  return {
    // Credentials allow the ALB affinity cookie for cross-origin polling.
    origin: origins.length
      ? (origin, callback) =>
          callback(null, !origin || origins.includes(origin))
      : "*",
    ...(origins.length ? { credentials: true } : {}),
    exposedHeaders: ["Retry-After", "X-Server-Time"],
  };
}

module.exports = { createCorsOptions };
