const { AppError } = require("./errors");

async function displayNames(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const response = await fetch(
    `${process.env.AUTH_SERVICE_URL || "http://auth-service:3001"}/internal/users/display-names`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "",
      },
      body: JSON.stringify({ userIds: ids }),
      signal: AbortSignal.timeout(2000),
    },
  );
  if (!response.ok) throw new AppError(502, "Name lookup unavailable");
  return response.json();
}

// Enrichment is deliberately best-effort; names must never block case access.
async function enrichStaffRows(items, fields) {
  if (!process.env.AUTH_SERVICE_URL) return items;
  try {
    const ids = [
      ...new Set(
        items
          .flatMap((row) => fields.map((field) => row[field]))
          .filter(Boolean),
      ),
    ];
    const results = [];
    for (let i = 0; i < ids.length; i += 50)
      results.push(...(await displayNames(ids.slice(i, i + 50))));
    const names = Object.fromEntries(
      results.map((item) => [item.userId, item.displayName]),
    );
    return items.map((row) => ({
      ...row,
      ...Object.fromEntries(
        fields.map((field) => [
          field.replace(/Id$/, "") + "Name",
          names[row[field]] || null,
        ]),
      ),
    }));
  } catch {
    return items;
  }
}
module.exports = { enrichStaffRows };
