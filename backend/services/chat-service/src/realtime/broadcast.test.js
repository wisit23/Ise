const test = require("node:test");
const assert = require("node:assert/strict");
const broadcast = require("./broadcast");

test("case messages and status reach current participants only", async (t) => {
  const originalFetch = global.fetch;
  const events = [];
  t.after(() => {
    global.fetch = originalFetch;
    broadcast.setIo(null);
  });
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({
      allowed: !url.includes("old-agent"),
      writable: !url.includes("old-agent"),
    }),
  });
  broadcast.setIo({
    to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }),
  });
  const conversation = {
    id: "room-1",
    contextType: "DISPUTE",
    contextId: "case-1",
    participants: [
      { userId: "buyer-1", role: "BUYER" },
      { userId: "old-agent", role: "AGENT" },
    ],
  };
  broadcast.broadcastMessage(conversation, { id: "message-1", visibility: "PUBLIC" });
  await broadcast.broadcastCaseTyping(conversation, "agent-now", true);
  broadcast.broadcastStatusChange(conversation, "LOCKED");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(new Set(events.map((entry) => entry.room)), new Set(["user:buyer-1"]));
  assert.equal(events.filter((entry) => entry.event === "message:new").length, 1);
  assert.equal(events.filter((entry) => entry.event === "conversation:status").length, 1);
  assert.deepEqual(events.find(entry => entry.event === "typing"), {
    room: "user:buyer-1", event: "typing",
    payload: { conversationId: "room-1", userId: "agent-now", typing: true },
  });
  const before = events.length;
  await broadcast.broadcastCaseTyping(conversation, "buyer-1", false);
  assert.equal(events.length, before); // sender excluded, stale agent denied
});

test("broadcastRealtime emits to targeted rooms and globally", () => {
  const events = [];
  broadcast.setIo({
    to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }),
    emit: (event, payload) => events.push({ room: "GLOBAL", event, payload }),
    of: (namespace) => ({ emit: (event, payload) => events.push({ room: namespace, event, payload }) }),
  });

  broadcast.broadcastRealtime({
    event: "product:updated",
    data: { id: "p-1", title: "Shirt" },
    rooms: ["user:seller-1"],
    broadcastGlobal: true,
  });

  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    room: "GLOBAL",
    event: "product:updated",
    payload: { id: "p-1", title: "Shirt" },
  });
  assert.deepEqual(events[1], {
    room: "/catalog", event: "catalog:changed", payload: undefined,
  });
  assert.deepEqual(events[2], {
    room: "user:seller-1",
    event: "product:updated",
    payload: { id: "p-1", title: "Shirt" },
  });
});

test("public catalog receives only invalidations for global product changes", (t) => {
  const events = [];
  t.after(() => broadcast.setIo(null));
  broadcast.setIo({
    emit() {},
    to: () => ({ emit() {} }),
    of: (namespace) => ({ emit: (...args) => events.push({ namespace, args }) }),
  });
  for (const event of ["product:created", "product:updated", "product:deleted"]) {
    broadcast.broadcastRealtime({ event, data: { privateData: "seller data" }, broadcastGlobal: true });
  }
  broadcast.broadcastRealtime({ event: "notification:new", data: { privateData: "message" }, broadcastGlobal: true });
  broadcast.broadcastRealtime({ event: "product:updated", rooms: ["user:seller-1"] });
  assert.deepEqual(events, Array.from({ length: 3 }, () => ({ namespace: "/catalog", args: ["catalog:changed"] })));
});

test("guest sockets receive product invalidations while the chat namespace stays protected", async (t) => {
  const http = require("node:http");
  const { Server } = require("socket.io");
  const { io: connect } = require("socket.io-client");
  const server = http.createServer();
  const io = new Server(server, { path: "/api/chat/socket.io" });
  io.of("/catalog");
  io.use((_socket, next) => next(new Error("Unauthorized")));
  broadcast.setIo(io);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const options = { path: "/api/chat/socket.io", transports: ["websocket"], forceNew: true, reconnection: false };
  const guest = connect(`${url}/catalog`, options);
  const chat = connect(url, options);
  t.after(() => {
    guest.close();
    chat.close();
    io.close();
    broadcast.setIo(null);
  });
  const once = (socket, event) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 3000);
    if (event === "connect") socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
    socket.once(event, (...args) => { clearTimeout(timer); resolve(args); });
  });
  const [, [error]] = await Promise.all([once(guest, "connect"), once(chat, "connect_error")]);
  assert.equal(error.message, "Unauthorized");
  for (const event of ["product:created", "product:updated", "product:deleted"]) {
    const received = once(guest, "catalog:changed");
    broadcast.broadcastRealtime({ event, data: { product: { id: "p1", privateData: "never sent to guests" } }, broadcastGlobal: true });
    assert.deepEqual(await received, []);
  }
});

test("read receipts reach the conversation room, and only current case participants", async (t) => {
  const originalFetch = global.fetch;
  const events = [];
  t.after(() => {
    global.fetch = originalFetch;
    broadcast.setIo(null);
  });
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({ allowed: !url.includes("old-agent"), writable: true }),
  });
  broadcast.setIo({
    to: (room) => ({ emit: (event, payload) => events.push({ room, event, payload }) }),
  });
  const readAt = new Date("2026-10-28T04:40:00.000Z");

  broadcast.broadcastRead(
    { id: "dm-1", contextType: "PRODUCT", participants: [] },
    "seller-1",
    readAt,
  );
  assert.deepEqual(events, [{
    room: "conversation:dm-1",
    event: "conversation:read",
    payload: { conversationId: "dm-1", userId: "seller-1", lastReadAt: readAt },
  }]);

  events.length = 0;
  broadcast.broadcastRead({
    id: "case-room",
    contextType: "SUPPORT",
    contextId: "case-1",
    participants: [
      { userId: "buyer-1", role: "BUYER" },
      { userId: "agent-now", role: "AGENT" },
      { userId: "old-agent", role: "AGENT" },
      { userId: "gone", role: "AGENT", leftAt: new Date() },
    ],
  }, "agent-now", readAt);
  await new Promise((resolve) => setImmediate(resolve));
  // The reader is skipped, a former agent is denied, a departed one ignored.
  assert.deepEqual(events.map((e) => e.room), ["user:buyer-1"]);
  assert.equal(events[0].event, "conversation:read");
});
