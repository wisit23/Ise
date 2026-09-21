"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import SellerDashboardCharts from "../../../components/seller/dashboard/SellerDashboardCharts";
import SellerOrderTracker from "../../../components/seller/dashboard/SellerOrderTracker";
import SellerProductList from "../../../components/seller/dashboard/SellerProductList";
import {
  ORDER_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
} from "../../../components/seller/dashboard/sellerStatus";
import Alert from "../../../components/ui/Alert";
import Skeleton from "../../../components/ui/Skeleton";
import RadioSelect from "../../../components/ui/RadioSelect";
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

const SECTIONS = [
  { key: "dashboard", label: "แดชบอร์ด", icon: "dashboard" },
  { key: "orders", label: "ติดตามออเดอร์", icon: "local_shipping" },
  { key: "products", label: "รายการสินค้า", icon: "inventory_2" },
];

export default function SellerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [kycStatus, setKycStatus] = useState(null);
  const [section, setSection] = useState("dashboard");
  const [highlightOrderId, setHighlightOrderId] = useState(null);
  const [productStatusFilter, setProductStatusFilter] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");

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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (user === undefined || loading) {
    return (
      <main className="min-h-screen bg-slate-50/50">
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

  // ── Access guard ──────────────────────────────────────────────────────────
  if (user?.role !== "SELLER") {
    return (
      <main className="min-h-screen bg-slate-50/50">
        <NavBar />
        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <Alert tone="warning" title="หน้านี้ใช้ได้เฉพาะบัญชีผู้ขายเท่านั้น">
            สมัครบัญชีผู้ขายเพื่อเปิดแดชบอร์ดและลงขายสินค้า
          </Alert>
        </section>
      </main>
    );
  }

  const activeSection = SECTIONS.find((s) => s.key === section);

  // ── Main layout (sidebar + content) ──────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <NavBar />

      <div className="flex flex-1">
        {/* ── Sidebar ── */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex shadow-[2px_0_10px_-3px_rgba(0,0,0,0.04)] z-10">
          {/* Brand */}
          <div className="flex h-16 items-center border-b border-slate-200/60 px-4 bg-white">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-600">
                <span className="material-symbols-outlined text-[19px]">
                  storefront
                </span>
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold tracking-tight text-slate-800">
                  Seller Panel
                </span>
                <span className="text-[10px] font-semibold tracking-wider text-emerald-600 uppercase">
                  แดชบอร์ดผู้ขาย
                </span>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex flex-1 flex-col gap-1 p-2">
            {SECTIONS.map((s) => {
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`group flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left text-xs transition-colors ${
                    active
                      ? "bg-emerald-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 font-medium hover:bg-slate-100/70 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 w-5 text-center ${
                      active
                        ? "text-white"
                        : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  >
                    {s.icon}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-2">
            <Link
              href="/sell"
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              ลงขายสินค้าใหม่
            </Link>
            {user?.id && (
              <Link
                href={`/store/${user.id}`}
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">storefront</span>
                หน้าร้านค้าของฉัน
              </Link>
            )}
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex-1 flex flex-col overflow-y-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-6 lg:px-8 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <span className="material-symbols-outlined text-[18px]">
                  {activeSection?.icon}
                </span>
              </span>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                {activeSection?.label}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* KYC warning badge */}
              {kycStatus && kycStatus !== "VERIFIED" && (
                <span className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  <span className="material-symbols-outlined text-[14px]">
                    warning
                  </span>
                  {kycStatus === "PENDING" ? "รอยืนยัน KYC" : "ยังไม่ยืนยัน KYC"}
                </span>
              )}
              {/* Mobile section switcher */}
              <div className="sm:hidden">
                <RadioSelect
                  value={section}
                  onChange={setSection}
                  options={SECTIONS.map((s) => ({
                    value: s.key,
                    label: s.label,
                    icon: s.icon,
                  }))}
                  size="sm"
                  variant="panel"
                  align="right"
                />
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {error && <Alert className="mb-4">{error}</Alert>}

            {/* KYC banner (full width, shown in content area) */}
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

            {/* ── Section 1: Dashboard Charts ── */}
            {section === "dashboard" && (
              <SellerDashboardCharts
                stats={stats}
                orders={orders}
                products={products}
                orderCount={orders.length}
                onNavigateOrders={(orderId, status = "") => {
                  setHighlightOrderId(orderId || null);
                  setOrderStatusFilter(status);
                  setSection("orders");
                }}
                onNavigateProducts={(status = "") => {
                  setProductStatusFilter(status);
                  setSection("products");
                }}
              />
            )}

            {/* ── Section 2: Order Tracking ── */}
            {section === "orders" && (
              <SellerOrderTracker
                orders={orders}
                highlightOrderId={highlightOrderId}
                onClearHighlight={() => setHighlightOrderId(null)}
                statusFilter={orderStatusFilter}
                onStatusFilterChange={setOrderStatusFilter}
              />
            )}

            {/* ── Section 3: Product List ── */}
            {section === "products" && (
              <SellerProductList
                products={products}
                statusFilter={productStatusFilter}
                onStatusFilterChange={setProductStatusFilter}
              />
            )}
          </div>

          <Footer />
        </main>
      </div>
    </div>
  );
}
