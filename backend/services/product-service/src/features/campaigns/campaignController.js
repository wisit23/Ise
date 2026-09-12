const { parsePagination, paginatedResponse } = require("@reloop/shared");
const campaignService = require("./campaignService");

function currentUser(req) {
  return {
    id: req.userId,
    role: req.userRole,
    roles: req.userRoles || (req.userRole ? [req.userRole] : []),
  };
}

async function createDraft(req, res, next) {
  try {
    const campaign = await campaignService.createDraft({
      user: currentUser(req),
      input: req.body,
    });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
}

async function updateDraft(req, res, next) {
  try {
    const campaign = await campaignService.updateDraft({
      user: currentUser(req),
      campaignId: req.params.id,
      input: req.body,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function submitForApproval(req, res, next) {
  try {
    const campaign = await campaignService.submitForApproval({
      user: currentUser(req),
      campaignId: req.params.id,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const campaign = await campaignService.approveCampaign({
      user: currentUser(req),
      campaignId: req.params.id,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const campaign = await campaignService.rejectCampaign({
      user: currentUser(req),
      campaignId: req.params.id,
      reason: req.body?.reason,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function publish(req, res, next) {
  try {
    const campaign = await campaignService.publishCampaign({
      user: currentUser(req),
      campaignId: req.params.id,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function end(req, res, next) {
  try {
    const campaign = await campaignService.endCampaign({
      user: currentUser(req),
      campaignId: req.params.id,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const campaign = await campaignService.getCampaign({
      campaignId: req.params.id,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);
    const { items, total } = await campaignService.listCampaigns({
      user: currentUser(req),
      status: req.query.status,
      search: req.query.search,
      skip,
      take,
    });
    res.json(paginatedResponse(items, total, { page, limit }));
  } catch (err) {
    next(err);
  }
}

async function listAvailable(req, res, next) {
  try {
    const campaigns = await campaignService.listAvailablePublicCampaigns();
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
}

async function claim(req, res, next) {
  try {
    const voucher = await campaignService.claimVoucher({
      user: currentUser(req),
      campaignId: req.params.id,
    });
    res.status(201).json(voucher);
  } catch (err) {
    next(err);
  }
}

async function myVouchers(req, res, next) {
  try {
    const vouchers = await campaignService.getMyVouchers({
      user: currentUser(req),
      status: req.query.status,
    });
    res.json(vouchers);
  } catch (err) {
    next(err);
  }
}

async function applicable(req, res, next) {
  try {
    const vouchers = await campaignService.getApplicableVouchers({
      user: currentUser(req),
      price: req.body.price,
      category: req.body.category,
    });
    res.json(vouchers);
  } catch (err) {
    next(err);
  }
}

async function deleteDraft(req, res, next) {
  try {
    await campaignService.deleteDraft({
      user: currentUser(req),
      campaignId: req.params.id,
    });
    res.json({ success: true, message: "campaign deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function hold(req, res, next) {
  try {
    const user = req.user || (req.body.userId ? { id: req.body.userId } : currentUser(req));
    const voucher = await campaignService.holdVoucher({
      user,
      campaignId: req.params.id,
      orderId: req.body.orderId,
    });
    res.json({ success: true, voucher });
  } catch (err) {
    next(err);
  }
}

async function release(req, res, next) {
  try {
    const user = req.user || (req.body.userId ? { id: req.body.userId } : currentUser(req));
    const voucher = await campaignService.releaseVoucher({
      user,
      campaignId: req.params.id,
      orderId: req.body.orderId,
    });
    res.json({ success: true, voucher });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const user = req.user || (req.body.userId ? { id: req.body.userId } : currentUser(req));
    const voucher = await campaignService.completeVoucher({
      user,
      campaignId: req.params.id,
      orderId: req.body.orderId,
    });
    res.json({ success: true, voucher });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createDraft,
  updateDraft,
  deleteDraft,
  submitForApproval,
  approve,
  reject,
  publish,
  end,
  getOne,
  list,
  listAvailable,
  claim,
  myVouchers,
  applicable,
  hold,
  release,
  complete,
};
