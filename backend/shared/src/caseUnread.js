const { AppError } = require("./errors");

async function readCaseUnread(rows, userId, domain) {
  const counts = new Map();
  for (let offset = 0; offset < rows.length; offset += 200) {
    const ids = [
      ...new Set(rows.slice(offset, offset + 200).map((row) => row.id)),
    ];
    const response = await fetch(
      (process.env.CHAT_SERVICE_URL || "http://chat-service:3004") +
        "/internal/case-unread",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "",
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          ids,
          userId,
          contextTypes:
            domain === "tickets"
              ? ["SUPPORT"]
              : ["DISPUTE_BUYER", "DISPUTE_SELLER"],
        }),
      },
    );
    if (!response.ok) throw new AppError(503, "Unread summary unavailable");
    const payload = await response.json();
    if (
      !Array.isArray(payload.items) ||
      payload.items.some(
        (row) =>
          !ids.includes(row.id) ||
          !Number.isSafeInteger(row.count) ||
          row.count < 0,
      )
    )
      throw new AppError(503, "Invalid unread summary");
    payload.items.forEach((row) => counts.set(row.id, row.count));
  }
  const scopes = { mine: 0, unassigned: 0, all: 0 };
  const items = rows.map((row) => {
    const count = counts.get(row.id) || 0;
    scopes.all += count;
    if (row.assigneeId === userId || row.chatResponderId === userId)
      scopes.mine += count;
    if (!row.assigneeId) scopes.unassigned += count;
    return { id: row.id, count };
  });
  return { items, scopes };
}

module.exports = { readCaseUnread };
