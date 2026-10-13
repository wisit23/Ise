const { randomUUID } = require("node:crypto");
const { Prisma } = require("../generated/prisma-client");
const { calculateOrderTotals } = require("./money");
const { STATE_FIELDS: DISPUTE_FIELDS } = require("./disputeWorkflowClient");
const ORDER_FIELDS = ["productTitle", "campaignCode", "preDisputeStatus"];
const VIRTUAL = {
  order: ORDER_FIELDS,
  checkout: ["addressSnapshot", "originalAmount", "ordersAmount"],
  shipping: ["addressSnapshot"],
};
const RELATIONS = {
  order: {
    checkout: "checkout",
    shipping: "shipping",
    payments: "payment",
    basket: "basket",
    dispute: "disputeCase",
    logs: "orderLog",
  },
  checkout: { orders: "order" },
  shipping: { order: "order" },
  payment: { order: "order", holds: "hold" },
  hold: { payment: "payment" },
  basket: { order: "order" },
  disputeCase: { order: "order" },
  orderLog: { order: "order" },
};
const ACTION = {
  order: "ORDER_HISTORY_STATE",
  checkout: "CHECKOUT_ADDRESS_STATE",
  shipping: "SHIPPING_ADDRESS_STATE",
};
function missing() {
  return new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: Prisma.prismaVersion.client,
  });
}
function fieldsFor(model) {
  return VIRTUAL[model] || [];
}
function readFieldsFor(model) {
  return model === "disputeCase" ? DISPUTE_FIELDS : fieldsFor(model);
}

// Selection rewriting is bounded to the named relations/delegates below.
// It does not pretend arbitrary Prisma operations can use virtual columns.
function readArgs(model, args = {}) {
  const result = { ...args };
  for (const kind of ["select", "include"]) {
    if (!args[kind]) continue;
    result[kind] = {};
    for (const [key, value] of Object.entries(args[kind])) {
      if (readFieldsFor(model).includes(key)) continue;
      const related = RELATIONS[model]?.[key];
      result[kind][key] =
        related && value && typeof value === "object"
          ? readArgs(related, value)
          : value;
    }
  }
  if (args.select && readFieldsFor(model).length) {
    result.select.id = true;
    if (model === "shipping") result.select.orderId = true;
    if (model === "order") result.select.checkoutId = true;
  }
  return result;
}
function project(row, select) {
  if (!row || !select) return row;
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, value]) => value)
      .map(([key]) => [key, row[key]]),
  );
}
async function latestState(db, model, id) {
  const rows = await db.$queryRaw`SELECT detail FROM order_log
    WHERE action = ${ACTION[model]} AND detail::jsonb->>'entity_id' = ${id}
    ORDER BY (detail::jsonb->>'revision')::bigint DESC LIMIT 1`;
  return rows[0] ? JSON.parse(rows[0].detail) : null;
}
async function appendState(db, model, row, patch) {
  const previous = await latestState(db, model, row.id);
  let order;
  if (model === "order") order = row;
  else if (model === "shipping")
    order = await db.order.findUnique({ where: { id: row.orderId } });
  else
    order = await db.order.findFirst({
      where: { checkoutId: row.id },
      orderBy: { id: "asc" },
    });
  if (!order)
    throw new Error("Cannot preserve checkout address without a linked order");
  const state =
    model === "order"
      ? {
          productTitle: null,
          campaignCode: null,
          preDisputeStatus: null,
          ...previous?.state,
          ...patch,
        }
      : { addressSnapshot: patch.addressSnapshot };
  await db.orderLog.create({
    data: {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      actorId: order.buyerId,
      action: ACTION[model],
      detail: JSON.stringify({
        schema_version: 1,
        entity_id: row.id,
        revision: (previous?.revision || 0) + 1,
        ...(model !== "order" ? { address_id: row.addressId } : {}),
        state,
      }),
    },
  });
}
async function lockRow(db, model, id) {
  const table = {
    order: "orders",
    checkout: "checkouts",
    shipping: "shipping",
  }[model];
  const pk = {
    order: "order_id",
    checkout: "checkout_id",
    shipping: "shipping_id",
  }[model];
  if (table)
    await db.$queryRaw(
      Prisma.sql`SELECT ${Prisma.raw(pk)} FROM ${Prisma.raw(table)} WHERE ${Prisma.raw(pk)} = ${id} FOR UPDATE`,
    );
}

