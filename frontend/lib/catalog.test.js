jest.mock("./api", () => ({ apiFetch: jest.fn() }));

describe("active categories", () => {
  let apiFetch;
  let fetchActiveCategories;
  beforeEach(() => {
    jest.resetModules();
    ({ apiFetch } = require("./api"));
    ({ fetchActiveCategories } = require("./catalog"));
  });

  it("excludes empty categories and sorts by available product count", async () => {
    apiFetch
      .mockResolvedValueOnce({ items: ["กระเป๋า", "รองเท้า", "เสื้อผ้า"] })
      .mockResolvedValueOnce({ total: 2 })
      .mockResolvedValueOnce({ total: 0 })
      .mockResolvedValueOnce({ total: 5 });
    await expect(fetchActiveCategories()).resolves.toEqual([
      { name: "เสื้อผ้า", count: 5 },
      { name: "กระเป๋า", count: 2 },
    ]);
  });

  it("rejects failed counts and fetches again on retry instead of caching zero", async () => {
    apiFetch
      .mockResolvedValueOnce({ items: ["กระเป๋า"] })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ total: 3 });
    await expect(fetchActiveCategories()).rejects.toThrow("offline");
    await expect(fetchActiveCategories()).resolves.toEqual([
      { name: "กระเป๋า", count: 3 },
    ]);
  });
});
