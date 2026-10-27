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
    const value = typeof input[field] === "string" ? input[field].trim() : "";
    if (field === "recipientName" && !value)
      throw badRequest("กรุณากรอกชื่อผู้รับ");
    if (field === "phone" && !/^[0-9]{10}$/.test(value)) {
      throw badRequest("เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก");
    }
    if (field === "phone" && !value.startsWith("0")) {
      throw badRequest(
        "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก และต้องขึ้นต้นด้วย 0",
      );
    }
    if (field === "postalCode" && !/^[0-9]{5}$/.test(value)) {
      throw badRequest("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
    }
    if (!value) throw badRequest(`${field} is required`);
    data[field] = value;
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
      where: { deletedAt: null, userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async function create(userId, input) {
    const data = normalizeAddressInput(input);

    return prismaClient.$transaction(async (tx) => {
      const existingCount = await tx.userAddress.count({
        where: { deletedAt: null, userId },
      });
      const isDefault = data.isDefault === true || existingCount === 0;

      if (isDefault) {
        await tx.userAddress.updateMany({
          where: { deletedAt: null, userId, isDefault: true },
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
      where: { id: addressId, userId, deletedAt: null },
    });
    if (!existing) throw notFound("address not found");

    const data = normalizeAddressInput(input, { partial: true });
    if (Object.keys(data).length === 0) {
      throw badRequest("at least one address field is required");
    }

    return prismaClient.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.userAddress.updateMany({
          where: { deletedAt: null, userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.userAddress.update({
        where: { id: addressId, userId, deletedAt: null },
        data,
      });
    });
  }

  async function setDefault(userId, addressId) {
    const existing = await prismaClient.userAddress.findFirst({
      where: { id: addressId, userId, deletedAt: null },
    });
    if (!existing) throw notFound("address not found");

    return prismaClient.$transaction(async (tx) => {
      await tx.userAddress.updateMany({
        where: { deletedAt: null, userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.userAddress.update({
        where: { id: addressId, userId, deletedAt: null },
        data: { isDefault: true },
      });
    });
  }

  async function remove(userId, addressId) {
    const existing = await prismaClient.userAddress.findFirst({
      where: { id: addressId, userId, deletedAt: null },
    });
    if (!existing) throw notFound("address not found");

    await prismaClient.$transaction(async (tx) => {
      await tx.userAddress.update({
        where: { id: addressId, userId, deletedAt: null },
        data: { deletedAt: new Date(), isDefault: false },
      });

      if (existing.isDefault) {
        const nextAddress = await tx.userAddress.findFirst({
          where: { deletedAt: null, userId },
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
