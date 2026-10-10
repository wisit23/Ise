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
