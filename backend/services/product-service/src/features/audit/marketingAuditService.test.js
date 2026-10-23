const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeAuditData,
  isSensitiveKey,
  REDACTED,
} = require("./marketingAuditSanitizer");
const { createMarketingAuditService } = require("./marketingAuditService");
const {
  createMarketingAuditRepository,
} = require("./marketingAuditRepository");

test("marketingAuditSanitizer - key sensitivity detection", () => {
  const sensitiveKeys = [
    "password",
    "passwordHash",
    "PASSWORD_HASH",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh-token",
    "token",
    "secret",
    "clientSecret",
    "authorization",
    "cookie",
    "apiKey",
    "api_key",
    "credential",
  ];

  for (const key of sensitiveKeys) {
    assert.equal(
      isSensitiveKey(key),
      true,
      `Expected "${key}" to be identified as sensitive`,
    );
  }

  const safeKeys = [
    "id",
    "name",
    "email",
    "status",
    "role",
    "action",
    "entityId",
  ];
  for (const key of safeKeys) {
    assert.equal(
      isSensitiveKey(key),
      false,
      `Expected "${key}" not to be identified as sensitive`,
    );
  }
});

test("marketingAuditSanitizer - data sanitization and redacting", () => {
  const input = {
    id: "camp-001",
    name: "Summer Sale",
    password: "super-secret-password",
    credentials: {
      client: "secret-client",
    },
    settings: {
      apiKey: "1234567890",
      accessToken:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
      user: {
        refreshToken: "refresh-token-val",
      },
    },
    items: [
      { code: "DISCOUNT10", secretKey: "secret-code" },
      { code: "DISCOUNT20", token: "tok-123" },
    ],
    authHeader: "Bearer secret-token-xyz",
    created: new Date("2026-06-01T10:00:00.000Z"),
    count: 42,
    active: true,
  };

  const sanitized = sanitizeAuditData(input);

  // Safe properties preserved
  assert.equal(sanitized.id, "camp-001");
  assert.equal(sanitized.name, "Summer Sale");
  assert.equal(sanitized.count, 42);
  assert.equal(sanitized.active, true);
  assert.equal(sanitized.created, "2026-06-01T10:00:00.000Z");

  // Sensitive fields redacted
  assert.equal(sanitized.password, REDACTED);
  assert.equal(sanitized.credentials, REDACTED);
  assert.equal(sanitized.settings.apiKey, REDACTED);
  assert.equal(sanitized.settings.accessToken, REDACTED);
  assert.equal(sanitized.settings.user.refreshToken, REDACTED);
  assert.equal(sanitized.items[0].secretKey, REDACTED);
  assert.equal(sanitized.items[1].token, REDACTED);
  assert.equal(sanitized.authHeader, REDACTED);

  // Primitives and edge cases
  assert.equal(sanitizeAuditData(null), null);
  assert.equal(sanitizeAuditData(undefined), undefined);
  assert.equal(sanitizeAuditData("regular-string"), "regular-string");
});

test("marketingAuditSanitizer - circular reference handling", () => {
  const circularObj = {
    name: "circular test",
    meta: {},
  };
  circularObj.meta.self = circularObj;

  const sanitized = sanitizeAuditData(circularObj);
  assert.equal(sanitized.name, "circular test");
  assert.equal(sanitized.meta.self, "[CIRCULAR]");
});

