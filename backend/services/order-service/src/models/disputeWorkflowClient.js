const { Prisma } = require("../generated/prisma-client");

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
const STATE_KEYS = new Set(STATE_FIELDS);
const WORKFLOW_ACTION = "WORKFLOW_STATE";

function initialState(data) {
  return {
    status: "OPEN",
    createdAt: new Date(),
    assignedRole: null,
    decisionReason: null,
    decidedBy: null,
    decidedAt: null,
    verdictKey: null,
    escalationNote: null,
    escalatedBy: null,
    priority: "NORMAL",
    priorityScore: 0,
    riskReportCount: 0,
    slaExpiresAt: null,
    slaPolicyVersion: null,
    firstReviewDueAt: null,
    firstReviewedAt: null,
    decisionDueAt: null,
    ...Object.fromEntries(
      STATE_FIELDS.filter((key) => data[key] !== undefined).map((key) => [
        key,
        data[key],
      ]),
    ),
  };
}
function validateState(state) {
  const dates = new Set([
    "createdAt",
    "decidedAt",
    "slaExpiresAt",
    "firstReviewDueAt",
    "firstReviewedAt",
    "decisionDueAt",
  ]);
  const integers = new Set(["priorityScore", "riskReportCount"]);
  const required = new Set(["status", "createdAt", "priority", ...integers]);
  for (const key of STATE_FIELDS) {
    const value = state[key];
    let valid = value === null && !required.has(key);
    if (value !== null && value !== undefined) {
      valid = dates.has(key)
        ? (value instanceof Date || typeof value === "string") &&
          !Number.isNaN(new Date(value).getTime())
        : integers.has(key)
          ? Number.isInteger(value) &&
            value >= -2147483648 &&
            value <= 2147483647
          : typeof value === "string";
    }
    if (!valid)
      throw new Prisma.PrismaClientValidationError(
        `Invalid dispute workflow field: ${key}`,
        { clientVersion: Prisma.prismaVersion.client },
      );
  }
}
function splitData(data) {
  const core = {},
    state = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) (STATE_KEYS.has(key) ? state : core)[key] = value;
  }
  return { core, state };
}
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

