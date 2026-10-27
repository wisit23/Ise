const { parsePagination, paginatedResponse } = require("@reloop/shared");
const ticketService = require("./ticketService");
const ticketModeration = require("./ticketModeration");
const { effectiveStaffRole } = require("../staffRole");

async function create(req, res, next) {
  try {
    const ticket = await ticketService.createTicket({
      requesterId: req.userId,
      subject: req.body.subject,
      description: req.body.description,
      category: req.body.category,
      orderId: req.body.orderId,
      targetId: req.body.targetId,
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
      role: effectiveStaffRole(req),
      userId: req.userId,
      scope: req.query.scope,
      work: req.query.work,
      retention: req.query.retention,
      status: req.query.status,
      priority: req.query.priority,
      search: req.query.q,
      sort: req.query.sort,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function dashboard(req, res, next) {
  try {
    res.json(
      await ticketService.getDashboardMetrics({
        role: req.userRole,
        days: req.query.days,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const ticket = await ticketService.getTicket({
      ticketId: req.params.id,
      userId: req.userId,
      role: effectiveStaffRole(req),
      before: req.query.before,
      limit: req.query.limit,
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
      role: effectiveStaffRole(req),
      body: req.body.body,
      isInternal: req.body.isInternal,
      eventKey: req.get("Idempotency-Key") || req.body.eventKey,
    });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function assign(req, res, next) {
  try {
    const ticket = await ticketService.assignToSelf({
      version: req.body?.version,
      ticketId: req.params.id,
      userId: req.userId,
      role: effectiveStaffRole(req),
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

async function takeover(req, res, next) {
  try {
    const ticket = await ticketService.takeoverTicket({
      ticketId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      version: req.body.version,
      reason: req.body.reason,
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

async function requestMoreEvidence(req, res, next) {
  try {
    res.json(
      await ticketService.requestMoreEvidence({
        ticketId: req.params.id,
        userId: req.userId,
        role: effectiveStaffRole(req),
        version: req.body?.version,
        reason: req.body?.reason,
        tasks: req.body?.tasks,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function updateReturnTask(req, res, next) {
  try {
    res.json(
      await ticketService.updateReturnTask({
        ticketId: req.params.id,
        taskId: req.params.taskId,
        userId: req.userId,
        role: effectiveStaffRole(req),
        done: req.body?.done,
        note: req.body?.note,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function changeStatus(req, res, next) {
  try {
    const ticket = await ticketService.changeStatus({
      version: req.body?.version,
      ticketId: req.params.id,
      userId: req.userId,
      role: effectiveStaffRole(req),
      status: req.body.status,
      reason: req.body.reason,
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    const result = await ticketService.getTicketConversation({
      ticketId: req.params.id,
      userId: req.userId,
      role: effectiveStaffRole(req),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function joinChat(req, res, next) {
  try {
    const result = await ticketService.joinTicketChat({
      ticketId: req.params.id,
      userId: req.userId,
      role: effectiveStaffRole(req),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function moderate(req, res, next) {
  try {
    res.json(await ticketModeration.moderateTicket({
      ticketId: req.params.id, userId: req.userId,
      role: effectiveStaffRole(req),
      version: req.body.version, action: req.body.action, targetId: req.body.targetId,
      reason: req.body.reason, authorization: req.headers.authorization,
    }));
  } catch (err) { next(err); }
}

module.exports = {
  moderate,
  create,
  mine,
  queue,
  dashboard,
  getOne,
  reply,
  assign,
  takeover,
  requestMoreEvidence,
  updateReturnTask,
  changeStatus,
  getConversation,
  joinChat,
};
