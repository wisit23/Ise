import {
  canPurchaseProduct,
  getAccessTokenClaims,
  isCustomerAccountRoles,
  isValidRoleCombinationRoles,
  resolvePostLoginPath,
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

function accessTokenFor(roles, role = roles[0]) {
  const payload = btoa(JSON.stringify({ sub: "user-1", role, roles }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

describe("post-login routing", () => {
  test("sends Marketing to the Marketing workspace by default", () => {
    expect(
      resolvePostLoginPath({
        accessToken: accessTokenFor(["MARKETING"]),
        user: { role: "MARKETING" },
      }),
    ).toBe("/marketing");
  });

  test("keeps a safe internal destination that the account may access", () => {
    expect(
      resolvePostLoginPath({
        accessToken: accessTokenFor(["SELLER"]),
        user: { role: "SELLER" },
        requestedDestination: "/seller/onboarding?step=documents",
      }),
    ).toBe("/seller/onboarding?step=documents");
  });

  test.each([
    "https://example.com/steal-session",
    "//example.com/steal-session",
    "/\\example.com/steal-session",
    "/login",
  ])(
    "rejects unsafe destination %s and uses the role fallback",
    (destination) => {
      expect(
        resolvePostLoginPath({
          accessToken: accessTokenFor(["MARKETING"]),
          user: { role: "MARKETING" },
          requestedDestination: destination,
        }),
      ).toBe("/marketing");
    },
  );

  test("rejects an internal destination that the role cannot access", () => {
    expect(
      resolvePostLoginPath({
        accessToken: accessTokenFor(["BUYER"]),
        user: { role: "BUYER" },
        requestedDestination: "/marketing?section=campaigns",
      }),
    ).toBe("/");
  });

  test.each([
    [["BUYER"], "/"],
    [["SELLER"], "/"],
    [["ADMIN"], "/"],
    [["CUSTOMER_SERVICE"], "/"],
    [["TRUST_AND_SAFETY"], "/"],
    [["EXECUTIVE"], "/executive"],
    [["BUYER", "SELLER"], "/"],
  ])("keeps the existing default for roles %j", (roles, expectedPath) => {
    expect(
      resolvePostLoginPath({
        accessToken: accessTokenFor(roles),
        user: { role: roles[0] },
      }),
    ).toBe(expectedPath);
  });

  test("uses the signed token roles instead of a conflicting stored legacy role", () => {
    expect(
      resolvePostLoginPath({
        accessToken: accessTokenFor(["MARKETING"]),
        user: { role: "BUYER" },
      }),
    ).toBe("/marketing");
  });
});
