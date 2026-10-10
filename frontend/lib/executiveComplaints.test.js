import { parseComplaintResponse, actionLabel } from "./executiveComplaints";

const report = {
  id: "r1",
  status: "ACTIONED",
  reason: "Report",
  reportedAt: "2026-10-09T03:00:00.000Z",
};
const response = (item) => ({
  data: { items: [item], statusCounts: {}, totalOpen: 0 },
});

it.each([
  { total: 10, page: 1, limit: 5, totalPages: 1 },
  { total: 10, page: 0, limit: 5, totalPages: 2 },
  { total: 10, page: 1 },
  { total: 1, page: 1, limit: "5", totalPages: 1 },
])("rejects inconsistent pagination metadata", (pagination) => {
  expect(() =>
    parseComplaintResponse({
      data: { ...response(report).data, ...pagination },
    }),
  ).toThrow("ข้อมูลข้อร้องเรียน");
});

it.each([
  { ...report, reportedAt: "invalid" },
  { ...report, status: ["OPEN"] },
  { ...report, reporterName: {} },
  { ...report, actionDetails: { actorId: "staff", reason: [] } },
])("rejects invalid report field types at the API boundary", (item) => {
  expect(() => parseComplaintResponse(response(item))).toThrow(
    "ข้อมูลข้อร้องเรียน",
  );
});

it("does not show action details for an unfinished report even if stale fields are present", () => {
  const data = parseComplaintResponse(
    response({
      ...report,
      status: "REVIEWED",
      actionTaken: "WARN_USER",
      actionDetails: {
        actorId: "staff",
        actorName: "Staff",
        reason: "Old decision",
      },
    }),
  );
  expect(data.items[0].actionTaken).toBeNull();
  expect(data.items[0].actionDetails).toBeNull();
  expect(actionLabel(data.items[0])).toBe("-");
});

it.each(["FUTURE_ACTION", "constructor"])(
  "handles an unknown action %s without claiming it is a known sanction",
  (actionTaken) => {
    expect(actionLabel({ ...report, actionTaken })).toBe("ไม่ทราบการดำเนินการ");
  },
);
