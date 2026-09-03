// WF-10 state machine. Pure and DB-free so it's cheap to test exhaustively.
const TRANSITIONS = {
  NEW: ["ASSIGNED", "ESCALATED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS: ["PENDING_USER", "RESOLVED", "ESCALATED"],
  PENDING_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  // WF-10 step 7: user says the problem isn't fixed -> back to IN_PROGRESS.
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  CLOSED: [],
};

const STATUSES = Object.keys(TRANSITIONS);

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

module.exports = { TRANSITIONS, STATUSES, canTransition };
