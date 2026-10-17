import { apiFetch } from "./api";
import { feePercent, fetchMetricsSeries, fetchOverview } from "./executive";

jest.mock("./api", () => ({ apiFetch: jest.fn() }));

describe("feePercent", () => {
  it("turns the fraction the order service sends into a label percentage", () => {
    expect(feePercent(0.03)).toBe(3);
    expect(feePercent(0.025)).toBe(2.5);
    expect(feePercent(0)).toBe(0);
  });

  it("answers null when the rate is not known, rather than guessing", () => {
    expect(feePercent(null)).toBeNull();
    expect(feePercent(undefined)).toBeNull();
    expect(feePercent("0.03")).toBeNull();
    expect(feePercent(Number.NaN)).toBeNull();
  });
});

describe("fee rate from the order service", () => {
  beforeEach(() => apiFetch.mockReset());

  it("fetchMetricsSeries carries the rate the revenue was computed at", async () => {
    apiFetch.mockImplementation(async (path) =>
      path.includes("/orders/")
        ? { data: [], meta: { platformFeeRate: 0.05 } }
        : { data: [] },
    );

    const result = await fetchMetricsSeries(
      { from: "2026-10-01", to: "2026-11-01" },
      "day",
      "token",
    );
    expect(result.feeRate).toBe(0.05);
  });

  it("fetchMetricsSeries has no rate when the order service is down", async () => {
    apiFetch.mockRejectedValue(new Error("down"));

    const result = await fetchMetricsSeries(
      { from: "2026-10-01", to: "2026-11-01" },
      "day",
      "token",
    );
    expect(result.feeRate).toBeNull();
  });

  it("fetchOverview carries the rate from the platform metrics", async () => {
    apiFetch.mockImplementation(async (path) =>
      path.startsWith("/api/orders/executive/metrics?")
        ? { data: { gmv: 1 }, meta: { platformFeeRate: 0.04 } }
        : { data: [] },
    );

    const overview = await fetchOverview("month", "token");
    expect(overview.feeRate).toBe(0.04);
  });

  it("fetchOverview has no rate when platform metrics fail", async () => {
    apiFetch.mockRejectedValue(new Error("down"));

    const overview = await fetchOverview("month", "token");
    expect(overview.feeRate).toBeNull();
  });
});
