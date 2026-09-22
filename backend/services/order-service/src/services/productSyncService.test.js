const test = require("node:test");
const assert = require("node:assert/strict");

const { ACTIONS, processEvent } = require("./productSyncService");

function mockDb(event) {
  return {
    productSyncEvent: {
      findUnique: async () => event,
      updateMany: async ({ data }) => {
        if (data.attempts) event.attempts += 1;
        if (Object.hasOwn(data, "lastError")) event.lastError = data.lastError;
        if (data.nextAttemptAt) event.nextAttemptAt = data.nextAttemptAt;
        if (data.processedAt) event.processedAt = data.processedAt;
        return { count: 1 };
      },
    },
  };
}

test("product sync records a retry without losing the outbox event", async () => {
  const event = {
    id: "sync-1",
    action: ACTIONS.COMPLETE_RESERVATION,
    productId: "product-1",
    reservationId: "reservation-1",
    attempts: 0,
    processedAt: null,
  };
  const db = mockDb(event);
  const client = {
    completeProductReservation: async () => {
      throw new Error("product service unavailable");
    },
  };

  await assert.rejects(
    () => processEvent(event.id, { db, client }),
    /unavailable/,
  );
  assert.equal(event.attempts, 1);
  assert.equal(event.processedAt, null);
  assert.match(event.lastError, /unavailable/);
  assert.ok(event.nextAttemptAt instanceof Date);
});

test("product sync marks a successfully delivered event as processed", async () => {
  const event = {
    id: "sync-2",
    action: ACTIONS.RELEASE_RESERVATION,
    productId: "product-1",
    reservationId: "reservation-1",
    attempts: 0,
    processedAt: null,
  };
  const db = mockDb(event);
  let delivered = false;
  const client = {
    releaseProductReservation: async () => {
      delivered = true;
    },
  };

  await processEvent(event.id, {
    db,
    client,
    now: new Date("2026-09-20T00:00:00Z"),
  });
  assert.equal(delivered, true);
  assert.equal(event.attempts, 1);
  assert.equal(event.processedAt.toISOString(), "2026-09-20T00:00:00.000Z");
});
