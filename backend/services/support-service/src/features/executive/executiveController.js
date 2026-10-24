const {
  resolveMetricRange,
  metricMeta,
  parsePagination,
  paginatedResponse,
  badRequest,
  notFound,
  METRIC_DEFINITION_VERSION,
} = require("@reloop/shared");
const { getExecutiveTicket } = require("./executiveTicketDetail");
const {
  listExecutiveTickets,
  getTicketOptions,
} = require("./executiveTickets");

// A filter value must be one the page offers, or the request is refused: an
// unknown status silently matching nothing would read as "no tickets".
function oneOf(value, allowed, name) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw badRequest(`${name} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

async function getTickets(req, res, next) {
  try {
    const { from, to, timezone } = resolveMetricRange(req.query);
    const pagination = parsePagination(req.query, 20);
    const options = await getTicketOptions();
    const codes = (list) => list.map((item) => item.code);
    const { items, total, statusCounts } = await listExecutiveTickets({
      from,
      to,
      status: oneOf(req.query.status, codes(options.statuses), "status"),
      category: oneOf(
        req.query.category,
        codes(options.categories),
        "category",
      ),
      priority: oneOf(
        req.query.priority,
        codes(options.priorities),
        "priority",
      ),
      skip: pagination.skip,
      take: pagination.take,
    });

    res.json({
      ...paginatedResponse(items, total, pagination),
      data: items,
      statusCounts,
      options,
      meta: metricMeta({ from, to, timezone }),
    });
  } catch (err) {
    next(err);
  }
}

async function getTicket(req, res, next) {
  try {
    const detail = await getExecutiveTicket(req.params.id);
    if (!detail) throw notFound("ticket not found");
    res.json({
      data: detail.data,
      meta: { definitionVersion: METRIC_DEFINITION_VERSION, ...detail.meta },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTickets, getTicket };
