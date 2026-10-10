const {
  badRequest,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
const defaultPrisma = require("../models/prismaClient");
const {
  recordMarketingAudit,
} = require("../features/audit/marketingAuditService");
const articleModel = require("../models/articleModel");

function getActor(req) {
  return {
    id: req.userId || req.user?.id,
    role: req.userRole || req.user?.role,
    displayName: req.userDisplayName || req.user?.displayName,
  };
}

function requireMarketingRole(req) {
  const actor = getActor(req);
  if (!actor.role || actor.role !== "MARKETING") {
    throw forbidden(
      "เฉพาะฝ่ายการตลาด (Marketing) เท่านั้นที่มีสิทธิ์ดำเนินการนี้",
    );
  }
}

async function listPublic(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 12);
    const { q, category } = req.query;
    const { items, total } = await articleModel.searchPublished({
      q,
      category,
      skip: pagination.skip,
      take: pagination.take,
    });
    return res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const actor = getActor(req);
    const isMarketingStaff = actor.role === "MARKETING";
    const article = await articleModel.getById(id, {
      allowDraft: isMarketingStaff,
    });
    if (!article) {
      throw notFound("ไม่พบบทความที่ต้องการ");
    }
    return res.json({ article });
  } catch (err) {
    next(err);
  }
}

async function listMarketing(req, res, next) {
  try {
    requireMarketingRole(req);
    const pagination = parsePagination(req.query, 20);
    const { status, category, q } = req.query;
    const { items, total } = await articleModel.listAllForMarketing({
      status,
      category,
      q,
      skip: pagination.skip,
      take: pagination.take,
    });
    return res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    requireMarketingRole(req);
    const actor = getActor(req);
    const { title, summary, content, coverImage, category, status } = req.body;

    if (!title || !title.trim()) {
      throw badRequest("กรุณาระบุชื่อหัวข้อบทความ (title)");
    }
    if (!content || !content.trim()) {
      throw badRequest("กรุณาระบุเนื้อหาบทความ (content)");
    }

    const runTx = articleModel.transaction
      ? (fn) => articleModel.transaction(fn)
      : (fn) => defaultPrisma.$transaction(fn);

    const article = await runTx(async (tx) => {
      const created = await articleModel.create(
        {
          title: title.trim(),
          summary: summary ? summary.trim() : null,
          content: content.trim(),
          coverImage: coverImage || null,
          category: category || "general",
          status: status || "draft",
          authorId: actor.id,
          authorName: actor.displayName || "ทีมการตลาด RE-LOOP",
        },
        { tx },
      );

      await recordMarketingAudit(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: "ARTICLE_CREATE",
          entityType: "ARTICLE",
          entityId: created.id,
          previousState: null,
          newState: created,
        },
        { tx },
      );

      if (created.status === "published") {
        await recordMarketingAudit(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: "ARTICLE_PUBLISH",
            entityType: "ARTICLE",
            entityId: created.id,
            previousState: null,
            newState: created,
          },
          { tx },
        );
      }

      return created;
    });

    return res.status(201).json({ article });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    requireMarketingRole(req);
    const actor = getActor(req);
    const { id } = req.params;
    const { title, summary, content, coverImage, category, status } = req.body;

    const existing = await articleModel.getById(id, { allowDraft: true });
    if (!existing) {
      throw notFound("ไม่พบบทความที่ต้องการแก้ไข");
    }

    const payload = {};
    let isContentChanged = false;

    if (title !== undefined) {
      const cleanTitle = title.trim();
      payload.title = cleanTitle;
      if (cleanTitle !== existing.title) isContentChanged = true;
    }
    if (summary !== undefined) {
      const cleanSummary = summary ? summary.trim() : null;
      payload.summary = cleanSummary;
      if (cleanSummary !== existing.summary) isContentChanged = true;
    }
    if (content !== undefined) {
      const cleanContent = content.trim();
      payload.content = cleanContent;
      if (cleanContent !== existing.content) isContentChanged = true;
    }
    if (coverImage !== undefined) {
      const cleanCover = coverImage || null;
      payload.coverImage = cleanCover;
      if (cleanCover !== existing.coverImage) isContentChanged = true;
    }
    if (category !== undefined) {
      payload.category = category;
      if (category !== existing.category) isContentChanged = true;
    }

    const oldStatus = existing.status;
    const newStatus = status !== undefined ? status : oldStatus;
    const isStatusChanged = status !== undefined && status !== oldStatus;
    if (status !== undefined) {
      payload.status = status;
    }

    if (!isContentChanged && !isStatusChanged) {
      isContentChanged = true;
    }

    const runTx = articleModel.transaction
      ? (fn) => articleModel.transaction(fn)
      : (fn) => defaultPrisma.$transaction(fn);

    const article = await runTx(async (tx) => {
      const updated = await articleModel.update(id, payload, { tx });

      if (isContentChanged) {
        await recordMarketingAudit(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: "ARTICLE_UPDATE",
            entityType: "ARTICLE",
            entityId: id,
            previousState: existing,
            newState: updated,
          },
          { tx },
        );
      }

      if (isStatusChanged && newStatus === "published") {
        await recordMarketingAudit(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: "ARTICLE_PUBLISH",
            entityType: "ARTICLE",
            entityId: id,
            previousState: existing,
            newState: updated,
          },
          { tx },
        );
      }

      if (isStatusChanged && newStatus === "archived") {
        await recordMarketingAudit(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: "ARTICLE_ARCHIVE",
            entityType: "ARTICLE",
            entityId: id,
            previousState: existing,
            newState: updated,
          },
          { tx },
        );
      }

      return updated;
    });

    return res.json({ article });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    requireMarketingRole(req);
    const actor = getActor(req);
    const { id } = req.params;

    const existing = await articleModel.getById(id, { allowDraft: true });
    if (!existing) {
      throw notFound("ไม่พบบทความที่ต้องการลบ");
    }

    const runTx = articleModel.transaction
      ? (fn) => articleModel.transaction(fn)
      : (fn) => defaultPrisma.$transaction(fn);

    await runTx(async (tx) => {
      await articleModel.remove(id, { tx });
      await recordMarketingAudit(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: "ARTICLE_DELETE",
          entityType: "ARTICLE",
          entityId: id,
          previousState: existing,
          newState: null,
        },
        { tx },
      );
    });

    return res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPublic,
  getOne,
  listMarketing,
  create,
  update,
  remove,
};
