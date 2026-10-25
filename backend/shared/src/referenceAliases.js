const {
  REFERENCE_MODELS,
  normalizeReferenceCode,
} = require("./referenceCodes");

// Resolve aliases before existing authorization and ownership checks. Mutation
// bodies, tokens, cursors, and free-text search remain untouched.
function referenceAliases(db, service) {
  const models = Object.entries(REFERENCE_MODELS[service] || {});
  const byPrefix = new Map(
    models.map(([model, prefix]) => [
      prefix,
      model[0].toLowerCase() + model.slice(1),
    ]),
  );
  return async (req, res, next) => {
    try {
      const index = req.url.indexOf("?");
      const pathname = index < 0 ? req.url : req.url.slice(0, index);
      const query = new URLSearchParams(index < 0 ? "" : req.url.slice(index + 1));
      const parts = pathname.split("/");
      for (let i = 0; i < parts.length; i += 1) {
        const code = normalizeReferenceCode(parts[i]);
        const delegate = code && byPrefix.get(code.slice(0, 3));
        if (!delegate) continue;
        const row = await db[delegate].findFirst({
          where: { referenceCode: code },
          select: { id: true },
        });
        if (row) parts[i] = encodeURIComponent(row.id);
      }
      for (const [key, value] of query) {
        if (!/Id$/.test(key) && !["assignedTo", "actorSearch"].includes(key)) continue;
        const code = normalizeReferenceCode(value);
        if (!code) continue;
        const delegate = byPrefix.get(code.slice(0, 3));
        if (delegate) {
          const row = await db[delegate].findFirst({ where: { referenceCode: code }, select: { id: true } });
          if (row) { query.set(key, row.id); if (req.query) req.query[key] = row.id; }
        } else {
          const owner = Object.keys(REFERENCE_MODELS).find((name) => Object.values(REFERENCE_MODELS[name]).includes(code.slice(0, 3)));
          const url = owner && process.env[`${owner.toUpperCase()}_SERVICE_URL`];
          if (!url || !process.env.INTERNAL_SERVICE_TOKEN) continue;
          const response = await fetch(`${url}/internal/reference-codes`, {
            method: "POST", headers: { "Content-Type": "application/json", "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN },
            body: JSON.stringify({ codes: [code] }), signal: AbortSignal.timeout(1500),
          });
          if (!response.ok) throw Object.assign(new Error("Reference search unavailable"), { status: 502 });
          const match = Object.entries(await response.json()).find(([, reference]) => reference === code);
          if (match) { query.set(key, match[0]); if (req.query) req.query[key] = match[0]; }
        }
      }
      req.url = parts.join("/") + (query.size ? "?" + query.toString() : "");
      next();
    } catch (error) {
      next(error);
    }
  };
}
module.exports = { referenceAliases };
