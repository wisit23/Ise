const prisma = require("../../models/prismaClient");
const { money } = require("../../models/money");
const { COMPLETED_STATUS } = require("./platformMetrics");

/**
 * Sales per product for orders placed in [from, to), counted exactly like
 * getPlatformMetrics (completed orders, created_at, amount after coupon) so a
 * ranking built from these rows adds up to the dashboard's GMV. Product
 * titles and categories belong to product-service, which joins them in.
 */
async function getProductSales({ from, to }) {
  const rows = await prisma.$queryRaw`
    SELECT product_id AS "productId",
           COUNT(*)::int AS count,
           COALESCE(SUM(orders_amount), 0) AS gmv
    FROM orders
    WHERE status = ${COMPLETED_STATUS}
      AND created_at >= ${from} AND created_at < ${to}
    GROUP BY product_id
    ORDER BY gmv DESC, product_id
  `;

  return rows.map((row) => ({
    productId: row.productId,
    count: row.count,
    gmv: Number(money(row.gmv)),
  }));
}

module.exports = { getProductSales };
