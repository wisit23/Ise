const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function evaluate(audit, lock, policy) {
  if (audit.auditReportVersion !== 2 || audit.error || !audit.vulnerabilities) {
    throw new Error("A complete npm audit report is required");
  }
  const vulnerabilities = audit.vulnerabilities;
  const exception = policy.sharp0345;
  function allowed(name, seen = new Set()) {
    const finding = vulnerabilities[name];
    if (!finding || finding.severity !== "high" || seen.has(name) || !finding.via?.length) return false;
    const nextSeen = new Set([...seen, name]);
    if (name === "sharp") {
      return exception?.enabled === true && exception.version === "0.34.5" &&
        finding.severity === "high" && finding.nodes?.length > 0 &&
        finding.nodes.every((node) => lock.packages[node]?.version === "0.34.5") &&
        finding.via.every((advisory) => typeof advisory === "object" &&
          advisory.name === "sharp" && advisory.severity === "high" &&
          exception.advisories.includes(advisory.url));
    }
    // npm can mark Next.js affected through its optional Sharp dependency.
    // Accept only this dependency chain; a direct Next advisory still blocks.
    return finding.via.every((cause) => typeof cause === "string" && allowed(cause, nextSeen));
  }
  const accepted = [];
  const blocked = [];
  for (const [name, finding] of Object.entries(vulnerabilities)) {
    if (!["high", "critical"].includes(finding.severity)) continue;
    (allowed(name) ? accepted : blocked).push(name);
  }
  return { accepted, blocked };
}

function main() {
  const root = path.resolve(__dirname, "../..");
  // Fixed command only; no workflow or user inputs become shell arguments.
  const run = spawnSync("npm audit --omit=dev --json", {
    cwd: root, shell: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error || ![0, 1].includes(run.status)) throw new Error("npm audit failed to execute");
  const audit = JSON.parse(run.stdout);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "release-audit-policy.json"), "utf8"));
  const result = evaluate(audit, lock, policy);
  for (const name of result.accepted) {
    console.log(`Accepted documented Sharp 0.34.5 CPU compatibility exception: ${name}`);
  }
  for (const name of result.blocked) console.error(`Release blocked by audit: ${name}`);
  if (result.blocked.length) process.exitCode = 1;
  else console.log("Release audit passed under the documented policy; accepted findings are not resolved vulnerabilities.");
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { evaluate };
