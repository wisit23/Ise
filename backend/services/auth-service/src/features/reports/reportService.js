const {
  badRequest,
  AppError,
  conflict,
  forbidden,
  isRestrictedStatus,
  notFound,
  restrictionsForStatus,
  combineRestrictionStatus,
} = require("@reloop/shared");
const prisma = require("../../models/prismaClient");
const { findSupportUser } = require("./supportUserLookup");
const productModerationClient = require("../../services/productModerationClient");
const { lockUser } = require("../../services/sessionService");
const authService = require("../../services/authService");
const reportEvidenceStorage = require("./reportEvidenceStorage");
const chatClient = require("../../services/chatClient");

function reviewIdForReport(report) {
  return report?.reason?.match(/\[รายงานรีวิว\s*#?([^\]]+)\]/)?.[1]?.trim() || null;
}

function toPublicUser(user) {
  return {
    id: user.id,
    ...(user.referenceCode ? { referenceCode: user.referenceCode } : {}),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    commerceRestrictions: restrictionsForStatus(user.status),
  };
}

/** Append-only — never updated or deleted (ADM-DEC-003: audit evidence must persist). */
async function recordAdminAction({
  actorId,
  action,
  targetId,
  reason,
  requestId,
  tx = prisma,
}) {
  return tx.adminAudit.create({
    data: { actorId, action, targetId, reason, requestId },
  });
}

async function checkPendingReport({ reporterId, productId, reviewId, targetId }) {
  if (!reporterId) return { hasPendingReport: false };

  // 1. Comment / review report check
  if (reviewId) {
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        status: { in: ["OPEN", "REVIEWED"] },
        reason: { contains: reviewId },
      },
    });
    if (existing) {
      return {
        hasPendingReport: true,
        type: "review",
        message:
          "คุณได้รายงานความคิดเห็นนี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจาก Trust and Safety",
        report: existing,
      };
    }
  }

  // 2. Product report check
  if (productId && !reviewId) {
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        productId,
        status: { in: ["OPEN", "REVIEWED"] },
        NOT: {
          reason: { contains: "[รายงานรีวิว" },
        },
      },
    });
    if (existing) {
      return {
        hasPendingReport: true,
        type: "product",
        message:
          "คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจาก Trust and Safety",
        report: existing,
      };
    }
  }

  // 3. User report check
  if (targetId && !productId && !reviewId) {
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        targetId,
        productId: null,
        status: { in: ["OPEN", "REVIEWED"] },
        NOT: {
          reason: { contains: "[รายงานรีวิว" },
        },
      },
    });
    if (existing) {
      return {
        hasPendingReport: true,
        type: "user",
        message:
          "คุณได้รายงานผู้ใช้นี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจาก Trust and Safety",
        report: existing,
      };
    }
  }

  return { hasPendingReport: false };
}

