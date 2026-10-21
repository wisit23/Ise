// In-memory stand-ins for Prisma and the mailer, shared by the password-reset
// tests. Only the query shapes the feature actually uses are supported.

function matches(row, where = {}) {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("gt" in condition) return value > condition.gt;
      if ("lt" in condition) return value < condition.lt;
    }
    return value === condition;
  });
}

function table(rows) {
  return {
    rows,
    async findUnique({ where }) {
      return rows.find((row) => matches(row, where)) || null;
    },
    async create({ data }) {
      const row = { id: `row-${rows.length + 1}`, usedAt: null, revokedAt: null, ...data };
      rows.push(row);
      return row;
    },
    async update({ where, data }) {
      const row = rows.find((r) => matches(r, where));
      Object.assign(row, data);
      return row;
    },
    async updateMany({ where, data }) {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
    async deleteMany({ where }) {
      const keep = rows.filter((row) => !matches(row, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    },
  };
}

function fakeDb({ users = [], tokens = [], sessions = [], loginLogs = [] } = {}) {
  const db = {
    user: table(users),
    passwordResetToken: table(tokens),
    refreshToken: table(sessions),
    loginLog: table(loginLogs),
    async $queryRaw() {
      return [];
    },
    async $transaction(work) {
      return Array.isArray(work) ? Promise.all(work) : work(db);
    },
  };
  return db;
}

function fakeMailer() {
  const sent = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

const enabledConfig = {
  enabled: true,
  appBaseUrl: "https://shop.example",
  tokenTtlMinutes: 30,
  retentionDays: 30,
  request: { windowSeconds: 3600, perEmail: 3, perIp: 10 },
  submit: { windowSeconds: 900, perIp: 20 },
};

/** Runs "background" work immediately and lets the test await it. */
function inlineScheduler() {
  const pending = [];
  return {
    schedule: (task) => pending.push(task()),
    flush: () => Promise.all(pending.splice(0)),
  };
}

module.exports = { fakeDb, fakeMailer, enabledConfig, inlineScheduler };
