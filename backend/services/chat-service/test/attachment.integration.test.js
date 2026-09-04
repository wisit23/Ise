// Integration test against a real, disposable MongoDB replica set AND the
// real on-disk private-attachments directory (multer writes actual files).
// Skips cleanly when Mongo is unreachable so `npm test` still passes on a
// machine with none running; REQUIRE_INTEGRATION=1 (the CI workflow does)
// turns that skip into a hard failure — same pattern as every other
// *.integration.test.js in this service.
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

if (process.env.DATABASE_URL_CHAT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_CHAT;
}
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const { signAccessToken } = require("@reloop/shared");
// Bulk-seeding through the public API would otherwise trip the per-user send
// limit (see src/limits.js) — raised HERE rather than lowering the real limit,
// which stays exactly what production runs.
process.env.CHAT_RATE_LIMIT_SEND_MESSAGE ||= "100000";
process.env.CHAT_RATE_LIMIT_UPLOAD_ATTACHMENT ||= "100000";
process.env.CHAT_RATE_LIMIT_CREATE_CONVERSATION ||= "100000";

const prisma = require("../src/models/prismaClient");
const app = require("../src/app");
// The rate limiter opens a Redis connection lazily on the first limited
// request; without closing it the test process stays alive forever.
const { closeRateLimitClient } = require("../src/middleware/rateLimit");
const {
  STORAGE_DIR,
} = require("../src/features/attachments/attachmentStorage");

const buyerId = `int-test-att-buyer-${Date.now()}`;
const sellerId = `int-test-att-seller-${Date.now()}`;
const strangerId = `int-test-att-stranger-${Date.now()}`;
const buyerToken = signAccessToken({ sub: buyerId, role: "BUYER" });
const sellerToken = signAccessToken({ sub: sellerId, role: "SELLER" });
const strangerToken = signAccessToken({ sub: strangerId, role: "BUYER" });

// A real (tiny) 1x1 PNG, not random bytes — multer's fileFilter only reads
// the declared MIME type, but pushing actually-decodable image bytes through
// the whole write→store→stream path is worth more than proving the plumbing
// accepts anything at all.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function databaseIsReachable() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

function makeConversation(suffix) {
  const now = new Date();
  return prisma.conversation.create({
    data: {
      contextType: "PRODUCT",
      contextId: `p-att-${suffix}`,
      contextKey: `PRODUCT:p-att-${suffix}:${buyerId}`,
      status: "ACTIVE",
      createdBy: buyerId,
      participants: [
        {
          userId: buyerId,
          role: "BUYER",
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        },
        {
          userId: sellerId,
          role: "SELLER",
          joinedAt: now,
          lastReadAt: null,
          leftAt: null,
        },
      ],
    },
  });
}