async function getMyReportedReviewIds(reporterId, productId) {
  if (!reporterId) return [];
  const where = {
    reporterId,
    status: { in: ["OPEN", "REVIEWED"] },
    reason: { contains: "[รายงานรีวิว" },
  };
  if (productId) {
    where.productId = productId;
  }
  const reports = await prisma.report.findMany({
    where,
    select: { reason: true },
  });

  const ids = [];
  for (const r of reports) {
    const match = r.reason?.match(/\[รายงานรีวิว\s*#?([^\]]+)\]/);
    if (match) {
      ids.push(match[1].trim());
    }
  }
  return Array.from(new Set(ids));
}

/**
 * A Buyer/Seller reports another account, optionally about a product or a
 * review, with a reason, a category and an optional image as evidence.
 * Product/order disputes use their own case flow.
 */
async function createReport({ reporterId, targetId, productId, category, reason, file, reviewId }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (!targetId && !productId) throw badRequest("targetId or productId is required");
  if (targetId && targetId === reporterId) throw badRequest("cannot report yourself");
  const allowedCategories = new Set([
    "FRAUD", "COUNTERFEIT_IP", "INAPPROPRIATE_BEHAVIOR",
    "MISLEADING_INFORMATION", "OTHER",
  ]);
  if (category && !allowedCategories.has(category)) {
    throw badRequest("invalid report category");
  }

  const reasonReviewId = reviewIdForReport({ reason: trimmedReason });
  if (reviewId && reasonReviewId && reviewId !== reasonReviewId) {
    throw badRequest("รหัสรีวิวในข้อมูลรายงานไม่ตรงกัน");
  }
  let extractedReviewId = reviewId || null;
  if (!extractedReviewId) {
    const match = trimmedReason.match(/\[รายงานรีวิว\s*#?([^\]]+)\]/);
    if (match) extractedReviewId = match[1].trim();
  }

  const isReviewReport = Boolean(
    extractedReviewId ||
    trimmedReason.includes("[รายงานรีวิว") ||
    trimmedReason.includes("เนื้อหารีวิว")
  );
  if (isReviewReport) {
    if (!extractedReviewId) throw badRequest("กรุณาระบุรีวิวที่ต้องการรายงาน");
    const review = await productModerationClient.getReview(extractedReviewId);
    if (review.removedAt || review.removed) throw badRequest("รีวิวนี้ถูกนำออกแล้ว");
    if (review.buyerId !== targetId || (review.productId || null) !== (productId || null)) {
      throw badRequest("ข้อมูลรีวิว ผู้เขียน หรือสินค้าไม่ตรงกัน");
    }
  }
  const storedReason = isReviewReport && !reasonReviewId
    ? `[รายงานรีวิว #${extractedReviewId}] ${trimmedReason}`
    : trimmedReason;
  // Review reports carry their topic in the reason; other reports need a category.
  if (!category && !isReviewReport) throw badRequest("category is required");

  // Prevent duplicate reports while pending admin decision
  if (isReviewReport) {
    const conditions = [];
    if (extractedReviewId) {
      conditions.push({ reason: { contains: extractedReviewId } });
    }
    if (targetId && productId) {
      conditions.push({
        AND: [
          { targetId },
          { productId },
          { reason: { contains: "[รายงานรีวิว" } },
        ],
      });
    }

    if (conditions.length > 0) {
      const existing = await prisma.report.findFirst({
        where: {
          reporterId,
          status: { in: ["OPEN", "REVIEWED"] },
          OR: conditions,
        },
      });
      if (existing) {
        throw conflict(
          "คุณได้รายงานความคิดเห็นนี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจาก Trust and Safety",
        );
      }
    }
  } else if (productId) {
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        productId,
        status: { in: ["OPEN", "REVIEWED"] },
        NOT: {
          reason: { contains: "[รายงานรีวิว" },
        },
      },
    });
    if (existing) {
      throw conflict(
        "คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจาก Trust and Safety",
      );
    }
  } else {
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        targetId,
        productId: null,
        status: { in: ["OPEN", "REVIEWED"] },
        NOT: {
          reason: { contains: "[รายงานรีวิว" },
        },
      },
    });
    if (existing) {
      throw conflict(
        "คุณได้รายงานผู้ใช้นี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจาก Trust and Safety",
      );
    }
  }

  let storageKey;
  let report;
  try {
    if (file) storageKey = await reportEvidenceStorage.persist(file);
    report = await prisma.report.create({
      data: {
        reporterId,
        targetId: targetId || null,
        productId: productId || null,
        category: category || null,
        reason: storedReason,
        ...(file ? { evidence: { create: { storageKey, fileType: file.mimetype, originalName: file.originalname || "evidence" } } } : {}),
      },
    });
  } catch (error) {
    if (storageKey) await reportEvidenceStorage.remove(storageKey);
    throw error;
  }

  if (isReviewReport && targetId) {
    try {
      let productTitle = "สินค้า";
      if (productId) {
        try {
          const product = await productModerationClient.getProduct(productId);
          if (product?.title) productTitle = product.title;
        } catch {
          // ignore lookup failure
        }
      }

      chatClient.sendSystemNotification({
        userId: targetId,
        type: "REPORT",
        title: "ความคิดเห็นของคุณถูกรายงาน",
        message: `ความคิดเห็น/รีวิวของคุณในสินค้า '${productTitle}' ถูกรายงานและอยู่ระหว่างการตรวจสอบโดยทีมงาน เหตุผลที่รายงาน: ${report.reason}`,
        link: productId ? `/products/${productId}` : "/orders",
        entityId: `report:review:${reviewId || report.id}`,
        metadata: {
          reportId: report.id,
          targetId,
          productId,
          reviewId: reviewId || null,
          reportReason: report.reason,
        },
      }).catch(() => {});
    } catch (notifyErr) {
      console.error("[reportService] notify report failed:", notifyErr.message);
    }
  }

  return report;
}

