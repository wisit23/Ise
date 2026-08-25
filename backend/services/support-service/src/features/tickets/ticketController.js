const { parsePagination, paginatedResponse } = require("@reloop/shared");
const ticketService = require("./ticketService");

async function create(req, res, next) {
  try {
    const ticket = await ticketService.createTicket({
      requesterId: req.userId,
      subject: req.body.subject,
      description: req.body.description,
      category: req.body.category,
      orderId: req.body.orderId,
    });
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { items, total } = await ticketService.listMine(req.userId, {
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function queue(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total } = await ticketService.listQueue({
      role: req.userRole,
      userId: req.userId,
      scope: req.query.scope,
      status: req.query.status,
      search: req.query.q,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const ticket = await ticketService.getTicket({
      ticketId: req.params.id,
      userId: req.userId,
      role: req.userRole,
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

async function reply(req, res, next) {
  try {
    const message = await ticketService.reply({
      ticketId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      body: req.body.body,
      isInternal: req.body.isInternal,
    });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function assign(req, res, next) {
  try {
    const ticket = await ticketService.assignToSelf({
      ticketId: req.params.id,
      userId: req.userId,
      role: req.userRole,
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

async function changeStatus(req, res, next) {
  try {
    const ticket = await ticketService.changeStatus({
      ticketId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      status: req.body.status,
      reason: req.body.reason,
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, mine, queue, getOne, reply, assign, changeStatus };
