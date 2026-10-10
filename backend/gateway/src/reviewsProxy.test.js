const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");

test("review API and existing media URLs reach product-service", async (t) => {
  const upstream = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => upstream.close());

  process.env.PRODUCT_SERVICE_URL = `http://127.0.0.1:${upstream.address().port}`;
  const app = require("./app");

  const reviews = await request(app).get("/api/reviews/by-seller/seller-1");
  assert.equal(reviews.status, 200);
  assert.equal(reviews.body.path, "/reviews/by-seller/seller-1");

  const media = await request(app).get("/review-uploads/photo.jpg");
  assert.equal(media.status, 200);
  assert.equal(media.body.path, "/review-uploads/photo.jpg");
});
