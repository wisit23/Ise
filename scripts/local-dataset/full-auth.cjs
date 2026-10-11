const assert = require("node:assert/strict");
module.exports = async function seedAuth(ctx) {
  const {
    step,
    request,
    token,
    accounts,
    customer,
    image,
    label,
    binary,
    coverage,
    authDb,
  } = ctx;
  await step("full-buyer-preferences-reference", async () => {
    const userId = accounts.buyer.user.id;
    await authDb.buyerProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        favoriteCategory: "เสื้อผ้า",
        stylePreference: "vintage",
        sizePreference: "M",
        brandPreference: "Demo Denim",
      },
    });
    return {
      userId,
      source: "explicit demo master preferences; style quiz is not implemented",
    };
  });
  for (const [index, stage] of ["pending", "verified", "rejected"].entries()) {
    const login = await customer("kyc-" + stage);
    const application = await step("full-kyc-" + stage, async () => {
      const form = new FormData();
      form.append(
        "document",
        await image("DEMO IDENTITY DOCUMENT", [
          "Not a real identity card",
          "Scenario: " + stage,
          "Demo account: " + login.user.email,
        ]),
        "demo-identity-" + stage + ".png",
      );
      for (const [key, value] of Object.entries({
        shopName: "DEMO ร้านตรวจตัวตน " + stage,
        idCardNumber: "000000000000" + index,
        idCardExpiry: "2035-12-31",
        address: "99 ถนนสาธิต กรุงเทพมหานคร",
        bankAccount: "DEMO-BANK-000" + index,
      }))
        form.append(key, value);
      return request("/api/auth/kyc", login.accessToken, form);
    });
    await step("full-kyc-" + stage + "-document-access", async () => {
      await binary(
        "/api/auth/kyc/" + application.applicationId + "/document",
        token("admin"),
      );
      await binary(
        "/api/auth/kyc/" + application.applicationId + "/document",
        token("otherCs"),
        403,
      );
      return { reviewerAllowed: true, unrelatedCsDenied: true };
    });
    if (stage !== "pending")
      await step("full-kyc-" + stage + "-decision", async () => {
        const queue = await request(
          "/api/auth/admin/kyc?status=PENDING&limit=100",
          token("admin"),
        );
        const item = queue.items.find(
          (row) => row.id === application.applicationId,
        );
        assert.ok(item);
        return request(
          "/api/auth/admin/kyc/" + item.id + "/decision",
          token("admin"),
          {
            decision: stage === "verified" ? "VERIFIED" : "REJECTED",
            version: item.version,
            reason:
              stage === "verified"
                ? "ตรวจเอกสารสาธิตครบตามรายการสำหรับทดสอบ flow"
                : "เอกสารสาธิตไม่ชัดเจน ขอให้ส่งใหม่",
          },
        );
      });
    if (stage === "verified") {
      await step("full-kyc-dual-role-check", async () => {
        const current = await customer("kyc-verified");
        await request("/api/auth/me", current.accessToken);
        const roles = JSON.parse(
          Buffer.from(current.accessToken.split(".")[1], "base64url"),
        ).roles;
        assert.ok(roles.includes("BUYER") && roles.includes("SELLER"));
        return { userId: current.user.id, roles };
      });
    }
  }
  coverage("auth.kyc", [
    "pending application",
    "document read and privacy denial",
    "verified/rejected decisions",
    "BUYER+SELLER after verified KYC",
  ]);
  for (const stage of ["APPROVED", "REJECTED", "PENDING"]) {
    const change = await step("full-shop-" + stage, () =>
      request("/api/auth/shop/change-request", token("seller"), {
        shopName: "DEMO ร้านยีนส์ปรับชื่อ " + stage,
        address: "99 ถนนสาธิต " + stage,
        comment: "ขอแก้ข้อมูลร้านค้าในสถานการณ์สาธิต " + stage,
      }),
    );
    if (stage !== "PENDING")
      await step("full-shop-" + stage + "-decision", () =>
        request(
          "/api/auth/admin/shop/change-requests/" + change.id + "/decide",
          token("admin"),
          {
            decision: stage,
            adminNote:
              stage === "APPROVED"
                ? "ตรวจข้อมูลสาธิตแล้วอนุมัติ"
                : "ขอให้ยืนยันข้อมูลเพิ่มก่อนเปลี่ยนร้าน",
          },
          "PATCH",
        ),
      );
  }
  coverage("auth.shop-profile", [
    "normalized field-change items",
    "approved/rejected/pending requests",
  ]);
  for (const scope of ["BUYER", "SELLER", "ALL_COMMERCE"]) {
    const login = await customer("restricted-" + scope.toLowerCase());
    if (scope !== "BUYER") {
      const kyc = await step("full-restriction-" + scope + "-kyc", async () => {
        const form = new FormData();
        form.append(
          "document",
          await image("DEMO SELLER ID", ["Restriction scenario: " + scope]),
          "demo-restriction.png",
        );
        for (const [key, value] of Object.entries({
          shopName: "DEMO ร้านจำกัดสิทธิ์ " + scope,
          idCardNumber: "0000000000010",
          address: "ถนนสาธิต กรุงเทพมหานคร",
        }))
          form.append(key, value);
        return request("/api/auth/kyc", login.accessToken, form);
      });
      await step("full-restriction-" + scope + "-kyc-approved", async () => {
        const queue = await request(
          "/api/auth/admin/kyc?status=PENDING&limit=100",
          token("admin"),
        );
        const item = queue.items.find((row) => row.id === kyc.applicationId);
        return request(
          "/api/auth/admin/kyc/" + item.id + "/decision",
          token("admin"),
          {
            decision: "VERIFIED",
            version: item.version,
            reason: "DEMO อนุมัติบัญชีขายสำหรับตรวจ capability",
          },
        );
      });
    }
    await step("full-restrict-" + scope, () =>
      request(
        "/api/auth/admin/users/" + login.user.id + "/commerce-restriction",
        token("trust"),
        { scope, reason: "DEMO ตรวจการจำกัดสิทธิ์ " + scope },
      ),
    );
    await step("full-restrict-" + scope + "-read", async () => {
      const status = await request(
        "/api/auth/me/commerce-restriction",
        login.accessToken,
      );
      return { userId: login.user.id, restriction: status };
    });
    if (scope !== "SELLER")
      await step("full-restrict-" + scope + "-purchase-denied", () =>
        request(
          "/api/orders",
          login.accessToken,
          { productId: ctx.state["swipe-one-product"].id },
          "POST",
          403,
        ),
      );
  }
  const restored = await customer("restored-permission");
  await step("full-permission-restrict", () =>
    request(
      "/api/auth/admin/users/" + restored.user.id + "/commerce-restriction",
      token("trust"),
      { scope: "BUYER", reason: "DEMO ตรวจ flow คืนสิทธิ์" },
    ),
  );
  await step("full-permission-revoke", () =>
    request(
      "/api/auth/admin/users/" +
        restored.user.id +
        "/commerce-restriction/revoke",
      token("trust"),
      { scope: "ALL_COMMERCE", reason: "ตรวจสอบแล้วคืนสิทธิ์ซื้อ" },
    ),
  );
  coverage("auth.commerce-restriction", [
    "BUYER/SELLER/ALL_COMMERCE restrictions",
    "purchase denial",
    "revocation",
  ]);
  const suspended = await customer("suspended", {
    authenticate: !ctx.state["full-account-suspended-suspend"],
  });
  const restoredAccount = await customer("restored-account", {
    authenticate:
      !ctx.state["full-account-restored-suspend"] ||
      Boolean(ctx.state["full-account-restore"]),
  });
  for (const [key, login] of [
    ["suspended", suspended],
    ["restored", restoredAccount],
  ])
    await step("full-account-" + key + "-suspend", () =>
      request(
        "/api/auth/admin/users/" + login.user.id + "/suspend",
        token("trust"),
        { reason: "DEMO ระงับบัญชีเฉพาะสถานการณ์ทดสอบ" },
      ),
    );
  await step("full-suspended-session-denied", async () => {
    if (suspended.accessToken)
      return request(
        "/api/auth/me",
        suspended.accessToken,
        undefined,
        "GET",
        403,
      );
    return request(
      "/api/auth/login",
      null,
      { email: suspended.user.email, password: "password123" },
      "POST",
      403,
    );
  });
  await step("full-account-restore", () =>
    request(
      "/api/auth/admin/users/" + restoredAccount.user.id + "/restore",
      token("trust"),
      { reason: "DEMO ตรวจครบแล้วคืนบัญชี" },
    ),
  );
  const batchUsers = [await customer("bulk-a"), await customer("bulk-b")];
  const batch = {
    action: "WARN_USER",
    ids: batchUsers.map((user) => user.user.id),
    reason: "DEMO แจ้งเตือนแบบ batch หลังเจ้าหน้าที่ตรวจสอบ",
    idempotencyKey: "dataset-" + label + "-bulk-warning",
  };
  await step("full-bulk-dry-run", () =>
    request("/api/auth/admin/bulk", token("admin"), { ...batch, dryRun: true }),
  );
  await step("full-bulk-run", () =>
    request("/api/auth/admin/bulk", token("admin"), batch),
  );
  await step("full-bulk-retry", () =>
    request("/api/auth/admin/bulk", token("admin"), batch),
  );
  coverage("auth.account-and-bulk", [
    "suspend/session revocation",
    "restore",
    "batch preview/execution/idempotent retry",
  ]);
  await step("full-session-refresh-logout", async () => {
    const login = await customer("session");
    const refreshed = await request("/api/auth/refresh", null, {
      refreshToken: login.refreshToken,
    });
    await request("/api/auth/logout", refreshed.accessToken, {
      refreshToken: refreshed.refreshToken || login.refreshToken,
    });
    await request("/api/auth/me", refreshed.accessToken, undefined, "GET", 401);
    return { accessTokenRefreshed: true, loggedOutTokenDenied: true };
  });
  coverage("auth.sessions", [
    "registration",
    "login logs",
    "access token refresh",
    "logout rejection",
  ]);
};
