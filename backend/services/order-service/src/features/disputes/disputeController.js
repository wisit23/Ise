const { parsePagination, paginatedResponse } = require("@reloop/shared");
const disputeService = require("./disputeService");
const { upload } = require("./evidenceStorage");

async function open(req, res, next) {
  try {
    const dispute = await disputeService.open({
      orderId: req.params.id,
      userId: req.userId,
      reason: req.body.reason,
    });
    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const dispute = await disputeService.getById({
      disputeId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

async function getByOrderId(req, res, next) {
  try {
    const dispute = await disputeService.getByOrderId({
      orderId: req.params.orderId,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

async function queue(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { items, total } = await disputeService.listQueue({
      role: req.userRole,
      roles: req.userRoles,
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

const uploadEvidence = [
  upload.single("file"),
  async (req, res, next) => {
    try {
      const evidence = await disputeService.addEvidence({
        disputeId: req.params.id,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        file: req.file,
      });
      res.status(201).json(evidence);
    } catch (err) {
      next(err);
    }
  },
];

async function viewEvidence(req, res, next) {
  try {
    const { path: filePath, fileType } = await disputeService.viewEvidence({
      disputeId: req.params.id,
      evidenceId: req.params.evidenceId,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
    });
    res.setHeader("Content-Type", fileType);
    require("fs").createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

async function claim(req, res, next) {
  try {
    const dispute = await disputeService.claim({
      disputeId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
      version: req.body.version,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

async function reassign(req, res, next) {
  try {
    const dispute = await disputeService.reassign({
      disputeId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
      toUserId: req.body.toUserId,
      reason: req.body.reason,
      version: req.body.version,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

async function escalate(req, res, next) {
  try {
    const dispute = await disputeService.escalate({
      disputeId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
      reason: req.body.reason,
      toUserId: req.body.toUserId,
      version: req.body.version,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

async function decide(req, res, next) {
  try {
    const dispute = await disputeService.decide({
      disputeId: req.params.id,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
      decision: req.body.decision,
      reason: req.body.reason,
      version: req.body.version,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  open,
  getOne,
  getByOrderId,
  queue,
  uploadEvidence,
  viewEvidence,
  claim,
  reassign,
  escalate,
  decide,
};
