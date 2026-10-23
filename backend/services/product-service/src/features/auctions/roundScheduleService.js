const { badRequest, forbidden, conflict, notFound } = require("@reloop/shared");
const repository = require("./auctionRepository");
const queue = require("../../jobs/auctionCloseQueue");
const chatClient = require("./chatClient");
const auditService = require("../audit/marketingAuditService");
const { ROUND_TIME_FIELDS, parseRoundTimes, validateRoundTimeEdit, getItemScheduleEdit } = require("./roundSchedulePolicy");

function createRoundScheduleService(deps = {}) {
  const repo = deps.repository || repository;
  const closeQueue = deps.queue || queue;
  const chat = deps.chatClient || chatClient;
  const recordAudit = deps.recordAudit || auditService.recordMarketingAudit;
  const clock = deps.clock || (() => new Date());

  async function updateRound({ user, roundId, input }) {
    if (user?.role !== "MARKETING") throw forbidden("เฉพาะฝ่ายการตลาดเท่านั้นที่แก้เวลารอบได้");
    const times = parseRoundTimes(input);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey || "")) {
      throw badRequest("ต้องมีรหัสคำขอแก้เวลาที่ถูกต้อง");
    }
    const request = Object.fromEntries(ROUND_TIME_FIELDS.map(field => [field, times[field].toISOString()]));
    const auditKey = `AUCTION_ROUND_UPDATE:${roundId}:${input.idempotencyKey}`;
    const result = await repo.withRoundLock(roundId, async tx => {
      const prior = await tx.marketingAuditLog.findUnique({ where: { idempotencyKey: auditKey } });
      if (prior) {
        if (prior.actorId !== user.id || ROUND_TIME_FIELDS.some(field => prior.metadata.request[field] !== request[field])) {
          throw conflict("รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว");
        }
        return { round: prior.newState, metadata: prior.metadata, replay: true };
      }
      const round = await tx.auctionRound.findUnique({ where: { id: roundId } });
      if (!round) throw notFound("ไม่พบรอบประมูล");
      if (!input.expectedUpdatedAt || new Date(input.expectedUpdatedAt).getTime() !== round.updatedAt.getTime()) {
        throw conflict("รอบถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่ก่อนแก้เวลา");
      }
      const now = clock();
      validateRoundTimeEdit(round, times, now);
      const changedFields = ROUND_TIME_FIELDS.filter(field => new Date(round[field]).getTime() !== times[field].getTime());
      if (!changedFields.length) return { round, metadata: null, replay: false };
      const auctions = await tx.auctionItem.findMany({ where: { roundId }, include: { bids: true, product: { select: { title: true } } } });
      const auctionTimeChanged = changedFields.some(field => field === "auctionStartsAt" || field === "auctionEndsAt");
      const affectedItems = [];
      if (auctionTimeChanged) {
        for (const item of auctions) {
          const schedule = getItemScheduleEdit(item, times, now);
          if (!schedule) continue;
          // Do not infer an anti-sniping floor from a legacy manual schedule.
          if (!item.softCloseEndsAt && item.scheduledEndAt && new Date(item.scheduledEndAt) > round.auctionEndsAt &&
              schedule.scheduledEndAt < new Date(item.scheduledEndAt)) {
            throw conflict("รายการเดิมมีเวลาปิดเกินรอบที่ยังไม่ระบุที่มา กรุณาตรวจสอบก่อนลดเวลา");
          }
          if (new Date(item.scheduledEndAt).getTime() === schedule.scheduledEndAt.getTime() &&
              new Date(item.scheduledStartAt).getTime() === new Date(schedule.scheduledStartAt).getTime()) continue;
          await tx.auctionItem.update({ where: { id: item.id }, data: schedule });
          affectedItems.push({ id: item.id, title: item.product?.title || item.id, sellerId: item.sellerId, closesAt: schedule.scheduledEndAt.toISOString(),
            bidderIds: [...new Set(item.bids.map(bid => bid.bidderId))] });
        }
      }
      const updated = await tx.auctionRound.update({ where: { id: roundId }, data: times });
      const metadata = { request, changedFields, affectedItems,
        previousTimes: Object.fromEntries(ROUND_TIME_FIELDS.map(field => [field, new Date(round[field]).toISOString()])),
        sellerIds: [...new Set(auctions.map(item => item.sellerId).filter(Boolean))] };
      await recordAudit({ actorId: user.id, actorRole: user.role, action: "AUCTION_ROUND_UPDATE",
        entityType: "AUCTION_ROUND", entityId: roundId, previousState: round, newState: updated,
        metadata, idempotencyKey: auditKey }, { tx });
      return { round: updated, metadata, previous: round, replay: false };
    });
    const warnings = [];
    if (result.metadata) {
      // Re-read under the bid/close lock so a retry never schedules an obsolete end.
      for (const item of result.metadata.affectedItems) {
        try {
          await repo.withAuctionLock(item.id, async tx => {
            const current = await tx.auctionItem.findUnique({ where: { id: item.id } });
            if (current && ["scheduled", "open"].includes(current.status)) {
              await closeQueue.scheduleClose(current.id, current.scheduledEndAt,
                current.status === "scheduled" ? current.scheduledStartAt : undefined);
            }
          });
        } catch {
          warnings.push("บันทึกเวลาแล้ว แต่ปรับงานปิดประมูลไม่ครบ กรุณากดส่งซ้ำ");
        }
      }
      const notification = await chat.notifyRoundUpdated({ round: result.round,
        previous: result.previous, metadata: result.metadata, eventId: auditKey });
      warnings.push(...notification.warnings);
    }
    return { ...result.round, warnings: [...new Set(warnings)], idempotentRetry: result.replay };
  }
  return { updateRound };
}

module.exports = createRoundScheduleService();
module.exports.createRoundScheduleService = createRoundScheduleService;