test("marketingAuditService - recordMarketingAudit validation", async () => {
  let recorded = null;
  const mockRepo = {
    recordAudit: async (entry, opts) => {
      recorded = { entry, opts };
      return { id: "log-1", ...entry };
    },
  };

  const service = createMarketingAuditService(mockRepo);

  // Missing actorId
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorRole: "MARKETING",
        action: "CAMPAIGN_CREATE",
        entityType: "CAMPAIGN",
        entityId: "c-1",
      }),
    /actorId is required/i,
  );

  // Missing actorRole
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorId: "user-1",
        action: "CAMPAIGN_CREATE",
        entityType: "CAMPAIGN",
        entityId: "c-1",
      }),
    /actorRole is required/i,
  );

  // Missing action
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorId: "user-1",
        actorRole: "MARKETING",
        entityType: "CAMPAIGN",
        entityId: "c-1",
      }),
    /action is required/i,
  );

  // Invalid action
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorId: "user-1",
        actorRole: "MARKETING",
        action: "INVALID_ACTION",
        entityType: "CAMPAIGN",
        entityId: "c-1",
      }),
    /invalid audit action/i,
  );

  // Missing entityType
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorId: "user-1",
        actorRole: "MARKETING",
        action: "CAMPAIGN_CREATE",
        entityId: "c-1",
      }),
    /entityType is required/i,
  );

  // Invalid entityType
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorId: "user-1",
        actorRole: "MARKETING",
        action: "CAMPAIGN_CREATE",
        entityType: "INVALID_ENTITY",
        entityId: "c-1",
      }),
    /invalid audit entityType/i,
  );

  // Missing entityId
  await assert.rejects(
    () =>
      service.recordMarketingAudit({
        actorId: "user-1",
        actorRole: "MARKETING",
        action: "CAMPAIGN_CREATE",
        entityType: "CAMPAIGN",
      }),
    /entityId is required/i,
  );

  // Valid record call with tx
  const fakeTx = { id: "fake-tx" };
  const result = await service.recordMarketingAudit(
    {
      actorId: "SYSTEM",
      actorRole: "SYSTEM",
      action: "CAMPAIGN_END",
      entityType: "CAMPAIGN",
      entityId: "c-123",
      previousState: { status: "active" },
      newState: { status: "expired" },
      metadata: { reason: "EXPIRED" },
      idempotencyKey: "CAMPAIGN_END:c-123",
    },
    { tx: fakeTx },
  );

  assert.equal(result.id, "log-1");
  assert.equal(recorded.entry.actorId, "SYSTEM");
  assert.equal(recorded.entry.action, "CAMPAIGN_END");
  assert.equal(recorded.entry.idempotencyKey, "CAMPAIGN_END:c-123");
  assert.equal(recorded.opts.tx, fakeTx);
});

