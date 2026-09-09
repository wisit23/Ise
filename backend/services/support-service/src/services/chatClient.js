const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

async function internalPost(path, body) {
  const res = await fetch(`${CHAT_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-token": INTERNAL_TOKEN },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat-service ${path} returned ${res.status}`);
  return res.json();
}

async function internalPatch(path, body) {
  const res = await fetch(`${CHAT_SERVICE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-internal-token": INTERNAL_TOKEN },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat-service ${path} returned ${res.status}`);
  return res.json();
}

async function createSupportConversation(ticketId, ticketNumber, requesterId) {
  try {
    const conversation = await internalPost("/internal/conversations", {
      contextType: "SUPPORT",
      contextId: ticketId,
      createdBy: "system",
      participants: [{ userId: requesterId, role: "BUYER" }],
    });
    
    await internalPost(`/internal/conversations/${conversation.id}/messages`, {
      senderId: "system",
      senderRole: "SYSTEM",
      type: "SYSTEM",
      body: `ตั๋วซัพพอร์ต ${ticketNumber} ถูกเปิดแล้ว กรุณารอเจ้าหน้าที่`
    });

    return conversation;
  } catch (err) {
    console.error(`[chatClient] createSupportConversation error: ${err.message}`);
    return null;
  }
}

async function addAgentToConversation(conversationId, agentUserId) {
  try {
    await internalPost(`/internal/conversations/${conversationId}/participants`, {
      userId: agentUserId,
      role: "AGENT",
    });

    await internalPost(`/internal/conversations/${conversationId}/messages`, {
      senderId: "system",
      senderRole: "SYSTEM",
      type: "SYSTEM",
      body: `เจ้าหน้าที่เข้าร่วมการสนทนาแล้ว`
    });
  } catch (err) {
    console.error(`[chatClient] addAgentToConversation error: ${err.message}`);
  }
}

async function sendSystemMessage(conversationId, body, payload) {
  try {
    await internalPost(`/internal/conversations/${conversationId}/messages`, {
      senderId: "system",
      senderRole: "SYSTEM",
      type: "SYSTEM",
      body,
      payload,
    });
  } catch (err) {
    console.error(`[chatClient] sendSystemMessage error: ${err.message}`);
  }
}

async function lockConversation(conversationId) {
  try {
    await internalPatch(`/internal/conversations/${conversationId}/status`, {
      status: "LOCKED"
    });

    await internalPost(`/internal/conversations/${conversationId}/messages`, {
      senderId: "system",
      senderRole: "SYSTEM",
      type: "SYSTEM",
      body: `การสนทนานี้ถูกปิดแล้ว`
    });
  } catch (err) {
    console.error(`[chatClient] lockConversation error: ${err.message}`);
  }
}

module.exports = {
  createSupportConversation,
  addAgentToConversation,
  sendSystemMessage,
  lockConversation,
};
