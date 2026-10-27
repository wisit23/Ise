const {
  resolveExecutiveRange,
  allowedValue,
  searchQuery,
  listSort,
  metricMeta,
  parsePagination,
  paginatedResponse,
  notFound,
  METRIC_DEFINITION_VERSION,
} = require("@reloop/shared");
const { getExecutiveTicket } = require("./executiveTicketDetail");
const {
  listExecutiveTickets,
  getTicketOptions,
} = require("./executiveTickets");

async function getTickets(req, res, next) {
  try {
    const { from, to, timezone } = resolveExecutiveRange(req.query);
    const pagination = parsePagination(req.query, 20);
    const options = await getTicketOptions();
    const codes = (list) => list.map((item) => item.code);
    const { items, total, statusCounts } = await listExecutiveTickets({
      from,
      to,
      status: allowedValue(req.query.status, codes(options.statuses), "status"),
      category: allowedValue(
        req.query.category,
        codes(options.categories),
        "category",
      ),
      priority: allowedValue(
        req.query.priority,
        codes(options.priorities),
        "priority",
      ),
      search: searchQuery(req.query.q),
      sort: listSort(req.query.sort),
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
