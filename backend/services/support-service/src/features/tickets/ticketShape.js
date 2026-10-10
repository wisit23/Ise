// Normalize persistence rows into the API shape used by the existing UI.
const ticketInclude = {
  category: true,
  priority: true,
  currentStatus: true,
  assignments: {
    orderBy: [
      { endedAt: { sort: "desc", nulls: "first" } },
      { assignedAt: "desc" },
    ],
    take: 1,
  },
  statusHistory: {
    where: { toStatus: { code: { in: ["RESOLVED", "CLOSED", "ESCALATED"] } } },
    include: { toStatus: true },
    orderBy: { createdAt: "desc" },
  },
  slaTargets: true,
  chatLink: true,
};

function toTicket(row) {
  if (!row) return null;
  const {
    category,
    priority,
    currentStatus,
    assignments = [],
    statusHistory = [],
    slaTargets = [],
    chatLink,
    ...core
  } = row;
  const latestTargets = [...slaTargets].sort(
    (a, b) => (b.cycle ?? 1) - (a.cycle ?? 1),
  );
  const response = latestTargets.find((t) => t.metricType === "FIRST_RESPONSE");
  const resolution = latestTargets.find((t) => t.metricType === "RESOLUTION");
  const pending = slaTargets
    .filter((t) => !t.achievedAt)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const latest = (code) => statusHistory.find((h) => h.toStatus.code === code);
  return {
    ...core,
    sla:
      currentStatus?.code === "CLOSED" || currentStatus?.code === "RESOLVED"
        ? { state: "complete", dueAt: null, metric: null }
        : pending[0]
          ? {
              state: "active",
              dueAt: pending[0].dueAt,
              metric: pending[0].metricType,
              cycle: pending[0].cycle,
            }
          : {
              state: slaTargets.length ? "complete" : "none",
              dueAt: null,
              metric: null,
            },
    category: category?.code,
    categoryLabel: category?.nameTh || category?.nameEn || category?.code,
    priority: priority?.code,
    status: currentStatus?.code,
    assigneeId:
      assignments[0] &&
      (!assignments[0].endedAt || currentStatus?.code === "CLOSED")
        ? assignments[0].assigneeId
        : null,
    conversationId: chatLink?.conversationId ?? null,
    slaDueAt: pending[0]?.dueAt ?? resolution?.dueAt ?? response?.dueAt ?? null,
    firstResponseAt: response?.achievedAt ?? null,
    resolvedAt: latest("RESOLVED")?.createdAt ?? null,
    closedAt: latest("CLOSED")?.createdAt ?? null,
    escalatedAt: latest("ESCALATED")?.createdAt ?? null,
    escalationNote: latest("ESCALATED")?.reason ?? null,
  };
}
module.exports = { ticketInclude, toTicket };
