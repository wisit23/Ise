import {
  canPurchaseProduct,
  getAccessTokenClaims,
  isCustomerAccountRoles,
  isValidRoleCombinationRoles,
} from "./auth";

describe("customer/staff account policy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("BUYER and SELLER customer roles may purchase", () => {
    expect(isCustomerAccountRoles(["BUYER"])).toBe(true);
    expect(isCustomerAccountRoles(["SELLER"])).toBe(true);
    expect(isCustomerAccountRoles(["BUYER", "SELLER"])).toBe(true);
  });

  test("staff and mixed staff/customer roles may not purchase", () => {
    expect(isCustomerAccountRoles(["EXECUTIVE"])).toBe(false);
    expect(isCustomerAccountRoles(["MARKETING"])).toBe(false);
    expect(isCustomerAccountRoles(["BUYER", "EXECUTIVE"])).toBe(false);
    expect(isCustomerAccountRoles(["BUYER", "UNKNOWN_ROLE"])).toBe(false);
    expect(isCustomerAccountRoles([])).toBe(false);
  });

  test("accepts only supported customer combinations or one staff role", () => {
    expect(isValidRoleCombinationRoles(["BUYER", "SELLER"])).toBe(true);
    expect(isValidRoleCombinationRoles(["EXECUTIVE"])).toBe(true);
    expect(isValidRoleCombinationRoles(["EXECUTIVE", "MARKETING"])).toBe(false);
    expect(isValidRoleCombinationRoles(["BUYER", "EXECUTIVE"])).toBe(false);
    expect(isValidRoleCombinationRoles(["UNKNOWN_ROLE"])).toBe(false);
  });

  test("a seller cannot purchase their own product", () => {
    expect(
      canPurchaseProduct({
        isAuthenticated: true,
        userId: "seller-1",
        roles: ["SELLER"],
        sellerId: "seller-1",
      }),
    ).toBe(false);
    expect(
      canPurchaseProduct({
        isAuthenticated: true,
        userId: "seller-2",
        roles: ["SELLER"],
        sellerId: "seller-1",
      }),
    ).toBe(true);
  });

  test("guests retain the existing login purchase call-to-action", () => {
    expect(
      canPurchaseProduct({
        isAuthenticated: false,
        userId: null,
        roles: [],
        sellerId: "seller-1",
      }),
    ).toBe(true);
  });

  test("authenticated accounts fail closed when profile storage is missing", () => {
    expect(
      canPurchaseProduct({
        isAuthenticated: true,
        userId: null,
        roles: ["EXECUTIVE"],
        sellerId: "seller-1",
      }),
    ).toBe(false);
  });

  test("decodes base64url access-token claims", () => {
    const payload = btoa(JSON.stringify({ sub: "user-1", roles: ["BUYER"] }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    localStorage.setItem("reloop_access_token", `header.${payload}.signature`);

    expect(getAccessTokenClaims()).toMatchObject({
      sub: "user-1",
      roles: ["BUYER"],
    });
  });
});
