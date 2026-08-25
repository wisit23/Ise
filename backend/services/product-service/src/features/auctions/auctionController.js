const { parsePagination, paginatedResponse } = require("@reloop/shared");
const auctionService = require("./auctionService");

function currentUser(req) {
  return { id: req.userId, role: req.userRole };
}

async function submit(req, res, next) {
  try {
    const auction = await auctionService.submit({
      user: currentUser(req),
      input: req.body,
    });
    res.status(201).json(auction);
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const auction = await auctionService.approve({
      user: currentUser(req),
      auctionId: req.params.id,
    });
    res.json(auction);
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const auction = await auctionService.reject({
      user: currentUser(req),
      auctionId: req.params.id,
    });
    res.json(auction);
  } catch (err) {
    next(err);
  }
}

async function schedule(req, res, next) {
  try {
    const auction = await auctionService.schedule({
      user: currentUser(req),
      auctionId: req.params.id,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
    });
    res.json(auction);
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const auction = await auctionService.cancel({
      user: currentUser(req),
      auctionId: req.params.id,
    });
    res.json(auction);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const auction = await auctionService.get(req.params.id);
    res.json(auction);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 10);
    const { status } = req.query;
    const { items, total } = await auctionService.list({
      status,
      skip: pagination.skip,
      take: pagination.take,
    });
    res.json(paginatedResponse(items, total, pagination));
  } catch (err) {
    next(err);
  }
}

async function bid(req, res, next) {
  try {
    const created = await auctionService.placeBid({
      user: currentUser(req),
      auctionId: req.params.id,
      amount: req.body.amount,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

module.exports = { submit, approve, reject, schedule, cancel, getOne, list, bid };
