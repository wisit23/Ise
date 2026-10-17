const styleProfileClient = require("../recommendations/styleProfileClient");

async function resolveBuyerProfile(req, profiles = styleProfileClient) {
  if (!req.userId || !req.headers.authorization) return null;

  try {
    return await profiles.get(req.headers.authorization);
  } catch {
    // Fail closed: universal campaigns remain available, while targeted
    // campaigns cannot match when Auth's persisted profile is unavailable.
    return null;
  }
}

module.exports = { resolveBuyerProfile };
