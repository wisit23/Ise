"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import SalesSummary from "../../../components/seller/dashboard/SalesSummary";
import RecentOrderList from "../../../components/seller/dashboard/RecentOrderList";
import SellerProductList from "../../../components/seller/dashboard/SellerProductList";
import {
  ORDER_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
} from "../../../components/seller/dashboard/sellerStatus";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Skeleton from "../../../components/ui/Skeleton";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const TREND_DAYS = 14;

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
  const [kycStatus, setKycStatus] = useState(null);

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

    apiFetch("/api/auth/kyc/mine", { token })
      .then((data) => setKycStatus(data.kycStatus))
      .catch(() => setKycStatus("NONE"));

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
      .filter((o) => ["pending", "pending_payment"].includes(o.status))
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
      <main className="min-h-screen bg-surface-subtle">
        <NavBar />
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <Skeleton className="h-7 w-48" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-44 rounded-xl lg:col-span-2 lg:row-span-2" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[86px] rounded-xl" />
            ))}
            <Skeleton className="h-56 rounded-xl sm:col-span-2 lg:col-span-4" />
          </div>
        </section>
      </main>
    );
  }

  if (user?.role !== "SELLER") {
    return (
      <main className="min-h-screen bg-surface-subtle">
        <NavBar />
        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <Alert tone="warning" title="หน้านี้ใช้ได้เฉพาะบัญชีผู้ขายเท่านั้น">
            สมัครบัญชีผู้ขายเพื่อเปิดแดชบอร์ดและลงขายสินค้า
          </Alert>
        </section>
      </main>
    );
  }

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">แดชบอร์ดผู้ขาย</h1>
          <Button href="/sell" icon="add">
            ลงขายสินค้าใหม่
          </Button>
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}

        {kycStatus && kycStatus !== "VERIFIED" && (
          <Alert tone="warning" className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {kycStatus === "PENDING"
                  ? "บัญชีนี้อยู่ระหว่างการตรวจสอบยืนยันตัวตนโดยแอดมิน"
                  : "บัญชีนี้ยังไม่ได้ยืนยันตัวตนผู้ขาย — ต้องยืนยันก่อนจึงจะลงขายสินค้าได้"}
              </span>
              {kycStatus !== "PENDING" && (
                <Link
                  href="/seller/onboarding"
                  className="focus-ring shrink-0 rounded font-medium underline hover:text-amber-900"
                >
                  ยืนยันตัวตนผู้ขาย
                </Link>
              )}
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SalesSummary
            stats={stats}
            orderCount={orders.length}
            trendDays={TREND_DAYS}
          />

          <div className="rounded-xl border border-line bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              คำสั่งซื้อล่าสุด
            </h2>
            <RecentOrderList orders={recentOrders} />
          </div>

          <div className="rounded-xl border border-line bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              สินค้าของฉัน ({products.length})
            </h2>
            <SellerProductList products={products} />
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
