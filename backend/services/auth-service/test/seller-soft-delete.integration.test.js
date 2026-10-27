const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../src/models/prismaClient");
const auth = require("../src/services/authService");
const addresses = require("../src/features/profileAddresses/profileAddressService");

test("deleted seller questions and addresses remain stored but cannot be used", async (t) => {
  if (!process.env.SELLER_SOFT_DELETE_TEST_DB) {
    t.skip("Requires an isolated database prepared by the rehearsal script");
    return;
  }
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      passwordHash: "fixture",
      firstName: "Test",
      lastName: "Seller",
      sellerProfile: { create: { shopName: "Test shop" } },
    },
  });
  try {
    const message = await auth.createAutoMessage(id, {
      messageText: "Available?",
    });
    await assert.rejects(
      auth.deleteAutoMessage("another-seller", message.id),
      (error) => error.status === 404,
    );
    await auth.deleteAutoMessage(id, message.id);
    const stored = await prisma.autoMessage.findUnique({
      where: { id: message.id },
    });
    assert.ok(stored.deletedAt);
    assert.equal(stored.messageText, "Available?");
    assert.equal(stored.isActive, false);
    assert.deepEqual(await auth.listMyAutoMessages(id), []);
    assert.deepEqual(await auth.getPublicAutoMessages(id), []);
    await assert.rejects(
      auth.updateAutoMessage(id, message.id, { isActive: true }),
      (error) => error.status === 404,
    );
    // Deleted questions do not consume the seller's 20-question limit.
    await prisma.autoMessage.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        userId: id,
        messageText: `Question ${index}`,
      })),
    });
    await auth.createAutoMessage(id, { messageText: "Question 20" });
    await assert.rejects(
      auth.createAutoMessage(id, { messageText: "Question 21" }),
      (error) => error.status === 409,
    );
    assert.equal(await prisma.autoMessage.count({ where: { userId: id } }), 21);

    const input = {
      recipientName: "Test",
      phone: "0812345678",
      addressLine: "1",
      subdistrict: "Test",
      district: "Test",
      province: "Test",
      postalCode: "10110",
    };
    const first = await addresses.create(id, input);
    const second = await addresses.create(id, input);
    await addresses.remove(id, first.id);
    assert.ok(
      (await prisma.userAddress.findUnique({ where: { id: first.id } }))
        .deletedAt,
    );
    assert.equal(
      (await prisma.userAddress.findUnique({ where: { id: first.id } }))
        .isDefault,
      false,
    );
    assert.equal((await addresses.list(id))[0].id, second.id);
    assert.equal((await addresses.list(id))[0].isDefault, true);
    await assert.rejects(
      addresses.setDefault(id, first.id),
      (error) => error.status === 404,
    );
    await assert.rejects(
      addresses.update(id, first.id, { province: "Changed" }),
      (error) => error.status === 404,
    );
    await addresses.remove(id, second.id);
    assert.equal((await addresses.list(id)).length, 0);
    assert.equal((await addresses.create(id, input)).isDefault, true);
  } finally {
    await prisma.autoMessage.deleteMany({ where: { userId: id } });
    await prisma.userAddress.deleteMany({ where: { userId: id } });
    await prisma.sellerProfile.delete({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    await prisma.$disconnect();
  }
});
