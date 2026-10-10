const { createHash } = require("node:crypto");
const { conflict, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

function commandHash(action, productId, reason) {
  return createHash("sha256")
    .update(JSON.stringify({ action, productId, reason: reason.trim() }))
    .digest("hex");
}

function jsonResult(product) {
  return JSON.parse(JSON.stringify(product));
}

function isModerated(product) {
  return Boolean(product.moderatedAt || product.status === "removed");
}

function moderationResult(product) {
  if (!product) return product;
  if (!isModerated(product)) return product;
  return {
    ...product,
    commerceStatus:
      product.status === "removed"
        ? product.preRemovalStatus || "available"
        : product.status,
    status: "removed",
  };
}

async function getProduct(productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { photos: true, videos: true },
  });
  if (!product) throw notFound("product not found");
  const { photos, videos, ...fields } = moderationResult(product);
  delete fields.searchText;
  return {
    ...fields,
    media: [
      ...photos.map((item) => ({
        type: "image",
        url: item.url,
        position: item.position,
      })),
      ...videos.map((item) => ({
        type: "video",
        url: item.url,
        position: item.position,
      })),
    ].sort((a, b) => a.position - b.position),
  };
}

async function restoreCommerceState(tx, product, now = new Date()) {
  let status =
    product.status === "removed"
      ? product.preRemovalStatus || "available"
      : product.status;
  const data = {};
  const auction = ["reserved", "auction"].includes(status)
    ? await tx.auctionItem.findUnique({
        where: { productId: product.id },
        select: { status: true, winningOrderId: true },
      })
    : null;

  if (status === "reserved") {
    const activeReservation = Boolean(
      (product.reservationId &&
        product.reservationExpiresAt &&
        product.reservationExpiresAt > now) ||
      auction?.winningOrderId,
    );
    if (!activeReservation) {
      status = "available";
      Object.assign(data, {
        reservationId: null,
        reservedBy: null,
        reservationExpiresAt: null,
      });
    }
  }

  if (status === "auction") {
    const activeAuction = [
      "draft",
      "pending_approval",
      "approved",
      "scheduled",
      "open",
    ].includes(auction?.status);
    if (!activeAuction) {
      status = auction?.winningOrderId ? "reserved" : "available";
    }
  }

  return { status, data };
}

async function executeCommand({
  action,
  productId,
  reason,
  idempotencyKey,
  mutate,
}) {
  const payloadHash = commandHash(action, productId, reason);

  return prisma.$transaction(async (tx) => {
    // Same-key commands serialize even when two Auth retries arrive together.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;

    const existing = await tx.productModerationCommand.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.action !== action ||
        existing.productId !== productId ||
        existing.payloadHash !== payloadHash
      ) {
        throw conflict(
          "idempotency key was already used with a different moderation command",
        );
      }
      return existing.result;
    }

    // Different moderation keys for the same product must also serialize.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"product:" + productId}))`;

    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw notFound("product not found");
    const updated = await mutate(tx, product);
    const result = jsonResult(updated);
    await tx.productModerationCommand.create({
      data: {
        idempotencyKey,
        action,
        productId,
        payloadHash,
        result,
      },
    });
    return result;
  });
}

async function removeProduct(productId, reason, idempotencyKey) {
  return executeCommand({
    action: "REMOVE_PRODUCT",
    productId,
    reason,
    idempotencyKey,
    async mutate(tx, product) {
      if (isModerated(product)) {
        throw conflict("product has already been removed");
      }
      let commerceStatus = product.status;
      if (product.status === "auction") {
        const auction = await tx.auctionItem.findUnique({
          where: { productId },
          select: { winningOrderId: true },
        });
        await tx.auctionItem.updateMany({
          where: {
            productId,
            status: {
              in: [
                "draft",
                "pending_approval",
                "approved",
                "scheduled",
                "open",
              ],
            },
          },
          data: { status: "cancelled" },
        });
        commerceStatus = auction?.winningOrderId ? "reserved" : "available";
      }
      const changed = await tx.product.updateMany({
        where: {
          id: productId,
          status: product.status,
          moderatedAt: null,
        },
        data: {
          preRemovalStatus: product.status,
          status: commerceStatus,
          moderatedAt: new Date(),
          moderationReason: reason.trim(),
        },
      });
      if (changed.count !== 1) {
        throw conflict("product status changed — reload and retry");
      }
      return moderationResult(
        await tx.product.findUnique({ where: { id: productId } }),
      );
    },
  });
}

async function restoreProduct(productId, reason, idempotencyKey) {
  return executeCommand({
    action: "RESTORE_PRODUCT",
    productId,
    reason,
    idempotencyKey,
    async mutate(tx, product) {
      if (!isModerated(product)) {
        throw conflict("product is not currently removed");
      }
      const restored = await restoreCommerceState(tx, product);
      const changed = await tx.product.updateMany({
        where: {
          id: productId,
          status: product.status,
          moderatedAt: product.moderatedAt,
        },
        data: {
          status: restored.status,
          ...restored.data,
          preRemovalStatus: null,
          moderatedAt: null,
          moderationReason: null,
        },
      });
      if (changed.count !== 1) {
        throw conflict("product status changed — reload and retry");
      }
      return tx.product.findUnique({ where: { id: productId } });
    },
  });
}

module.exports = {
  getProduct,
  removeProduct,
  restoreProduct,
  isModerated,
  restoreCommerceState,
};
