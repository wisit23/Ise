const { AppError } = require("@reloop/shared");

const CHAT_SERVICE_URL = () =>
  process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = () => process.env.INTERNAL_SERVICE_TOKEN || "";
const DEFAULT_TIMEOUT_MS = 5000;

async function requestWithTimeout(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${CHAT_SERVICE_URL()}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": INTERNAL_TOKEN(),
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body.error || body.message || "";
      } catch {
        // non-JSON response
      }
      const message = detail
        ? `chat-service ${path} failed (${res.status}): ${detail}`
        : `chat-service ${path} returned ${res.status}`;
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      throw new AppError(status, message);
    }
    return res;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === "AbortError") {
      throw new AppError(504, `chat-service ${path} timed out after ${timeoutMs}ms`);
    }
    throw new AppError(503, `chat-service is unavailable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function internalPost(path, body, timeoutMs) {
  const res = await requestWithTimeout(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  return res.json();
}

async function internalPatch(path, body, timeoutMs) {
  const res = await requestWithTimeout(
    path,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  return res.json();
}

/**
 * Creates or retrieves a SUPPORT conversation deterministically.
 * Only sends the initial greeting if the room was newly created (HTTP 201),
 * preventing duplicate greeting messages when the deterministic room already exists.
 */
async function createSupportConversation(ticketId, ticketNumber, requesterId, timeoutMs) {
  const res = await requestWithTimeout(
    "/internal/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        contextType: "SUPPORT",
        contextId: ticketId,
        createdBy: "system",
        participants: [{ userId: requesterId, role: "BUYER" }],
      }),
    },
    timeoutMs,
  );

  const conversation = await res.json();
  const isNew = res.status === 201;

  if (isNew) {
    try {
      await internalPost(`/internal/conversations/${conversation.id}/messages`, {
        senderId: "system",
        senderRole: "SYSTEM",
        type: "SYSTEM",
        body: `ตั๋วซัพพอร์ต ${ticketNumber} ถูกเปิดแล้ว กรุณารอเจ้าหน้าที่`,
      });
    } catch (err) {
      console.error(
        `[chatClient] createSupportConversation greeting warning: ${err.message}`,
      );
    }
  }

  return conversation;
}

async function getConversationByContext(contextType, contextId, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${CHAT_SERVICE_URL()}/internal/conversations/by-context/${contextType}/${contextId}`,
      {
        signal: controller.signal,
        headers: {
          "x-internal-token": INTERNAL_TOKEN(),
        },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      throw new AppError(status, `chat-service returned ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === "AbortError") {
      throw new AppError(504, `chat-service request timed out`);
    }
    throw new AppError(503, `chat-service is unavailable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function addParticipantToConversation(conversationId, userId, role, timeoutMs) {
  return await internalPost(
    `/internal/conversations/${conversationId}/participants`,
    {
      userId,
      role,
    },
    timeoutMs,
  );
}

async function addAgentToConversation(conversationId, agentUserId, timeoutMs) {
  const conversation = await addParticipantToConversation(
    conversationId,
    agentUserId,
    "AGENT",
    timeoutMs,
  );

  try {
    await internalPost(
      `/internal/conversations/${conversationId}/messages`,
      {
        senderId: "system",
        senderRole: "SYSTEM",
        type: "SYSTEM",
        body: `เจ้าหน้าที่เข้าร่วมการสนทนาแล้ว`,
      },
      timeoutMs,
    );
  } catch (err) {
    console.error(
      `[chatClient] addAgentToConversation announcement warning: ${err.message}`,
    );
  }

  return conversation;
}

async function sendSystemMessage(conversationId, body, payload, timeoutMs) {
  try {
    return await internalPost(
      `/internal/conversations/${conversationId}/messages`,
      {
        senderId: "system",
        senderRole: "SYSTEM",
        type: "SYSTEM",
        body,
        payload,
      },
      timeoutMs,
    );
  } catch (err) {
    console.error(`[chatClient] sendSystemMessage error: ${err.message}`);
    throw err;
  }
}

/**
 * Locks a conversation. Propagates failures so callers never falsely report a locked chat.
 */
async function lockConversation(conversationId, timeoutMs) {
  await internalPatch(
    `/internal/conversations/${conversationId}/status`,
    { status: "LOCKED" },
    timeoutMs,
  );

  try {
    await internalPost(
      `/internal/conversations/${conversationId}/messages`,
      {
        senderId: "system",
        senderRole: "SYSTEM",
        type: "SYSTEM",
        body: `การสนทนานี้ถูกปิดแล้ว`,
      },
      timeoutMs,
    );
  } catch (err) {
    console.error(`[chatClient] lockConversation notification warning: ${err.message}`);
  }
  return true;
}

module.exports = {
  createSupportConversation,
  getConversationByContext,
  addParticipantToConversation,
  addAgentToConversation,
  sendSystemMessage,
  lockConversation,
  DEFAULT_TIMEOUT_MS,
};
