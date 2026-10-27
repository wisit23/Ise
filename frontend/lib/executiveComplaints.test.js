import {
  parseComplaintResponse,
  actionLabel,
  describeReport,
  reportedPartyName,
} from "./executiveComplaints";

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

it.each([
  ["SUSPEND_USER", "ระงับบัญชีผู้ใช้"],
  ["WARN_USER", "เตือนผู้ใช้"],
  ["RESTRICT_BUYER", "เพิกถอนสิทธิ์ซื้อ"],
  ["RESTRICT_SELLER", "เพิกถอนสิทธิ์ขาย"],
  ["REMOVE_PRODUCT", "นำสินค้าออก"],
  ["REMOVE_REVIEW", "ลบรีวิว"],
  ["DISMISS", "ไม่ดำเนินการ"],
])("displays the persisted report decision %s", (actionTaken, label) => {
  const parsed = parseComplaintResponse(
    response({
      ...report,
      status: actionTaken === "DISMISS" ? "DISMISSED" : "ACTIONED",
      actionTaken,
      actionDetails: {
        actorId: "staff-1",
        actorName: "เจ้าหน้าที่",
        reason: "ตรวจสอบแล้วพบการกระทำผิด",
      },
    }),
  ).items[0];
  expect(actionLabel(parsed)).toBe(label);
  expect(parsed.actionDetails).toEqual({
    actorId: "staff-1",
    actorName: "เจ้าหน้าที่",
    reason: "ตรวจสอบแล้วพบการกระทำผิด",
  });
});

it.each(["OPEN", "REVIEWED"])(
  "does not display a sanction before a %s report is completed",
  (status) => {
    expect(
      actionLabel({ ...report, status, actionTaken: "RESTRICT_SELLER" }),
    ).toBe("-");
  },
);

describe("a complaint's product", () => {
  const item = (extra) => ({
    id: "r1",
    status: "OPEN",
    reason: "Report",
    reportedAt: "2026-10-09T03:00:00.000Z",
    productId: "p1",
    ...extra,
  });
  const parsed = (extra) =>
    parseComplaintResponse(response(item(extra))).items[0];

  it("carries the product's name when product-service gave it", () => {
    expect(parsed({ productTitle: "กางเกงยีนส์" }).productTitle).toBe(
      "กางเกงยีนส์",
    );
  });

  it("keeps a deleted product's name and says it is deleted", () => {
    const deleted = parsed({ productTitle: "เสื้อ", productDeleted: true });
    expect(deleted.productTitle).toBe("เสื้อ");
    expect(deleted.productDeleted).toBe(true);
    expect(parsed({ productTitle: "เสื้อ" }).productDeleted).toBeUndefined();
  });

  it("tells a product that is gone from one that could not be asked", () => {
    const gone = parsed({ productTitle: null });
    expect(gone.productTitle).toBeNull();
    expect(gone.productUnavailable).toBeUndefined();
    const down = parsed({ productTitle: null, productUnavailable: true });
    expect(down.productUnavailable).toBe(true);
  });

  it("says nothing about a product when there is none", () => {
    const none = parsed({ productId: null });
    expect("productTitle" in none).toBe(false);
    expect("productUnavailable" in none).toBe(false);
  });
});

describe("describeReport", () => {
  const id = "9ecc319c-9d52-4f5e-8139-135c4da709ba";

  it("reads a report of a review into its topic, comment and the review", () => {
    expect(
      describeReport({
        reason: `[รายงานรีวิว #${id}] [รีวิวเท็จ / ข้อมูลไม่ตรงกับความจริง] มั่วละ (เนื้อหารีวิว: "ของดีมาก")`,
      }),
    ).toEqual({
      kind: "review",
      topic: "รีวิวเท็จ / ข้อมูลไม่ตรงกับความจริง",
      comment: "มั่วละ",
      reviewText: "ของดีมาก",
    });
  });

  it("copes with a review report that has no comment, topic or review text", () => {
    expect(describeReport({ reason: `[รายงานรีวิว #${id}] [อื่นๆ]` })).toEqual({
      kind: "review",
      topic: "อื่นๆ",
      comment: "",
      reviewText: null,
    });
    expect(
      describeReport({ reason: `[รายงานรีวิว #${id}] พูดจาหยาบคาย` }),
    ).toEqual({
      kind: "review",
      topic: null,
      comment: "พูดจาหยาบคาย",
      reviewText: null,
    });
  });

  it("keeps quotes and brackets inside the review's own words", () => {
    const parsed = describeReport({
      reason: `[รายงานรีวิว #${id}] [อื่นๆ] (เนื้อหารีวิว: "ดี (มาก) [จริง] "ๆ"")`,
    });
    expect(parsed.reviewText).toBe('ดี (มาก) [จริง] "ๆ');
  });

  it("leaves any other report as it was written", () => {
    expect(describeReport({ reason: "ร้านไม่ส่งของ" })).toEqual({
      kind: "user",
      comment: "ร้านไม่ส่งของ",
    });
    // The marker has to start the reason, as auth-service writes it.
    expect(
      describeReport({ reason: "ผมเห็น [รายงานรีวิว #x] อยู่ข้างหน้า" }).kind,
    ).toBe("user");
    expect(describeReport({ reason: "" }).kind).toBe("user");
    expect(describeReport({}).kind).toBe("user");
  });
});

describe("reportedPartyName", () => {
  const person = {
    targetName: "นักซื้อ ตัวยง",
    targetShopName: "GG SHOP",
  };

  it("names the person who wrote a reviewed review, not their shop", () => {
    expect(
      reportedPartyName({ ...person, reason: "[รายงานรีวิว #r1] [อื่นๆ]" }),
    ).toBe("นักซื้อ ตัวยง");
  });

  it("keeps naming the shop first for any other report", () => {
    expect(reportedPartyName({ ...person, reason: "ร้านไม่ส่งของ" })).toBe(
      "GG SHOP",
    );
    expect(
      reportedPartyName({ targetName: "สมชาย", reason: "ร้านไม่ส่งของ" }),
    ).toBe("สมชาย");
    expect(reportedPartyName({ reason: "ร้านไม่ส่งของ" })).toBeNull();
  });
});
