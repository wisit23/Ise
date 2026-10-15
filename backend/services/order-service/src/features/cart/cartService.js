const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const products = require("../../services/productClient");
const orders = require("../../models/orderModel");
const { reserveOrder } = require("../checkout/checkoutService");
const {
  authorizeReservation,
} = require("../../services/reservationAuthorization");

function createCartService({
  db = prisma,
  productClient = products,
  orderModel = orders,
  authorize = authorizeReservation,
  orderPlaced = async () => {},
} = {}) {
  async function view(basket) {
    if (basket.order)
      return {
        ...orderModel.view(basket.order),
        id: basket.id,
        basketId: basket.id,
        orderId: basket.order.id,
      };
    const product = await productClient.getProduct(basket.productId);
    if (!product) throw notFound("cart product not found");
    let quote = null;
    if (basket.campaignId) {
      try {
        quote = await productClient.validateVoucherDiscount(basket.campaignId, {
          userId: basket.buyerId,
          price: product.price,
          category: product.category,
        });
      } catch (error) {
        // A cart estimate does not hold a voucher; checkout validates it again.
        if (![400, 404, 409].includes(error.status)) throw error;
      }
    }
    return {
      id: basket.id,
      basketId: basket.id,
      orderId: null,
      buyerId: basket.buyerId,
      productId: basket.productId,
      productTitle: product.title,
      price: Number(product.price),
      finalPrice: Number(quote?.finalPrice ?? product.price),
      discountAmount: Number(quote?.discountAmount || 0),
      campaignId: basket.campaignId,
      campaignCode: quote?.campaignCode || null,
      createdAt: basket.lockAt,
      reservationId: basket.id,
      reservationExpiresAt: basket.unlockAt,
    };
  }

  async function add({ buyerId, productId, campaignId = null }) {
    if (typeof productId !== "string" || !productId.trim())
      throw badRequest("productId is required");
    if (
      campaignId !== null &&
      (typeof campaignId !== "string" || !campaignId.trim())
    )
      throw badRequest("campaignId must be a voucher ID or null");
    const reservation = await productClient.reserveProduct(productId, buyerId);
    try {
      await authorize(reservation);
      const existing = await db.basket.findUnique({
        where: { id: reservation.reservationId },
        include: { order: { include: orderModel.INCLUDE } },
      });
      if (existing) {
        if (existing.buyerId !== buyerId || existing.status !== "locked")
          throw conflict("cart reservation is no longer active");
        return view(existing);
      }
      if (campaignId) {
        const product = await productClient.getProduct(productId);
        if (!product) throw notFound("product not found");
        await productClient.validateVoucherDiscount(campaignId, {
          userId: buyerId,
          price: product.price,
          category: product.category,
        });
      }
      const basket = await db.basket.upsert({
        where: { id: reservation.reservationId },
        create: {
          id: reservation.reservationId,
          buyerId,
          productId,
          campaignId,
          status: "locked",
          lockAt: new Date(),
          unlockAt: new Date(reservation.expiresAt),
        },
        update: {},
        include: { order: { include: orderModel.INCLUDE } },
      });
      return view(basket);
    } catch (error) {
      if (reservation.created || error.code === "P2002") {
        // Never release a reservation another request has already persisted.
        const persisted = await db.basket.findUnique({
          where: { id: reservation.reservationId },
          include: { order: { include: orderModel.INCLUDE } },
        });
        if (
          error.code === "P2002" &&
          persisted?.buyerId === buyerId &&
          persisted.productId === productId &&
          persisted.status === "locked" &&
          persisted.unlockAt > new Date()
        )
          return view(persisted);
        if (!persisted && reservation.created)
          await productClient.releaseProductReservation(
            productId,
            reservation.reservationId,
          );
      }
      throw error;
    }
  }

  async function list({ buyerId, now = new Date() }) {
    const [baskets, legacy] = await Promise.all([
      db.basket.findMany({
        where: {
          buyerId,
          status: "locked",
          unlockAt: { gt: now },
          OR: [
            { order: null },
            { order: { status: { in: ["pending", "pending_payment"] } } },
          ],
        },
        include: { order: { include: orderModel.INCLUDE } },
        orderBy: { lockAt: "desc" },
      }),
      db.order.findMany({
        where: {
          buyerId,
          basketId: null,
          status: { in: ["pending", "pending_payment"] },
        },
        include: orderModel.INCLUDE,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const items = [
      ...(await Promise.all(baskets.map(view))),
      ...legacy.map((row) => ({ ...orderModel.view(row), orderId: row.id })),
    ];
    return { items, total: items.length };
  }

  async function remove({ buyerId, basketId }) {
    const basket = await db.$transaction(async (tx) => {
      const row = await tx.basket.findUnique({ where: { id: basketId } });
      if (!row || row.buyerId !== buyerId)
        throw notFound("cart item not found");
      if (row.status === "cancelled") return row;
      // The same row lock serializes removal with order creation.
      const changed = await tx.basket.updateMany({
        where: { id: basketId, buyerId, status: "locked" },
        data: { status: "locked" },
      });
      if (changed.count !== 1) throw conflict("cart item is no longer active");
      // Read after acquiring the lock: relation predicates evaluated before a
      // PostgreSQL lock wait can still see the pre-checkout snapshot.
      const current = await tx.basket.findUnique({
        where: { id: basketId },
        include: { order: true },
      });
      if (current.order) throw conflict("cart item already has an order");
      await tx.basket.update({
        where: { id: basketId },
        data: { status: "cancelled" },
      });
      return row;
    });
    await productClient.releaseProductReservation(basket.productId, basket.id);
  }

  async function prepare({ buyerId, basketIds, now = new Date() }) {
    if (
      !Array.isArray(basketIds) ||
      !basketIds.length ||
      basketIds.length > 20 ||
      basketIds.some((id) => typeof id !== "string" || !id.trim())
    )
      throw badRequest("basketIds must contain 1 to 20 cart item IDs");
    const result = [];
    // Per-item transactions allow safe retry after a later item fails.
    for (const basketId of new Set(basketIds)) {
      const saved = await db.$transaction(
        async (tx) => {
          const locked = await tx.basket.updateMany({
            where: {
              id: basketId,
              buyerId,
              status: "locked",
              unlockAt: { gt: now },
            },
            data: { status: "locked" },
          });
          if (locked.count !== 1)
            throw conflict("cart item is unavailable or expired");
          const basket = await tx.basket.findUnique({
            where: { id: basketId },
            include: { order: { include: orderModel.INCLUDE } },
          });
          if (basket.order) {
            if (!["pending", "pending_payment"].includes(basket.order.status))
              throw conflict("order is no longer awaiting payment");
            return { order: orderModel.view(basket.order), created: false };
          }
          return reserveOrder(
            {
              buyerId,
              productId: basket.productId,
              campaignId: basket.campaignId,
              basketId,
            },
            {
              productClient,
              authorizeReservation: authorize,
              orderModel: {
                findByReservationId: async (id) =>
                  orderModel.view(
                    await tx.order.findUnique({
                      where: { basketId: id },
                      include: orderModel.INCLUDE,
                    }),
                  ),
                create: async (data) =>
                  orderModel.view(
                    await tx.order.create({
                      data,
                      include: orderModel.INCLUDE,
                    }),
                  ),
              },
            },
          );
        },
        { timeout: 20000 },
      );
      if (saved.created) await orderPlaced(saved.order);
      result.push(saved.order);
    }
    return { items: result };
  }
  return { add, list, remove, prepare };
}
module.exports = { createCartService };
