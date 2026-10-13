const { Prisma } = require("../../generated/prisma-client");

// Same campaign row lock used by ingestion and claims: no new reservation rule.
async function lockCampaign(client, campaignId) {
  await client.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaignId} FOR UPDATE`;
}

async function withSpentBudget(client, campaign) {
  if (!campaign) return campaign;
  const total = await client.campaignAttribution.aggregate({
    where: { campaignId: campaign.id },
    _sum: { discountAmount: true },
  });
  return { ...campaign, spentBudget: total._sum.discountAmount || new Prisma.Decimal(0) };
}

async function withVoucherBudget(client, voucher) {
  if (!voucher) return voucher;
  return { ...voucher, campaign: await withSpentBudget(client, voucher.campaign) };
}

module.exports = { lockCampaign, withSpentBudget, withVoucherBudget };
