// High-confidence patterns for credential formats that are never legitimately
// committed to source control, regardless of context.
const HIGH_CONFIDENCE_PATTERNS = [
  {
    name: "private key header",
    regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  { name: "AWS access key ID", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", regex: /gh[oprsu]_[A-Za-z0-9]{36,}/ },
  { name: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "OpenAI-style secret key", regex: /sk-[A-Za-z0-9]{20,}/ },
];

// Values that mean "this is an example/placeholder, not a real secret" —
// checked against the matched value only, so a real secret containing the
// word "test" in an unrelated part of the line still gets flagged.
const PLACEHOLDER_MARKERS = [
  "change_me",
  "changeme",
  "example",
  "placeholder",
  "your_",
  "your-",
  "dev_",
  "ci-test",
  "xxxx",
  "<",
  "{{",
];

// Matches both quoted string literals ("token: 'value'") and unquoted
// .env-style assignments (TOKEN=value). The keyword may appear anywhere in
// the identifier, not just at the start — this repo's own env vars are named
// like JWT_ACCESS_SECRET and POSTGRES_PASSWORD, with the keyword last.
const GENERIC_ASSIGNMENT_PATTERN =
  /\b[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY)\w*\s*[:=]\s*(['"]?)([A-Za-z0-9+/=_-]{12,})\1/gi;

function isPlaceholder(value) {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

// An unquoted value with no digits and no special characters reads as a
// plain camelCase/snake_case JS identifier reference ("token: refreshToken"),
// not a secret literal — real secrets are effectively guaranteed to contain
// at least one digit across 12+ random characters.
function looksLikeBareIdentifier(quote, value) {
  return (
    !quote && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) && !/[0-9]/.test(value)
  );
}

// Test files legitimately construct credential-shaped string literals to
// exercise register/login/auth flows (e.g. a hardcoded test password). The
// low-confidence generic heuristic is skipped there; the high-confidence
// patterns (real key/token formats) still apply everywhere, since a real
// private key or cloud credential has no legitimate reason to appear in a
// test file either.
function isTestFile(filename) {
  return /\.test\.js$/.test(filename) || /(^|\/)tests?\//.test(filename);
}

/**
 * Scans file content for likely secrets. `filename` is optional context used
 * only to relax the generic low-confidence heuristic for test files. Returns
 * an array of { line, pattern, excerpt } findings — empty if none found.
 */
function findSecrets(content, filename = "") {
  const findings = [];
  const lines = content.split("\n");
  const skipGenericHeuristic = isTestFile(filename);

  lines.forEach((line, index) => {
    for (const { name, regex } of HIGH_CONFIDENCE_PATTERNS) {
      if (regex.test(line)) {
        findings.push({
          line: index + 1,
          pattern: name,
          excerpt: line.trim().slice(0, 80),
        });
      }
    }

    if (skipGenericHeuristic) return;

    let match;
    GENERIC_ASSIGNMENT_PATTERN.lastIndex = 0;
    while ((match = GENERIC_ASSIGNMENT_PATTERN.exec(line))) {
      const [, quote, value] = match;
      if (!looksLikeBareIdentifier(quote, value) && !isPlaceholder(value)) {
        findings.push({
          line: index + 1,
          pattern: "generic SECRET/TOKEN/PASSWORD/API_KEY assignment",
          excerpt: line.trim().slice(0, 80),
        });
      }
    }
  });

  return findings;
}

module.exports = { findSecrets };

if (require.main === module) {
  const { execFileSync } = require("child_process");
  const fs = require("fs");
  const path = require("path");

  const repoRoot = path.resolve(__dirname, "..");
  // This file's own test fixtures deliberately contain every pattern type
  // (including high-confidence ones like a fake private key header) to prove
  // detection works — scanning it here would always self-flag, exactly like
  // scanning .env.example for its intentional placeholder values would.
  const SELF_EXCLUDED_PATH = "scripts/secretScan.test.js";
  const trackedFiles = execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && file !== SELF_EXCLUDED_PATH);

  let totalFindings = 0;
  for (const relativePath of trackedFiles) {
    const fullPath = path.join(repoRoot, relativePath);
    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue; // binary or unreadable file — skip rather than crash the scan
    }
    const findings = findSecrets(content, relativePath);
    for (const finding of findings) {
      totalFindings += 1;
      console.error(
        `${relativePath}:${finding.line} [${finding.pattern}] ${finding.excerpt}`,
      );
    }
  }

  if (totalFindings > 0) {
    console.error(
      `\nsecret-scan: ${totalFindings} potential secret(s) found in tracked files.`,
    );
    process.exit(1);
  }
  console.log(
    `secret-scan: 0 potential secrets found across ${trackedFiles.length} tracked files.`,
  );
}
