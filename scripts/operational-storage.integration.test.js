const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const MIGRATION = "20261016000000_operational_storage";
const enabled = process.env.OPERATIONAL_REHEARSAL === "1";
const address = {
  recipientName: "Buyer",
  phone: "0812345678",
  addressLine: "Original road",
  subdistrict: "A",
  district: "B",
  province: "Bangkok",
  postalCode: "10110",
};
function urlFor(service) {
  const value = process.env[`OPERATIONAL_${service.toUpperCase()}_URL`];
  assert.ok(value, "Explicit disposable rehearsal URL is required");
  const url = new URL(value);
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === "55441" &&
      url.pathname === `/operational_${service}_upgrade`,
    "Refusing non-rehearsal database",
  );
  return value;
}
function deploy(service, url, before = false, expectedFailure = false) {
  const serviceRoot = path.join(ROOT, "backend/services", `${service}-service`);
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "operational-migrations-"),
  );
  try {
    fs.copyFileSync(
      path.join(serviceRoot, "prisma/schema.prisma"),
      path.join(temp, "schema.prisma"),
    );
    fs.mkdirSync(path.join(temp, "migrations"));
    for (const name of fs.readdirSync(
      path.join(serviceRoot, "prisma/migrations"),
    )) {
      if (before && name === MIGRATION) continue;
      fs.cpSync(
        path.join(serviceRoot, "prisma/migrations", name),
        path.join(temp, "migrations", name),
        { recursive: true },
      );
    }
    const result = spawnSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(temp, "schema.prisma"),
      ],
      {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
      },
    );
    if (expectedFailure) {
      assert.notEqual(
        result.status,
        0,
        "Invalid source data must block migration",
      );
      return result.stdout + result.stderr;
    }
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    assert.ok(
      path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    fs.rmSync(temp, { recursive: true });
  }
}
async function setup(service, t) {
  const url = urlFor(service);
  const { PrismaClient } = require(
    path.join(
      ROOT,
      "backend/services",
      `${service}-service/src/generated/prisma-client`,
    ),
  );
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  // Only the exact allowlisted upgrade fixture is reset; application DBs are never used.
  await db.$executeRawUnsafe("DROP SCHEMA public CASCADE");
  await db.$executeRawUnsafe("CREATE SCHEMA public");
  deploy(service, url, true);
  return { db, url };
}
async function sql(db, statements) {
  for (const statement of statements) await db.$executeRawUnsafe(statement);
}
function j(value) {
  return JSON.stringify(value).replaceAll("'", "''");
}

