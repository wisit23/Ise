"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Sparkline from "../../../components/charts/Sparkline";
import TrendBarChart from "../../../components/charts/TrendBarChart";
import CategoryBarChart from "../../../components/charts/CategoryBarChart";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const PRODUCT_STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "อยู่ในตะกร้าลูกค้า",
  sold: "ขายแล้ว",
};

const PRODUCT_STATUS_STYLE = {
  available: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-gray-100 text-gray-500",
};

const ORDER_STATUS_LABEL = {
  pending: "รอลูกค้าชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "ขายสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

const ORDER_STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const TREND_DAYS = 14;

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

/** Last N days as { key: "YYYY-MM-DD", label: "D/M" }, oldest first. */
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: `${d.getDate()}/${d.getMonth() + 1}`,
    });
  }
  return days;
}

export default function SellerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (storedUser?.role !== "SELLER") {
      setLoading(false);
      return;
    }

    // The stat cards/charts below need the full recent picture, not one page of
    // it — capped at 100 rather than truly unbounded (a real pagination UI
    // wouldn't make sense mixed into aggregate stats/charts).
    Promise.all([
      apiFetch("/api/products/mine?limit=100", { token }),
      apiFetch("/api/orders/selling?limit=100", { token }),
    ])
      .then(([productData, orderData]) => {
        setProducts(productData.items);
        setOrders(orderData.items);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === "completed");
    const totalRevenue = completed.reduce((sum, o) => sum + o.price, 0);
    const pendingRevenue = orders
      .filter((o) => o.status === "pending")
      .reduce((sum, o) => sum + o.price, 0);

    const days = lastNDays(TREND_DAYS);
    const revenueByDay = Object.fromEntries(days.map((d) => [d.key, 0]));
    completed.forEach((o) => {
      const key = o.createdAt.slice(0, 10);
      if (key in revenueByDay) revenueByDay[key] += o.price;
    });
    const trend = days.map((d) => ({
      label: d.label,
      value: revenueByDay[d.key],
    }));
    const sparklineValues = trend.map((t) => t.value);

    const last7 = trend.slice(-7).reduce((sum, t) => sum + t.value, 0);
    const prev7 = trend.slice(0, 7).reduce((sum, t) => sum + t.value, 0);
    const delta =
      prev7 === 0 ? null : Math.round(((last7 - prev7) / prev7) * 100);

    const orderStatusCounts = {};
    orders.forEach((o) => {
      orderStatusCounts[o.status] = (orderStatusCounts[o.status] || 0) + 1;
    });
    const orderStatusData = Object.entries(orderStatusCounts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        label: ORDER_STATUS_LABEL[status] || status,
        value: count,
      }));

    const productStatusCounts = {};
    products.forEach((p) => {
      productStatusCounts[p.status] = (productStatusCounts[p.status] || 0) + 1;
    });
    const productStatusData = Object.entries(productStatusCounts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        label: PRODUCT_STATUS_LABEL[status] || status,
        value: count,
      }));

    const categoryCounts = {};
    products.forEach((p) => {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    });
    const categoryData = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ label: category, value: count }));

    return {
      totalRevenue,
      pendingRevenue,
      soldCount: completed.length,
      activeCount: products.filter((p) => p.status === "available").length,
      trend,
      sparklineValues,
      delta,
      orderStatusData,
      productStatusData,
      categoryData,
    };
  }, [products, orders]);

  if (user === undefined || loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (user?.role !== "SELLER") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะบัญชีผู้ขายเท่านั้น
        </p>
      </main>
    );
  }

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">แดชบอร์ดผู้ขาย</h1>
          <Link
            href="/sell"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + ลงขายสินค้าใหม่
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Hero: total revenue, 2x2 */}
          <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2 lg:row-span-2">
            <div>
              <p className="text-sm text-gray-500">ยอดขายสำเร็จทั้งหมด</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight text-gray-900">
                {baht(stats.totalRevenue)}
              </p>
              {stats.delta !== null && (
                <p
                  className={`mt-2 text-sm font-medium ${
                    stats.delta >= 0 ? "text-[#006300]" : "text-red-600"
                  }`}
                >
                  {stats.delta >= 0 ? "▲" : "▼"} {Math.abs(stats.delta)}%{" "}
                  <span className="font-normal text-gray-400">
                    เทียบ 7 วันก่อนหน้า
                  </span>
                </p>
              )}
            </div>
            <div className="mt-4 flex items-end justify-between">
              <p className="text-xs text-gray-400">
                แนวโน้ม {TREND_DAYS} วันล่าสุด
              </p>
              <Sparkline
                values={stats.sparklineValues}
                width={140}
                height={36}
              />
            </div>
          </div>

          {/* Stat tiles filling the other 2x2 block */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">คำสั่งซื้อทั้งหมด</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {orders.length}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">สินค้าพร้อมขาย</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {stats.activeCount}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">รอลูกค้าชำระเงิน</p>
            <p className="mt-1 text-2xl font-semibold text-amber-600">
              {baht(stats.pendingRevenue)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">ขายแล้ว (ชิ้น)</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {stats.soldCount}
            </p>
          </div>

          {/* Full-width sales trend */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              ยอดขายรายวัน ({TREND_DAYS} วันล่าสุด)
            </h2>
            {stats.totalRevenue === 0 ? (
              <p className="text-sm text-gray-400">
                ยังไม่มียอดขายสำเร็จในช่วงนี้
              </p>
            ) : (
              <TrendBarChart data={stats.trend} formatValue={baht} />
            )}
          </div>

          {/* Order status breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              สถานะคำสั่งซื้อ
            </h2>
            {stats.orderStatusData.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีคำสั่งซื้อ</p>
            ) : (
              <CategoryBarChart data={stats.orderStatusData} />
            )}
          </div>

          {/* Product status breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              สถานะสินค้า
            </h2>
            {stats.productStatusData.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีสินค้าที่ลงขาย</p>
            ) : (
              <CategoryBarChart data={stats.productStatusData} />
            )}
          </div>

          {/* Category breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              สินค้าตามหมวดหมู่
            </h2>
            {stats.categoryData.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีสินค้าที่ลงขาย</p>
            ) : (
              <CategoryBarChart data={stats.categoryData} />
            )}
          </div>

          {/* Recent orders */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              คำสั่งซื้อล่าสุด
            </h2>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีคำสั่งซื้อเข้ามา</p>
            ) : (
              <ul className="flex flex-col divide-y divide-gray-100">
                {recentOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {o.productTitle}
                      </p>
                      <p className="text-gray-500">
                        {baht(o.price)} ·{" "}
                        {new Date(o.createdAt).toLocaleDateString("th-TH")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                        ORDER_STATUS_STYLE[o.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ORDER_STATUS_LABEL[o.status] || o.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Full product list */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              สินค้าของฉัน ({products.length})
            </h2>
            {products.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีสินค้าที่ลงขาย</p>
            ) : (
              <ul className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2">
                {products.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between py-2.5 pr-4 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/products/${p.id}`}
                        className="block truncate font-medium text-gray-900 hover:text-emerald-600"
                      >
                        {p.title}
                      </Link>
                      <p className="text-gray-500">{baht(p.price)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                        PRODUCT_STATUS_STYLE[p.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {PRODUCT_STATUS_LABEL[p.status] || p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
