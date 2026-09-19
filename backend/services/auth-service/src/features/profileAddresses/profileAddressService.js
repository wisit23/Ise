const { badRequest, notFound } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const REQUIRED_FIELDS = [
  "recipientName",
  "phone",
  "addressLine",
  "subdistrict",
  "district",
  "province",
  "postalCode",
];

function normalizeAddressInput(input = {}, { partial = false } = {}) {
  const data = {};

  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined && partial) continue;
    if (typeof input[field] !== "string" || !input[field].trim()) {
      throw badRequest(`${field} is required`);
    }
    data[field] = input[field].trim();
  }

  if (input.isDefault !== undefined) {
    if (typeof input.isDefault !== "boolean") {
      throw badRequest("isDefault must be a boolean");
    }
    data.isDefault = input.isDefault;
  }

  return data;
}

function createProfileAddressService(prismaClient) {
  function list(userId) {
    return prismaClient.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async function create(userId, input) {
    const data = normalizeAddressInput(input);

    return prismaClient.$transaction(async (tx) => {
      const existingCount = await tx.userAddress.count({ where: { userId } });
      const isDefault = data.isDefault === true || existingCount === 0;

      if (isDefault) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.userAddress.create({
        data: { ...data, isDefault, userId },
      });
    });
  }

  async function update(userId, addressId, input) {
    const existing = await prismaClient.userAddress.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw notFound("address not found");

    const data = normalizeAddressInput(input, { partial: true });
    if (Object.keys(data).length === 0) {
      throw badRequest("at least one address field is required");
    }

    return prismaClient.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.userAddress.update({
        where: { id: addressId },
        data,
      });
    });
  }

  async function setDefault(userId, addressId) {
    const existing = await prismaClient.userAddress.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw notFound("address not found");

    return prismaClient.$transaction(async (tx) => {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.userAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  }

  async function remove(userId, addressId) {
    const existing = await prismaClient.userAddress.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw notFound("address not found");

    await prismaClient.$transaction(async (tx) => {
      await tx.userAddress.delete({ where: { id: addressId } });

      if (existing.isDefault) {
        const nextAddress = await tx.userAddress.findFirst({
          where: { userId },
          orderBy: { createdAt: "asc" },
        });
        if (nextAddress) {
          await tx.userAddress.update({
            where: { id: nextAddress.id },
            data: { isDefault: true },
          });
        }
      }
    });
  }

  return { list, create, update, setDefault, remove };
}

module.exports = createProfileAddressService(prisma);
module.exports.createProfileAddressService = createProfileAddressService;
