const { randomUUID } = require("node:crypto");
const { Prisma } = require("../generated/prisma-client");
const { calculateOrderTotals } = require("./money");
const ORDER_FIELDS = ["productTitle", "campaignCode", "preDisputeStatus"];
const VIRTUAL = {
  order: [],
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
  return fieldsFor(model);
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
const ADDRESS_FIELDS = [
  "recipientName",
  "phone",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postalCode",
];
async function addressState(db, model, id) {
  if (model === "order") return null;
  const row = await db[`${model}AddressSnapshot`].findUnique({
    where: { [`${model}Id`]: id },
  });
  return {
    state: {
      addressSnapshot: row
        ? Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, row[k]]))
        : null,
    },
  };
}
async function saveAddress(db, model, row, patch) {
  if (model === "order" || patch.addressSnapshot === undefined) return;
  const delegate = db[`${model}AddressSnapshot`];
  const where = { [`${model}Id`]: row.id };
  if (patch.addressSnapshot === null) {
    await delegate.deleteMany({ where });
    return;
  }
  const data = Object.fromEntries(
    ADDRESS_FIELDS.map((k) => [k, patch.addressSnapshot[k]]),
  );
  if (
    Object.keys(patch.addressSnapshot).some((k) => !ADDRESS_FIELDS.includes(k))
  )
    throw new Error("Address snapshot contains unsupported fields");
  await delegate.upsert({ where, create: { ...where, ...data }, update: data });
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
    if (VIRTUAL[model]) {
      const history = await addressState(db, model, row.id);
      if (model !== "order")
        result.addressSnapshot = history?.state.addressSnapshot ?? null;
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
            `Use explicit ${related} writes for address-snapshot nested ${op}`,
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
      await saveAddress(tx, item.model, row, item.patch);
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
            await saveAddress(tx, model, after, patch);
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
        throw new Error("Use an interactive transaction for address snapshots");
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
