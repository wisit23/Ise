const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const request = require("supertest");
const { createMediaStorage } = require("./mediaStorage");
const { errorHandler } = require("./errors");
const { createFakeS3 } = require("../test/fakeS3");

async function fixture(t, driver = "s3") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "reloop-storage-test-"));
  const namespace = path.basename(directory);
  const client = createFakeS3();
  const storage = createMediaStorage({ directory, namespace, client,
    env: { MEDIA_STORAGE_DRIVER: driver, AWS_REGION: "ap-southeast-1", S3_BUCKET: "private-test", S3_KEY_PREFIX: "test" },
  });
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
    if (driver === "s3") await fs.rm(storage.uploadDirectory, { recursive: true, force: true });
  });
  const app = express();
  app.use("/media", storage.publicMiddleware);
  app.use(errorHandler);
  return { storage, client, app };
}

for (const driver of ["docker", "s3"]) {
  test(`${driver}: store, HEAD, stream, range, missing and delete via HTTP`, async (t) => {
    const { storage, app, client } = await fixture(t, driver);
    await storage.put("clip.mp4", Buffer.from("0123456789"), "video/mp4");
    await storage.assertExists("clip.mp4");
    const get = await request(app).get("/media/clip.mp4");
    assert.equal(get.status, 200);
    assert.deepEqual(get.body, Buffer.from("0123456789"));
    const head = await request(app).head("/media/clip.mp4");
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-length"], "10");
    const part = await request(app).get("/media/clip.mp4").set("Range", "bytes=2-5");
    assert.equal(part.status, 206);
    assert.equal(part.headers["content-range"], "bytes 2-5/10");
    assert.deepEqual(part.body, Buffer.from("2345"));
    assert.equal((await request(app).get("/media/clip.mp4").set("Range", "bytes=99-100")).status, 416);
    await storage.remove("clip.mp4");
    await storage.remove("clip.mp4");
    await assert.rejects(storage.assertExists("clip.mp4"), (error) => error.code === "ENOENT");
    assert.equal((await request(app).get("/media/clip.mp4")).status, 404);
    if (driver === "s3") {
      assert.ok(client.calls.every(({ input }) => input.Bucket === "private-test"));
      assert.ok(client.calls.every(({ input }) => input.Key.startsWith("test/")));
      assert.ok(client.calls.every(({ input }) => !input.ACL));
    }
  });
}

test("configuration defaults to Docker and rejects invalid S3 config", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "reloop-config-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.equal(createMediaStorage({ directory, namespace: "config", env: {} }).driver, "docker");
  for (const env of [
    { MEDIA_STORAGE_DRIVER: "typo" },
    { MEDIA_STORAGE_DRIVER: "s3" },
    { MEDIA_STORAGE_DRIVER: "s3", S3_BUCKET: "x", AWS_REGION: "x", AWS_ACCESS_KEY_ID: "only-one" },
    { MEDIA_STORAGE_DRIVER: "s3", S3_BUCKET: "x", AWS_REGION: "x", S3_KEY_PREFIX: "../private" },
  ]) assert.throws(() => createMediaStorage({ directory, namespace: "config", env }));
});

test("reject unsafe keys without accessing S3", async (t) => {
  const { storage, client, app } = await fixture(t);
  for (const key of ["..", ".", "../secret", "a/b", "a\\b", "", "x\u0000", "x\n"]) {
    await assert.rejects(storage.put(key, Buffer.from("x")), /invalid media storage key/);
  }
  assert.equal((await request(app).get("/media/a%2Fb")).status, 400);
  assert.equal((await request(app).get("/media/%ZZ")).status, 400);
  assert.equal(client.calls.length, 0);
});

test("S3 multer upload persists then cleans scratch; rejected multipart removes objects", async (t) => {
  const { storage, client } = await fixture(t);
  const app = express();
  const upload = multer({ storage: storage.multerStorage(multer), limits: { files: 2, fileSize: 4 } });
  app.post("/upload", upload.array("files"), (req, res) => res.json(req.files));
  app.use((error, req, res, next) => { void next; res.status(400).json({ error: error.message }); });
  const ok = await request(app).post("/upload").attach("files", Buffer.from("123"), "test.png");
  assert.equal(ok.status, 200);
  assert.equal(client.objects.size, 1);
  assert.equal((await fs.readdir(storage.uploadDirectory)).length, 0);
  await storage.discardUpload(ok.body[0]);
  assert.equal(client.objects.size, 0);
  const over = await request(app).post("/upload")
    .attach("files", Buffer.from("12"), "one.png")
    .attach("files", Buffer.from("123456"), "two.png");
  assert.equal(over.status, 400);
  assert.equal(client.objects.size, 0);
  assert.equal((await fs.readdir(storage.uploadDirectory)).length, 0);
});

test("real AWS SDK signs and streams requests against an isolated HTTP S3 fixture", async (t) => {
  const http = require("node:http");
  const { S3Client } = require("@aws-sdk/client-s3");
  const bytes = Buffer.from("real-sdk-stream");
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const body = Buffer.concat(await Array.fromAsync(req));
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.method === "GET" || req.method === "HEAD") {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", bytes.length);
      res.end(req.method === "HEAD" ? undefined : bytes);
    } else res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new S3Client({
    endpoint: `http://127.0.0.1:${server.address().port}`, region: "ap-southeast-1", forcePathStyle: true,
    credentials: { accessKeyId: "fixture-only", secretAccessKey: "fixture-only" }, maxAttempts: 1,
  });
  t.after(() => client.destroy());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "reloop-sdk-wire-"));
  const storage = createMediaStorage({ directory, namespace: path.basename(directory), client,
    env: { MEDIA_STORAGE_DRIVER: "s3", AWS_REGION: "ap-southeast-1", S3_BUCKET: "wire-bucket" },
  });
  t.after(async () => {
    await fs.rm(storage.uploadDirectory, { recursive: true, force: true });
    await fs.rm(directory, { recursive: true, force: true });
  });
  const filename = "clip.mp4";
  const filePath = path.join(storage.uploadDirectory, filename);
  await fs.writeFile(filePath, bytes);
  await storage.persistUpload({ filename, path: filePath, mimetype: "video/mp4" });
  await storage.assertExists(filename);
  const app = express();
  app.use("/media", storage.publicMiddleware);
  app.use(errorHandler);
  const read = await request(app).get("/media/clip.mp4");
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, bytes);
  await storage.remove(filename);
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "HEAD", "GET", "DELETE"]);
  assert.ok(calls.every((call) => call.headers.authorization.startsWith("AWS4-HMAC-SHA256")));
  assert.ok(calls.every((call) => call.url.startsWith(`/wire-bucket/reloop/${path.basename(directory)}/clip.mp4`)));
  assert.ok(calls[0].body.includes(bytes));
  await assert.rejects(fs.access(filePath), (error) => error.code === "ENOENT");
});

test("S3 failure is not hidden by local fallback; scratch is removed", async (t) => {
  const { storage, client } = await fixture(t);
  client.failPut = true;
  const app = express();
  app.post("/upload", multer({ storage: storage.multerStorage(multer) }).single("file"), (req, res) => res.sendStatus(201));
  app.use((error, req, res, next) => { void next; res.status(503).json({ error: error.message }); });
  const result = await request(app).post("/upload").attach("file", Buffer.from("hello"), "a.png");
  assert.equal(result.status, 503);
  assert.equal(client.objects.size, 0);
  assert.equal((await fs.readdir(storage.uploadDirectory)).length, 0);
  assert.equal((await fs.readdir(path.dirname(storage.absolutePath("a.png")))).length, 0);
});
