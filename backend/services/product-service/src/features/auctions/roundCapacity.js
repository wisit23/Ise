const { badRequest, conflict } = require("@reloop/shared");

// Submitted items reserve a slot until explicitly rejected or cancelled.
const CAPACITY_ITEM_FILTER = { status: { notIn: ["rejected", "cancelled"] } };
const MAX_DATABASE_INTEGER = 2147483647;

function requireRoundCapacity(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_DATABASE_INTEGER) {
    throw badRequest("จำนวนสินค้าสูงสุดต้องเป็นจำนวนเต็มบวกมากกว่า 0");
  }
  return value;
}

// Caller must hold the round mutation lock through both this check and insertion.
async function assertRoundHasCapacity(round, tx) {
  if (round.maxItems == null) return;
  const count = await tx.auctionItem.count({ where: { roundId: round.id, ...CAPACITY_ITEM_FILTER } });
  if (count >= round.maxItems) throw conflict("รอบประมูลนี้รับสินค้าเต็มแล้ว กรุณาเลือกรอบอื่น");
}

async function addRoundCapacityCounts(rounds, client) {
  const ids = [...new Set(rounds.filter(round => round.maxItems != null).map(round => round.id))];
  if (ids.length === 0) return rounds;
  const counts = await client.auctionItem.groupBy({ by: ["roundId"],
    where: { roundId: { in: ids }, ...CAPACITY_ITEM_FILTER }, _count: { _all: true } });
  const byRound = new Map(counts.map(row => [row.roundId, row._count._all]));
  return rounds.map(round => round.maxItems == null ? round : {
    ...round, submittedItemCount: byRound.get(round.id) || 0,
  });
}

module.exports = { requireRoundCapacity, assertRoundHasCapacity, addRoundCapacityCounts };
