// @ts-check

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** @param {unknown} value @returns {value is number} */
const amount = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
/** @param {unknown} value @returns {value is number} */
const count = (value) => amount(value) && Number.isSafeInteger(value);

/** @typedef {{gmv: number, gmvPurchase: number, gmvAuction: number, platformRevenue: number, completedOrders: number}} OverviewMetrics */
/** @param {unknown} value @returns {value is OverviewMetrics} */
function metrics(value) {
  return (
    object(value) &&
    [
      value.gmv,
      value.gmvPurchase,
      value.gmvAuction,
      value.platformRevenue,
    ].every(amount) &&
    count(value.completedOrders)
  );
}
/** @param {unknown} value @returns {OverviewMetrics|null} */
export function parseOverviewMetrics(value) {
  return metrics(value) ? value : null;
}

/** @typedef {{id: string, label: string|null, count: number, gmv: number}} CategoryRow */
/** @param {unknown} value @returns {value is CategoryRow} */
function category(value) {
  return (
    object(value) &&
    typeof value.id === "string" &&
    Boolean(value.id) &&
    (value.label === null || typeof value.label === "string") &&
    count(value.count) &&
    amount(value.gmv)
  );
}
/** @typedef {{categories: CategoryRow[], popularCategories: CategoryRow[], categoryTotal: {count: number, gmv: number}}} Rankings */
/** @param {unknown} value @returns {value is Rankings} */
function rankings(value) {
  return (
    object(value) &&
    Array.isArray(value.categories) &&
    value.categories.every(category) &&
    Array.isArray(value.popularCategories) &&
    value.popularCategories.every(category) &&
    object(value.categoryTotal) &&
    count(value.categoryTotal.count) &&
    amount(value.categoryTotal.gmv)
  );
}
/** @param {unknown} value @returns {Rankings|null} */
export function parseRankings(value) {
  return rankings(value) ? value : null;
}

/** @typedef {{completed: number, inProgress: number, disputeRefund: number, total: number}} OrderStatusCounts */
/** @param {unknown} value @returns {value is OrderStatusCounts} */
function statusCounts(value) {
  return (
    object(value) &&
    count(value.completed) &&
    count(value.inProgress) &&
    count(value.disputeRefund) &&
    count(value.total) &&
    value.total === value.completed + value.inProgress + value.disputeRefund
  );
}
/** @param {unknown} value @returns {OrderStatusCounts|null} */
export function parseOrderStatusCounts(value) {
  return statusCounts(value) ? value : null;
}
