const {
  badRequest,
  forbidden,
  notFound,
  conflict,
  AppError,
} = require("@reloop/shared");
const ticketModel = require("./ticketModel");
const { ticketCapabilities } = require("./workspacePolicy");

async function moderateTicket(
  { ticketId, userId, role, version, action, targetId, reason, authorization },
  dependencies = {},
) {
  const model = dependencies.model || ticketModel;
  const send = dependencies.fetch || fetch;
  const ticket = await model.findById(ticketId);
  if (!ticket) throw notFound("ticket not found");
  if (!ticketCapabilities(ticket, userId, role).canModerateUsers) {
    throw forbidden("claim this active ticket before moderating users");
  }
  if (!Number.isInteger(version) || version !== ticket.version)
    throw conflict("ticket changed, reload before moderating users");
  if (!targetId?.trim() || !reason?.trim())
    throw badRequest("targetId and reason are required");
  const commands = {
    warn: ["warn", { reason }],
    ban: ["suspend", { reason }],
    restrictBuyer: ["commerce-restriction", { reason, scope: "BUYER" }],
    restrictSeller: ["commerce-restriction", { reason, scope: "SELLER" }],
  };
  if (!Object.hasOwn(commands, action))
    throw badRequest("invalid moderation action");
  const [path, body] = commands[action];
  const base = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
  const response = await send(
    `${base}/admin/users/${encodeURIComponent(targetId.trim())}/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new AppError(
      response.status,
      typeof result.error === "string"
        ? result.error
        : result.error?.message || "moderation failed",
    );
  return result;
}
module.exports = { moderateTicket };
