const { parsePagination, paginatedResponse } = require("@reloop/shared");
const helpService = require("./helpService");
const { effectiveStaffRole } = require("../staffRole");

async function search(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total } = await helpService.searchPublic({
      q: req.query.q,
      category: req.query.category,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function manage(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total } = await helpService.listForAgent({
      role: effectiveStaffRole(req),
      status: req.query.status,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const article = await helpService.createDraft({
      role: effectiveStaffRole(req),
      authorId: req.userId,
      title: req.body.title,
      body: req.body.body,
      category: req.body.category,
    });
    res.status(201).json(article);
  } catch (err) {
    next(err);
  }
}

async function publish(req, res, next) {
  try {
    const article = await helpService.publish({
      role: effectiveStaffRole(req),
      id: req.params.id,
      version: req.body?.version,
    });
    res.json(article);
  } catch (err) {
    next(err);
  }
}

async function revise(req, res, next) {
  try {
    const article = await helpService.revise({
      role: effectiveStaffRole(req),
      id: req.params.id,
      authorId: req.userId,
      title: req.body.title,
      body: req.body.body,
      category: req.body.category,
    });
    res.status(201).json(article);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await helpService.remove({
      role: effectiveStaffRole(req),
      id: req.params.id,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { search, manage, create, revise, publish, remove };