test("marketingAuditService - getAuditLogs query validation and pagination", async () => {
  let listOptions = null;
  const mockRepo = {
    listAuditLogs: async (opts) => {
      listOptions = opts;
      return {
        items: [{ id: "log-1" }, { id: "log-2" }],
        total: 55,
      };
    },
  };

  const service = createMarketingAuditService(mockRepo);

  // Default pagination
  const res1 = await service.getAuditLogs({});
  assert.equal(res1.page, 1);
  assert.equal(res1.limit, 20);
  assert.equal(res1.total, 55);
  assert.equal(res1.totalPages, 3);
  assert.equal(listOptions.skip, 0);
  assert.equal(listOptions.take, 20);

  // Clamped limit
  const res2 = await service.getAuditLogs({ page: "2", limit: "500" });
  assert.equal(res2.page, 2);
  assert.equal(res2.limit, 100);
  assert.equal(listOptions.skip, 100);
  assert.equal(listOptions.take, 100);

  // Invalid 'from' date
  await assert.rejects(
    () => service.getAuditLogs({ from: "invalid-date" }),
    /invalid 'from' date format/i,
  );

  // Invalid 'to' date
  await assert.rejects(
    () => service.getAuditLogs({ to: "not-a-date" }),
    /invalid 'to' date format/i,
  );

  // 'from' after or equal to 'to'
  await assert.rejects(
    () =>
      service.getAuditLogs({
        from: "2026-06-10",
        to: "2026-06-05",
      }),
    /'from' date must be before 'to' date/i,
  );

  await assert.rejects(
    () =>
      service.getAuditLogs({
        from: "2026-06-01T00:00:00+07:00",
        to: "2026-06-01T00:00:00+07:00",
      }),
    /'from' date must be before 'to' date/i,
  );

  // Same-day query: from=2026-06-01, to=2026-06-01 converts to [2026-06-01T00:00:00+07:00, 2026-06-02T00:00:00+07:00)
  await service.getAuditLogs({
    from: "2026-06-01",
    to: "2026-06-01",
  });
  assert.ok(listOptions.fromDate instanceof Date);
  assert.ok(listOptions.toDate instanceof Date);
  assert.equal(
    listOptions.fromDate.toISOString(),
    new Date("2026-06-01T00:00:00+07:00").toISOString(),
  );
  assert.equal(
    listOptions.toDate.toISOString(),
    new Date("2026-06-02T00:00:00+07:00").toISOString(),
  );
  assert.ok(listOptions.fromDate < listOptions.toDate);

  // Month boundary query: from=2026-01-31, to=2026-01-31 converts to next month 2026-02-01
  await service.getAuditLogs({
    from: "2026-01-31",
    to: "2026-01-31",
  });
  assert.equal(
    listOptions.fromDate.toISOString(),
    new Date("2026-01-31T00:00:00+07:00").toISOString(),
  );
  assert.equal(
    listOptions.toDate.toISOString(),
    new Date("2026-02-01T00:00:00+07:00").toISOString(),
  );

  // Invalid action filter
  await assert.rejects(
    () => service.getAuditLogs({ action: "FAKE_ACTION" }),
    /invalid action filter/i,
  );

  // Invalid entityType filter
  await assert.rejects(
    () => service.getAuditLogs({ entityType: "UNKNOWN" }),
    /invalid entityType filter/i,
  );

  // Valid filters passed to repo
  const res3 = await service.getAuditLogs({
    action: "CAMPAIGN_CREATE",
    entityType: "CAMPAIGN",
    actorId: "marketing-1",
    from: "2026-06-01T00:00:00.000Z",
    to: "2026-06-05T00:00:00.000Z",
  });
  assert.equal(res3.total, 55);
  assert.equal(listOptions.action, "CAMPAIGN_CREATE");
  assert.equal(listOptions.entityType, "CAMPAIGN");
  assert.equal(listOptions.actorId, "marketing-1");
  assert.ok(listOptions.fromDate instanceof Date);
  assert.ok(listOptions.toDate instanceof Date);
});

test("marketingAuditRepository - handles idempotencyKey collision via createMany skipDuplicates", async () => {
  const existingLog = {
    id: "existing-log-id",
    actorId: "SYSTEM",
    actorRole: "SYSTEM",
    action: "AUCTION_ITEM_CLOSE",
    entityType: "AUCTION_ITEM",
    entityId: "auc-999",
    idempotencyKey: "AUCTION_ITEM_CLOSE:auc-999",
  };

  let createManyArgs = null;
  const mockPrisma = {
    marketingAuditLog: {
      createMany: async (args) => {
        createManyArgs = args;
        return { count: 0 }; // 0 inserted due to duplicate key collision
      },
      findUnique: async ({ where }) => {
        if (where.idempotencyKey === "AUCTION_ITEM_CLOSE:auc-999") {
          return existingLog;
        }
        return null;
      },
    },
  };

  const repository = createMarketingAuditRepository(mockPrisma);

  const result = await repository.recordAudit({
    actorId: "SYSTEM",
    actorRole: "SYSTEM",
    action: "AUCTION_ITEM_CLOSE",
    entityType: "AUCTION_ITEM",
    entityId: "auc-999",
    idempotencyKey: "AUCTION_ITEM_CLOSE:auc-999",
  });

  assert.deepEqual(result, existingLog);
  assert.equal(createManyArgs.skipDuplicates, true);
  assert.equal(
    createManyArgs.data[0].idempotencyKey,
    "AUCTION_ITEM_CLOSE:auc-999",
  );

  // Non-idempotent audit must use create and rethrow DB error so transaction aborts
  const failingPrisma = {
    marketingAuditLog: {
      create: async () => {
        const error = new Error("DB connection lost");
        error.code = "P1001";
        throw error;
      },
    },
  };

  const failingRepo = createMarketingAuditRepository(failingPrisma);
  await assert.rejects(
    () =>
      failingRepo.recordAudit({
        actorId: "usr-1",
        actorRole: "MARKETING",
        action: "CAMPAIGN_CREATE",
        entityType: "CAMPAIGN",
        entityId: "camp-001",
      }),
    /DB connection lost/,
  );
});

