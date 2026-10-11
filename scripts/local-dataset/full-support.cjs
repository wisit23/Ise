module.exports = async (ctx) => {
  const { step, request, token, coverage } = ctx;
  for (const category of ["ACCOUNT", "PAYMENT", "TECHNICAL", "OTHER"]) {
    const ticket = await step("full-ticket-" + category, () =>
      request("/api/support/tickets", token("buyer"), {
        subject: "DEMO ขอคำแนะนำ · " + category,
        description:
          category === "ACCOUNT"
            ? "ต้องการคำแนะนำการยืนยันตัวตนและรักษาความปลอดภัยบัญชี"
            : category === "PAYMENT"
              ? "ต้องการคำแนะนำวิธีตรวจยอดชำระและส่วนลด"
              : "ต้องการสอบถามขั้นตอนใช้ระบบซื้อสินค้ามือสอง",
        category,
      }),
    );
    await step("full-ticket-" + category + "-assign", async () => {
      const current = await request(
        "/api/support/tickets/" + ticket.id,
        token("otherCs"),
      );
      return request(
        "/api/support/tickets/" + ticket.id + "/assign",
        token("otherCs"),
        { version: current.version },
      );
    });
    await step("full-ticket-" + category + "-answer", () =>
      request(
        "/api/support/tickets/" + ticket.id + "/messages",
        token("otherCs"),
        {
          body: "รับเรื่องแล้วครับ สามารถดูขั้นตอนในศูนย์ช่วยเหลือ และแจ้งรายละเอียดที่ต้องการเพิ่มเติมได้",
          eventKey: "full-answer-" + category,
        },
      ),
    );
  }
  for (const stage of ["draft", "revised", "unpublished"]) {
    const article = await step("full-help-" + stage, () =>
      request("/api/support/help", token("cs"), {
        title: "DEMO ช่วยเหลือบัญชี · " + stage,
        body: "ยืนยันข้อมูลบัญชีผ่านระบบ เก็บรหัสผ่าน และติดต่อ CS เมื่อพบปัญหา",
        category: "ACCOUNT",
      }),
    );
    if (stage !== "draft") {
      const published = await step("full-help-" + stage + "-publish", () =>
        request(
          "/api/support/help/" + article.id + "/publish",
          token("cs"),
          { version: article.version },
          "PATCH",
        ),
      );
      if (stage === "revised")
        await step("full-help-revision", () =>
          request(
            "/api/support/help/" + article.id + "/revisions",
            token("cs"),
            {
              title: "DEMO คำแนะนำบัญชีฉบับปรับปรุง",
              body: "ยืนยันตัวตนด้วยเอกสารสาธิตในชุดทดสอบ อย่าส่งรหัสผ่านในแชต และติดต่อ CS ผ่าน ticket",
              category: "ACCOUNT",
            },
          ),
        );
      else
        await step("full-help-unpublish", () =>
          request(
            "/api/support/help/" + article.id + "/unpublish",
            token("cs"),
            { version: published.version },
            "PATCH",
          ),
        );
    }
  }
  await request("/api/support/help?q=DEMO", null);
  await request("/api/support/help/config", null);
  coverage("support.tickets-and-help", [
    "ORDER/ACCOUNT/PAYMENT/OTHER intake",
    "two CS agents",
    "automatic case SLA/reference policy",
    "NEW/IN_PROGRESS/PENDING_USER/ESCALATED/RESOLVED/CLOSED history",
    "T&S takeover with CS chat responder",
    "draft/publish/revision/unpublish FAQ and public search",
  ]);
  await step("full-executive-audit", () =>
    request("/api/auth/executive/audit", token("executive"), {
      action: "DEMO_DATASET_REVIEW",
      category: "OPERATIONS",
      targetType: "DATASET",
      targetId: ctx.label,
      description:
        "ตรวจชุดข้อมูลสาธิตที่เชื่อม Auth Product Order Chat Support ครบตาม flow",
      metadata: { demo: true, label: ctx.label },
    }),
  );
  await request("/api/auth/executive/audit", token("executive"));
  await request("/api/auth/executive/reports?status=ALL", token("executive"));
  coverage("executive.oversight", [
    "complaints across states",
    "explicit operations audit",
    "campaign sales/budget metrics",
  ]);
};
