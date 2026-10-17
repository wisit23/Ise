const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseRoundTimes, validateRoundTimeEdit, getItemScheduleEdit } = require("./roundSchedulePolicy");

const now = new Date("2030-01-01T10:00:00Z");
function round() {
  return { submissionStartsAt: new Date("2030-01-01T11:00:00Z"), submissionEndsAt: new Date("2030-01-01T12:00:00Z"),
    auctionStartsAt: new Date("2030-01-01T13:00:00Z"), auctionEndsAt: new Date("2030-01-01T14:00:00Z") };
}
test("upcoming round permits moving submission start earlier but only into the future", () => {
  const original = round();
  validateRoundTimeEdit(original, { ...original, submissionStartsAt: new Date("2030-01-01T10:30:00Z") }, now);
  assert.throws(() => validateRoundTimeEdit(original, { ...original, submissionStartsAt: now }, now));
});
test("submission may be shortened or extended before auction, but never reopened", () => {
  const original = { ...round(), submissionStartsAt: new Date("2030-01-01T09:00:00Z") };
  for (const time of ["10:30", "12:30"]) validateRoundTimeEdit(original,
    { ...original, submissionEndsAt: new Date(`2030-01-01T${time}:00Z`) }, now);
  assert.throws(() => validateRoundTimeEdit(original, { ...original, submissionStartsAt: new Date("2030-01-01T11:00:00Z") }, now));
  const ended = { ...original, submissionEndsAt: new Date("2030-01-01T09:30:00Z") };
  assert.throws(() => validateRoundTimeEdit(ended, { ...ended, submissionEndsAt: new Date("2030-01-01T11:30:00Z") }, now));
});
test("open auction locks earlier milestones and validates ordering and future end", () => {
  const original = { ...round(), submissionStartsAt: new Date("2030-01-01T07:00:00Z"), submissionEndsAt: new Date("2030-01-01T08:00:00Z"), auctionStartsAt: new Date("2030-01-01T09:00:00Z") };
  validateRoundTimeEdit(original, { ...original, auctionEndsAt: new Date("2030-01-01T10:01:00Z") }, now);
  assert.throws(() => validateRoundTimeEdit(original, { ...original, auctionStartsAt: new Date("2030-01-01T11:00:00Z") }, now));
  assert.throws(() => validateRoundTimeEdit(original, { ...original, auctionEndsAt: now }, now));
  assert.throws(() => validateRoundTimeEdit(round(), { ...round(), submissionEndsAt: round().auctionEndsAt }, now));
});
test("ended and cancelled rounds reject changes", () => {
  assert.throws(() => validateRoundTimeEdit({ ...round(), cancelledAt: now }, round(), now));
  assert.throws(() => validateRoundTimeEdit({ ...round(), auctionEndsAt: now }, round(), now));
  assert.throws(() => parseRoundTimes({ auctionEndsAt: "invalid" }));
});
test("per-item soft-close floor survives extending and then shortening the round", () => {
  const item = { status: "open", scheduledStartAt: new Date("2030-01-01T09:00:00Z"), scheduledEndAt: new Date("2030-01-01T14:05:00Z"), softCloseEndsAt: new Date("2030-01-01T14:05:00Z") };
  const extended = getItemScheduleEdit(item, { ...round(), auctionEndsAt: new Date("2030-01-01T15:00:00Z") }, now);
  assert.equal(extended.scheduledEndAt.toISOString(), "2030-01-01T15:00:00.000Z");
  const shortened = getItemScheduleEdit({ ...item, ...extended }, round(), now);
  assert.equal(shortened.scheduledEndAt.toISOString(), "2030-01-01T14:05:00.000Z");
  assert.equal(shortened.scheduledStartAt, item.scheduledStartAt);
  assert.equal(getItemScheduleEdit({ ...item, softCloseEndsAt: null }, round(), now).scheduledEndAt.getTime(), round().auctionEndsAt.getTime());
});
test("closed, cancelled, rejected, expired and winner-ordered items never change", () => {
  for (const status of ["closed", "cancelled", "rejected"]) assert.equal(getItemScheduleEdit({ status }, round(), now), null);
  assert.equal(getItemScheduleEdit({ status: "open", scheduledEndAt: now }, round(), now), null);
  assert.equal(getItemScheduleEdit({ status: "open", winningOrderId: "order" }, round(), now), null);
});
