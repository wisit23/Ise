// Verify persisted facts independently of seed HTTP responses.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const env = require("dotenv").parse(fs.readFileSync(".env"));
const label = process.env.LOCAL_DATASET_LABEL || "20261011";
const output = path.join("tmp", "local-dataset-" + label);
const state = JSON.parse(
  fs.readFileSync(path.join(output, "workflow-checkpoints.json")),
);
const clients = {};
for (const service of ["auth", "product", "order", "support", "chat"]) {
  const url = new URL(env["DATABASE_URL_" + service.toUpperCase()]);
  assert.equal(
    url.pathname,
    "/reloop_demo_" + label + "_" + service,
    "Demo databases only",
  );
  url.hostname = "127.0.0.1";
  if (service === "chat") url.searchParams.set("directConnection", "true");
  const Client = require(
    service === "auth"
      ? "@prisma/client"
      : "../backend/services/" +
          service +
          "-service/src/generated/prisma-client",
  ).PrismaClient;
  clients[service] = new Client({
    datasources: { db: { url: url.toString() } },
  });
}
async function main() {
  const { auth, product, order, support, chat } = clients;
  const orders = await order.order.findMany({
    include: {
      checkout: true,
      shipping: true,
      payments: { include: { holds: true } },
      dispute: { include: { evidence: true, caseLog: true } },
      logs: true,
    },
  });
  assert.ok(orders.length >= 9);
  for (const row of orders) {
    assert.ok(await auth.user.findUnique({ where: { id: row.buyerId } }));
    const item = await product.product.findUnique({
      where: { id: row.productId },
    });
    assert.ok(item);
    assert.equal(item.sellerId, row.sellerId);
    if (row.checkout) {
      assert.ok(row.shipping);
      for (const addressId of [
        row.checkout.addressId,
        row.shipping.addressId,
      ]) {
        const address = await auth.userAddress.findUnique({
          where: { id: addressId },
        });
        assert.ok(address);
        assert.equal(address.userId, row.buyerId);
      }
      assert.ok(row.shipping.addressSnapshot.recipientName);
    } else
      assert.ok(
        ["pending_payment", "pending", "cancelled"].includes(row.status),
        "Paid order needs checkout",
      );
    if (row.payments.length) {
      assert.equal(
        row.payments.length,
        1,
        "Payment retry must not duplicate payment",
      );
      assert.equal(
        Number(row.payments[0].paymentAmount),
        Number(row.ordersAmount),
      );
      assert.ok(row.checkout.paidAt);
    }
    if (row.dispute) {
      assert.ok(row.dispute.evidence.length > 0);
      for (const evidence of row.dispute.evidence)
        assert.ok([row.buyerId, row.sellerId].includes(evidence.uploaderId));
      assert.ok(
        row.payments[0].holds.some((hold) => hold.source === "DISPUTE"),
      );
    }
  }
  for (const scenario of state.orderSummary) {
    const row = orders.find((order) => order.id === scenario.orderId);
    assert.ok(row);
    const room = await chat.conversation.findUnique({
      where: { contextKey: "PRODUCT:" + row.productId + ":" + row.buyerId },
    });
    assert.ok(room);
    const messages = await chat.message.findMany({
      where: { conversationId: room.id },
    });
    assert.ok(messages.some((message) => message.senderId === row.buyerId));
    assert.ok(messages.some((message) => message.senderId === row.sellerId));
    if (row.payments.length)
      assert.equal(
        messages.filter((message) => message.payload?.event === "order.paid")
          .length,
        1,
      );
  }
  const refunded = orders.find((row) => row.id === state["refunded-order"].id);
  assert.equal(refunded.status, "refunded");
  assert.equal(
    refunded.dispute.decidedBy,
    "40000000-0000-0000-0000-000000000002",
  );
  assert.ok(
    refunded.payments[0].holds.every((hold) => hold.holdStatus === "RELEASED"),
  );
  const held = orders.find((row) => row.id === state["safety-order"].id);
  assert.ok(
    held.payments[0].holds.some(
      (hold) =>
        hold.source === "TRUST_AND_SAFETY" && hold.holdStatus === "ON_HOLD",
    ),
  );
  const tickets = await support.supportTicket.findMany({
    include: {
      currentStatus: true,
      chatLink: true,
      assignments: true,
      auditLog: true,
      slaTargets: true,
    },
  });
  assert.ok(tickets.length >= 5);
  for (const ticket of tickets) {
    assert.ok(ticket.chatLink);
    const room = await chat.conversation.findUnique({
      where: { id: ticket.chatLink.conversationId },
    });
    assert.equal(room.contextId, ticket.id);
    assert.ok(ticket.slaTargets.length);
    if (ticket.orderId)
      assert.ok(orders.some((order) => order.id === ticket.orderId));
  }
  const takeover = tickets.find(
    (ticket) => ticket.id === state["ticket-escalated"].id,
  );
  assert.equal(
    takeover.chatResponderId,
    "20000000-0000-0000-0000-000000000001",
  );
  assert.ok(
    takeover.assignments.some(
      (assignment) =>
        assignment.assigneeId === "40000000-0000-0000-0000-000000000003",
    ),
  );
  const campaign = await product.campaign.findUnique({
    where: { id: state["campaign-draft"].id },
  });
  const attribution = await product.campaignAttribution.findFirst({
    where: { orderId: state["completed-order"].id },
  });
  assert.equal(Number(attribution.netAmount), 801);
  assert.equal(Number(campaign.spentBudget), 89);
  const summary = {
    verifiedAt: new Date().toISOString(),
    label,
    models: {},
    status: "ready",
  };
  for (const [service, client] of Object.entries(clients)) {
    const schema = fs.readFileSync(
      "backend/services/" + service + "-service/prisma/schema.prisma",
      "utf8",
    );
    summary.models[service] = {};
    for (const match of schema.matchAll(/^model (\w+) \{/gm)) {
      const model = match[1];
      const delegate = model[0].toLowerCase() + model.slice(1);
      summary.models[service][model] = await client[delegate].count();
    }
  }
  if (fs.existsSync(path.join(output, "all-service-coverage.json"))) {
    const coverage = JSON.parse(
      fs.readFileSync(path.join(output, "all-service-coverage.json")),
    );
    const domains = [
      "auth.kyc",
      "auth.shop-profile",
      "auth.commerce-restriction",
      "auth.account-and-bulk",
      "auth.sessions",
      "auth.profile-and-addresses",
      "product.catalog-and-moderation",
      "product.reviews-and-swipe",
      "product.auctions",
      "marketing.articles",
      "marketing.campaigns",
      "order.checkout-and-safety",
      "chat.private-messaging",
      "chat.dispute-and-ticket-privacy",
      "support.tickets-and-help",
      "executive.oversight",
      "gateway.analytics",
    ];
    for (const domain of domains)
      assert.ok(
        coverage[domain]?.scenarios.length,
        "Missing coverage: " + domain,
      );
    summary.coverage = coverage;
    summary.inactiveModels = {
      "support.TicketMessage":
        "Legacy archive; active ticket messages live in Chat MongoDB. No fictional legacy history is inserted.",
    };
    for (const [service, models] of Object.entries(summary.models))
      for (const [model, count] of Object.entries(models)) {
        if (!summary.inactiveModels[service + "." + model])
          assert.ok(count > 0, service + "." + model + " has no demo data");
      }
    const released = orders.find(
      (row) => row.id === state["full-seller-verdict-release-order"].id,
    );
    assert.equal(released.dispute.decision, "RELEASE_ESCROW");
    assert.ok(
      released.payments[0].holds.every(
        (hold) => hold.holdStatus === "RELEASED",
      ),
    );
    const multiOrders = orders.filter(
      (row) => row.checkoutId === state["full-multi-checkout"].id,
    );
    assert.equal(multiOrders.length, 2);
    assert.equal(new Set(multiOrders.map((row) => row.sellerId)).size, 2);
    assert.equal(
      multiOrders.reduce((total, row) => total + Number(row.ordersAmount), 0),
      Number(multiOrders[0].checkout.ordersAmount),
    );
    const cancelledVoucher = await product.userVoucher.findFirst({
      where: { campaignId: state["full-cancel-voucher-campaign"].id },
    });
    assert.equal(cancelledVoucher.status, "CLAIMED");
    const winner = await product.auctionItem.findUnique({
      where: { id: state["full-auction-winner"].id },
      include: { bids: true },
    });
    assert.equal(winner.status, "closed");
    assert.equal(winner.bids.length, 2);
    const noBids = await product.auctionItem.findUnique({
      where: { id: state["full-auction-no-bids"].id },
    });
    assert.equal(noBids.status, "closed");
    assert.equal(noBids.winningOrderId, null);
    assert.equal(
      await chat.message.count({ where: { syncStatus: "FAILED" } }),
      0,
      "Chat sync has failed messages",
    );
    const outbox = await order.attributionOutboxEvent.findFirst({
      where: { orderId: state["completed-order"].id },
    });
    assert.ok(
      outbox.processedAt,
      "Campaign attribution outbox must be processed",
    );
    assert.ok(
      orders.some(
        (row) =>
          row.id === winner.winningOrderId &&
          row.buyerId === "30000000-0000-0000-0000-000000000001",
      ),
    );
    summary.scenarios = domains.length;
  }
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...summary,
        coverage: summary.coverage ? Object.keys(summary.coverage) : undefined,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() =>
    Promise.all(Object.values(clients).map((client) => client.$disconnect())),
  );