test(
  "Order: populated log-backed upgrade preserves workflow, snapshots and queues; runtime uses tables",
  { skip: !enabled },
  async (t) => {
    const { db, url } = await setup("order", t);
    const at = "2026-10-01T08:00:00.123Z";
    const state = {
      status: "NEEDS_INFO",
      createdAt: at,
      assignedRole: "CUSTOMER_SERVICE",
      decisionReason: "reason",
      decidedBy: "reviewer",
      decidedAt: at,
      verdictKey: "old-verdict",
      escalationNote: "note",
      escalatedBy: "agent",
      priority: "HIGH",
      priorityScore: 777,
      riskReportCount: 3,
      slaExpiresAt: at,
      slaPolicyVersion: "v1",
      firstReviewDueAt: at,
      firstReviewedAt: at,
      decisionDueAt: at,
    };
    await sql(db, [
      "INSERT INTO checkouts(checkout_id,buyer_id,address_id,status,cancel_at,updated_at) VALUES('checkout-old','buyer','address-old','pending','2026-10-01','2026-10-01')",
      "INSERT INTO orders(order_id,checkout_id,buyer_id,seller_id,product_id,campaign_id,order_type,original_amount,orders_amount,status,updated_at) VALUES('order-old','checkout-old','buyer','seller','product-old','campaign-old','BUY_NOW',123.45,100.25,'disputed','2026-10-01')",
      "INSERT INTO shipping(shipping_id,order_id,address_id,status,updated_at) VALUES('shipping-old','order-old','address-old','pending','2026-10-01')",
      "INSERT INTO dispute_case(dispute_case_id,order_id,created_by,reason,dispute_type,dispute_case_version) VALUES('case-old','order-old','buyer','reason','OTHER',2)",
      `INSERT INTO dispute_case_log(dispute_case_log_id,dispute_case_id,actor_id,action,detail) VALUES('state-old','case-old','buyer','WORKFLOW_STATE','${j({ schema_version: 1, case_version: 2, state })}')`,
      ...[
        [
          "ORDER_HISTORY_STATE",
          "order-old",
          {
            productTitle: "Original product",
            campaignCode: "OLD",
            preDisputeStatus: "completed",
          },
        ],
        [
          "CHECKOUT_ADDRESS_STATE",
          "checkout-old",
          { addressSnapshot: address },
        ],
        [
          "SHIPPING_ADDRESS_STATE",
          "shipping-old",
          { addressSnapshot: { ...address, addressLine: "Shipping road" } },
        ],
      ].map(
        ([action, entity_id, state], i) =>
          `INSERT INTO order_log(order_log_id,order_id,buyer_id,seller_id,actor_id,action,detail) VALUES('history-${i}','order-old','buyer','seller','buyer','${action}','${j({ schema_version: 1, revision: 1, entity_id, state })}')`,
      ),
      `INSERT INTO order_log(order_log_id,order_id,buyer_id,seller_id,actor_id,action,detail) VALUES('attribution-old','order-old','buyer','seller','buyer','ATTRIBUTION_REQUESTED','${j({ campaignId: "campaign-old", grossAmount: "123.45", discountAmount: "23.20", netAmount: "100.25", completedAt: at })}')`,
      `INSERT INTO order_log(order_log_id,order_id,buyer_id,seller_id,actor_id,action,detail) VALUES('retry-old','order-old','buyer','seller','buyer','ATTRIBUTION_RETRY','${j({ eventId: "attribution-old", attempts: 2, lastError: "503", nextAttemptAt: at })}')`,
      `INSERT INTO order_log(order_log_id,order_id,buyer_id,seller_id,actor_id,action,detail) VALUES('sync-old','order-old','buyer','seller','buyer','PRODUCT_SYNC_REQUESTED','${j({ action: "SET_STATUS", productId: "product-old", targetStatus: "sold" })}')`,
    ]);
    const logsBefore = await db.$queryRawUnsafe(
      "SELECT * FROM order_log ORDER BY order_log_id",
    );
    const workflowBefore = await db.$queryRawUnsafe(
      "SELECT * FROM dispute_case_state",
    );
    const attributionBefore = await db.$queryRawUnsafe(
      "SELECT * FROM order_attribution_jobs",
    );
    deploy("order", url);
    await db.$disconnect();
    assert.deepEqual(
      await db.$queryRawUnsafe("SELECT * FROM order_log ORDER BY order_log_id"),
      logsBefore,
    );
    const physical = await db.$queryRawUnsafe("SELECT * FROM dispute_case");
    for (const [key, value] of Object.entries(workflowBefore[0]))
      assert.deepEqual(physical[0][key], value, key);
    const jobs = await db.$queryRawUnsafe(
      "SELECT * FROM order_attribution_jobs",
    );
    for (const [key, value] of Object.entries(attributionBefore[0]))
      assert.deepEqual(jobs[0][key], value, key);
    const {
      wrapClient,
    } = require("../backend/services/order-service/src/models/erClient");
    const client = wrapClient(db);
    const order = await client.order.findUnique({
      where: { id: "order-old" },
      include: { checkout: true, shipping: true, dispute: true },
    });

    assert.equal(order.productTitle, "Original product");
    assert.deepEqual(order.checkout.addressSnapshot, address);
    assert.equal(order.shipping.addressSnapshot.addressLine, "Shipping road");
    assert.equal(order.dispute.priorityScore, 777);
    assert.equal(Number(order.checkout.ordersAmount), 100.25);
    assert.equal(
      await client.disputeCase.count({ where: { priorityScore: 777 } }),
      1,
    );
    const changed = await client.disputeCase.updateMany({
      where: { id: "case-old", version: 2 },
      data: { priorityScore: 888, version: { increment: 1 } },
    });
    assert.equal(changed.count, 1);
    assert.equal(
      (
        await client.disputeCase.updateMany({
          where: { id: "case-old", version: 2 },
          data: { priorityScore: 999 },
        })
      ).count,
      0,
    );
    assert.equal(
      (await client.disputeCase.findUnique({ where: { id: "case-old" } }))
        .priorityScore,
      888,
    );
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.disputeCase.update({
          where: { id: "case-old" },
          data: { priorityScore: 999 },
        });
        throw new Error("rollback");
      }),
      /rollback/,
    );
    assert.equal(
      (await client.disputeCase.findUnique({ where: { id: "case-old" } }))
        .priorityScore,
      888,
    );
    const outbox = require("../backend/services/order-service/src/services/attributionOutboxService");
    const received = [];
    await outbox.processEvent("attribution-old", {
      db: client,
      client: {
        recordOrderCompleted: async (event) => received.push(event.eventId),
      },
    });
    await outbox.processEvent("attribution-old", {
      db: client,
      client: {
        recordOrderCompleted: async () => {
          throw new Error("duplicate delivery");
        },
      },
    });
    assert.deepEqual(received, ["attribution-old"]);
    assert.equal(
      (await db.attributionJob.findUnique({ where: { id: "attribution-old" } }))
        .attempts,
      3,
    );
    const sync = require("../backend/services/order-service/src/services/productSyncService");
    await sync.processEvent("sync-old", {
      db: client,
      client: {
        setProductStatus: async (id, status) => {
          assert.equal(id, "product-old");
          assert.equal(status, "sold");
        },
      },
    });
    assert.ok(
      (await db.productSyncJob.findUnique({ where: { id: "sync-old" } }))
        .processedAt,
    );
    await client.shipping.update({
      where: { id: "shipping-old" },
      data: { addressSnapshot: { ...address, addressLine: "New road" } },
    });
    assert.equal(
      (await client.shipping.findUnique({ where: { id: "shipping-old" } }))
        .addressSnapshot.addressLine,
      "New road",
    );
    assert.equal(
      (await client.checkout.findUnique({ where: { id: "checkout-old" } }))
        .addressSnapshot.addressLine,
      "Original road",
    );
    assert.equal(
      (
        await db.$queryRawUnsafe(
          "SELECT count(*)::int AS n FROM dispute_case_log WHERE action='WORKFLOW_STATE'",
        )
      )[0].n,
      1,
    );
  },
);

