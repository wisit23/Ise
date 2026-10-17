const { badRequest } = require("@reloop/shared");

const ROUND_TIME_FIELDS = [
  "submissionStartsAt", "submissionEndsAt", "auctionStartsAt", "auctionEndsAt",
];

function parseRoundTimes(input) {
  return Object.fromEntries(ROUND_TIME_FIELDS.map((field) => {
    const value = input?.[field];
    const date = typeof value === "string" ? new Date(value) : new Date(NaN);
    if (!Number.isFinite(date.getTime())) throw badRequest("กรุณาระบุเวลาของรอบให้ครบและถูกต้อง");
    return [field, date];
  }));
}

function validateRoundTimeEdit(round, times, now) {
  if (round.cancelledAt || new Date(round.auctionEndsAt) <= now) {
    throw badRequest("ไม่สามารถแก้รอบที่สิ้นสุดหรือยกเลิกแล้วได้");
  }
  if (!(times.submissionStartsAt < times.submissionEndsAt &&
        times.submissionEndsAt <= times.auctionStartsAt && times.auctionStartsAt < times.auctionEndsAt)) {
    throw badRequest("เวลาต้องเรียง: เริ่มรับ < ปิดรับ ≤ เริ่มประมูล < ปิดประมูล");
  }
  for (const field of ROUND_TIME_FIELDS) {
    if (new Date(round[field]).getTime() === times[field].getTime()) continue;
    if (field !== "auctionEndsAt" && new Date(round[field]) <= now) {
      throw badRequest("ช่วงเวลานี้เริ่มหรือสิ้นสุดแล้ว ไม่สามารถเปลี่ยนกลับได้");
    }
    if (times[field] <= now) throw badRequest("เวลาใหม่ต้องอยู่หลังเวลาปัจจุบัน");
  }
}

function getItemScheduleEdit(item, times, now) {
  if (["closed", "cancelled", "rejected"].includes(item.status) || item.winningOrderId ||
      (item.scheduledEndAt && new Date(item.scheduledEndAt) <= now)) return null;
  const protectedEnd = item.softCloseEndsAt ? new Date(item.softCloseEndsAt) : null;
  const scheduledEndAt = protectedEnd && protectedEnd > times.auctionEndsAt
    ? protectedEnd : times.auctionEndsAt;
  const started = item.status === "open" || item.openedAt ||
    (item.scheduledStartAt && new Date(item.scheduledStartAt) <= now);
  return {
    scheduledStartAt: started ? item.scheduledStartAt : times.auctionStartsAt,
    scheduledEndAt,
  };
}

module.exports = { ROUND_TIME_FIELDS, parseRoundTimes, validateRoundTimeEdit, getItemScheduleEdit };