function reportSearchWhere(search) {
  const query = search?.trim();
  if (!query) return {};
  const referenceCode = require("@reloop/shared").normalizeReferenceCode(query, "RPT");
  return {
    OR: [
      ...(referenceCode ? [{ referenceCode }] : []),
      { id: { contains: query, mode: "insensitive" } },
      { reporterId: { contains: query, mode: "insensitive" } },
      { targetId: { contains: query, mode: "insensitive" } },
      { productId: { contains: query, mode: "insensitive" } },
      { reason: { contains: query, mode: "insensitive" } },
      {
        reporter: {
          is: {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

async function listReports({ page, limit, status, search, scope = "all", staffId, type = "ALL" }, db = prisma) {
  const searchWhere = reportSearchWhere(search);
  const where = {};
  if (!["all", "mine", "unassigned", "history"].includes(scope)) {
    throw badRequest("invalid report scope");
  }
  if (scope === "mine" || scope === "history") {
    if (!staffId) throw badRequest("staffId is required for mine scope");
    where.reviewedBy = staffId;
  }
  if (scope === "unassigned") where.reviewedBy = null;
  if (scope === "all" && staffId) {
    where.AND = [{ OR: [{ reviewedBy: null }, { reviewedBy: staffId }] }];
  }
  if (status === undefined || status === null) where.status = "OPEN";
  else if (status.trim() === "PENDING") where.status = { in: ["OPEN", "REVIEWED"] };
  else if (status.trim() && status.trim() !== "ALL") where.status = status.trim();
  if (scope === "unassigned") where.status = "OPEN";
  Object.assign(where, searchWhere);
  if (scope === "history") where.status = { in: ["ACTIONED", "DISMISSED"] };
  if (!["ALL", "USER", "PRODUCT", "COMMENT"].includes(type)) {
    throw badRequest("invalid report type");
  }
  // Existing review reports store their reference in the reason. Keep both
  // legacy markers so old reports remain in the correct queue without a cutover.
  const commentWhere = { OR: [
    { reason: { contains: "[รายงานรีวิว" } },
    { reason: { contains: "เนื้อหารีวิว" } },
  ] };
  if (type !== "ALL") {
    const typeWhere = type === "COMMENT" ? commentWhere : {
      NOT: commentWhere,
      productId: type === "PRODUCT" ? { not: null } : null,
    };
    where.AND = [...(where.AND || []), typeWhere];
  }
  const [items, total] = await Promise.all([
    db.report.findMany({
      where,
      include: {
        reporter: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { reportedAt: scope === "history" ? "desc" : "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.report.count({ where }),
  ]);
  const completedIds = items.filter((item) => ["ACTIONED", "DISMISSED"].includes(item.status)).map((item) => item.id);
  const decisions = completedIds.length ? await db.adminAudit.findMany({
    where: { targetId: { in: completedIds }, action: { startsWith: "REPORT_", not: "REPORT_REVIEWED" } },
    select: { targetId: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }) : [];
  const decidedAt = new Map();
  for (const decision of decisions) if (!decidedAt.has(decision.targetId)) decidedAt.set(decision.targetId, decision.createdAt);
  return { items: items.map((item) => ({ ...item, decidedAt: decidedAt.get(item.id) || null })), total };
}

async function getReportDetail(reportId) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
      evidence: { select: { id: true, fileType: true, originalName: true, uploadedAt: true } },
    },
  });
  if (!report) throw notFound("report not found");

  const decisionPromise = prisma.adminAudit.findFirst({
    where: {
      targetId: reportId,
      action: { startsWith: "REPORT_", not: "REPORT_REVIEWED" },
    },
    orderBy: { createdAt: "desc" },
  });
  const targetPromise = report.targetId
    ? prisma.user.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      })
    : Promise.resolve(null);
  const productPromise = report.productId
    ? productModerationClient
        .getProduct(report.productId)
        .then((product) => ({ available: true, product }))
        .catch((error) => ({ available: false, error: error.message }))
    : Promise.resolve(null);

  const reviewId = reviewIdForReport(report);
  const reviewPromise = reviewId
    ? productModerationClient.getReview(reviewId)
        .then((review) => ({ available: true, review }))
        .catch((error) => ({ available: false, error: error.message }))
    : Promise.resolve(null);
  const [decision, target, productDetail, reviewDetail, reporterSafety, targetSafety] =
    await Promise.all([
      decisionPromise,
      targetPromise,
      productPromise,
      reviewPromise,
      getUserSafetySummary(report.reporterId),
      report.targetId
        ? getUserSafetySummary(report.targetId)
        : Promise.resolve(null),
    ]);
  const decider = decision
    ? await prisma.user.findUnique({
        where: { id: decision.actorId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      })
    : null;

  return {
    ...report,
    reporter: { ...report.reporter, safetySummary: reporterSafety },
    target: target ? { ...target, safetySummary: targetSafety } : null,
    productDetail,
    reviewDetail,
    decision: decision
      ? {
          action: report.actionTaken || decision.action.replace(/^REPORT_/, ""),
          reason: decision.reason,
          decidedAt: decision.createdAt,
          decidedBy: decider || { id: decision.actorId },
        }
      : null,
  };
}

async function viewReportEvidence({ reportId, evidenceId }) {
  const evidence = await prisma.reportEvidence.findFirst({ where: { id: evidenceId, reportId } });
  if (!evidence) throw notFound("report evidence not found");
  return { path: await reportEvidenceStorage.readablePath(evidence.storageKey), fileType: evidence.fileType };
}

async function getReportChat({ reportId, before }) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");
  if (!report.productId) return { available: false, messages: [], nextCursor: null };

  const base = process.env.CHAT_SERVICE_URL || "http://chat-service:3004";
  const headers = { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "" };
  for (const buyerId of [report.reporterId, report.targetId].filter(Boolean)) {
    let conversationResponse;
    try {
      conversationResponse = await fetch(`${base}/internal/conversations/by-context/PRODUCT/${encodeURIComponent(report.productId)}?buyerId=${encodeURIComponent(buyerId)}`, { headers, signal: AbortSignal.timeout(5000) });
    } catch { throw new AppError(502, "chat history is temporarily unavailable"); }
    if (conversationResponse.status === 404) continue;
    if (!conversationResponse.ok) throw new AppError(502, "chat history is temporarily unavailable");
    const conversation = await conversationResponse.json();
    const participants = new Set((conversation.participants || []).map((person) => person.userId));
    if (!participants.has(report.reporterId) || (report.targetId && !participants.has(report.targetId))) continue;
    const query = new URLSearchParams({ limit: "50", ...(before ? { before } : {}) });
    let transcriptResponse;
    try {
      transcriptResponse = await fetch(`${base}/internal/conversations/${encodeURIComponent(conversation.id)}/transcript?${query}`, { headers, signal: AbortSignal.timeout(5000) });
    } catch { throw new AppError(502, "chat history is temporarily unavailable"); }
    if (!transcriptResponse.ok) throw new AppError(502, "chat history is temporarily unavailable");
    const page = await transcriptResponse.json();
    return {
      available: true,
      messages: (page.messages || []).map((message) => ({ id: message.id, senderId: message.senderId, body: message.body, type: message.type, createdAt: message.createdAt })),
      nextCursor: page.nextCursor || null,
    };
  }
  return { available: false, messages: [], nextCursor: null };
}

async function reviewReport({ reportId, adminId, staffId, requestId }) {
  const actorId = staffId || adminId;
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report) throw notFound("report not found");
    const claimed = await tx.report.updateMany({
      where: { id: reportId, status: "OPEN", reviewedBy: null },
      data: {
        status: "REVIEWED",
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });
    if (claimed.count !== 1) {
      throw conflict("report has already been reviewed or modified");
    }
    await recordAdminAction({
      actorId,
      action: "REPORT_REVIEWED",
      targetId: reportId,
      reason: "accepted for review",
      requestId,
      tx,
    });
    return tx.report.findUnique({ where: { id: reportId } });
  });
}

const VALID_DECISIONS = [
  "SUSPEND_USER",
  "WARN_USER",
  "RESTRICT_BUYER",
  "RESTRICT_SELLER",
  "REMOVE_PRODUCT",
  "REMOVE_REVIEW",
  "DISMISS",
];

const DECISION_LABELS = {
  SUSPEND_USER: "ระงับการใช้งานบัญชีผู้ใช้",
  WARN_USER: "ตักเตือนผู้ใช้",
  REMOVE_PRODUCT: "ลบสินค้าออกจากระบบ",
  REMOVE_REVIEW: "ลบรีวิวที่ถูกรายงาน",
  DISMISS: "ยกเลิกรายงาน / ไม่พบการกระทำผิด",
};

async function sendReportDecisionNotifications({ report, decision, reason }) {
  if (!report) return;

  const trimmedReason = reason?.trim() || "";
  const isReviewReport = Boolean(
    report.reason?.includes("[รายงานรีวิว") ||
    report.reason?.includes("เนื้อหารีวิว")
  );

  let productTitle = "สินค้า";
  let sellerId = null;
  if (report.productId) {
    try {
      const product = await productModerationClient.getProduct(report.productId);
      if (product?.title) productTitle = product.title;
      if (product?.sellerId) sellerId = product.sellerId;
    } catch {
      // product lookup error ignored
    }
  }

  const decisionLabel = DECISION_LABELS[decision] || decision;
  const notifications = [];

  // 1. Notify reporter (ผู้รายงาน)
  if (report.reporterId) {
    let reporterMsg = "";
    if (isReviewReport) {
      reporterMsg = `ผลการพิจารณารายงานความคิดเห็น: ${decisionLabel} (เหตุผล: ${trimmedReason})`;
    } else if (report.productId) {
      reporterMsg = `ผลการพิจารณารายงานสินค้า '${productTitle}': ${decisionLabel} (เหตุผล: ${trimmedReason})`;
    } else {
      reporterMsg = `ผลการพิจารณารายงานของคุณ: ${decisionLabel} (เหตุผล: ${trimmedReason})`;
    }

    notifications.push({
      userId: report.reporterId,
      type: "REPORT",
      title: "ผลการพิจารณารายงาน",
      message: reporterMsg,
      link: report.productId ? `/products/${report.productId}` : "/profile",
      entityId: `report:decision:${report.id}:reporter`,
      metadata: {
        reportId: report.id,
        decision,
        reason: trimmedReason,
        role: "reporter",
      },
    });
  }

  // 2. Notify target user (ผู้ถูกรายงาน)
  if (report.targetId && report.targetId !== report.reporterId) {
    let targetTitle = "ผลการพิจารณารายงาน";
    let targetMsg = "";

    if (decision === "SUSPEND_USER") {
      targetTitle = "บัญชีของคุณถูกระงับการใช้งาน";
      targetMsg = `Trust and Safety ได้ระงับการใช้งานบัญชีของคุณ เนื่องจาก: ${trimmedReason}`;
    } else if (decision === "WARN_USER") {
      targetTitle = "แจ้งเตือนคำเตือนจาก Trust and Safety";
      targetMsg = `คุณได้รับการตักเตือนจาก Trust and Safety เนื่องจาก: ${trimmedReason}`;
    } else if (decision === "REMOVE_PRODUCT") {
      targetTitle = "ผลการพิจารณารายงาน";
      targetMsg = isReviewReport
        ? `เนื้อหา/สินค้าที่เกี่ยวข้องถูกนำออกจากระบบโดย Trust and Safety เนื่องจาก: ${trimmedReason}`
        : `สินค้า '${productTitle}' ถูกลบออกจากระบบโดย Trust and Safety เนื่องจาก: ${trimmedReason}`;
    } else if (decision === "REMOVE_REVIEW") {
      targetTitle = "รีวิวของคุณถูกลบ";
      targetMsg = `รีวิวของคุณถูกลบโดยทีม Trust & Safety เนื่องจาก: ${trimmedReason}`;
    } else if (decision === "DISMISS") {
      targetTitle = "ผลการตรวจสอบรายงาน";
      targetMsg = isReviewReport
        ? `รายงานต่อความคิดเห็นของคุณได้รับการตรวจสอบแล้ว และ Trust and Safety ได้ยกเลิกรายงาน/ไม่พบการกระทำผิด (เหตุผล: ${trimmedReason})`
        : `รายงานที่เกี่ยวข้องกับคุณได้รับการตรวจสอบแล้ว และ Trust and Safety ได้ยกเลิกรายงาน (เหตุผล: ${trimmedReason})`;
    }

    notifications.push({
      userId: report.targetId,
      type: "REPORT",
      title: targetTitle,
      message: targetMsg,
      link: report.productId ? `/products/${report.productId}` : "/profile",
      entityId: `report:decision:${report.id}:target`,
      metadata: {
        reportId: report.id,
        decision,
        reason: trimmedReason,
        role: "target",
      },
    });
  }

  // 3. Notify seller (ผู้ขาย / เจ้าของสินค้า หากไม่ใช่ reporter หรือ target)
  if (
    sellerId &&
    sellerId !== report.reporterId &&
    sellerId !== report.targetId
  ) {
    let sellerTitle = "ผลการตรวจสอบรายงานในร้านค้าของคุณ";
    let sellerMsg = "";

    if (decision === "REMOVE_PRODUCT") {
      sellerTitle = "สินค้าของคุณถูกลบโดย Trust and Safety";
      sellerMsg = `สินค้า '${productTitle}' ของคุณถูกลบออกจากระบบโดย Trust and Safety เนื่องจาก: ${trimmedReason}`;
    } else if (decision === "DISMISS") {
      sellerTitle = "ผลการตรวจสอบรายงานสินค้า";
      sellerMsg = `รายงานต่อสินค้า '${productTitle}' ได้รับการตรวจสอบแล้ว และ Trust and Safety ได้ยกเลิกรายงาน (เหตุผล: ${trimmedReason})`;
    } else {
      sellerTitle = "ผลการพิจารณารายงานในสินค้าของคุณ";
      sellerMsg = `รายงานที่เกี่ยวข้องกับสินค้า '${productTitle}' ได้รับการพิจารณาแล้ว โดยมีผลการตัดสิน: ${decisionLabel} (เหตุผล: ${trimmedReason})`;
    }

    notifications.push({
      userId: sellerId,
      type: "REPORT",
      title: sellerTitle,
      message: sellerMsg,
      link:
        decision === "REMOVE_PRODUCT"
          ? "/seller/dashboard"
          : `/products/${report.productId}`,
      entityId: `report:decision:${report.id}:seller`,
      metadata: {
        reportId: report.id,
        decision,
        reason: trimmedReason,
        role: "seller",
      },
    });
  }

  for (const notif of notifications) {
    try {
      await chatClient.sendSystemNotification(notif);
    } catch (err) {
      console.error("[reportService] notify report decision failed:", err.message);
    }
  }
}

/**
 * A report must pass through REVIEWED first (reviewReport) — this keeps
 * the OPEN -> REVIEWED -> ACTIONED|DISMISSED lifecycle from plan.md strictly
 * sequential instead of letting a decision skip the review step.
 */
async function actionReport({
  reportId,
  adminId,
  staffId,
  decision,
  reason,
  requestId,
  idempotencyKey,
}) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();

  if (!VALID_DECISIONS.includes(decision)) {
    throw badRequest(`decision must be one of ${VALID_DECISIONS.join(", ")}`);
  }
  if (!trimmedReason) throw badRequest("reason is required");

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("report not found");
  if (report.status === "REVIEWED" && report.reviewedBy !== actorId) {
    throw forbidden("only the staff member who claimed this report can decide it");
  }

  if (decision === "REMOVE_REVIEW") {
    const reviewId = reviewIdForReport(report);
    if (!reviewId || !report.targetId) throw badRequest("report has no target review to remove");
    if (report.status === "ACTIONED" && report.actionTaken === decision) return report;
    if (report.status !== "REVIEWED") throw conflict("report must be reviewed before it can be actioned");
    // The owner service commits an idempotent deletion first. A retry can finish
    // the Auth transaction if the connection is lost between the two commits.
    const actioned = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reports WHERE id::text = ${reportId} FOR UPDATE`;
      const latest = await tx.report.findUnique({ where: { id: reportId } });
      if (latest?.status === "ACTIONED" && latest.actionTaken === decision) return latest;
      if (latest?.status !== "REVIEWED" || latest.reviewedBy !== actorId) {
        throw conflict("report was already actioned or modified");
      }
      await productModerationClient.removeReview(reviewId, {
        reason: trimmedReason, targetId: report.targetId, productId: report.productId, actorId,
      }, `report:${reportId}:REMOVE_REVIEW`);
      const claimed = await tx.report.updateMany({
        where: { id: reportId, status: "REVIEWED", reviewedBy: actorId },
        data: { status: "ACTIONED", actionTaken: decision },
      });
      if (claimed.count !== 1) {
        const replay = await tx.report.findUnique({ where: { id: reportId } });
        if (replay?.status === "ACTIONED" && replay.actionTaken === decision) return replay;
        throw conflict("report was already actioned or modified");
      }
      await recordAdminAction({ actorId, action: "REPORT_REMOVE_REVIEW", targetId: reportId, reason: trimmedReason, requestId, tx });
      return tx.report.findUnique({ where: { id: reportId } });
    }, { timeout: 15000 });
    await sendReportDecisionNotifications({ report: actioned, decision, reason: trimmedReason });
    return actioned;
  }

  if (decision === "REMOVE_PRODUCT") {
    if (reviewIdForReport(report)) throw badRequest("ไม่สามารถลบสินค้าจากรายงานรีวิว");
    if (!report.productId) {
      throw badRequest("report has no target product to remove");
    }
    if (
      report.status !== "REVIEWED" &&
      !(report.status === "ACTIONED" && report.actionTaken === decision)
    ) {
      throw conflict("report must be reviewed before it can be actioned");
    }
    return actionProductReport({
      report,
      actorId,
      reason: trimmedReason,
      requestId,
      idempotencyKey: idempotencyKey || `report:${reportId}:REMOVE_PRODUCT`,
    });
  }

  if (report.status !== "REVIEWED") {
    throw conflict("report must be reviewed before it can be actioned");
  }

  const actioned = await prisma.$transaction(async (tx) => {
    const claimed = await tx.report.updateMany({
      where: { id: reportId, status: "REVIEWED" },
      data: {
        status: decision === "DISMISS" ? "DISMISSED" : "ACTIONED",
        actionTaken: decision,
      },
    });
    if (claimed.count !== 1) {
      throw conflict("report was already actioned or modified");
    }

    if (decision === "SUSPEND_USER") {
      if (!report.targetId) {
        throw badRequest("report has no target user to suspend");
      }
      await suspendUserInTx(tx, {
        targetId: report.targetId,
        actorId,
        reason: trimmedReason,
        requestId,
      });
    } else if (decision === "WARN_USER") {
      if (!report.targetId) {
        throw badRequest("report has no target user to warn");
      }
      await warnUserInTx(tx, {
        targetId: report.targetId,
        actorId,
        reason: trimmedReason,
        requestId,
      });
    } else if (decision === "RESTRICT_BUYER" || decision === "RESTRICT_SELLER") {
      if (!report.targetId) throw badRequest("report has no target user to restrict");
      if (report.targetId === actorId) throw forbidden("staff cannot restrict themselves");
      const scope = decision === "RESTRICT_BUYER" ? "BUYER" : "SELLER";
      const user = await lockUser(tx, report.targetId);
      if (!user) throw notFound("user not found");
      if (user.status === "SUSPENDED") throw conflict("suspended user cannot be restricted");
      const roles = await authService.getUserRoles(report.targetId, tx);
      if (!roles.includes(scope)) throw conflict(`target account does not have the ${scope} role`);
      const nextStatus = combineRestrictionStatus(user.status, scope);
      if (!nextStatus || nextStatus === user.status) throw conflict("commerce scope is already restricted");
      await tx.user.update({ where: { id: report.targetId }, data: { status: nextStatus } });
      await recordAdminAction({ actorId, action: `COMMERCE_RESTRICTED_${scope}`, targetId: report.targetId, reason: trimmedReason, requestId, tx });
    }

    await recordAdminAction({
      actorId,
      action: `REPORT_${decision}`,
      targetId: reportId,
      reason: trimmedReason,
      requestId,
      tx,
    });

    return tx.report.findUnique({ where: { id: reportId } });
  });

  try {
    await sendReportDecisionNotifications({
      report: actioned,
      decision,
      reason: trimmedReason,
    });
  } catch (err) {
    console.error("[reportService] notify report decision error:", err.message);
  }

  return actioned;
}

async function actionProductReport({
  report,
  actorId,
  reason,
  requestId,
  idempotencyKey,
}) {
  const latest = await prisma.report.findUnique({ where: { id: report.id } });
  if (
    latest?.status === "ACTIONED" &&
    latest.actionTaken === "REMOVE_PRODUCT"
  ) {
    return latest;
  }
  if (latest?.status !== "REVIEWED") {
    throw conflict("report must be reviewed before it can be actioned");
  }

  await productModerationClient.removeProduct(
    report.productId,
    reason,
    idempotencyKey,
  );
  const actioned = await prisma.$transaction(async (tx) => {
    const claimed = await tx.report.updateMany({
      where: { id: report.id, status: "REVIEWED" },
      data: { status: "ACTIONED", actionTaken: "REMOVE_PRODUCT" },
    });
    if (claimed.count !== 1) {
      const replay = await tx.report.findUnique({ where: { id: report.id } });
      if (
        replay?.status === "ACTIONED" &&
        replay.actionTaken === "REMOVE_PRODUCT"
      ) {
        return replay;
      }
      throw conflict("report was already actioned or modified");
    }
    await recordAdminAction({
      actorId,
      action: "REPORT_REMOVE_PRODUCT",
      targetId: report.id,
      reason,
      requestId,
      tx,
    });
    return tx.report.findUnique({ where: { id: report.id } });
  });

  try {
    await sendReportDecisionNotifications({
      report: actioned,
      decision: "REMOVE_PRODUCT",
      reason,
    });
  } catch (err) {
    console.error("[reportService] notify report decision error:", err.message);
  }

  return actioned;
}

async function suspendUserInTx(tx, { targetId, actorId, reason, requestId }) {
  if (targetId === actorId) throw forbidden("staff cannot suspend themselves");
  const user = await lockUser(tx, targetId);
  if (!user) throw notFound("user not found");
  if (user.status === "SUSPENDED") throw conflict("user is already suspended");
  // Account status stores only one sanction. End the scoped restriction in the
  // same transaction before the full suspension replaces it in that field.
  if (isRestrictedStatus(user.status)) {
    await recordAdminAction({
      actorId,
      action: "COMMERCE_RESTRICTION_REVOKED",
      targetId,
      reason: `สิ้นสุดข้อจำกัดเดิมเมื่อระงับบัญชี: ${reason}`,
      requestId,
      tx,
    });
  }
  const updated = await tx.user.update({
    where: { id: targetId },
    data: { status: "SUSPENDED" },
  });
  await tx.refreshToken.updateMany({
    where: { userId: targetId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAdminAction({
    actorId,
    action: "USER_SUSPENDED",
    targetId,
    reason,
    requestId,
    tx,
  });
  return toPublicUser(updated);
}

async function warnUserInTx(tx, { targetId, actorId, reason, requestId }) {
  if (targetId === actorId) throw forbidden("staff cannot warn themselves");
  const user = await tx.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("user not found");
  await recordAdminAction({
    actorId,
    action: "USER_WARNED",
    targetId,
    reason,
    requestId,
    tx,
  });
  return toPublicUser(user);
}

async function suspendUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (targetId === actorId) throw forbidden("staff cannot suspend themselves");

  const result = await prisma.$transaction((tx) =>
    suspendUserInTx(tx, {
      targetId,
      actorId,
      reason: trimmedReason,
      requestId,
    }),
  );

  try {
    await chatClient.sendSystemNotification({
      userId: targetId,
      type: "REPORT",
      title: "บัญชีของคุณถูกระงับการใช้งาน",
      message: `บัญชีของคุณถูกระงับการใช้งานโดย Trust and Safety เนื่องจาก: ${trimmedReason}`,
      link: "/login",
      entityId: `admin:suspend:${targetId}:${Date.now()}`,
      metadata: { targetId, reason: trimmedReason, action: "USER_SUSPENDED" },
    });
  } catch (err) {
    console.error("[reportService] suspend notification failed:", err.message);
  }

  return result;
}

/**
 * The lighter-touch counterpart to suspendUser — records a formal warning
 * against the user without touching account status. Keyed by the user's own
 * id (not the report's), so it feeds getUserSafetySummary's `priorActions`
 * count the same way USER_SUSPENDED does — a repeat offender with three
 * warnings and no suspension is still visible as a repeat offender.
 */
async function warnUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");
  if (targetId === actorId) throw forbidden("staff cannot warn themselves");

  const result = await prisma.$transaction((tx) =>
    warnUserInTx(tx, {
      targetId,
      actorId,
      reason: trimmedReason,
      requestId,
    }),
  );

  try {
    await chatClient.sendSystemNotification({
      userId: targetId,
      type: "REPORT",
      title: "แจ้งเตือนคำเตือนจาก Trust and Safety",
      message: `คุณได้รับการตักเตือนจาก Trust and Safety เนื่องจาก: ${trimmedReason}`,
      link: "/profile",
      entityId: `admin:warn:${targetId}:${Date.now()}`,
      metadata: { targetId, reason: trimmedReason, action: "USER_WARNED" },
    });
  } catch (err) {
    console.error("[reportService] warn notification failed:", err.message);
  }

  return result;
}

async function restoreUser({ targetId, adminId, staffId, reason, requestId }) {
  const actorId = staffId || adminId;
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw badRequest("reason is required");

  const result = await prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, targetId);
    if (!user) throw notFound("user not found");
    if (user.status !== "SUSPENDED") throw conflict("user is not suspended");

    const updated = await tx.user.update({
      where: { id: targetId },
      data: { status: "ACTIVE" },
    });
    // Also invalidates sessions belonging to accounts suspended before rollout.
    await tx.refreshToken.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.adminAudit.create({
      data: {
        actorId,
        action: "USER_RESTORED",
        targetId,
        reason: trimmedReason,
        requestId,
      },
    });
    return toPublicUser(updated);
  });

  try {
    await chatClient.sendSystemNotification({
      userId: targetId,
      type: "REPORT",
      title: "บัญชีของคุณได้รับการคืนสถานะ",
      message: `บัญชีของคุณได้รับการปลดระงับและคืนสถานะการใช้งานแล้ว (เหตุผล: ${trimmedReason})`,
      link: "/profile",
      entityId: `admin:restore:${targetId}:${Date.now()}`,
      metadata: { targetId, reason: trimmedReason, action: "USER_RESTORED" },
    });
  } catch (err) {
    console.error("[reportService] restore notification failed:", err.message);
  }

  return result;
}

async function getUserSafetySummary(targetId) {
  const [
    reportCount,
    priorActions,
    suspensionCount,
    warningCount,
    commerceRestrictionCount,
    restoreCount,
  ] = await Promise.all([
    prisma.report.count({ where: { targetId } }),
    prisma.adminAudit.count({ where: { targetId } }),
    prisma.adminAudit.count({
      where: { targetId, action: "USER_SUSPENDED" },
    }),
    prisma.adminAudit.count({
      where: { targetId, action: "USER_WARNED" },
    }),
    prisma.adminAudit.count({
      where: {
        targetId,
        action: {
          in: [
            "COMMERCE_RESTRICTED_BUYER",
            "COMMERCE_RESTRICTED_SELLER",
            "COMMERCE_RESTRICTED_ALL",
          ],
        },
      },
    }),
    prisma.adminAudit.count({
      where: { targetId, action: "USER_RESTORED" },
    }),
  ]);

  return {
    // Cross-service completed-order count is out of ADM-003 scope (order-service
    // isn't an owned file here — see decision.md ADM-DEC-011): unavailable
    // rather than a fabricated zero, per integration.md's Gate 1 rule.
    completedOrders: null,
    completedOrdersAvailable: false,
    reportCount,
    priorActions,
    suspensionCount,
    warningCount,
    commerceRestrictionCount,
    restoreCount,
  };
}

const USER_ACTIONS = [
  "USER_WARNED",
  "USER_SUSPENDED",
  "USER_RESTORED",
  "COMMERCE_RESTRICTED_BUYER",
  "COMMERCE_RESTRICTED_SELLER",
  "COMMERCE_RESTRICTED_ALL",
  "COMMERCE_RESTRICTION_REVOKED",
];

async function listUserHistory({ targetId, kind, page, limit }) {
  if (kind === "reports") {
    const where = { targetId };
    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: {
          id: true,
          reporterId: true,
          productId: true,
          reason: true,
          status: true,
          actionTaken: true,
          reportedAt: true,
          reviewedAt: true,
        },
        orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);
    return { items, total };
  }

  if (kind !== "actions") {
    throw badRequest("kind must be one of reports or actions");
  }
  const where = { targetId, action: { in: USER_ACTIONS } };
  const [audits, total] = await Promise.all([
    prisma.adminAudit.findMany({
      where,
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminAudit.count({ where }),
  ]);

  const requestIds = audits.map((item) => item.requestId).filter(Boolean);
  const sources = requestIds.length
    ? await prisma.adminAudit.findMany({
        where: {
          requestId: { in: requestIds },
          action: { startsWith: "REPORT_", not: "REPORT_REVIEWED" },
        },
        select: { requestId: true, targetId: true },
      })
    : [];
  const sourceByRequest = new Map(
    sources.map((source) => [source.requestId, source.targetId]),
  );
  return {
    total,
    items: audits.map((audit) => ({
      ...audit,
      sourceReportId: audit.requestId
        ? sourceByRequest.get(audit.requestId) || null
        : null,
    })),
  };
}

async function getUserDetail(identifier) {
  const user = await findSupportUser(prisma, identifier);

  const safetySummary = await getUserSafetySummary(user.id);
  const roles =
    user.roles && user.roles.length > 0
      ? user.roles.map((r) => r.role)
      : [user.role];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    commerceRestrictions: restrictionsForStatus(user.status),
    createdAt: user.createdAt,
    roles,
    sellerProfile: user.sellerProfile
      ? {
          shopName: user.sellerProfile.shopName,
          kycStatus: user.sellerProfile.kycStatus,
          verifiedAt: user.sellerProfile.verifiedAt,
        }
      : null,
    safetySummary,
  };
}

module.exports = {
  createReport,
  checkPendingReport,
  getMyReportedReviewIds,
  sendReportDecisionNotifications,
  listReports,
  getReportDetail,
  viewReportEvidence,
  getReportChat,
  reviewReport,
  actionReport,
  suspendUser,
  warnUser,
  restoreUser,
  getUserSafetySummary,
  listUserHistory,
  getUserDetail,
  recordAdminAction,
};
