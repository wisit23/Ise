const { parsePagination, paginatedResponse } = require("@reloop/shared");
const helpService = require("./helpService");

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
      role: req.userRole,
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
      role: req.userRole,
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
      role: req.userRole,
      id: req.params.id,
    });
    res.json(article);
  } catch (err) {
    next(err);
  }
}

module.exports = { search, manage, create, publish };
