// Ephemeral state — online status and typing indicators — deliberately kept
// out of MongoDB entirely and in Redis instead, with a TTL so it disappears
// on its own. Neither of these is data anyone needs to survive a restart or
// query historically; they're only meaningful for as long as a connection
// is actually live, which is exactly what a TTL key models for free.
//
// Built lazily on first real use, not at require time — requiring this
// module must never open a Redis connection by itself (same reasoning as
// product-service's auctionCloseQueue.js), so unit tests that don't touch
// presence at all never need a Redis instance to be running.
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const ONLINE_TTL_SECONDS = 30;
const TYPING_TTL_SECONDS = 5;

let client = null;
function getClient() {
  if (!client) client = new IORedis(REDIS_URL);
  return client;
}

function onlineKey(userId) {
  return `presence:online:${userId}`;
}

function typingKey(conversationId, userId) {
  return `presence:typing:${conversationId}:${userId}`;
}

async function setOnline(userId) {
  await getClient().set(onlineKey(userId), "1", "EX", ONLINE_TTL_SECONDS);
}

async function clearOnline(userId) {
  await getClient().del(onlineKey(userId));
}

async function isOnline(userId) {
  if (!userId) return false;
  const value = await getClient().get(onlineKey(userId));
  return value !== null;
}

async function setTyping(conversationId, userId) {
  await getClient().set(
    typingKey(conversationId, userId),
    "1",
    "EX",
    TYPING_TTL_SECONDS,
  );
}

async function clearTyping(conversationId, userId) {
  await getClient().del(typingKey(conversationId, userId));
}

/** Closes the lazily-created shared client — only meaningful for a test
 * harness that needs the process to actually exit; production code never
 * calls this (the process just runs until it's killed). No-op if the
 * client was never opened. */
async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = {
  setOnline,
  clearOnline,
  isOnline,
  setTyping,
  clearTyping,
  onlineKey,
  typingKey,
  disconnect,
};
