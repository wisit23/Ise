const test = require("node:test");
const assert = require("node:assert/strict");
const chatClient = require("./chatClient");

test("createSupportConversation sends greeting on 201 (new room)", async () => {
  const origFetch = global.fetch;
  const postedMessages = [];

  global.fetch = (url, options) => {
    if (url.includes("/internal/conversations/") && url.includes("/messages")) {
      postedMessages.push(JSON.parse(options.body));
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "msg-welcome-1" }),
      });
    }

    if (url.includes("/internal/conversations")) {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({ id: "conv-new-1", contextType: "SUPPORT" }),
      });
    }

    return Promise.reject(new Error(`Unexpected url: ${url}`));
  };

  try {
    const conv = await chatClient.createSupportConversation(
      "t-1",
      "#CS-000001",
      "u-1",
    );
    assert.equal(conv.id, "conv-new-1");
    assert.equal(postedMessages.length, 1);
    assert.ok(postedMessages[0].body.includes("#CS-000001"));
  } finally {
    global.fetch = origFetch;
  }
});

test("createSupportConversation does NOT send greeting on 200 (existing deterministic room)", async () => {
  const origFetch = global.fetch;
  const postedMessages = [];

  global.fetch = (url, options) => {
    if (url.includes("/internal/conversations/") && url.includes("/messages")) {
      postedMessages.push(JSON.parse(options.body));
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "msg-welcome-2" }),
      });
    }

    if (url.includes("/internal/conversations")) {
      // Return 200: existing deterministic room
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ id: "conv-existing-1", contextType: "SUPPORT" }),
      });
    }

    return Promise.reject(new Error(`Unexpected url: ${url}`));
  };

  try {
    const conv = await chatClient.createSupportConversation(
      "t-1",
      "#CS-000001",
      "u-1",
    );
    assert.equal(conv.id, "conv-existing-1");
    // Crucial: Greeting must NOT be sent again when room already exists!
    assert.equal(postedMessages.length, 0);
  } finally {
    global.fetch = origFetch;
  }
});

test("lockConversation propagates error and throws on lock failure", async () => {
  const origFetch = global.fetch;

  global.fetch = (url) => {
    if (url.includes("/status")) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({ error: "Failed to update status in MongoDB" }),
      });
    }
    return Promise.reject(new Error(`Unexpected url: ${url}`));
  };

  try {
    await assert.rejects(
      () => chatClient.lockConversation("conv-fail-1"),
      (err) => {
        assert.equal(err.status, 500);
        assert.ok(err.message.includes("Failed to update status in MongoDB"));
        return true;
      },
    );
  } finally {
    global.fetch = origFetch;
  }
});

test("requestWithTimeout extracts actionable error and retains HTTP status", async () => {
  const origFetch = global.fetch;

  global.fetch = () => {
    return Promise.resolve({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({ message: "Conversation is already locked" }),
    });
  };

  try {
    await assert.rejects(
      () => chatClient.addParticipantToConversation("c-1", "u-1", "AGENT"),
      (err) => {
        assert.equal(err.status, 409);
        assert.ok(err.message.includes("Conversation is already locked"));
        return true;
      },
    );
  } finally {
    global.fetch = origFetch;
  }
});
