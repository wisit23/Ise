const test = require("node:test");
const assert = require("node:assert/strict");
const { findSecrets } = require("./secretScan");

test("flags a fake private key header", () => {
  const content =
    "some file\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n";
  const findings = findSecrets(content);
  assert.ok(findings.some((f) => f.pattern === "private key header"));
});

test("flags a fake AWS access key ID", () => {
  const findings = findSecrets("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n");
  assert.ok(findings.some((f) => f.pattern === "AWS access key ID"));
});

test("flags a fake GitHub token", () => {
  const findings = findSecrets(
    "token: ghp_1234567890abcdefghijklmnopqrstuvwxyz\n",
  );
  assert.ok(findings.some((f) => f.pattern === "GitHub token"));
});

test("does not flag a placeholder value in .env.example style content", () => {
  const findings = findSecrets(
    "JWT_ACCESS_SECRET=dev_access_secret_change_me\n",
  );
  assert.equal(findings.length, 0);
});

test("does not flag ordinary source code with no secret-shaped content", () => {
  const findings = findSecrets(
    "function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n",
  );
  assert.equal(findings.length, 0);
});

test("still flags a real-looking secret even if the line also contains the word 'test'", () => {
  const findings = findSecrets(
    "// test config\nAPI_KEY=abcdEFGH1234567890ijklMNOP\n",
  );
  assert.ok(findings.some((f) => f.pattern.includes("assignment")));
});
