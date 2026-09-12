const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const IORedis = require("ioredis");
const { verifySocketAuth } = require("./socketAuth");
const conversationModel = require("../features/conversations/conversationModel");
const conversationService = require("../features/conversations/conversationService");
const presence = require("../realtime/presence");
const broadcast = require("./broadcast");

// Sending messages themselves still goes through the REST endpoints only
// (messageController.js / internalController.js) — there is deliberately no
// socket "message:send" event. That keeps exactly one code path responsible
// for the write+transaction+broadcast sequence (see broadcast.js's
// comment), instead of a REST path and a socket path that could drift out
// of sync with each other's validation. Sockets here are for JOINING a
// room, RECEIVING what REST already wrote, and ephemeral presence/typing —
// never for writing chat data.
function createSocketServer(httpServer) {
  // Gateway's WebSocket upgrade proxy forwards the ORIGINAL request path
  // unmodified (see backend/gateway/src/server.js's `server.on("upgrade",
  // ...)`), unlike the normal HTTP `/api/chat` proxy which strips that
  // prefix via Express's `app.use` mount stripping. So the path Socket.IO
  // listens on here must be the gateway-facing one, "/api/chat/socket.io",
  // not the library's default "/socket.io" — a client hitting the default
  // path would connect directly to chat-service in dev-without-gateway, but
  // 404 the WS upgrade through the real Docker Compose stack.
  const io = new Server(httpServer, {
    path: "/api/chat/socket.io",
    cors: { origin: "*" },
  });

  const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
  const pubClient = new IORedis(REDIS_URL);
  const subClient = pubClient.duplicate();
  pubClient.on("error", (err) =>
    console.warn("[chat-service] redis pubClient warning:", err.message),
  );
  subClient.on("error", (err) =>
    console.warn("[chat-service] redis subClient warning:", err.message),
  );
  io.adapter(createAdapter(pubClient, subClient));

  // Nothing in production ever calls this (the process just exits), but an
  // open ioredis connection has no natural end on its own — without an
  // explicit close(), any test harness that spins this server up keeps two
  // live Redis connections past the test's own teardown, and `node --test`
  // never exits on its own (found by running this suite once and watching
  // the process hang after every assertion had already passed).
  async function close() {
    io.close();
    await Promise.all([pubClient.quit(), subClient.quit()]);
  }

  async function isUserOnline(targetUserId) {
    if (!targetUserId) return false;
    try {
      const sockets = await io
        .in(broadcast.userRoomName(targetUserId))
        .fetchSockets();
      if (sockets.length > 0) return true;
    } catch {
      // ignore fetchSockets failure, fallback to presence.isOnline
    }
    try {
      return await presence.isOnline(targetUserId);
    } catch {
      return false;
    }
  }

  io.use(verifySocketAuth);

  io.on("connection", async (socket) => {
    const userId = socket.data.userId;
    const joinedConversations = new Set();

    // Joined immediately, before any "join" event — this is the user's own
    // room, and the handshake already proved who they are (socketAuth.js),
    // so there is nothing further to authorize. It carries the lightweight
    // "conversation:activity" nudges that keep the NavBar badge and the
    // inbox list live on pages that have no conversation open at all (see
    // broadcast.js's userRoomName comment).
    socket.join(broadcast.userRoomName(userId));
    presence.setOnline(userId).catch(() => {});

    // Broadcast to conversation rooms and participant user rooms that this user is online
    try {
      const userConvs = await conversationModel.findByParticipant(userId);
      for (const c of userConvs) {
        socket.to(broadcast.roomName(c.id)).emit("presence", {
          userId,
          online: true,
        });
        for (const p of c.participants || []) {
          if (p.userId !== userId) {
            socket.to(broadcast.userRoomName(p.userId)).emit("presence", {
              userId,
              online: true,
            });
          }
        }
      }
    } catch {
      // ignore lookup failures
    }

    // Re-checks participant membership against the database on every join —
    // exactly like conversationService.getForParticipant does for the REST
    // GET — the JWT proves who you are, never which rooms you're allowed
    // into (see plan.md's CHAT-006 Step 1: this must be re-checked at join
    // time, not just trusted from the handshake).
    socket.on("join", async (conversationId, ack) => {
      try {
        const conversation = await conversationModel.findById(conversationId);
        if (
          !conversation ||
          !conversationService.isParticipant(conversation, userId)
        ) {
          if (typeof ack === "function") ack({ error: "forbidden" });
          return;
        }
        socket.join(broadcast.roomName(conversationId));
        joinedConversations.add(conversationId);
        await presence.setOnline(userId);
        socket
          .to(broadcast.roomName(conversationId))
          .emit("presence", { userId, online: true });

        const onlineUsers = {};
        for (const p of conversation.participants || []) {
          if (p.userId !== userId) {
            onlineUsers[p.userId] = await isUserOnline(p.userId);
          }
        }

        if (typeof ack === "function") ack({ ok: true, onlineUsers });
      } catch {
        if (typeof ack === "function") ack({ error: "internal" });
      }
    });

    // Allows client to query online presence of specific users on demand
    socket.on("presence:query", async (payload, ack) => {
      if (typeof ack !== "function") return;
      try {
        const raw = payload?.userIds || payload;
        const ids = Array.isArray(raw) ? raw : [raw].filter(Boolean);
        const result = {};
        for (const id of ids) {
          result[id] = await isUserOnline(id);
        }
        ack({ ok: true, presence: result });
      } catch {
        ack({ error: "internal" });
      }
    });

    // Needed now that the client keeps ONE socket for the whole app session
    // instead of opening a fresh one per chat room: without an explicit
    // leave, a user who opens room A then navigates to room B stays joined
    // to A on the server and keeps receiving its messages in the
    // background. No authorization check — leaving a room you may or may
    // not be in can only ever reduce what you receive.
    socket.on("leave", async (conversationId) => {
      if (!joinedConversations.has(conversationId)) return;
      socket.leave(broadcast.roomName(conversationId));
      joinedConversations.delete(conversationId);
      await presence.clearTyping(conversationId, userId).catch(() => {});
    });

    socket.on("typing:start", async (conversationId) => {
      if (!joinedConversations.has(conversationId)) return;
      await presence.setTyping(conversationId, userId);
      socket
        .to(broadcast.roomName(conversationId))
        .emit("typing", { userId, typing: true });
    });

    socket.on("typing:stop", async (conversationId) => {
      if (!joinedConversations.has(conversationId)) return;
      await presence.clearTyping(conversationId, userId);
      socket
        .to(broadcast.roomName(conversationId))
        .emit("typing", { userId, typing: false });
    });

    socket.on("disconnect", async () => {
      let isStillOnline = false;
      try {
        const remaining = await io
          .in(broadcast.userRoomName(userId))
          .fetchSockets();
        isStillOnline = remaining.some((s) => s.id !== socket.id);
      } catch {
        isStillOnline = false;
      }
      if (!isStillOnline) {
        await presence.clearOnline(userId).catch(() => {});
        try {
          const userConvs = await conversationModel.findByParticipant(userId);
          for (const c of userConvs) {
            io.to(broadcast.roomName(c.id)).emit("presence", {
              userId,
              online: false,
            });
            for (const p of c.participants || []) {
              if (p.userId !== userId) {
                io.to(broadcast.userRoomName(p.userId)).emit("presence", {
                  userId,
                  online: false,
                });
              }
            }
          }
        } catch {
          for (const conversationId of joinedConversations) {
            socket
              .to(broadcast.roomName(conversationId))
              .emit("presence", { userId, online: false });
          }
        }
      }
    });
  });

  broadcast.setIo(io);
  return { io, close };
}

module.exports = { createSocketServer };