function wrapClient(db, inTransaction = false) {
  const write = (fn) =>
    inTransaction ? fn(db) : db.$transaction((tx) => fn(tx));
  async function hydrate(model, row, args = {}) {
    if (!row) return row;
    if (Array.isArray(row))
      return Promise.all(row.map((item) => hydrate(model, item, args)));
    const result = { ...row };
    // Nested Prisma relation reads cannot select fields backed by the parent's
    // workflow log. Reuse its read facade, then hydrate any included order here.
    if (model === "disputeCase" && row.id)
      Object.assign(
        result,
        await db.disputeCase.findUnique({ where: { id: row.id } }),
      );
    if (VIRTUAL[model]) {
      const history = await latestState(db, model, row.id);
      if (model === "order")
        Object.assign(
          result,
          { productTitle: null, campaignCode: null, preDisputeStatus: null },
          history?.state,
        );
      else result.addressSnapshot = history?.state.addressSnapshot ?? null;
      if (model === "checkout") {
        const orders = await db.order.findMany({
          where: { checkoutId: row.id },
          select: { id: true, originalAmount: true, ordersAmount: true },
        });
        Object.assign(result, calculateOrderTotals(orders));
      }
    }
    for (const [key, related] of Object.entries(RELATIONS[model] || {})) {
      if (row[key] !== undefined && row[key] !== null)
        result[key] = await hydrate(
          related,
          row[key],
          (args.include || args.select)?.[key] === true
            ? {}
            : (args.include || args.select)?.[key] || {},
        );
    }
    return project(result, args.select);
  }
  function normalizeData(model, data, pending) {
    const core = { ...data },
      patch = {};
    for (const key of fieldsFor(model)) {
      if (
        data[key] !== undefined &&
        !(model === "checkout" && key.endsWith("Amount"))
      )
        patch[key] = data[key];
      delete core[key];
    }
    if (Object.keys(patch).length) {
      core.id ||= randomUUID();
      pending.push({ model, id: core.id, patch });
    }
    for (const [key, related] of Object.entries(RELATIONS[model] || {})) {
      const relation = core[key];
      if (!relation || typeof relation !== "object") continue;
      core[key] = { ...relation };
      if (relation.create)
        core[key].create = Array.isArray(relation.create)
          ? relation.create.map((item) => normalizeData(related, item, pending))
          : normalizeData(related, relation.create, pending);
      // Nested connect has no data. Other nested writes must be made through
      // explicit repository calls, so removed fields cannot silently disappear.
      for (const op of [
        "update",
        "updateMany",
        "upsert",
        "connectOrCreate",
        "createMany",
      ]) {
        if (
          relation[op] &&
          JSON.stringify(relation[op]).match(
            /"(productTitle|campaignCode|preDisputeStatus|addressSnapshot)"/,
          )
        )
          throw new Error(
            `Use explicit ${related} writes for log-backed nested ${op}`,
          );
      }
    }
    return core;
  }
  async function finish(tx, pending) {
    // All nested records now exist and checkout/order links are available.
    for (const item of pending) {
      const row = await tx[item.model].findUnique({ where: { id: item.id } });
      await lockRow(tx, item.model, item.id);
      await appendState(tx, item.model, row, item.patch);
    }
  }
  const delegates = {};
  for (const model of Object.keys(RELATIONS)) {
    if (!db[model]) continue;
    const target = db[model];
    const operations = {};
    for (const method of [
      "findUnique",
      "findFirst",
      "findMany",
      "findUniqueOrThrow",
      "findFirstOrThrow",
    ])
      operations[method] = async (args = {}) =>
        hydrate(model, await target[method](readArgs(model, args)), args);
    // Parent owns dispute writes; intercept reads only so included related orders
    // receive the same history projection as reads rooted at order/checkout.
    if (model === "disputeCase") {
      delegates[model] = new Proxy(operations, {
        get(delegate, key) {
          if (key in delegate) return delegate[key];
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      continue;
    }
    operations.create = (args) =>
      write(async (tx) => {
        const pending = [];
        const row = await tx[model].create({
          data: normalizeData(model, args.data, pending),
        });
        await finish(tx, pending);
        return wrapClient(tx, true)[model].findUnique({
          where: { id: row.id },
          include: args.include,
          select: args.select,
        });
      });
    if (VIRTUAL[model]) {
      operations.updateMany = (args) =>
        write(async (tx) => {
          const patch = Object.fromEntries(
            fieldsFor(model)
              .filter(
                (key) =>
                  args.data[key] !== undefined &&
                  !(model === "checkout" && key.endsWith("Amount")),
              )
              .map((key) => [key, args.data[key]]),
          );
          const core = Object.fromEntries(
            Object.entries(args.data).filter(
              ([key]) => !fieldsFor(model).includes(key),
            ),
          );
          if (!Object.keys(patch).length)
            return tx[model].updateMany({ ...args, data: core });
          const rows = await tx[model].findMany({
            where: args.where,
            orderBy: { id: "asc" },
          });
          let count = 0;
          for (const row of rows) {
            await lockRow(tx, model, row.id);
            // Re-check caller's optimistic predicates after obtaining the lock.
            const current = await tx[model].findFirst({
              where: { AND: [args.where || {}, { id: row.id }] },
            });
            if (!current) continue;
            if (Object.keys(core).length) {
              const changed = await tx[model].updateMany({
                where: { AND: [args.where || {}, { id: row.id }] },
                data: core,
              });
              if (!changed.count) continue;
            }
            const after = await tx[model].findUnique({ where: { id: row.id } });
            await appendState(tx, model, after, patch);
            count++;
          }
          return { count };
        });
      operations.update = (args) =>
        write(async (tx) => {
          const before = await tx[model].findUnique({ where: args.where });
          if (!before) throw missing();
          await lockRow(tx, model, before.id);
          const pending = [];
          const core = normalizeData(
            model,
            { ...args.data, id: before.id },
            pending,
          );
          delete core.id;
          if (Object.keys(core).length)
            await tx[model].update({ where: args.where, data: core });
          await finish(tx, pending);
          return wrapClient(tx, true)[model].findUnique({
            where: { id: before.id },
            include: args.include,
            select: args.select,
          });
        });
      operations.upsert = (args) =>
        write(async (tx) => {
          const wrapped = wrapClient(tx, true);
          const row = await tx[model].findUnique({ where: args.where });
          return row
            ? wrapped[model].update({
                where: args.where,
                data: args.update,
                include: args.include,
                select: args.select,
              })
            : wrapped[model].create({
                data: args.create,
                include: args.include,
                select: args.select,
              });
        });
      operations.createMany = (args) =>
        write(async (tx) => {
          let count = 0;
          for (const data of Array.isArray(args.data)
            ? args.data
            : [args.data]) {
            if (args.skipDuplicates) {
              const unique =
                model === "order"
                  ? ["id", "basketId", "auctionId"]
                  : model === "shipping"
                    ? ["id", "orderId"]
                    : ["id"];
              const predicates = unique
                .filter((key) => data[key])
                .map((key) => ({ [key]: data[key] }));
              if (
                predicates.length &&
                (await tx[model].findFirst({ where: { OR: predicates } }))
              )
                continue;
            }
            await wrapClient(tx, true)[model].create({ data });
            count++;
          }
          return { count };
        });
    }
    delegates[model] = new Proxy(operations, {
      get(delegate, key) {
        if (key in delegate) return delegate[key];
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  // Stable facade properties preserve dependency injection without bypassing
  // projections in normal reads or interactive transactions.
  const exposed = { ...delegates };
  if (!inTransaction)
    exposed.$transaction = (callback, options) => {
      if (typeof callback !== "function")
        throw new Error("Use an interactive transaction for order history");
      return db.$transaction((tx) => callback(wrapClient(tx, true)), options);
    };
  return new Proxy(exposed, {
    get(target, key) {
      if (key in target) return target[key];
      const value = db[key];
      return typeof value === "function" ? value.bind(db) : value;
    },
  });
}
module.exports = { wrapClient, ORDER_FIELDS, ACTION };
