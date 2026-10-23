const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deliver,
  retryDelayMs,
  processEvent,
  processPendingEvents,
  findPendingForOrder,
  startWorker,
  stopWorker,
} = require("./attributionOutboxService");

function fixture(extra = {}) {
  const event = {
    id: "event-1",
    orderId: "order-1",
    campaignId: "campaign-1",
    grossAmount: 1000.25,
    discountAmount: 100,
    netAmount: 900.25,
    completedAt: new Date("2026-08-01T12:00:00Z"),
    attempts: 0,
    processedAt: null,
    nextAttemptAt: new Date(0),
    ...extra,
  };
  const job = {
    id: event.id,
    orderId: event.orderId,
    buyerId: "buyer",
    sellerId: "seller",
    actorId: "buyer",
    action: "ATTRIBUTION_REQUESTED",
    detail: "immutable job",
  };
  const logs = [job];
  let current = { ...event, lastError: null };
  const state = () => ({ ...current });
  const db = {
    order: {
      findUnique: async () => ({
        id: event.orderId,
        buyerId: "buyer",
        sellerId: "seller",
      }),
    },
    attributionJob: {
      findUnique: async ({ where }) =>
        where.id === event.id || where.orderId === event.orderId
          ? state()
          : null,
      findMany: async ({ where }) =>
        !current.processedAt && current.nextAttemptAt <= where.nextAttemptAt.lte
          ? [state()]
          : [],
      findFirst: async ({ where }) =>
        where.orderId === event.orderId && !current.processedAt
          ? state()
          : null,
      updateMany: async ({ data }) => {
        if (current.processedAt) return { count: 0 };
        const { attempts, ...patch } = data;
        current = {
          ...current,
          ...patch,
          attempts: current.attempts + attempts.increment,
        };
        return { count: 1 };
      },
    },
    orderLog: {
      findUnique: async ({ where }) => logs.find((row) => row.id === where.id),
      create: async ({ data }) => {
        if (data.id && logs.some((row) => row.id === data.id))
          throw Object.assign(new Error("duplicate ACK"), { code: "P2002" });
        const row = { id: data.id || `result-${logs.length}`, ...data };
        logs.push(row);
        return row;
      },
    },
  };
  let tail = Promise.resolve();
  db.$transaction = (callback) => {
    const result = tail.then(async () => {
      const before = { ...current },
        count = logs.length;
      try {
        return await callback(db);
      } catch (error) {
        current = before;
        logs.length = count;
        throw error;
      }
    });
    tail = result.catch(() => {});
    return result;
  };
  return { db, logs, job, event, state };
}
test("retry backoff doubles and caps at 60s", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 10].map(retryDelayMs),
    [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000],
  );
});
test("delivery retains envelope, decimal baht, stable ID and flat compatibility fields", async () => {
  const f = fixture();
  let payload;
  await deliver(f.event, {
    recordOrderCompleted: async (row) => {
      payload = row;
    },
  });
  assert.equal(payload.eventId, f.event.id);
  assert.equal(payload.eventType, "order.completed.v1");
  assert.equal(payload.aggregateId, f.event.orderId);
  assert.equal(payload.occurredAt, f.event.completedAt.toISOString());
  for (const key of [
    "orderId",
    "campaignId",
    "grossAmount",
    "discountAmount",
    "netAmount",
    "completedAt",
  ])
    assert.equal(payload[key], payload.payload[key]);
  assert.equal(payload.netAmount, 900.25);
});
test("success appends one ACK; repeated delivery is a no-op; immutable job is unchanged", async () => {
  const f = fixture();
  const before = JSON.stringify(f.job);
  let calls = 0;
  const opts = {
    db: f.db,
    client: {
      recordOrderCompleted: async () => {
        calls++;
      },
    },
  };
  const result = await processEvent(f.event.id, opts);
  await processEvent(f.event.id, opts);
  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
  assert.ok(result.processedAt);
  assert.equal(f.logs[1].action, "ATTRIBUTION_ACK");
  assert.equal(JSON.stringify(f.job), before);
});
test("failure appends retry state and schedules backoff; sweep does not retry early", async () => {
  const f = fixture({ attempts: 1 });
  const now = new Date("2026-08-01T15:00:00Z");
  await assert.rejects(
    processEvent(f.event.id, {
      db: f.db,
      now,
      client: {
        recordOrderCompleted: async () => {
          throw new Error("503");
        },
      },
    }),
    /503/,
  );
  assert.equal(f.state().attempts, 2);
  assert.equal(f.state().nextAttemptAt.getTime(), now.getTime() + 2000);
  assert.equal(f.logs[1].action, "ATTRIBUTION_RETRY");
  assert.equal(f.state().processedAt, null);
  assert.deepEqual(await processPendingEvents({ db: f.db, now }), []);
  const delivered = [];
  const result = await processPendingEvents({
    db: f.db,
    now: new Date(now.getTime() + 2000),
    client: {
      recordOrderCompleted: async (row) => delivered.push(row.eventId),
    },
  });
  assert.equal(result[0].status, "fulfilled");
  assert.deepEqual(delivered, [f.event.id]);
  assert.equal(await findPendingForOrder(f.event.orderId, f.db), null);
});
test("crash after Product accepts but before ACK retries the original event ID", async () => {
  const f = fixture();
  const create = f.db.orderLog.create;
  let fail = true;
  const received = [];
  f.db.orderLog.create = async (args) => {
    if (fail) throw new Error("DB interrupted");
    return create(args);
  };
  const opts = {
    db: f.db,
    client: { recordOrderCompleted: async (row) => received.push(row.eventId) },
  };
  await assert.rejects(processEvent(f.event.id, opts), /interrupted/);
  assert.equal(f.state().processedAt, null);
  fail = false;
  await processEvent(f.event.id, opts);
  assert.deepEqual(received, [f.event.id, f.event.id]);
  assert.equal(f.logs.length, 2);
});
test("concurrent delivery deduplicates ACKs", async () => {
  const f = fixture();
  await Promise.all(
    [1, 2].map(() =>
      processEvent(f.event.id, {
        db: f.db,
        client: { recordOrderCompleted: async () => {} },
      }),
    ),
  );
  assert.equal(
    f.logs.filter((row) => row.action === "ATTRIBUTION_ACK").length,
    1,
  );
});
test("worker starts and stops; missing durable queue fails loudly", async () => {
  const f = fixture({ processedAt: new Date() });
  assert.ok(startWorker({ db: f.db, intervalMs: 60000 }));
  stopWorker();
  for (const run of [
    () => processEvent("missing", { db: {} }),
    () => processPendingEvents({ db: {} }),
    () => findPendingForOrder("missing", {}),
  ])
    await assert.rejects(
      run(),
      /attributionJob table and orderLog model are required/,
    );
});
