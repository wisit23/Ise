// The bridge between "a message was written to MongoDB" (messageController,
// internalController) and "connected sockets hear about it" (socketServer).
// Kept as its own tiny module rather than importing socketServer directly
// into the REST controllers, so `app.js` (used by every supertest-based
// integration test, which never starts a real HTTP/socket server) never has
// to know sockets exist at all: setIo() is only ever called from server.js,
// so in every test process ioInstance stays null and broadcast* calls below
// are silent no-ops — exactly the CHAT-001-style requirement that requiring
// a module never opens a connection by itself.
let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

/** Room every socket viewing one conversation joins (see socketServer's
 * "join" handler, which authorizes membership before joining). */
function roomName(conversationId) {
  return `conversation:${conversationId}`;
}

/**
 * Every authenticated socket joins its OWN room automatically on connect,
 * with no authorization step needed beyond the handshake — a user is
 * always allowed to hear about their own account. This is what lets
 * surfaces that aren't inside any particular conversation (the NavBar
 * unread badge, the /chat inbox list) receive live updates without having
 * to join a room per conversation the user happens to be part of, which
 * would scale with their conversation count instead of staying at one.
 */
function userRoomName(userId) {
  return `user:${userId}`;
}

/**
 * Emitted only AFTER the caller has already persisted the message to
 * MongoDB (see messageModel.createAndTouch) — Redis (which is what
 * ultimately fans this out across chat-service instances, via the
 * @socket.io/redis-adapter wired in socketServer.js) is a delivery
 * mechanism only, never the source of truth. See plan.md's Global
 * Constraints for why this ordering is non-negotiable.
 *
 * Two different audiences, deliberately two different events:
 *  - "message:new" carries the full message to whoever has that
 *    conversation open, because they render it directly.
 *  - "conversation:activity" is a lightweight nudge to every participant's
 *    own room. It deliberately does NOT carry an unread count: computing a
 *    per-user total here would race against that user's own concurrent
 *    mark-read calls, so the client is told only "something happened in
 *    conversation X" and re-reads the authoritative number itself.
 */
function broadcastMessage(conversation, message) {
  if (!ioInstance) return;
  ioInstance.to(roomName(conversation.id)).emit("message:new", message);

  const activity = {
    conversationId: conversation.id,
    messageId: message.id,
    senderId: message.senderId,
    createdAt: message.createdAt,
  };
  for (const participant of conversation.participants || []) {
    if (participant.leftAt) continue;
    ioInstance
      .to(userRoomName(participant.userId))
      .emit("conversation:activity", activity);
  }
}

module.exports = { setIo, roomName, userRoomName, broadcastMessage };
