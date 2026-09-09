const {
  badRequest,
  notFound,
  forbidden,
  parsePagination,
  paginatedResponse,
} = require("@reloop/shared");
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
  if (!actor.role || !["MARKETING", "ADMIN"].includes(actor.role)) {
    throw forbidden("เฉพาะฝ่ายการตลาด (Marketing) หรือผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ดำเนินการนี้");
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
    const isMarketingStaff =
      actor.role && ["MARKETING", "ADMIN"].includes(actor.role);
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

    const article = await articleModel.create({
      title: title.trim(),
      summary: summary ? summary.trim() : null,
      content: content.trim(),
      coverImage: coverImage || null,
      category: category || "general",
      status: status || "draft",
      authorId: actor.id,
      authorName: actor.displayName || "ทีมการตลาด RE-LOOP",
    });

    return res.status(201).json({ article });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    requireMarketingRole(req);
    const { id } = req.params;
    const { title, summary, content, coverImage, category, status } = req.body;

    const payload = {};
    if (title !== undefined) payload.title = title.trim();
    if (summary !== undefined) payload.summary = summary ? summary.trim() : null;
    if (content !== undefined) payload.content = content.trim();
    if (coverImage !== undefined) payload.coverImage = coverImage || null;
    if (category !== undefined) payload.category = category;
    if (status !== undefined) payload.status = status;

    const article = await articleModel.update(id, payload);
    if (!article) {
      throw notFound("ไม่พบบทความที่ต้องการแก้ไข");
    }
    return res.json({ article });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    requireMarketingRole(req);
    const { id } = req.params;
    await articleModel.remove(id);
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