test(
  "Product: populated upgrade preserves auction fields and moderation receipts without log reads",
  { skip: !enabled },
  async (t) => {
    const { db, url } = await setup("product", t);
    const at = "2026-10-01T08:00:00.123Z";
    await sql(db, [
      "INSERT INTO auction_rounds(id,submission_starts_at,submission_ends_at,auction_starts_at,auction_ends_at,updated_at) VALUES('round-old','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-01')",
      `INSERT INTO marketing_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata) VALUES('round-state','import','SYSTEM','ER_STATE_IMPORT','AUCTION_ROUND','round-old','${j({ erFields: { title: "Original round", categories: ["Shirts", "Shoes"], cancellationReason: "original reason", cancelledAt: at, cancelledBy: "actor-old" } })}')`,
      `INSERT INTO marketing_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,idempotency_key,metadata) VALUES('command-old','import','SYSTEM','REMOVE_PRODUCT','PRODUCT_MODERATION','deleted-product','key-old','${j({ payloadHash: "hash-old", result: { id: "deleted-product", status: "removed" } })}')`,
    ]);
    const before = await db.$queryRawUnsafe(
      "SELECT * FROM marketing_audit_logs ORDER BY id",
    );
    deploy("product", url);
    await db.$disconnect();
    assert.deepEqual(
      await db.$queryRawUnsafe(
        "SELECT * FROM marketing_audit_logs ORDER BY id",
      ),
      before,
    );
    const round = await db.auctionRound.findUnique({
      where: { id: "round-old" },
    });
    assert.equal(round.title, "Original round");
    assert.deepEqual(round.categories, ["Shirts", "Shoes"]);
    assert.equal(round.cancelledAt.toISOString(), at);
    assert.equal(round.cancelledBy, "actor-old");
    const receipt = await db.productModerationCommand.findUnique({
      where: { idempotencyKey: "key-old" },
    });
    assert.equal(receipt.productId, "deleted-product");
    assert.deepEqual(receipt.result, {
      id: "deleted-product",
      status: "removed",
    });
    const fields = require("../backend/services/product-service/src/features/auctions/auctionAuditState");
    const changed = await fields.writeRound(db, "update", {
      where: { id: round.id },
      data: { title: "Updated round" },
    });
    assert.equal(changed.title, "Updated round");
    assert.equal(
      (
        await db.$queryRawUnsafe(
          "SELECT count(*)::int AS n FROM marketing_audit_logs",
        )
      )[0].n,
      before.length,
    );
  },
);

