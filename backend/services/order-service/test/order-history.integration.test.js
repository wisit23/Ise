const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("../src/generated/prisma-client");
const { wrapClient } = require("../src/models/erClient");
const ROOT = path.resolve(__dirname, "..");
const URL = process.env.ORDER_HISTORY_TEST_DATABASE_URL;
const ADDRESS = {
  recipientName: "History Buyer",
  phone: "0812345678",
  addressLine: "Selected Road",
  subdistrict: "A",
  district: "B",
  province: "Bangkok",
  postalCode: "10110",
};
const env = () => ({
  ...process.env,
  DATABASE_URL: URL,
  DATABASE_URL_ORDER: URL,
});
function cli(args, cwd = ROOT, variables = env()) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: variables,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, (result.stdout || "") + (result.stderr || ""));
  return result.stdout;
}
function compose(raw) {
  return wrapClient(raw);
}
function client() {
  return new PrismaClient({ datasources: { db: { url: URL } } });
}
async function reset(db) {
  await db.$executeRawUnsafe("DROP SCHEMA public CASCADE");
  await db.$executeRawUnsafe("CREATE SCHEMA public");
}
function stagedDeploy(serviceRoot, stopBefore, url) {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "order-history-migrations-"),
  );
  try {
    fs.copyFileSync(
      path.join(serviceRoot, "prisma/schema.prisma"),
      path.join(temp, "schema.prisma"),
    );
    fs.mkdirSync(path.join(temp, "migrations"));
    fs.copyFileSync(
      path.join(serviceRoot, "prisma/migrations/migration_lock.toml"),
      path.join(temp, "migrations/migration_lock.toml"),
    );
    for (const dir of fs.readdirSync(
      path.join(serviceRoot, "prisma/migrations"),
    )) {
      if (!/^\d/.test(dir) || (stopBefore && dir >= stopBefore)) continue;
      fs.cpSync(
        path.join(serviceRoot, "prisma/migrations", dir),
        path.join(temp, "migrations", dir),
        { recursive: true },
      );
    }
    cli(
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(temp, "schema.prisma"),
      ],
      serviceRoot,
      { ...env(), DATABASE_URL: url },
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test(
  "approved order history: fresh install, actual checkout/payment/restart, and populated upgrade",
  { skip: !URL, timeout: 180000 },
  async (t) => {
    const parsed = new global.URL(URL);
    assert.equal(parsed.hostname, "localhost");
    assert.equal(parsed.port, "55439");
    assert.equal(parsed.pathname, "/order_history_luna_er");
    process.env.DATABASE_URL = URL;
    process.env.DATABASE_URL_ORDER = URL;
    const raw = client();
    t.after(() => raw.$disconnect());
    await reset(raw);
    const deployOutput = cli(["prisma/migrate.js"]);
    assert.match(deployOutput, /All migrations have been successfully applied/);
    const db = compose(raw);
    // Exact integration intended for prismaClient, without editing the parent file.
    const modulePath = require.resolve("../src/models/prismaClient");
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports: db,
    };
    const orderModel = require("../src/models/orderModel");
    const {
      reserveOrder,
    } = require("../src/features/checkout/checkoutService");
    const {
      createCheckoutSessionService,
    } = require("../src/features/checkoutSessions/checkoutSessionService");
    const {
      createShippingService,
      resolveSelectedAddress,
    } = require("../src/features/shipping/shippingService");
    const outbox = require("../src/services/attributionOutboxService");
    let selectedRows = [
      { id: "selected", userId: "buyer", ...ADDRESS },
      {
        id: "default",
        userId: "buyer",
        ...ADDRESS,
        addressLine: "Never Selected",
        isDefault: true,
      },
    ];
    const auth = await listen((req, res) => {
      if (
        req.url !== "/me/addresses" ||
        req.headers.authorization !== "Bearer buyer-token"
      ) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(selectedRows));
    });
    process.env.AUTH_SERVICE_URL = auth.url;
    t.after(auth.close);
    let failPaymentSync = false;
    const products = {
      reserveProduct: async (id) => ({
        created: true,
        reservationId: `basket-${id}`,
        expiresAt: new Date(Date.now() + 300000),
        product: {
          id,
          sellerId: `seller-${id}`,
          title: `Verified ${id}`,
          price: id === "p1" ? "0.10" : "0.20",
        },
      }),
      quoteAndHold: async () => ({
        campaignId: "campaign",
        campaignCode: "VERIFIED",
        discountAmount: "0.03",
        finalPrice: "0.07",
      }),
      releaseVoucher: async () => {},
      releaseProductReservation: async () => {},
      extendProductReservation: async () => {},
      completeProductReservation: async () => {
        if (failPaymentSync) throw new Error("product interrupted");
      },
      setProductStatus: async () => {},
      completeVoucher: async () => {},
    };
    let checkout, first;
    await t.test(
      "verified title/code, selected address ownership, exact totals, immutable historical snapshots",
      async () => {
        first = (
          await reserveOrder(
            {
              buyerId: "buyer",
              productId: "p1",
              campaignId: "campaign",
              productTitle: "Forged",
            },
            { products, productClient: products, orderModel },
          )
        ).order;
        const second = (
          await reserveOrder(
            { buyerId: "buyer", productId: "p2" },
            { productClient: products, orderModel },
          )
        ).order;
        assert.equal(first.productTitle, "Verified p1");
        assert.equal(first.campaignCode, "VERIFIED");
        const sessions = createCheckoutSessionService(db, products);
        const input = {
          buyerId: "buyer",
          orderIds: [first.id, second.id],
          addressId: "selected",
          shippingAddress: { ...ADDRESS, addressLine: "Forged Road" },
          authorization: "Bearer buyer-token",
        };
        await assert.rejects(
          sessions.create({ ...input, addressId: "foreign" }),
          /does not belong/,
        );
        checkout = await sessions.create(input);
        assert.equal(checkout.originalAmount.toString(), "0.3");
        assert.equal(checkout.ordersAmount.toString(), "0.27");
        assert.equal(checkout.discount, 0.03);
        assert.equal(checkout.shippingAddress.addressLine, "Selected Road");
        assert.ok(
          checkout.orders.every(
            (order) =>
              order.shipping.addressSnapshot.addressLine === "Selected Road",
          ),
        );
        const history = await db.orderLog.findMany({
          where: { action: "SHIPPING_ADDRESS_STATE" },
        });
        const oldSnapshots = history.map((row) => row.detail);
        selectedRows[0].addressLine = "Updated Book Road";
        assert.equal(
          (await sessions.get({ buyerId: "buyer", sessionId: checkout.id }))
            .shippingAddress.addressLine,
          "Selected Road",
        );
        checkout = await sessions.updateAddress({
          ...input,
          sessionId: checkout.id,
        });
        assert.equal(checkout.shippingAddress.addressLine, "Updated Book Road");
        assert.deepEqual(
          (
            await db.orderLog.findMany({
              where: { id: { in: history.map((row) => row.id) } },
              orderBy: { id: "asc" },
            })
          )
            .map((row) => row.detail)
            .sort(),
          oldSnapshots.sort(),
        );
        await assert.rejects(
          sessions.get({ buyerId: "intruder", sessionId: checkout.id }),
          /another buyer/,
        );
        await assert.rejects(
          resolveSelectedAddress({
            buyerId: "intruder",
            addressId: "selected",
            authorization: "Bearer buyer-token",
          }),
          /does not belong/,
        );
      },
    );
    await t.test(
      "payment failure/restart resumes downstream work, charges once, and freezes checkout address",
      async () => {
        failPaymentSync = true;
        const sessions = createCheckoutSessionService(db, products);
        await assert.rejects(
          sessions.confirm({ buyerId: "buyer", sessionId: checkout.id }),
          /interrupted/,
        );
        assert.equal(
          (await db.checkout.findUnique({ where: { id: checkout.id } })).status,
          "processing",
        );
        assert.equal(await db.payment.count(), 2);
        const restartedRaw = client();
        const restarted = compose(restartedRaw);
        try {
          failPaymentSync = false;
          const service = createCheckoutSessionService(restarted, products);
          const paid = await service.confirm({
            buyerId: "buyer",
            sessionId: checkout.id,
          });
          assert.equal(paid.status, "paid");
          assert.ok(paid.paidAt instanceof Date);
          await service.confirm({ buyerId: "buyer", sessionId: checkout.id });
          assert.equal(await restarted.payment.count(), 2);
          assert.equal(
            (
              await restarted.payment.aggregate({
                _sum: { paymentAmount: true },
              })
            )._sum.paymentAmount.toString(),
            "0.27",
          );
          await assert.rejects(
            service.updateAddress({
              buyerId: "buyer",
              sessionId: checkout.id,
              addressId: "selected",
              authorization: "Bearer buyer-token",
            }),
            /only pending/,
          );
          const shipping = createShippingService(restarted);
          selectedRows[0].addressLine = "Confirmed Shipping Road";
          await shipping.updateAddress({
            buyerId: "buyer",
            orderId: first.id,
            addressId: "selected",
            authorization: "Bearer buyer-token",
          });
          const row = await restarted.order.findUnique({
            where: { id: first.id },
            include: orderModel.INCLUDE,
          });
          assert.equal(
            row.shipping.addressSnapshot.addressLine,
            "Confirmed Shipping Road",
          );
          assert.equal(
            row.checkout.addressSnapshot.addressLine,
            "Updated Book Road",
          );
          await shipping.markShipped({
            orderId: first.id,
            actorId: "seller-p1",
            version: row.version,
            company: "Carrier",
            trackingNumber: "TRK",
          });
          await assert.rejects(
            shipping.updateAddress({
              buyerId: "buyer",
              orderId: first.id,
              addressId: "selected",
              authorization: "Bearer buyer-token",
            }),
            /awaiting shipment/,
          );
        } finally {
          await restartedRaw.$disconnect();
        }
      },
    );
    await t.test(
      "history wrapper composes in tx, preserves arbitrary nested creates/selects, rolls back and restores pre-dispute state",
      async () => {
        const created = await db.checkout.create({
          data: {
            buyerId: "nested-buyer",
            addressId: "nested-address",
            addressSnapshot: ADDRESS,
            originalAmount: "12.34",
            ordersAmount: "12.34",
            status: "paid",
            cancelAt: new Date(),
            orders: {
              create: {
                buyerId: "nested-buyer",
                sellerId: "seller",
                productId: "nested-product",
                orderType: "BUY_NOW",
                originalAmount: "12.34",
                ordersAmount: "12.34",
                productTitle: "Nested Title",
                shipping: {
                  create: {
                    addressId: "nested-address",
                    addressSnapshot: ADDRESS,
                    status: "pending",
                  },
                },
              },
            },
          },
          select: {
            id: true,
            addressSnapshot: true,
            originalAmount: true,
            orders: {
              select: {
                id: true,
                productTitle: true,
                shipping: { select: { addressSnapshot: true } },
              },
            },
          },
        });
        assert.equal(created.orders[0].productTitle, "Nested Title");
        assert.equal(created.originalAmount.toString(), "12.34");
        assert.deepEqual(created.orders[0].shipping, {
          addressSnapshot: ADDRESS,
        });
        const nested = created.orders[0];
        const logsBefore = await db.orderLog.count();
        await assert.rejects(
          db.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: nested.id },
              data: { productTitle: "Never Committed" },
            });
            await tx.disputeCase.create({
              data: {
                orderId: nested.id,
                createdBy: "nested-buyer",
                reason: "test",
                disputeType: "BUYER_DISPUTE",
                status: "NEEDS_INFO",
              },
            });
            throw new Error("rollback both layers");
          }),
          /rollback both layers/,
        );
        assert.equal(await db.orderLog.count(), logsBefore);
        assert.equal(
          await db.disputeCase.count({ where: { orderId: nested.id } }),
          0,
        );
        assert.equal(
          (
            await db.order.findUnique({
              where: { id: nested.id },
              select: { productTitle: true },
            })
          ).productTitle,
          "Nested Title",
        );
        await db.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: nested.id },
            data: { status: "confirmed", preDisputeStatus: "confirmed" },
          });
          await tx.order.updateMany({
            where: { id: nested.id },
            data: { status: "disputed", version: { increment: 1 } },
          });
          await tx.disputeCase.create({
            data: {
              orderId: nested.id,
              createdBy: "nested-buyer",
              reason: "test",
              disputeType: "BUYER_DISPUTE",
              status: "NEEDS_INFO",
            },
          });
        });
        const disputed = await db.order.findUnique({
          where: { id: nested.id },
          include: { dispute: true },
        });
        assert.equal(disputed.preDisputeStatus, "confirmed");
        assert.equal(disputed.dispute.status, "NEEDS_INFO");
        const nestedDispute = await db.checkout.findUnique({
          where: { id: created.id },
          select: {
            orders: {
              select: {
                productTitle: true,
                dispute: { select: { status: true, reason: true } },
              },
            },
          },
        });
        assert.deepEqual(nestedDispute.orders[0], {
          productTitle: "Nested Title",
          dispute: { status: "NEEDS_INFO", reason: "test" },
        });
        const disputeWithOrder = await db.disputeCase.findUnique({
          where: { id: disputed.dispute.id },
          include: { order: true },
        });
        assert.equal(disputeWithOrder.order.productTitle, "Nested Title");
        assert.equal(disputeWithOrder.order.preDisputeStatus, "confirmed");
        const beforeStale = await db.orderLog.count({
          where: { orderId: nested.id, action: "ORDER_HISTORY_STATE" },
        });
        assert.equal(
          (
            await db.order.updateMany({
              where: { id: nested.id, version: -1 },
              data: {
                preDisputeStatus: "cancelled",
                version: { increment: 1 },
              },
            })
          ).count,
          0,
        );
        assert.equal(
          await db.orderLog.count({
            where: { orderId: nested.id, action: "ORDER_HISTORY_STATE" },
          }),
          beforeStale,
        );
        await db.disputeCase.update({
          where: { id: disputed.dispute.id },
          data: { decision: "REJECT_REFUND", status: "DECIDED" },
        });
        const {
          resolveHoldState,
        } = require("../src/services/orderTransitionService");
        // The real transition policy restores the recorded status, not 'completed'.
        const state = await resolveHoldState(db, nested.id);
        assert.equal(state.nextStatus, "confirmed");
        await db.order.update({
          where: { id: nested.id },
          data: { status: disputed.preDisputeStatus, preDisputeStatus: null },
        });
        assert.equal(
          (await db.order.findUnique({ where: { id: nested.id } })).status,
          "confirmed",
        );
        await Promise.all(
          ["Concurrent A", "Concurrent B"].map((productTitle) =>
            db.order.update({
              where: { id: nested.id },
              data: { productTitle },
            }),
          ),
        );
        const events = await db.orderLog.findMany({
          where: { orderId: nested.id, action: "ORDER_HISTORY_STATE" },
        });
        const revisions = events.map((row) => JSON.parse(row.detail).revision);
        assert.equal(new Set(revisions).size, revisions.length);
        assert.equal(
          (await db.order.findUnique({ where: { id: nested.id } }))
            .productTitle,
          JSON.parse(
            events.sort(
              (a, b) =>
                JSON.parse(b.detail).revision - JSON.parse(a.detail).revision,
            )[0].detail,
          ).state.productTitle,
        );
      },
    );
    await t.test(
      "cancelled/expired checkout totals and snapshots stay derived from linked orders, and approved FKs reject orphans",
      async () => {
        const order = await db.order.create({
          data: {
            buyerId: "buyer",
            sellerId: "seller",
            productId: "expiry-product",
            orderType: "AUCTION",
            originalAmount: "100.15",
            ordersAmount: "100.05",
          },
        });
        const sessions = createCheckoutSessionService(db, products);
        const expires = await sessions.create({
          buyerId: "buyer",
          orderIds: [order.id],
          addressId: "selected",
          authorization: "Bearer buyer-token",
        });
        const expired = await sessions.get({
          buyerId: "buyer",
          sessionId: expires.id,
          now: new Date(expires.cancelAt.getTime() + 1),
        });
        assert.equal(expired.status, "expired");
        assert.equal(expired.orders[0].status, "payment_expired");
        assert.equal(expired.originalAmount.toString(), "100.15");
        assert.equal(expired.ordersAmount.toString(), "100.05");
        assert.equal(
          expired.shippingAddress.addressLine,
          "Confirmed Shipping Road",
        );
        const data = {
          buyerId: "buyer",
          sellerId: "seller",
          productId: "fk",
          orderType: "BUY_NOW",
          originalAmount: "1",
          ordersAmount: "1",
        };
        for (const patch of [{ checkoutId: "orphan" }, { basketId: "orphan" }])
          await assert.rejects(
            db.order.create({ data: { ...data, ...patch } }),
            (error) => error.code === "P2003",
          );
        await assert.rejects(
          db.orderLog.create({
            data: {
              orderId: "orphan",
              buyerId: "buyer",
              sellerId: "seller",
              actorId: "buyer",
              action: "NOTE",
              detail: "orphan",
            },
          }),
          (error) => error.code === "P2003",
        );
        await assert.rejects(
          db.hold.create({
            data: {
              paymentId: "orphan",
              source: "DISPUTE",
              referenceId: "case",
              holdReason: "test",
              holdStatus: "ON_HOLD",
              holdAmount: "1",
              holdAt: new Date(),
              holdBy: "test",
            },
          }),
          (error) => error.code === "P2003",
        );
        const payment = await db.payment.create({
          data: {
            paymentType: "TEST",
            paymentStatus: "paid",
            paymentAmount: "1.01",
            order: {
              create: {
                ...data,
                originalAmount: "1.01",
                ordersAmount: "1.01",
                productTitle: "Inverse nested order",
              },
            },
          },
          select: { order: { select: { productTitle: true } } },
        });
        assert.deepEqual(payment, {
          order: { productTitle: "Inverse nested order" },
        });
        assert.equal(
          (
            await db.order.createMany({
              data: [
                { id: "bulk1", ...data, productTitle: "Bulk" },
                { id: "bulk1", ...data, productTitle: "Do not overwrite" },
              ],
              skipDuplicates: true,
            })
          ).count,
          1,
        );
        assert.equal(
          (await db.order.findUnique({ where: { id: "bulk1" } })).productTitle,
          "Bulk",
        );
      },
    );
    await t.test(
      "completion job is atomic; retry/restart + crash before ACK use stable ID and real Product deduplicates",
      async () => {
        const before = await orderModel.findById(first.id);
        const result = await orderModel.transitionStatusWithProductSync({
          id: before.id,
          status: "completed",
          expectedVersion: before.version,
          expectedStatuses: ["shipped"],
          actorId: before.buyerId,
          productSync: {
            action: "SET_STATUS",
            productId: before.productId,
            targetStatus: "sold",
          },
        });
        const event = result.attributionEvent;
        assert.ok(event.id);
        assert.equal(event.netAmount.toString(), "0.07");
        const job = await db.orderLog.findUnique({ where: { id: event.id } });
        const immutable = job.detail;
        const now = new Date();
        await assert.rejects(
          outbox.processEvent(event.id, {
            db,
            now,
            client: {
              recordOrderCompleted: async () => {
                throw new Error("Product offline");
              },
            },
          }),
          /offline/,
        );
        assert.equal(
          (await db.attributionJob.findUnique({ where: { id: event.id } }))
            .attempts,
          1,
        );
        assert.deepEqual(await outbox.processPendingEvents({ db, now }), []);
        // Product's persistent code and real uniqueness constraints, isolated in a
        // separate schema of THIS temporary database; no Product/Auth DBs touched.
        const productRoot = path.resolve(ROOT, "../product-service");
        const productURL = `${URL}?schema=product_order_contract`;
        await raw.$executeRawUnsafe(
          "DROP SCHEMA IF EXISTS product_order_contract CASCADE",
        );
        stagedDeploy(productRoot, null, productURL);
        const ProductClient = require(
          path.join(productRoot, "src/generated/prisma-client"),
        ).PrismaClient;
        const productDb = new ProductClient({
          datasources: { db: { url: productURL } },
        });
        t.after(() => productDb.$disconnect());
        process.env.DATABASE_URL_PRODUCT = productURL;
        const productPrismaPath = require.resolve(
          path.join(productRoot, "src/models/prismaClient"),
        );
        require.cache[productPrismaPath] = {
          id: productPrismaPath,
          filename: productPrismaPath,
          loaded: true,
          exports: productDb,
        };
        const { createCampaignMetricsService } = require(
          path.join(productRoot, "src/features/campaigns/campaignMetrics"),
        );
        const metrics = createCampaignMetricsService(productDb);
        await productDb.campaign.create({
          data: {
            id: "campaign",
            code: "HISTORY",
            name: "Order probe",
            discountType: "FIXED",
            discountValue: 1,
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 86400000),
            createdById: "test",
            status: "published",
          },
        });
        const sent = [];
        const product = await listen(async (req, res) => {
          const buffers = [];
          for await (const chunk of req) buffers.push(chunk);
          try {
            const payload = JSON.parse(Buffer.concat(buffers).toString());
            sent.push(payload.eventId);
            const result = await metrics.recordOrderCompletedEvent(payload);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(error.status || 500, {
              "Content-Type": "application/json",
            });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        process.env.PRODUCT_SERVICE_URL = product.url;
        const restartedRaw = client();
        const restarted = compose(restartedRaw);
        try {
          const actualProductClient = require("../src/services/productClient");
          const failingAckDb = new Proxy(restarted, {
            get(target, key) {
              if (key === "orderLog")
                return new Proxy(target.orderLog, {
                  get(delegate, method) {
                    if (method === "create")
                      return async () => {
                        throw new Error("crash before ACK");
                      };
                    return delegate[method];
                  },
                });
              return target[key];
            },
          });
          await assert.rejects(
            outbox.processEvent(event.id, {
              db: failingAckDb,
              client: actualProductClient,
            }),
            /crash before ACK/,
          );
          assert.equal(
            await productDb.campaignAttribution.count({
              where: { orderId: first.id },
            }),
            1,
          );
          assert.equal(
            (
              await restarted.attributionJob.findUnique({
                where: { id: event.id },
              })
            ).processedAt,
            null,
          );
          const results = await outbox.processPendingEvents({
            db: restarted,
            client: actualProductClient,
            now: new Date(now.getTime() + 5000),
          });
          assert.equal(
            results[0].status,
            "fulfilled",
            String(results[0].reason),
          );
          assert.equal(
            await productDb.campaignAttribution.count({
              where: { orderId: first.id },
            }),
            1,
          );
          assert.equal(
            (
              await productDb.campaignAttribution.aggregate({
                where: { orderId: first.id },
                _sum: { discountAmount: true },
              })
            )._sum.discountAmount.toString(),
            "0.03",
          );
          assert.deepEqual(sent, [event.id, event.id]);
          assert.ok(
            (
              await restarted.attributionJob.findUnique({
                where: { id: event.id },
              })
            ).processedAt,
          );
          assert.equal(
            (await db.orderLog.findUnique({ where: { id: event.id } })).detail,
            immutable,
          );
          assert.equal(
            await db.orderLog.count({
              where: { orderId: first.id, action: "ATTRIBUTION_ACK" },
            }),
            1,
          );
        } finally {
          await product.close();
          await restartedRaw.$disconnect();
          await productDb.$disconnect();
        }
        const failedOrder = await db.order.create({
          data: {
            buyerId: "buyer",
            sellerId: "seller",
            productId: "atomic",
            orderType: "BUY_NOW",
            originalAmount: "10",
            ordersAmount: "9",
            campaignId: "campaign",
            status: "shipped",
          },
        });
        await assert.rejects(
          db.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: failedOrder.id },
              data: { status: "completed" },
            });
            await tx.orderLog.create({
              data: orderModel.logData(
                failedOrder,
                "buyer",
                "ATTRIBUTION_REQUESTED",
                {
                  schema_version: 1,
                  campaignId: "campaign",
                  grossAmount: "10",
                  discountAmount: "1",
                  netAmount: "9",
                  completedAt: new Date(),
                },
              ),
            });
            throw new Error("rollback job and order");
          }),
          /rollback job/,
        );
        assert.equal(
          (await db.order.findUnique({ where: { id: failedOrder.id } })).status,
          "shipped",
        );
        assert.equal(
          await db.attributionJob.count({ where: { orderId: failedOrder.id } }),
          0,
        );
      },
    );
    await t.test(
      "populated baseline upgrade retains differing checkout/shipping snapshots, metadata and processed/pending jobs",
      async () => {
        await reset(raw);
        stagedDeploy(ROOT, "20261014020000", URL);
        const json = JSON.stringify(ADDRESS);
        await raw.$executeRaw`INSERT INTO checkouts(checkout_id,buyer_id,address_id,address_snapshot,original_amount,orders_amount,status,cancel_at,updated_at) VALUES ('old-checkout','buyer','old-address',${json}::jsonb,10.15,9.12,'paid',now(),now())`;
        for (const id of ["old-pending", "old-processed"]) {
          await raw.$executeRaw`INSERT INTO orders(order_id,buyer_id,seller_id,product_id,order_type,original_amount,orders_amount,status,product_title,campaign_code,pre_dispute_status,updated_at) VALUES (${id},'buyer','seller',${id},'BUY_NOW',10.15,9.12,'disputed','Historical Title','Historical Code','shipped',now())`;
          await raw.$executeRaw`INSERT INTO attribution_outbox_events(id,order_id,campaign_id,gross_amount,discount_amount,net_amount,completed_at,attempts,last_error,next_attempt_at,processed_at,updated_at) VALUES (${id + "-event"},${id},'campaign',10.15,1.03,9.12,'2026-08-01T12:00:00Z',3,'503','2026-08-01T12:05:00Z',${id === "old-processed" ? new Date("2026-08-01T12:03:00Z") : null},now())`;
        }
        await raw.$executeRaw`UPDATE orders SET checkout_id='old-checkout' WHERE order_id='old-pending'`;
        const shippingSnapshot = JSON.stringify({
          ...ADDRESS,
          addressLine: "Historical Shipping Different",
        });
        await raw.$executeRaw`INSERT INTO shipping(shipping_id,order_id,address_id,address_snapshot,status,updated_at) VALUES ('old-shipping','old-pending','old-shipping-address',${shippingSnapshot}::jsonb,'pending',now())`;
        await raw.$executeRaw`INSERT INTO order_log(order_log_id,order_id,seller_id,buyer_id,actor_id,action,detail) VALUES ('untouched-audit','old-pending','seller','buyer','buyer','NOTE','Original historical text')`;
        cli(["prisma/migrate.js"]);
        const row = await db.order.findUnique({
          where: { id: "old-pending" },
          include: { checkout: true, shipping: true },
        });
        assert.equal(row.productTitle, "Historical Title");
        assert.equal(row.campaignCode, "Historical Code");
        assert.equal(row.preDisputeStatus, "shipped");
        assert.equal(
          row.checkout.addressSnapshot.addressLine,
          ADDRESS.addressLine,
        );
        assert.equal(
          row.shipping.addressSnapshot.addressLine,
          "Historical Shipping Different",
        );
        assert.equal(row.checkout.originalAmount.toString(), "10.15");
        assert.equal(row.checkout.ordersAmount.toString(), "9.12");
        assert.equal(
          (await db.orderLog.findUnique({ where: { id: "untouched-audit" } }))
            .detail,
          "Original historical text",
        );
        const pending = await db.attributionJob.findUnique({
          where: { id: "old-pending-event" },
        });
        assert.equal(pending.attempts, 3);
        assert.equal(pending.lastError, "503");
        assert.equal(
          pending.nextAttemptAt.toISOString(),
          "2026-08-01T12:05:00.000Z",
        );
        assert.equal(pending.processedAt, null);
        const processed = await db.attributionJob.findUnique({
          where: { id: "old-processed-event" },
        });
        assert.equal(
          processed.processedAt.toISOString(),
          "2026-08-01T12:03:00.000Z",
        );
        assert.equal(processed.attempts, 3);
        const sent = [];
        const results = await outbox.processPendingEvents({
          db,
          client: {
            recordOrderCompleted: async (event) => sent.push(event.eventId),
          },
        });
        assert.equal(results.length, 1);
        assert.equal(results[0].status, "fulfilled");
        assert.deepEqual(sent, ["old-pending-event"]);
        const columns =
          await raw.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='orders' AND column_name IN ('product_title','campaign_code','pre_dispute_status')) OR (table_name='checkouts' AND column_name IN ('original_amount','orders_amount','address_snapshot')) OR (table_name='shipping' AND column_name='address_snapshot') OR table_name='attribution_outbox_events')`;
        assert.deepEqual(columns, []);
        assert.equal(
          (
            await raw.$queryRaw`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='dispute_case'`
          )[0].count,
          9,
        );
      },
    );
    await t.test(
      "unrepresentable upgrades and unknown legacy baselines stop without data loss or bypassing the helper",
      async () => {
        await reset(raw);
        stagedDeploy(ROOT, "20261014020000", URL);
        const snapshot = JSON.stringify(ADDRESS);
        await raw.$executeRaw`INSERT INTO checkouts(checkout_id,buyer_id,address_id,address_snapshot,original_amount,orders_amount,status,cancel_at,updated_at) VALUES ('unlinked','buyer','address',${snapshot}::jsonb,123.45,123.45,'pending',now(),now())`;
        const failed = spawnSync(process.execPath, ["prisma/migrate.js"], {
          cwd: ROOT,
          env: env(),
          encoding: "utf8",
        });
        assert.notEqual(failed.status, 0);
        assert.match(
          failed.stdout + failed.stderr,
          /Order migration deploy failed/,
        );
        const saved =
          await raw.$queryRaw`SELECT address_snapshot,original_amount FROM checkouts WHERE checkout_id='unlinked'`;
        assert.deepEqual(saved[0].address_snapshot, ADDRESS);
        assert.equal(saved[0].original_amount.toString(), "123.45");
        assert.equal(
          await raw.orderLog.count({
            where: { action: "CHECKOUT_ADDRESS_STATE" },
          }),
          0,
        );
        await reset(raw);
        await raw.$executeRawUnsafe(
          "CREATE TABLE legacy_unmapped (id text PRIMARY KEY)",
        );
        await raw.$executeRawUnsafe(
          "INSERT INTO legacy_unmapped VALUES ('preserved')",
        );
        const blocked = spawnSync(process.execPath, ["prisma/migrate.js"], {
          cwd: ROOT,
          env: env(),
          encoding: "utf8",
        });
        assert.notEqual(blocked.status, 0);
        assert.match(blocked.stderr, /cutover BLOCKED/);
        assert.deepEqual(
          await raw.$queryRawUnsafe("SELECT id FROM legacy_unmapped"),
          [{ id: "preserved" }],
        );
        await reset(raw);
        cli(["prisma/migrate.js"]);
      },
    );
  },
);
