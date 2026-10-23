const { parsePagination, paginatedResponse } = require("@reloop/shared");
const auctionService = require("./auctionService");

function splitFilterValues(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) =>
      typeof entry === "string" ? entry.split(",") : [],
    )
    .map((entry) => entry.trim())
    .filter(Boolean);
}

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
      reason: req.body?.reason ?? req.body?.cancellationReason,
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
    const { status, roundId, search } = req.query;
    const statuses = splitFilterValues(req.query.statuses);
    const roundIds = splitFilterValues(req.query.roundIds);
    const { items, total } = await auctionService.list({
      status,
      roundId,
      statuses,
      roundIds,
      search,
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

async function getBids(req, res, next) {
  try {
    const bids = await auctionService.getBids(req.params.id);
    res.json({ items: bids });
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
    const phases = splitFilterValues(req.query.phases);
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const isPaginated =
      req.query.page !== undefined || req.query.limit !== undefined;

    if (isPaginated) {
      const pagination = parsePagination(req.query, 20);
      const { items, total } = await auctionService.listRounds({
        user: currentUser(req),
        skip: pagination.skip,
        take: pagination.take,
        phases,
        search,
      });
      return res.json(paginatedResponse(items, total, pagination));
    }

    const rounds = await auctionService.listRounds({
      user: currentUser(req),
      phases,
      search,
    });
    const items = Array.isArray(rounds) ? rounds : rounds?.items || [];
    const total = Array.isArray(rounds)
      ? rounds.length
      : rounds?.total ?? items.length;
    res.json({ items, total });
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
  updateRound: async (req, res, next) => {
    try {
      const service = require("./roundScheduleService");
      res.json(await service.updateRound({ user: currentUser(req), roundId: req.params.roundId, input: req.body }));
    } catch (err) { next(err); }
  },
  submit,
  approve,
  reject,
  schedule,
  cancel,
  getOne,
  list,
  bid,
  getBids,
  getCurrentRound,
  browseRounds,
  getRoundDetails,
  getRoundItems,
  createRound,
  listRounds,
  cancelRound,
};
