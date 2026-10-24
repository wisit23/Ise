// Consumes one clearly labelled review-report fixture; keeps the other cases for manual QA.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const env = require("dotenv").parse(fs.readFileSync(".env"));
const base = `http://127.0.0.1:${env.GATEWAY_PORT || 8080}`;
const seed = JSON.parse(fs.readFileSync("tmp/review-report-seed.json"));
const fixture = seed.cases[0];
let token;
async function request(path, body) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function main() {
  const login = await request("/api/auth/login", { email: "admin@example.com", password: "password123" });
  token = login.accessToken;
  const sellerId = seed.storeUrl.split("/").pop();
  const summaryUrl = `/api/products/reviews/by-seller/${sellerId}/summary`;
  const before = await request(summaryUrl);
  const reportUrl = `/api/auth/admin/reports/${fixture.reportId}`;
  await request(reportUrl + "/review", {});
  const command = { decision: "REMOVE_REVIEW", reason: "DEMO smoke: ยืนยันว่าเป็นรีวิวสแปมสำหรับทดสอบ" };
  const result = await request(reportUrl + "/action", command);
  assert.equal(result.status, "ACTIONED");
  assert.equal(result.actionTaken, "REMOVE_REVIEW");
  assert.equal((await request(reportUrl + "/action", command)).status, "ACTIONED");
  const detail = await request(reportUrl);
  assert.equal(detail.decision.action, "REMOVE_REVIEW");
  assert.equal(detail.decision.reason, command.reason);
  const after = await request(summaryUrl);
  assert.equal(after.total, before.total - 1);
  const reviews = await request(`/api/products/reviews/by-seller/${sellerId}?limit=100`);
  assert.equal(reviews.items.some((review) => review.id === fixture.reviewId), false);
  console.log(JSON.stringify({ removedReview: fixture.reviewId, reportStatus: result.status, audit: detail.decision.action, before, after, manualCases: seed.cases.slice(1) }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
