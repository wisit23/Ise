"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import SellerDashboardCharts from "../../../components/seller/dashboard/SellerDashboardCharts";
import SellerOrderTracker from "../../../components/seller/dashboard/SellerOrderTracker";
import SellerProductList from "../../../components/seller/dashboard/SellerProductList";
import SellerAutoMessages from "../../../components/seller/dashboard/SellerAutoMessages";
import {
  ORDER_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  isOrderDisputed,
} from "../../../components/seller/dashboard/sellerStatus";
import Alert from "../../../components/ui/Alert";
import Skeleton from "../../../components/ui/Skeleton";
import RadioSelect from "../../../components/ui/RadioSelect";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { PLATFORM_FEE_RATE } from "../../../lib/executive";
import { useChatSocketEvent } from "../../../components/chat/ChatSocketProvider";

const TREND_DAYS = 7;

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
  { key: "auto_messages", label: "คำถามอัตโนมัติ", icon: "chat_bubble" },
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

  // ── Real-time WebSocket Listeners ──────────────────────────────────────────
  useChatSocketEvent("product:created", (payload) => {
    if (!payload?.product?.id) return;
    const prod = payload.product;
    setProducts((prev) => {
      if (prev.some((p) => p.id === prod.id)) return prev;
      if (prod.sellerId && user?.id && prod.sellerId !== user.id) return prev;
      return [prod, ...prev];
    });
  });

  useChatSocketEvent("product:updated", (payload) => {
    if (!payload?.product?.id) return;
    const updated = payload.product;
    setProducts((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
  });

  useChatSocketEvent("product:deleted", (payload) => {
    const id = payload?.productId || payload?.product?.id || payload?.id;
    if (!id) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  });

  useChatSocketEvent("order:updated", (payload) => {
    if (!payload?.order?.id) return;
    const updatedOrder = payload.order;
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === updatedOrder.id);
      if (idx !== -1) {
        return prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      }
      const sellerId = updatedOrder.sellerId || updatedOrder.seller?.id;
      if (sellerId && user?.id && sellerId !== user.id) return prev;
      return [updatedOrder, ...prev];
    });
  });

  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === "completed");
    const totalGrossRevenue = completed.reduce(
      (sum, o) => sum + (o.finalPrice ?? o.price ?? 0),
      0,
    );
    // Net sales after platform fee deduction (PLATFORM_FEE_RATE = 3%)
    const platformFee = totalGrossRevenue * PLATFORM_FEE_RATE;
    const totalRevenue = totalGrossRevenue - platformFee;

    // Separate regular sales vs auction sales
    const regularCompleted = completed.filter(
      (o) => !o.auctionId && o.orderType !== "AUCTION" && !o.id?.startsWith("AUC-"),
    );
    const auctionCompleted = completed.filter(
      (o) => Boolean(o.auctionId) || o.orderType === "AUCTION" || o.id?.startsWith("AUC-"),
    );

    const regularGrossRevenue = regularCompleted.reduce(
      (sum, o) => sum + (o.finalPrice ?? o.price ?? 0),
      0,
    );
    const regularRevenue = regularGrossRevenue * (1 - PLATFORM_FEE_RATE);

    const auctionGrossRevenue = auctionCompleted.reduce(
      (sum, o) => sum + (o.finalPrice ?? o.price ?? 0),
      0,
    );
    const auctionRevenue = auctionGrossRevenue * (1 - PLATFORM_FEE_RATE);

    const pendingRevenue = orders
      .filter((o) => ["pending", "pending_payment"].includes(o.status))
      .reduce((sum, o) => sum + (o.finalPrice ?? o.price ?? 0), 0);

    const days14 = lastNDays(14);
    const revenueByDay = Object.fromEntries(days14.map((d) => [d.key, 0]));
    completed.forEach((o) => {
      const key = o.createdAt.slice(0, 10);
      const gross = o.finalPrice ?? o.price ?? 0;
      const net = gross * (1 - PLATFORM_FEE_RATE);
      if (key in revenueByDay) revenueByDay[key] += net;
    });

    const days = days14.slice(-TREND_DAYS);
    const trend = days.map((d) => ({
      label: d.label,
      value: revenueByDay[d.key],
    }));
    const sparklineValues = trend.map((t) => t.value);

    const last7 = days14.slice(-7).reduce((sum, d) => sum + revenueByDay[d.key], 0);
    const prev7 = days14.slice(0, 7).reduce((sum, d) => sum + revenueByDay[d.key], 0);
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
      totalGrossRevenue,
      platformFee,
      regularRevenue,
      regularGrossRevenue,
      regularCompletedCount: regularCompleted.length,
      auctionRevenue,
      auctionGrossRevenue,
      auctionCompletedCount: auctionCompleted.length,
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

  const disputedOrders = useMemo(() => {
    return orders.filter(isOrderDisputed);
  }, [orders]);

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
                  My Store
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

            {user?.id && (
              <Link
                href={`/store/${user.id}`}
                className="group flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] shrink-0 w-5 text-center text-slate-500 group-hover:text-slate-700">
                  storefront
                </span>
                <span className="truncate">ร้านค้าของฉัน</span>
              </Link>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-2">
            <Link
              href="/sell"
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                add_circle
              </span>
              ลงขายสินค้าใหม่
            </Link>
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

            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* KYC warning badge */}
              {kycStatus && kycStatus !== "VERIFIED" && (
                <span className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  <span className="material-symbols-outlined text-[14px]">
                    warning
                  </span>
                  {kycStatus === "PENDING"
                    ? "รอยืนยัน KYC"
                    : "ยังไม่ยืนยัน KYC"}
                </span>
              )}

              {/* View Store Button */}
              {user?.id && (
                <Link
                  href={`/store/${user.id}`}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">
                    storefront
                  </span>
                  <span>ร้านค้าของฉัน</span>
                </Link>
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
                      ? "บัญชีนี้อยู่ระหว่างการตรวจสอบยืนยันตัวตนโดย Trust and Safety"
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

            {/* ── Dispute alert banner for seller ── */}
            {disputedOrders.length > 0 && (
              <Alert tone="danger" className="mb-6 border-red-300 bg-red-50/80 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[24px] text-red-600 shrink-0">
                      warning
                    </span>
                    <div>
                      <p className="font-bold text-red-900 text-sm">
                        แจ้งเตือนข้อพิพาท: คุณมีคำสั่งซื้อที่อยู่ระหว่างข้อพิพาท {disputedOrders.length} รายการ
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">
                        ผู้ซื้อได้เปิดข้อพิพาทสำหรับคำสั่งซื้อของคุณ กรุณาตรวจสอบรายละเอียดและดำเนินการตอบกลับหรือส่งหลักฐานในระบบ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderStatusFilter("disputed");
                      setSection("orders");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 shadow-xs transition shrink-0"
                  >
                    <span>ดูรายการข้อพิพาท</span>
                    <span className="material-symbols-outlined text-[15px]">
                      arrow_forward
                    </span>
                  </button>
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
                onOrderUpdated={(updated) => {
                  setOrders((prev) =>
                    prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
                  );
                }}
              />
            )}

            {/* ── Section 3: Product List ── */}
            {section === "products" && (
              <SellerProductList
                products={products}
                orders={orders}
                statusFilter={productStatusFilter}
                onStatusFilterChange={setProductStatusFilter}
                onProductDeleted={(deletedId) => {
                  setProducts((prev) => prev.filter((p) => p.id !== deletedId));
                }}
                onOrderUpdated={(updated) => {
                  setOrders((prev) =>
                    prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
                  );
                }}
              />
            )}

            {/* ── Section 4: Auto Messages ── */}
            {section === "auto_messages" && <SellerAutoMessages />}
          </div>

          <Footer />
        </main>
      </div>
    </div>
  );
}
