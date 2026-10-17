// Operational dispute fields are real columns. This boundary only preserves
// historical assignment envelopes and hides old internal snapshot events.
const WORKFLOW_ACTION = "WORKFLOW_STATE";
const STATE_FIELDS = [
  "status",
  "createdAt",
  "assignedRole",
  "decisionReason",
  "decidedBy",
  "decidedAt",
  "verdictKey",
  "escalationNote",
  "escalatedBy",
  "priority",
  "priorityScore",
  "riskReportCount",
  "slaExpiresAt",
  "slaPolicyVersion",
  "firstReviewDueAt",
  "firstReviewedAt",
  "decisionDueAt",
];
function decodeLog(row) {
  if (!row) return row;
  try {
    const envelope = JSON.parse(row.detail);
    if (envelope.kind === "assignment_detail" && envelope.schema_version === 1)
      return {
        ...row,
        detail: envelope.detail,
        fromAssignedRole: envelope.fromAssignedRole,
        toAssignedRole: envelope.toAssignedRole,
      };
  } catch {
    /* Ordinary historical text is not a structured assignment event. */
  }
  return row;
}
function encodeLog(data) {
  const { fromAssignedRole, toAssignedRole, ...core } = data;
  if (fromAssignedRole !== undefined || toAssignedRole !== undefined)
    core.detail = JSON.stringify({
      schema_version: 1,
      kind: "assignment_detail",
      detail: data.detail,
      fromAssignedRole: fromAssignedRole ?? null,
      toAssignedRole: toAssignedRole ?? null,
    });
  return core;
}

function wrapClient(db, inTransaction = false) {
  const logDelegate = new Proxy(db.disputeCaseLog || {}, {
    get(target, key) {
      if (key === "create")
        return async (args) =>
          decodeLog(
            await target.create({ ...args, data: encodeLog(args.data) }),
          );
      if (key === "findMany")
        return async (args = {}) =>
          (
            await target.findMany({
              ...args,
              where: {
                AND: [args.where || {}, { action: { not: WORKFLOW_ACTION } }],
              },
            })
          ).map(decodeLog);
      if (key === "count")
        return (args = {}) =>
          target.count({
            ...args,
            where: {
              AND: [args.where || {}, { action: { not: WORKFLOW_ACTION } }],
            },
          });
      if (key === "findFirst")
        return async (args = {}) =>
          decodeLog(
            await target.findFirst({
              ...args,
              where: {
                AND: [args.where || {}, { action: { not: WORKFLOW_ACTION } }],
              },
            }),
          );
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  async function hydrate(row) {
    if (!row) return row;
    if (Array.isArray(row)) return row.map(hydrateRow);
    return hydrateRow(row);
  }
  function hydrateRow(row) {
    const result = { ...row };
    if (result.caseLog)
      result.caseLog = result.caseLog
        .filter((l) => l.action !== WORKFLOW_ACTION)
        .map(decodeLog);
    for (const key of ["order", "orders", "dispute"]) {
      if (result[key])
        result[key] = Array.isArray(result[key])
          ? result[key].map(hydrateRow)
          : hydrateRow(result[key]);
    }
    return result;
  }
  const exposed = { disputeCaseLog: logDelegate };
  for (const model of ["disputeCase", "order"]) {
    if (!db[model]) continue;
    exposed[model] = new Proxy(db[model], {
      get(target, method) {
        const value = target[method];
        if (typeof value !== "function") return value;
        if (
          [
            "findUnique",
            "findFirst",
            "findMany",
            "findUniqueOrThrow",
            "create",
            "update",
            "upsert",
          ].includes(method)
        )
          return async (...args) => hydrate(await value.apply(target, args));
        return value.bind(target);
      },
    });
  }
  if (!inTransaction)
    exposed.$transaction = (callback, options) =>
      typeof callback === "function"
        ? db.$transaction((tx) => callback(wrapClient(tx, true)), options)
        : db.$transaction(callback, options);
  return new Proxy(exposed, {
    get(target, key) {
      if (key in target) return target[key];
      const value = db[key];
      return typeof value === "function" ? value.bind(db) : value;
    },
  });
}
module.exports = {
  wrapClient,
  STATE_FIELDS,
  WORKFLOW_ACTION,
  encodeLog,
  decodeLog,
};
