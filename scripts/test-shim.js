const fs = require("fs");
const path = require("path");
const Module = require("module");

const orig = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...args) {
  if (req === "@reloop/shared") {
    try {
      const resolved = orig.call(this, req, parent, ...args);
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // Best-effort module resolution fallback
    }
    const hostPath = path.resolve(__dirname, "../backend/shared/src/index.js");
    if (fs.existsSync(hostPath)) return hostPath;
    const containerPath = path.resolve(__dirname, "../shared/src/index.js");
    if (fs.existsSync(containerPath)) return containerPath;
  }
  if (req === "jsonwebtoken") {
    try {
      const resolved = orig.call(this, req, parent, ...args);
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // Best-effort module resolution fallback
    }
    const hostPath = path.resolve(
      __dirname,
      "../frontend/node_modules/next/dist/compiled/jsonwebtoken/index.js",
    );
    if (fs.existsSync(hostPath)) return hostPath;
  }
  if (req === "supertest") {
    try {
      return orig.call(this, req, parent, ...args);
    } catch {
      return path.resolve(__dirname, "supertest-shim.js");
    }
  }
  if (
    (req.endsWith("prismaClient") || req.endsWith("prismaClient.js")) &&
    process.env.REQUIRE_INTEGRATION !== "1"
  ) {
    return path.resolve(__dirname, "dummyPrisma.js");
  }
  return orig.call(this, req, parent, ...args);
};
