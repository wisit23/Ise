import { toCsv } from "./csv";

const COLUMNS = [
  { key: "metric", label: "ตัวชี้วัด" },
  { key: "value", label: "ค่า" },
];

describe("toCsv", () => {
  it("writes a header row followed by one row per record", () => {
    const csv = toCsv(COLUMNS, [
      { metric: "GMV", value: 1000 },
      { metric: "Orders", value: 2 },
    ]);

    expect(csv).toBe("ตัวชี้วัด,ค่า\r\nGMV,1000\r\nOrders,2");
  });

  it("quotes fields containing a comma so columns do not shift", () => {
    const csv = toCsv(COLUMNS, [{ metric: "รายได้, สุทธิ", value: 5 }]);

    expect(csv).toContain('"รายได้, สุทธิ",5');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = toCsv(COLUMNS, [{ metric: 'ชื่อ "พิเศษ"', value: 1 }]);

    expect(csv).toContain('"ชื่อ ""พิเศษ""",1');
  });

  it("renders null and undefined as an empty field, not the string null", () => {
    const csv = toCsv(COLUMNS, [{ metric: null, value: undefined }]);

    expect(csv).toBe("ตัวชี้วัด,ค่า\r\n,");
  });
});
