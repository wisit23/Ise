import { apiFetch } from "./api";
import { fetchFirstSaleYear, reportYears } from "./executive";

jest.mock("./api", () => ({ apiFetch: jest.fn() }));

// 12:00 Bangkok on 14 October 2026.
const OCT_14_2026 = new Date("2026-10-14T05:00:00.000Z");

describe("reportYears", () => {
  it("runs from the year of the first sale up to this year, newest first", () => {
    expect(reportYears(2024, OCT_14_2026)).toEqual([2026, 2025, 2024]);
  });

  it("offers only this year when the first sale is this year", () => {
    expect(reportYears(2026, OCT_14_2026)).toEqual([2026]);
  });

  it("offers only this year while nothing has sold", () => {
    expect(reportYears(null, OCT_14_2026)).toEqual([2026]);
  });

  it("is not capped: an old first sale keeps every year reachable", () => {
    expect(reportYears(2019, OCT_14_2026)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019,
    ]);
  });

  it("never offers a year that has not started", () => {
    expect(reportYears(2030, OCT_14_2026)).toEqual([2026]);
  });

  it("falls back to the last five years when the first sale is unknown", () => {
    expect(reportYears(undefined, OCT_14_2026)).toEqual([
      2026, 2025, 2024, 2023, 2022,
    ]);
  });

  it("starts the new year at Bangkok midnight, not UTC's", () => {
    // 01:00 Bangkok on 1 January 2027 is still 31 December 2026 in UTC.
    expect(reportYears(2026, new Date("2026-12-31T18:00:00.000Z"))).toEqual([
      2027, 2026,
    ]);
  });
});

describe("fetchFirstSaleYear", () => {
  beforeEach(() => apiFetch.mockReset());

  it("reads the year of the first sale in the report time zone", async () => {
    apiFetch.mockResolvedValue({
      data: { firstSaleAt: "2024-03-10T05:00:00.000Z" },
    });

    expect(await fetchFirstSaleYear("token")).toBe(2024);
    expect(apiFetch).toHaveBeenCalledWith("/api/orders/executive/first-sale", {
      token: "token",
    });
  });

  it("counts a sale just after Bangkok's new year as that year", async () => {
    // 01:00 Bangkok on 1 January 2024, still 31 December 2023 in UTC.
    apiFetch.mockResolvedValue({
      data: { firstSaleAt: "2023-12-31T18:00:00.000Z" },
    });

    expect(await fetchFirstSaleYear("token")).toBe(2024);
  });

  it("answers null while nothing has sold", async () => {
    apiFetch.mockResolvedValue({ data: { firstSaleAt: null } });

    expect(await fetchFirstSaleYear("token")).toBeNull();
  });

  it("answers undefined, not null, when the service cannot say", async () => {
    apiFetch.mockRejectedValue(new Error("order-service unreachable"));
    expect(await fetchFirstSaleYear("token")).toBeUndefined();

    apiFetch.mockResolvedValue({ data: {} });
    expect(await fetchFirstSaleYear("token")).toBeUndefined();

    apiFetch.mockResolvedValue({ data: { firstSaleAt: "not a date" } });
    expect(await fetchFirstSaleYear("token")).toBeUndefined();

    apiFetch.mockResolvedValue(null);
    expect(await fetchFirstSaleYear("token")).toBeUndefined();
  });
});
