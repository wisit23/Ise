const { parsePagination, paginatedResponse } = require("@reloop/shared");
const auctionService = require("./auctionService");

function currentUser(req) {
  return {
    id: req.userId,
    role: req.userRole,
    kycVerified: req.kycVerified,
    kycStatus: req.kycStatus,
  };
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
      reason: req.body?.reason,
      cancellationReason: req.body?.cancellationReason,
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
    const { status, roundId } = req.query;
    const { items, total } = await auctionService.list({
      status,
      roundId,
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

async function getCurrentRound(req, res, next) {
  try {
    const data = await auctionService.getCurrentRound();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function browseRounds(req, res, next) {
  try {
    const data = await auctionService.browseRounds();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getRoundDetails(req, res, next) {
  try {
    const data = await auctionService.getRound(req.params.roundId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getRoundItems(req, res, next) {
  try {
    const data = await auctionService.listRoundItems(req.params.roundId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function createRound(req, res, next) {
  try {
    const round = await auctionService.createRound({
      user: currentUser(req),
      input: req.body,
    });
    res.status(201).json(round);
  } catch (err) {
    next(err);
  }
}

async function listRounds(req, res, next) {
  try {
    const rounds = await auctionService.listRounds({
      user: currentUser(req),
    });
    res.json({ items: rounds });
  } catch (err) {
    next(err);
  }
}

async function cancelRound(req, res, next) {
  try {
    const round = await auctionService.cancelRound({
      user: currentUser(req),
      roundId: req.params.roundId,
      reason: req.body?.reason ?? req.body?.cancellationReason,
    });
    res.json(round);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submit,
  approve,
  reject,
  schedule,
  cancel,
  getOne,
  list,
  bid,
  getCurrentRound,
  browseRounds,
  getRoundDetails,
  getRoundItems,
  createRound,
  listRounds,
  cancelRound,
};
