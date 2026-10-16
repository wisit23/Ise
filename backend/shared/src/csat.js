const { badRequest, forbidden, notFound, conflict } = require("./errors");
const { customerServiceClientConfig } = require("./customerServiceConfig");

function validateRating(body) {
  if (!Number.isInteger(body?.rating) || body.rating < 1 || body.rating > 5)
    throw badRequest("กรุณาเลือกคะแนน 1–5 ดาว");
  if (body.comment !== undefined && typeof body.comment !== "string")
    throw badRequest("ความคิดเห็นต้องเป็นข้อความ");
  const comment = (body.comment || "").trim();
  if (comment.length > 1000)
    throw badRequest("ความคิดเห็นต้องไม่เกิน 1,000 ตัวอักษร");
  return { rating: body.rating, comment };
}

function summarize(rows) {
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: Number(
      rows.find((row) => Number(row.rating) === rating)?.count || 0,
    ),
  }));
  const total = distribution.reduce((sum, row) => sum + row.count, 0);
  const satisfied = distribution
    .filter((row) => row.rating >= 4)
    .reduce((sum, row) => sum + row.count, 0);
  const scoreSum = distribution.reduce(
    (sum, row) => sum + row.rating * row.count,
    0,
  );
  return {
    total,
    satisfied,
    scoreSum,
    percent: total ? Math.round((satisfied / total) * 100) : null,
    average: total ? Math.round((scoreSum / total) * 10) / 10 : null,
    distribution,
  };
}

// Each service owns its ratings and supplies a locked, authoritative case snapshot.
function createCsat({ db, Prisma, readCase }) {
  async function access(tx, id, userId) {
    const item = await readCase(tx, id);
    if (!item || item.deleted) throw notFound("ไม่พบเรื่องนี้");
    const side = Object.hasOwn(item.participants, userId)
      ? item.participants[userId]
      : null;
    if (!side)
      throw forbidden(
        "เฉพาะลูกค้าที่เกี่ยวข้องกับเรื่องนี้เท่านั้นที่ให้คะแนนได้",
      );
    return { ...item, side };
  }
  async function existing(tx, id, userId) {
    const [row] = await tx.$queryRaw(Prisma.sql`
      SELECT rating, comment, created_at AS "createdAt" FROM customer_satisfaction
      WHERE case_id = ${id} AND respondent_id = ${userId}`);
    return row || null;
  }
  async function read(id, userId) {
    return db.$transaction(async (tx) => {
      const item = await access(tx, id, userId);
      const response = await existing(tx, id, userId);
      return {
        eligible: item.complete && !response,
        complete: item.complete,
        response,
      };
    });
  }
  async function submit(id, userId, body) {
    const { rating, comment } = validateRating(body);
    return db.$transaction(async (tx) => {
      const item = await access(tx, id, userId);
      if (!item.complete)
        throw conflict(
          "ให้คะแนนได้หลังจากเรื่องได้รับการแก้ไขหรือปิดแล้วเท่านั้น",
        );
      const previous = await existing(tx, id, userId);
      if (previous) {
        // A retry after a lost response must not create another vote.
        if (previous.rating === rating && previous.comment === comment)
          return { eligible: false, complete: true, response: previous };
        throw conflict("คุณให้คะแนนเรื่องนี้แล้ว ไม่สามารถเปลี่ยนคะแนนได้");
      }
      const [response] = await tx.$queryRaw(Prisma.sql`
        INSERT INTO customer_satisfaction (case_id, respondent_id, respondent_side, agent_id, rating, comment)
        VALUES (${id}, ${userId}, ${item.side}, ${item.agentId}, ${rating}, ${comment})
        RETURNING rating, comment, created_at AS "createdAt"`);
      return { eligible: false, complete: true, response };
    });
  }
  async function stats(userId, days, now = new Date()) {
    const { timeZone } = customerServiceClientConfig.dashboard;
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT rating, count(*)::int AS count FROM customer_satisfaction
      WHERE agent_id = ${userId}
        AND created_at >= ((${now}::timestamptz AT TIME ZONE ${timeZone})::date - (${days}::int - 1)) AT TIME ZONE ${timeZone}
        AND created_at <= ${now}::timestamptz
      GROUP BY rating`);
    return summarize(rows);
  }
  function handler(action) {
    return async (req, res, next) => {
      try {
        const data =
          action === "read"
            ? await read(req.params.id, req.userId)
            : await submit(req.params.id, req.userId, req.body);
        res.set("Cache-Control", "private, no-store");
        res.json(data);
      } catch (error) {
        next(error);
      }
    };
  }
  return { read, submit, stats, get: handler("read"), post: handler("submit") };
}

module.exports = { createCsat, validateRating, summarize };