test(
  "Support: populated upgrade preserves classification, SLA policy/targets and Chat receipt ownership",
  { skip: !enabled },
  async (t) => {
    const { db, url } = await setup("support", t);
    const at = "2026-10-01T08:00:00.123Z";
    const classification = {
      reasonCodes: ["rule-old"],
      policyVersion: "policy-old",
      riskLookupAvailable: false,
    };
    await sql(db, [
      "INSERT INTO sla_policies(sla_policy_id,ticket_priority_id,first_response_minutes,resolution_minutes,effective_from) VALUES('policy-old',(SELECT ticket_priority_id FROM ticket_priorities WHERE code='NORMAL'),30,90,'2026-01-01')",
      "INSERT INTO support_tickets(ticket_id,ticket_number,requester_id,subject,ticket_category_id,ticket_priority_id,current_status_id,updated_at) VALUES('ticket-old','OLD-1','buyer','Original',(SELECT ticket_category_id FROM ticket_categories WHERE code='OTHER'),(SELECT ticket_priority_id FROM ticket_priorities WHERE code='NORMAL'),(SELECT ticket_status_id FROM ticket_statuses WHERE code='NEW'),'2026-10-01')",
      `INSERT INTO ticket_sla_targets(sla_target_id,ticket_id,sla_policy_id,metric_type,due_at,updated_at) VALUES('target-old','ticket-old','policy-old','RESOLUTION','${at}','${at}')`,
      `INSERT INTO ticket_audit_events(audit_event_id,ticket_id,actor_id,event_type,payload) VALUES('queue-old','ticket-old','buyer','QUEUE_CLASSIFIED','${j({ ticketVersion: 0, priorityScore: 777, riskReportCount: 3, classification })}')`,
      `INSERT INTO ticket_audit_events(audit_event_id,ticket_id,actor_id,event_type,payload) VALUES('responder-old','ticket-old','agent','CHAT_RESPONDER_CHANGED','${j({ ticketVersion: 0, responderId: "responder-old" })}')`,
      `INSERT INTO ticket_audit_events(audit_event_id,ticket_id,actor_id,event_type,payload) VALUES('round-old','ticket-old','migration:er','TICKET_OPENED','${j({ schemaVersion: 1, cycle: 1, startedAt: at, targets: [{ id: "target-old", metricType: "RESOLUTION", policyId: "policy-old", snapshotSource: "policy-row-at-migration", policy: { id: "policy-old", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, firstResponseMinutes: 7, resolutionMinutes: 23 } }] })}')`,
      `INSERT INTO ticket_audit_events(audit_event_id,ticket_id,actor_id,event_type,dedupe_key,payload,created_at) VALUES('reply-old','ticket-old','agent','REPLY','chat:message-old','${j({ chatMessageId: "message-old", conversationId: "conversation-old", authorRole: "AGENT", isInternal: false })}','${at}')`,
    ]);
    const events = await db.$queryRawUnsafe(
      "SELECT * FROM ticket_audit_events ORDER BY audit_event_id",
    );
    const targets = await db.$queryRawUnsafe(
      "SELECT * FROM ticket_sla_targets",
    );
    deploy("support", url);
    await db.$disconnect();
    assert.deepEqual(
      await db.$queryRawUnsafe(
        "SELECT * FROM ticket_audit_events ORDER BY audit_event_id",
      ),
      events,
    );
    const ticket = await db.supportTicket.findUnique({
      where: { id: "ticket-old" },
      include: { slaTargets: { include: { round: true } } },
    });
    assert.equal(ticket.priorityScore, 777);
    assert.equal(ticket.riskReportCount, 3);
    assert.equal(ticket.chatResponderId, "responder-old");
    assert.deepEqual(ticket.classificationReasonCodes, ["rule-old"]);
    assert.equal(ticket.classificationPolicyVersion, "policy-old");
    assert.equal(ticket.riskLookupAvailable, false);
    const round = ticket.slaTargets[0].round;
    assert.equal(round.resolutionMinutes, 23);
    assert.equal(round.snapshotSource, "policy-row-at-migration");
    for (const [key, value] of Object.entries(targets[0]))
      assert.deepEqual(
        (await db.$queryRawUnsafe("SELECT * FROM ticket_sla_targets"))[0][key],
        value,
        key,
      );
    const receipt = await db.ticketChatMessageReceipt.findUnique({
      where: { messageId: "message-old" },
    });
    assert.equal(receipt.receivedAt, null);
    assert.equal(receipt.messageCreatedAt.toISOString(), at);
    assert.equal(receipt.conversationId, "conversation-old");
    const {
      effectiveTargets,
    } = require("../backend/services/support-service/src/features/tickets/ticketEvents");
    assert.equal(effectiveTargets(ticket.slaTargets)[0].cycle, 1);
    await assert.rejects(
      db.ticketSlaTarget.create({
        data: {
          roundId: round.id,
          ticketId: "ticket-old",
          policyId: "policy-old",
          metricType: "RESOLUTION",
          dueAt: new Date(),
        },
      }),
      { code: "P2002" },
    );
    await assert.rejects(
      db.ticketChatMessageReceipt.create({
        data: {
          messageId: "message-old",
          ticketId: "ticket-old",
          conversationId: "wrong",
          authorRole: "AGENT",
          isInternal: false,
          messageCreatedAt: new Date(),
        },
      }),
      { code: "P2002" },
    );
  },
);

