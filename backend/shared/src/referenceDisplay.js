const { REFERENCE_MODELS, normalizeReferenceCode } = require("./referenceCodes");
const { requireInternalToken } = require("./authMiddleware");

const LIMIT = 200;
const isIdentifier = (key) => key === "id" || /(?:Id|By)$/.test(key) || key === "assignedTo";

// Only codes for identifiers already present in an authorized response are added.
// IDs, stored text, authorization decisions, and mutation inputs remain untouched.
function installReferenceDisplay(app, db, service) {
  const cache = new Map();
  const models = Object.keys(REFERENCE_MODELS[service]);
  async function local(ids, codes = null) {
    const entries = await Promise.all(models.map(async (model) => {
      const delegate = db[model[0].toLowerCase() + model.slice(1)];
      if (!delegate?.findMany) return [];
      // Mongo rejects non-ObjectId strings, whereas Postgres IDs are text.
      const candidates = service === "chat" ? ids.filter((id) => /^[a-f\d]{24}$/i.test(id)) : ids;
      if (!codes && !candidates.length) return [];
      return delegate.findMany({ where: codes ? { referenceCode: { in: codes } } : { id: { in: candidates } }, select: { id: true, referenceCode: true } });
    }));
    return Object.fromEntries(entries.flat().filter((row) => row.referenceCode).map((row) => [row.id, row.referenceCode]));
  }
  app.post("/internal/reference-codes", requireInternalToken, async (req, res, next) => {
    const codes = req.body?.codes;
    const ids = codes || req.body?.ids;
    if (!Array.isArray(ids) || ids.length > LIMIT || ids.some((id) => typeof id !== "string" || id.length > 128) || (codes && codes.some((code) => !normalizeReferenceCode(code))))
      return res.status(400).json({ error: "Invalid reference identifiers" });
    try { return res.json(await local(codes ? [] : [...new Set(ids)], codes?.map((code) => normalizeReferenceCode(code)))); } catch (error) { next(error); }
  });
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (req.path.startsWith("/internal/") || !req.userId || res.statusCode >= 400 || !body || typeof body !== "object") return json(body);
      const ids = new Set();
      function collect(value) {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (typeof child === "string") {
            if (isIdentifier(key) && child && child.length <= 128) ids.add(child);
          } else collect(child);
        }
      }
      collect(body);
      if (!ids.size) return json(body);
      async function enrich() {
        const found = Object.create(null);
        const missing = [];
        for (const id of ids) {
          const entry = cache.get(id);
          if (entry && entry.until > Date.now()) Object.assign(found, entry.code ? { [id]: entry.code } : {});
          else missing.push(id);
        }
        for (let offset = 0; offset < missing.length; offset += LIMIT) {
          const batch = missing.slice(offset, offset + LIMIT);
          const results = await Promise.allSettled(Object.keys(REFERENCE_MODELS).map(async (owner) => {
            if (owner === service) return local(batch);
            const url = process.env[`${owner.toUpperCase()}_SERVICE_URL`];
            if (!url || !process.env.INTERNAL_SERVICE_TOKEN) return {};
            const response = await fetch(`${url}/internal/reference-codes`, {
              method: "POST", headers: { "Content-Type": "application/json", "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN },
              body: JSON.stringify({ ids: batch }), signal: AbortSignal.timeout(1500),
            });
            if (!response.ok) throw new Error("Reference lookup unavailable");
            return response.json();
          }));
          for (const result of results) if (result.status === "fulfilled") {
            for (const [id, code] of Object.entries(result.value)) if (ids.has(id)) found[id] = code;
          }
          for (const id of batch) {
            if (cache.size >= 5000) cache.delete(cache.keys().next().value);
            cache.set(id, { code: found[id], until: Date.now() + (found[id] ? 300000 : 10000) });
          }
        }
        function attach(value) {
          if (!value || typeof value !== "object") return;
          for (const [key, child] of Object.entries(value)) {
            if (typeof child === "string" && found[child]) {
              const field = key === "id" ? "referenceCode" : key.replace(/Id$/, "") + "ReferenceCode";
              if (isIdentifier(key)) value[field] = found[child];
            } else attach(child);
          }
          // Local mapping also covers UUIDs embedded in historical audit/report text.
          const references = Object.fromEntries(Object.entries(found).filter(([id]) => Object.values(value).some((child) => typeof child === "string" && child.includes(id))));
          if (Object.keys(references).length) value.displayReferences = references;
        }
        attach(body);
        return json(body);
      }
      // Reference lookup must never turn a completed business operation into an error.
      enrich().catch(() => { if (!res.headersSent) json(body); });
      return res;
    };
    next();
  });
}

module.exports = { installReferenceDisplay };
