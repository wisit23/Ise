const { parsePagination, paginatedResponse } = require("@reloop/shared");
const disputeService = require("./disputeService");
const { upload } = require("./evidenceStorage");

async function open(req, res, next) {
  try {
    const dispute = await disputeService.open({
      orderId: req.params.id,
      userId: req.userId,
      reason: req.body.reason,
      disputeType: req.body.disputeType,
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

async function joinConversation(req, res, next) {
  try {
    res.json(
      await disputeService.joinConversation({
        disputeId: req.params.id,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        side: req.body?.side,
      }),
    );
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
      assignedRole: req.query.assignedRole,
      search: req.query.q,
      scope: req.query.scope,
      work: req.query.work,
      retention: req.query.retention,
      userId: req.userId,
      priority: req.query.priority,
      sort: req.query.sort,
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
    res.sendFile(filePath, err => { if(err) next(err); });
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
      idempotencyKey: req.get("Idempotency-Key") || req.body.idempotencyKey,
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
}

async function requestMoreEvidence(req, res, next) {
  try {
    res.json(
      await disputeService.requestMoreEvidence({
        disputeId: req.params.id,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        reason: req.body.reason,
        version: req.body.version,
        tasks: req.body.tasks,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function updateReturnTask(req, res, next) {
  try {
    res.json(
      await disputeService.updateReturnTask({
        disputeId: req.params.id,
        taskId: req.params.taskId,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        done: req.body.done,
        note: req.body.note,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function auditTranscript(req, res, next) {
  try {
    res.json(
      await disputeService.getAuditTranscript({
        disputeId: req.params.id,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        side: req.query.side || "buyer",
        before: req.query.before,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function setEvidenceDeadline(req, res, next) {
  try {
    res.json(
      await disputeService.setEvidenceDeadline({
        disputeId: req.params.id,
        evidenceId: req.params.evidenceId,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        deadline: req.body.deadline,
        version: req.body.version,
      }),
    );
  } catch (err) {
    next(err);
  }
}
async function dashboard(req, res, next) {
  try {
    res.json(
      await disputeService.getDashboardMetrics({
        role: req.userRole,
        roles: req.userRoles,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function chatHistory(req, res, next) {
  try {
    res.json(
      await disputeService.getChatHistory({
        disputeId: req.params.id,
      source:req.query.source,
        userId: req.userId,
        role: req.userRole,
        roles: req.userRoles,
        before: req.query.before,
        limit: req.query.limit,
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function chatAttachment(req, res, next) {
  try {
    const attachment = await disputeService.getChatAttachment({
      disputeId: req.params.id,
      messageId: req.params.messageId,
      source:req.query.source,
      userId: req.userId,
      role: req.userRole,
      roles: req.userRoles,
    });
    res.setHeader("Content-Type", attachment.contentType);
    if (attachment.contentDisposition) {
      res.setHeader("Content-Disposition", attachment.contentDisposition);
    }
    res.send(attachment.bytes);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateReturnTask,
  chatAttachment,
  chatHistory,
  dashboard,
  setEvidenceDeadline,
  open,
  getOne,
  getByOrderId,
  joinConversation,
  queue,
  uploadEvidence,
  viewEvidence,
  claim,
  reassign,
  escalate,
  decide,
  requestMoreEvidence,
  auditTranscript,
};