test(
  "Order: missing workflow snapshot blocks the entire cutover without changing existing data",
  { skip: !enabled },
  async (t) => {
    const { db, url } = await setup("order", t);
    await sql(db, [
      "INSERT INTO orders(order_id,buyer_id,seller_id,product_id,order_type,original_amount,orders_amount,status,updated_at) VALUES('blocked-order','buyer','seller','product','BUY_NOW',100,100,'disputed','2026-10-01')",
      "INSERT INTO dispute_case(dispute_case_id,order_id,created_by,reason,dispute_type) VALUES('blocked-case','blocked-order','buyer','missing snapshot','OTHER')",
      "INSERT INTO dispute_case_log(dispute_case_log_id,dispute_case_id,actor_id,action,detail) VALUES('audit-retained','blocked-case','buyer','OPEN','actual historical detail')",
    ]);
    const before = await db.$queryRawUnsafe("SELECT * FROM dispute_case_log");
    const failure = deploy("order", url, false, true);
    // Prisma 5 may hide the guard error behind transaction-aborted. The test
    // checks the failed migration and unchanged rows/DDL instead of its wrapper text.
    assert.match(failure, /20261016000000_operational_storage/);
    await db.$disconnect();
    assert.deepEqual(
      await db.$queryRawUnsafe("SELECT * FROM dispute_case_log"),
      before,
    );
    const columns = await db.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name='dispute_case' AND column_name='status'",
    );
    assert.equal(columns.length, 0);
    assert.equal(
      (
        await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM dispute_case")
      )[0].n,
      1,
    );
  },
);
