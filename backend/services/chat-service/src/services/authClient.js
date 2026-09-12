// Thin service-to-service client toward auth-service's Internal API. Chat
// stores userIds only; this is what turns them into something a human can
// read in the room header and the inbox list.
//
// Why the server does this instead of the browser: if the frontend could ask
// "what is user X's name?", a single logged-in account could walk every id in
// the system and rebuild the user directory. Here the ids are never chosen by
// the client — they come from a conversation the caller has already been
// authorized for, so nothing outside that room is ever resolvable.
const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

// auth-service caps a single call at 100 ids; the inbox never approaches that
// (one conversation = 2 participants), but chunking keeps a future group-chat
// or a long inbox from turning into a 400.
const CHUNK_SIZE = 100;

async function fetchChunk(userIds) {
  const res = await fetch(`${AUTH_SERVICE_URL}/internal/users/display-names`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) throw new Error(`auth-service returned ${res.status}`);
  return res.json();
}

/**
 * Best-effort by design: a name lookup failing must never stop a user from
 * reading their own messages, so an auth-service outage degrades the UI to
 * bare ids rather than failing the whole request. Returns a Map(userId ->
 * displayName); ids with no name (deleted account, failed lookup) are simply
 * absent from it.
 */
async function getDisplayNames(userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  const names = new Map();
  if (unique.length === 0) return names;

  const chunks = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE));
  }

  try {
    const results = await Promise.all(chunks.map(fetchChunk));
    for (const entry of results.flat()) {
      if (entry?.userId && entry.displayName) {
        names.set(entry.userId, entry.displayName);
      }
    }
  } catch (err) {
    console.error("[chat-service] display-name lookup failed:", err.message);
  }

  return names;
}

module.exports = { getDisplayNames };