test("marketingAuditService - operator search and enrichment", async (t) => {
  const { AppError } = require("@reloop/shared");

  let recordedListOpts = null;
  const mockLogs = [
    {
      id: "log-1",
      actorId: "u-123",
      actorRole: "MARKETING",
      action: "CAMPAIGN_UPDATE",
      entityType: "CAMPAIGN",
      entityId: "camp-001",
      previousState: { name: "แคมเปญก่อนแก้" },
      newState: { name: "แคมเปญหลังแก้" },
    },
    {
      id: "log-2",
      actorId: "SYSTEM",
      actorRole: "SYSTEM",
      action: "ARTICLE_PUBLISH",
      entityType: "ARTICLE",
      entityId: "art-001",
      previousState: null,
      newState: { title: "บทความแฟชั่นยั่งยืน" },
    },
    {
      id: "log-3",
      actorId: "u-deleted",
      actorRole: "MARKETING",
      action: "AUCTION_ROUND_CREATE",
      entityType: "AUCTION_ROUND",
      entityId: "rnd-001",
      previousState: null,
      newState: null,
    },
    {
      id: "log-4",
      actorId: "audit-test-mkt-01",
      actorRole: "MARKETING",
      action: "CAMPAIGN_CREATE",
      entityType: "CAMPAIGN",
      entityId: "camp-custom-01",
      previousState: null,
      newState: { name: "Reject Test Campaign" },
    },
  ];

  const mockRepo = {
    listAuditLogs: async (opts) => {
      recordedListOpts = opts;
      let items = [...mockLogs];
      if (opts.actorIds && Array.isArray(opts.actorIds)) {
        items = items.filter((item) => opts.actorIds.includes(item.actorId));
      } else if (opts.actorId) {
        items = items.filter((item) => item.actorId === opts.actorId);
      }
      return {
        items,
        total: items.length,
      };
    },
  };

  const mockAuthClient = {
    searchUsers: async (q) => {
      if (q === "fail-auth") throw new AppError(502, "Auth service unreachable");
      if (q === "สมชาย") return [{ id: "u-123", userId: "u-123", displayName: "สมชาย" }];
      if (q === "not-found") return [];
      return [];
    },
    getDisplayNames: async (ids) => {
      return ids.includes("u-123") ? [{ userId: "u-123", displayName: "สมชาย การตลาด" }] : [];
    },
  };

  const mockPrisma = {
    auctionRound: {
      findMany: async () => [{ id: "rnd-001", title: "รอบประมูลวินเทจ (ปัจจุบัน)" }],
    },
  };

  const service = createMarketingAuditService(mockRepo, mockAuthClient, mockPrisma);

  await t.test("operator search by name filters by resolved actor IDs and enriches", async () => {
    const res = await service.getAuditLogs({ q: "สมชาย" });
    assert.ok(recordedListOpts.actorIds.includes("u-123"));
    assert.equal(res.items.length, 1);

    // Operator enrichment
    assert.equal(res.items[0].actorName, "สมชาย การตลาด");
    assert.equal(res.items[0].isCurrentName, true);

    // Entity enrichment & rename detection
    assert.equal(res.items[0].entityName, "แคมเปญหลังแก้");
    assert.equal(res.items[0].previousEntityName, "แคมเปญก่อนแก้");
    assert.equal(res.items[0].newEntityName, "แคมเปญหลังแก้");
  });

  await t.test("operator search by full custom non-UUID ID without Auth account succeeds", async () => {
    const res = await service.getAuditLogs({ actorQuery: "audit-test-mkt-01" });
    assert.ok(recordedListOpts.actorIds.includes("audit-test-mkt-01"));
    assert.equal(res.total, 1);
    assert.equal(res.items[0].actorId, "audit-test-mkt-01");
    assert.equal(res.items[0].actorName, "audit-test-mkt-01"); // fallback to ID
    assert.equal(res.items[0].actorNameSource, "fallback_id");
  });

  await t.test("operator search by deleted user ID finds historical records", async () => {
    const res = await service.getAuditLogs({ q: "u-deleted" });
    assert.ok(recordedListOpts.actorIds.includes("u-deleted"));
    assert.equal(res.total, 1);
    assert.equal(res.items[0].actorId, "u-deleted");
    assert.equal(res.items[0].actorName, "u-deleted"); // fallback to ID
    assert.equal(res.items[0].actorNameSource, "fallback_id");
  });

  await t.test("operator search for ระบบอัตโนมัติ includes SYSTEM", async () => {
    const res = await service.getAuditLogs({ q: "ระบบอัตโนมัติ" });
    assert.ok(recordedListOpts.actorIds.includes("SYSTEM"));
    assert.equal(res.total, 1);
    assert.equal(res.items[0].actorName, "ระบบอัตโนมัติ");
  });

  await t.test("operator search with no matching users returns empty result", async () => {
    const res = await service.getAuditLogs({ q: "not-found" });
    assert.equal(res.total, 0);
    assert.deepEqual(res.items, []);
  });

  await t.test("operator search does not pass search text as exact actorId", async () => {
    await service.getAuditLogs({ q: "สมชาย", actorId: "สมชาย" });
    assert.equal(recordedListOpts.actorId, undefined);
    assert.ok(recordedListOpts.actorIds.includes("u-123"));
  });

  await t.test("operator search fail-closed on auth failure", async () => {
    await assert.rejects(
      () => service.getAuditLogs({ q: "fail-auth" }),
      /Auth service unreachable/i,
    );
  });

  await t.test("article editor differs from author: actorName must be editor, never authorName", async () => {
    const authorServiceMockRepo = {
      listAuditLogs: async () => ({
        items: [
          {
            id: "log-art-1",
            actorId: "u-editor-01",
            actorRole: "MARKETING",
            action: "ARTICLE_UPDATE",
            entityType: "ARTICLE",
            entityId: "art-100",
            previousState: { title: "บทความเดิม", authorName: "สมคิด นักเขียน (เจ้าของ)" },
            newState: { title: "บทความใหม่", authorName: "สมคิด นักเขียน (เจ้าของ)" },
          },
          {
            id: "log-art-2",
            actorId: "u-editor-unknown",
            actorRole: "MARKETING",
            action: "ARTICLE_UPDATE",
            entityType: "ARTICLE",
            entityId: "art-200",
            previousState: { title: "บทความเดิม", authorName: "วิชัย นักเขียน" },
            newState: { title: "บทความใหม่", authorName: "วิชัย นักเขียน" },
          },
        ],
        total: 2,
      }),
    };

    const authorServiceMockAuth = {
      searchUsers: async () => [],
      getDisplayNames: async (ids) => {
        if (ids.includes("u-editor-01")) {
          return [{ userId: "u-editor-01", displayName: "พิมพ์ชนก (ผู้แก้ไขจริง)" }];
        }
        return [];
      },
    };

    const testService = createMarketingAuditService(authorServiceMockRepo, authorServiceMockAuth, mockPrisma);
    const res = await testService.getAuditLogs({});

    // log-art-1: Must show editor's name from auth directory, NOT the article author
    assert.equal(res.items[0].actorName, "พิมพ์ชนก (ผู้แก้ไขจริง)");
    assert.notEqual(res.items[0].actorName, "สมคิด นักเขียน (เจ้าของ)");
    assert.equal(res.items[0].actorNameSource, "auth_directory");

    // log-art-2: When editor is unknown, must fallback to actorId, NOT the article author
    assert.equal(res.items[1].actorName, "u-editor-unknown");
    assert.notEqual(res.items[1].actorName, "วิชัย นักเขียน");
    assert.equal(res.items[1].actorNameSource, "fallback_id");
  });
});
