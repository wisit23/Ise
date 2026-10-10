const { badRequest, conflict, notFound } = require("@reloop/shared");
const prisma = require("../models/prismaClient");

const SHOP_CHANGE_FIELDS = Object.freeze([
  {
    apiName: "shopName",
    storedName: "shop_name",
    profileField: "shopName",
  },
  {
    apiName: "address",
    storedName: "address",
    profileField: "address",
  },
  {
    apiName: "bankAccount",
    storedName: "bank_account",
    profileField: "bankAccount",
  },
]);

const FIELD_BY_STORED_NAME = new Map(
  SHOP_CHANGE_FIELDS.map((field) => [field.storedName, field]),
);

function cleanComment(comment) {
  if (typeof comment !== "string" || !comment.trim()) {
    throw badRequest("comment is required");
  }
  return comment.trim();
}

function buildChangeItems(input, profile) {
  const items = [];

  for (const field of SHOP_CHANGE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field.apiName)) continue;

    const value = input[field.apiName];
    if (typeof value !== "string" || !value.trim()) {
      throw badRequest(`${field.apiName} must be a non-empty string`);
    }

    const newValue = value.trim();
    const oldValue = profile[field.profileField] ?? null;
    if (newValue === (oldValue ?? "")) continue;

    items.push({
      fieldName: field.storedName,
      oldValue,
      newValue,
    });
  }

  if (items.length === 0) {
    throw badRequest(
      "at least one changed field (shopName, address, bankAccount) is required",
    );
  }

  return items;
}

// Keep the existing API response shape while exposing the normalized item
// records too. This lets the current frontend continue reading req.shopName,
// req.address and req.bankAccount during the database transition.
function serializeRequest(request) {
  const flattened = {
    shopName: null,
    address: null,
    bankAccount: null,
  };

  for (const item of request.items || []) {
    const field = FIELD_BY_STORED_NAME.get(item.fieldName);
    if (field) flattened[field.apiName] = item.newValue;
  }

  return { ...request, ...flattened };
}

function createShopChangeRequestService(prismaClient) {
  async function submit(sellerId, payload = {}) {
    const clean = cleanComment(payload.comment);

    try {
      const request = await prismaClient.$transaction(async (tx) => {
        const [profile, existing] = await Promise.all([
          tx.sellerProfile.findUnique({
            where: { userId: sellerId },
            select: { shopName: true, address: true, bankAccount: true },
          }),
          tx.shopChangeRequest.findFirst({
            where: { sellerId, status: "PENDING" },
            select: { id: true },
          }),
        ]);

        if (!profile) throw notFound("seller profile not found");
        if (existing) {
          throw conflict("you already have a pending change request");
        }

        const items = buildChangeItems(payload, profile);
        return tx.shopChangeRequest.create({
          data: {
            sellerId,
            comment: clean,
            items: { create: items },
          },
          include: { items: true },
        });
      });

      return serializeRequest(request);
    } catch (error) {
      // The partial unique index closes the race between two simultaneous
      // submissions after the application-level pending check above.
      if (error.code === "P2002") {
        throw conflict("you already have a pending change request");
      }
      throw error;
    }
  }

  async function listMine(sellerId) {
    const items = await prismaClient.shopChangeRequest.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { items: true },
    });
    return { items: items.map(serializeRequest) };
  }

  async function listPending() {
    const items = await prismaClient.shopChangeRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        items: true,
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            sellerProfile: {
              select: { shopName: true, address: true, bankAccount: true },
            },
          },
        },
      },
    });
    return { items: items.map(serializeRequest) };
  }

  async function decide(adminId, requestId, { decision, adminNote } = {}) {
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      throw badRequest("decision must be APPROVED or REJECTED");
    }

    const request = await prismaClient.$transaction(async (tx) => {
      const current = await tx.shopChangeRequest.findUnique({
        where: { id: requestId },
        include: { items: true },
      });
      if (!current) throw notFound("change request not found");
      if (current.status !== "PENDING") {
        throw conflict("request has already been decided");
      }

      if (decision === "APPROVED") {
        const profile = await tx.sellerProfile.findUnique({
          where: { userId: current.sellerId },
          select: { shopName: true, address: true, bankAccount: true },
        });
        if (!profile) throw notFound("seller profile not found");

        const patch = {};
        for (const item of current.items) {
          const field = FIELD_BY_STORED_NAME.get(item.fieldName);
          if (!field) {
            throw conflict(`unsupported shop field: ${item.fieldName}`);
          }
          if ((profile[field.profileField] ?? null) !== item.oldValue) {
            throw conflict(
              `${field.apiName} changed after this request was submitted`,
            );
          }
          patch[field.profileField] = item.newValue;
        }

        await tx.sellerProfile.update({
          where: { userId: current.sellerId },
          data: patch,
        });
      }

      const claimed = await tx.shopChangeRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: {
          status: decision,
          adminNote:
            typeof adminNote === "string" && adminNote.trim()
              ? adminNote.trim()
              : null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw conflict("request has already been decided");
      }

      return tx.shopChangeRequest.findUnique({
        where: { id: requestId },
        include: { items: true },
      });
    });

    return serializeRequest(request);
  }

  return { submit, listMine, listPending, decide };
}

module.exports = createShopChangeRequestService(prisma);
module.exports.createShopChangeRequestService = createShopChangeRequestService;
module.exports.serializeRequest = serializeRequest;
module.exports.SHOP_CHANGE_FIELDS = SHOP_CHANGE_FIELDS;
