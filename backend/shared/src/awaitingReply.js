const { AppError } = require("./errors");
async function awaitingReplyIds(db, Prisma, base, userId, domain) {
  const rows = await db.$queryRaw(
    Prisma.sql`SELECT id FROM (${base}) eligible WHERE assignee_id = ${userId}`,
  );
  const result = new Set();
  for (let offset = 0; offset < rows.length; offset += 200) {
    const response = await fetch(
      (process.env.CHAT_SERVICE_URL || "http://chat-service:3004") +
        "/internal/awaiting-reply",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "",
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          ids: rows.slice(offset, offset + 200).map((row) => row.id),
          contextTypes:
            domain === "tickets"
              ? ["SUPPORT"]
              : ["DISPUTE_BUYER", "DISPUTE_SELLER"],
        }),
      },
    );
    if (!response.ok) throw new AppError(503, "Reply summary unavailable");
    const payload = await response.json();
    if (
      !Array.isArray(payload.ids) ||
      payload.ids.some((id) => typeof id !== "string")
    )
      throw new AppError(503, "Invalid reply summary");
    const allowed = new Set(
      rows.slice(offset, offset + 200).map((row) => row.id),
    );
    payload.ids.forEach((id) => {
      if (allowed.has(id)) result.add(id);
    });
  }
  return [...result];
}
module.exports = { awaitingReplyIds };