// This compatibility boundary keeps existing repository/transaction callers
// while changing physical storage. The SQL view performs filtering, sorting,
// counts and pagination in the database, not on an already paginated JS page.
function wrapClient(db, inTransaction = false) {
  const write = (fn) =>
    inTransaction ? fn(db) : db.$transaction((tx) => fn(tx));

  async function hydrate(row) {
    if (!row) return row;
    if (Array.isArray(row)) return Promise.all(row.map(hydrate));
    const result = { ...row };
    if (row.dispute && row.dispute.id) {
      const state = await db.disputeWorkflow.findUnique({
        where: { id: row.dispute.id },
      });
      result.dispute = await hydrate({ ...row.dispute, ...state });
    }
    if (row.caseLog)
      result.caseLog = row.caseLog
        .filter((log) => log.action !== WORKFLOW_ACTION)
        .map(decodeLog);
    if (row.order) result.order = await hydrate(row.order);
    if (row.orders) result.orders = await hydrate(row.orders);
    return result;
  }
  async function readOne(args, first = false) {
    const state = await db.disputeWorkflow[first ? "findFirst" : "findUnique"]({
      where: args.where,
      ...(args.orderBy ? { orderBy: args.orderBy } : {}),
    });
    if (!state) return null;
    const row = await db.disputeCase.findUnique({
      where: { id: state.id },
      ...(args.include ? { include: args.include } : {}),
    });
    const merged = await hydrate({ ...row, ...state });
    if (!args.select) return merged;
    const selected = {};
    for (const [key, selection] of Object.entries(args.select)) {
      if (!selection) continue;
      if (key in merged) selected[key] = merged[key];
      else {
        const relation = await db.disputeCase.findUnique({
          where: { id: state.id },
          select: { [key]: selection },
        });
        selected[key] = (await hydrate(relation))[key];
      }
    }
    return selected;
  }
  async function saveState(tx, row, state) {
    validateState(state);
    // Preserve verdict-key uniqueness across concurrent transactions without
    // adding a storage column/table. Lock before checking the derived state.
    if (state.verdictKey) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${state.verdictKey}, 0))::text`;
      const existing = await tx.disputeWorkflow.findUnique({
        where: { verdictKey: state.verdictKey },
      });
      if (existing && existing.id !== row.id)
        throw new Prisma.PrismaClientKnownRequestError(
          "Verdict key already used",
          {
            code: "P2002",
            clientVersion: Prisma.prismaVersion.client,
            meta: { target: ["verdict_key"] },
          },
        );
    }
    await tx.disputeCaseLog.create({
      data: {
        disputeCaseId: row.id,
        actorId: state.decidedBy || row.createdBy,
        action: WORKFLOW_ACTION,
        detail: JSON.stringify({
          schema_version: 1,
          case_version: row.version,
          state,
        }),
      },
    });
  }
  const cases = {
    findUnique: (args) => readOne(args),
    findFirst: (args = {}) => readOne(args, true),
    async findUniqueOrThrow(args) {
      const row = await readOne(args);
      if (!row)
        throw new Prisma.PrismaClientKnownRequestError("Dispute not found", {
          code: "P2025",
          clientVersion: Prisma.prismaVersion.client,
        });
      return row;
    },
    async findMany(args = {}) {
      const { include, select, ...query } = args;
      const states = await db.disputeWorkflow.findMany(query);
      if (!states.length) return [];
      const relations = Object.fromEntries(
        Object.entries(select || {}).filter(
          ([key, value]) => value && !(key in states[0]),
        ),
      );
      const related =
        include || (Object.keys(relations).length ? relations : null);
      const rows = await db.disputeCase.findMany({
        where: { id: { in: states.map((s) => s.id) } },
        ...(related ? { include: related } : {}),
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const merged = await Promise.all(
        states.map((state) => hydrate({ ...byId.get(state.id), ...state })),
      );
      if (!select) return merged;
      return merged.map((row) =>
        Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key])
            .map((key) => [key, row[key]]),
        ),
      );
    },
    delete(args) {
      return write(async (tx) => {
        const wrapped = wrapClient(tx, true);
        const row = await wrapped.disputeCase.findUnique(args);
        if (!row)
          throw new Prisma.PrismaClientKnownRequestError("Dispute not found", {
            code: "P2025",
            clientVersion: Prisma.prismaVersion.client,
          });
        await wrapped.disputeCase.deleteMany({ where: args.where });
        return row;
      });
    },
    deleteMany(args = {}) {
      return write(async (tx) => {
        const hasStateFilter = JSON.stringify(args.where || {}).match(
          new RegExp(`"(${STATE_FIELDS.join("|")})"\\s*:`),
        );
        const rows = await (
          hasStateFilter ? tx.disputeWorkflow : tx.disputeCase
        ).findMany({ where: args.where, select: { id: true } });
        const ids = rows.map((row) => row.id);
        await tx.disputeCaseLog.deleteMany({
          where: { disputeCaseId: { in: ids }, action: WORKFLOW_ACTION },
        });
        // Actual audit history still enforces its FK: a failed delete rolls the
        // transaction back, including removal of derived-state snapshots.
        return tx.disputeCase.deleteMany({ where: { id: { in: ids } } });
      });
    },
    count: (args) => db.disputeWorkflow.count(args),
    groupBy: (args) => db.disputeWorkflow.groupBy(args),
    aggregate: (args) => db.disputeWorkflow.aggregate(args),
    create(args) {
      return write(async (tx) => {
        const { core } = splitData(args.data);
        const row = await tx.disputeCase.create({ data: core });
        await saveState(tx, row, initialState(args.data));
        return wrapClient(tx, true).disputeCase.findUnique({
          where: { id: row.id },
          include: args.include,
          select: args.select,
        });
      });
    },
    updateMany(args) {
      return write(async (tx) => {
        const before = await tx.disputeWorkflow.findMany({ where: args.where });
        const { core, state: patch } = splitData(args.data);
        let count = 0;
        for (const current of before) {
          const changed = await tx.disputeCase.updateMany({
            where: { id: current.id, version: current.version },
            data: { ...core, version: core.version ?? { increment: 1 } },
          });
          if (changed.count !== 1) continue;
          const row = await tx.disputeCase.findUnique({
            where: { id: current.id },
          });
          const state = Object.fromEntries(
            STATE_FIELDS.map((key) => [key, current[key]]),
          );
          for (const [key, value] of Object.entries(patch)) {
            if (
              value &&
              typeof value === "object" &&
              !(value instanceof Date)
            ) {
              if ("set" in value) state[key] = value.set;
              else if ("increment" in value) state[key] += value.increment;
              else if ("decrement" in value) state[key] -= value.decrement;
              else state[key] = value;
            } else state[key] = value;
          }
          await saveState(tx, row, state);
          count++;
        }
        return { count };
      });
    },
    update(args) {
      return write(async (tx) => {
        const wrapped = wrapClient(tx, true);
        const before = await wrapped.disputeCase.findUnique({
          where: args.where,
        });
        if (!before)
          throw new Prisma.PrismaClientKnownRequestError("Dispute not found", {
            code: "P2025",
            clientVersion: Prisma.prismaVersion.client,
          });
        const changed = await wrapped.disputeCase.updateMany({
          where: { id: before.id, version: before.version },
          data: args.data,
        });
        if (changed.count !== 1)
          throw new Error("Dispute changed concurrently");
        return wrapped.disputeCase.findUnique({
          where: { id: before.id },
          include: args.include,
          select: args.select,
        });
      });
    },
    upsert(args) {
      return write(async (tx) => {
        const wrapped = wrapClient(tx, true);
        const existing = await wrapped.disputeCase.findUnique({
          where: args.where,
        });
        return existing
          ? wrapped.disputeCase.update({
              where: { id: existing.id },
              data: args.update,
              include: args.include,
              select: args.select,
            })
          : wrapped.disputeCase.create({
              data: args.create,
              include: args.include,
              select: args.select,
            });
      });
    },
    createMany(args) {
      return write(async (tx) => {
        let count = 0;
        for (const data of Array.isArray(args.data) ? args.data : [args.data]) {
          if (args.skipDuplicates && (data.id || data.orderId)) {
            const exists = await tx.disputeCase.findFirst({
              where: {
                OR: [
                  ...(data.id ? [{ id: data.id }] : []),
                  ...(data.orderId ? [{ orderId: data.orderId }] : []),
                ],
              },
            });
            if (exists) continue;
          }
          await wrapClient(tx, true).disputeCase.create({ data });
          count++;
        }
        return { count };
      });
    },
  };
  const caseDelegate = new Proxy(cases, {
    get(target, method) {
      if (method in target) return target[method];
      const value = db.disputeCase[method];
      return typeof value === "function" ? value.bind(db.disputeCase) : value;
    },
  });
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
  // Stable delegates retain the normal client dependency-injection contract.
  const exposed = { disputeCase: caseDelegate, disputeCaseLog: logDelegate };
  if (!inTransaction)
    exposed.$transaction = (callback, options) => {
      if (typeof callback !== "function")
        throw new Error(
          "Use an interactive transaction for log-backed dispute state",
        );
      return db.$transaction((tx) => callback(wrapClient(tx, true)), options);
    };
  // Order reads contain a nested dispute even outside its dedicated repository.
  if (db.order)
    exposed.order = new Proxy(db.order, {
      get(delegate, method) {
        const value = delegate[method];
        if (typeof value !== "function") return value;
        if (
          ["findUnique", "findFirst", "findMany", "create", "update"].includes(
            method,
          )
        )
          return async (...args) => hydrate(await value.apply(delegate, args));
        return value.bind(delegate);
      },
    });
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