test("chat attachments against a real MongoDB replica set + real disk", async (t) => {
  if (!(await databaseIsReachable())) {
    const message =
      "DATABASE_URL_CHAT not set or MongoDB unreachable — see docs/featureplan/chat/plan.md CHAT-001";
    if (process.env.REQUIRE_INTEGRATION === "1") {
      throw new Error(`REQUIRE_INTEGRATION=1 but ${message}`);
    }
    t.skip(message);
    return;
  }

  const written = [];
  t.after(() => {
    // Files this test wrote to the real storage directory are its own to
    // clean up — leaving them behind would slowly fill the volume across
    // runs.
    for (const key of written) {
      fs.rm(path.join(STORAGE_DIR, key), { force: true }, () => {});
    }
  });

  await t.test(
    "uploads an image and stores it on disk, not in the DB",
    async () => {
      const conversation = await makeConversation("image");
      const res = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "item.png",
          contentType: "image/png",
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.type, "IMAGE");
      assert.equal(res.body.senderId, buyerId);
      assert.equal(res.body.payload.filename, "item.png");
      assert.equal(res.body.payload.mimeType, "image/png");
      assert.ok(res.body.payload.size > 0);
      written.push(res.body.payload.storageKey);

      // The bytes live on disk; the document holds only a reference. This is
      // plan.md's "ไฟล์แนบ ห้ามเก็บลงฐานข้อมูล" constraint, asserted rather
      // than assumed.
      const onDisk = path.join(STORAGE_DIR, res.body.payload.storageKey);
      assert.ok(fs.existsSync(onDisk), "file must exist on disk");
      assert.equal(fs.statSync(onDisk).size, res.body.payload.size);
      const stored = await prisma.message.findUnique({
        where: { id: res.body.id },
      });
      assert.equal(stored.payload.storageKey, res.body.payload.storageKey);
      assert.equal(stored.body, "");
    },
  );

  await t.test("a non-image is typed FILE rather than IMAGE", async () => {
    const conversation = await makeConversation("pdf");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .attach("file", Buffer.from("%PDF-1.4 fake"), {
        filename: "receipt.pdf",
        contentType: "application/pdf",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.type, "FILE");
    written.push(res.body.payload.storageKey);
  });

  await t.test(
    "sets a human-readable inbox preview, not a raw [IMAGE] tag",
    async () => {
      const conversation = await makeConversation("preview");
      const res = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "photo.png",
          contentType: "image/png",
        });
      assert.equal(res.status, 201);
      written.push(res.body.payload.storageKey);

      const reloaded = await prisma.conversation.findUnique({
        where: { id: conversation.id },
      });
      assert.equal(reloaded.lastMessagePreview, "📷 รูปภาพ");
      assert.ok(reloaded.lastMessageAt);
    },
  );

  await t.test(
    "an optional caption becomes the body and the preview",
    async () => {
      const conversation = await makeConversation("caption");
      const res = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .field("caption", "สภาพสินค้าตามรูปนี้ครับ")
        .attach("file", PNG_BYTES, {
          filename: "cond.png",
          contentType: "image/png",
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.body, "สภาพสินค้าตามรูปนี้ครับ");
      written.push(res.body.payload.storageKey);

      const reloaded = await prisma.conversation.findUnique({
        where: { id: conversation.id },
      });
      assert.equal(reloaded.lastMessagePreview, "สภาพสินค้าตามรูปนี้ครับ");
    },
  );

  await t.test("the other participant can download it", async () => {
    const conversation = await makeConversation("download");
    const up = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .attach("file", PNG_BYTES, {
        filename: "shared.png",
        contentType: "image/png",
      });
    assert.equal(up.status, 201);
    written.push(up.body.payload.storageKey);

    const down = await request(app)
      .get(`/conversations/${conversation.id}/attachments/${up.body.id}`)
      .set("Authorization", `Bearer ${sellerToken}`);

    assert.equal(down.status, 200);
    assert.match(down.headers["content-type"], /image\/png/);
    assert.ok(Buffer.isBuffer(down.body));
    assert.deepEqual(down.body, PNG_BYTES, "bytes must round-trip intact");
  });

  await t.test("a stranger cannot upload into the conversation", async () => {
    const conversation = await makeConversation("stranger-up");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .attach("file", PNG_BYTES, {
        filename: "nope.png",
        contentType: "image/png",
      });
    assert.equal(res.status, 403);
  });

  await t.test(
    "a rejected upload does not leave the file orphaned on disk",
    async () => {
      const before = fs.readdirSync(STORAGE_DIR).length;
      const conversation = await makeConversation("orphan");
      const res = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "orphan.png",
          contentType: "image/png",
        });
      assert.equal(res.status, 403);

      // multer writes to disk BEFORE the participant check runs, so without
      // the controller's cleanup this count would have grown by one.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(fs.readdirSync(STORAGE_DIR).length, before);
    },
  );

  await t.test(
    "a stranger cannot download someone else's attachment",
    async () => {
      const conversation = await makeConversation("stranger-down");
      const up = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "private.png",
          contentType: "image/png",
        });
      written.push(up.body.payload.storageKey);

      const down = await request(app)
        .get(`/conversations/${conversation.id}/attachments/${up.body.id}`)
        .set("Authorization", `Bearer ${strangerToken}`);
      assert.equal(down.status, 403);
    },
  );

  await t.test(
    "an attachment cannot be read through a DIFFERENT conversation the caller is in",
    async () => {
      // The attacker here is a legitimate participant of their own
      // conversation, trying to use it as a lens onto someone else's
      // attachment id — the messageId must be scoped to the conversation.
      const victim = await makeConversation("victim");
      const up = await request(app)
        .post(`/conversations/${victim.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "victim.png",
          contentType: "image/png",
        });
      written.push(up.body.payload.storageKey);

      const attackerConversation = await prisma.conversation.create({
        data: {
          contextType: "PRODUCT",
          contextId: "p-att-attacker",
          contextKey: `PRODUCT:p-att-attacker:${strangerId}`,
          status: "ACTIVE",
          createdBy: strangerId,
          participants: [
            {
              userId: strangerId,
              role: "BUYER",
              joinedAt: new Date(),
              lastReadAt: null,
              leftAt: null,
            },
          ],
        },
      });

      const down = await request(app)
        .get(
          `/conversations/${attackerConversation.id}/attachments/${up.body.id}`,
        )
        .set("Authorization", `Bearer ${strangerToken}`);
      assert.equal(down.status, 404);
    },
  );

  await t.test("guest gets 401, not 403", async () => {
    const conversation = await makeConversation("guest");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .attach("file", PNG_BYTES, {
        filename: "guest.png",
        contentType: "image/png",
      });
    assert.equal(res.status, 401);
  });

  await t.test("an unsupported file type is rejected with 400", async () => {
    const conversation = await makeConversation("badtype");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .attach("file", Buffer.from("#!/bin/sh\necho hi"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      });
    assert.equal(res.status, 400);
  });

  await t.test(
    "a file over the size limit is rejected, not silently truncated",
    async () => {
      const conversation = await makeConversation("toobig");
      // 11 MB against the 10 MB cap in attachmentStorage.
      const tooBig = Buffer.alloc(11 * 1024 * 1024, 1);
      const res = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", tooBig, {
          filename: "huge.png",
          contentType: "image/png",
        });
      // 413 specifically, not merely "some error": multer throws a
      // MulterError with no `status`, which the shared errorHandler would
      // otherwise turn into a 500 — making a client mistake look like a
      // server fault. An earlier version of this assertion accepted
      // 400/413/500 and so passed while the API really did answer 500.
      assert.equal(res.status, 413);
    },
  );

  await t.test(
    "a LOCKED conversation rejects attachments with 409",
    async () => {
      const conversation = await makeConversation("locked");
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "LOCKED" },
      });
      const res = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "locked.png",
          contentType: "image/png",
        });
      assert.equal(res.status, 409);
    },
  );

  await t.test("uploading with no file at all is a 400", async () => {
    const conversation = await makeConversation("nofile");
    const res = await request(app)
      .post(`/conversations/${conversation.id}/attachments`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .field("caption", "forgot the file");
    assert.equal(res.status, 400);
  });

  await t.test(
    "the attachment message appears in the normal message list",
    async () => {
      const conversation = await makeConversation("inlist");
      const up = await request(app)
        .post(`/conversations/${conversation.id}/attachments`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .attach("file", PNG_BYTES, {
          filename: "listed.png",
          contentType: "image/png",
        });
      written.push(up.body.payload.storageKey);

      const list = await request(app)
        .get(`/conversations/${conversation.id}/messages`)
        .set("Authorization", `Bearer ${sellerToken}`);
      assert.equal(list.status, 200);
      const found = list.body.items.find((m) => m.id === up.body.id);
      assert.ok(found, "attachment must be part of the message history");
      assert.equal(found.type, "IMAGE");
      assert.equal(found.payload.filename, "listed.png");
    },
  );
});

// Runs once after every test in this file, whether they passed, failed or
// skipped — the limiter's Redis connection is opened lazily on the first
// limited request and would otherwise hold the process open.
after(async () => {
  await closeRateLimitClient();
});
