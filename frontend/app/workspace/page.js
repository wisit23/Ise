"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import { ToastProvider } from "../../components/ui/ToastProvider";
import RadioSelect from "../../components/ui/RadioSelect";
import Link from "next/link";

import DashboardSection from "../../components/support/sections/DashboardSection";
import TicketsSection from "../../components/support/sections/TicketsSection";
import DisputesSection from "../../components/support/sections/DisputesSection";
import OrdersSection from "../../components/support/sections/OrdersSection";
import FaqSection from "../../components/support/sections/FaqSection";
import KycSection from "../../components/support/sections/KycSection";
import AuditSection from "../../components/support/sections/AuditSection";
import AdminInboxSection from "../../components/support/sections/AdminInboxSection";
import ProductsSection from "../../components/support/sections/ProductsSection";
import AuctionApprovalsSection from "../../components/support/sections/AuctionApprovalsSection";

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "tickets", label: "Tickets", icon: "confirmation_number" },
  { key: "disputes", label: "Disputes", icon: "gavel" },
  { key: "orders", label: "ค้นหาออเดอร์", icon: "search" },
  { key: "faq", label: "จัดการ FAQ", icon: "menu_book" },
];

// Escalated tickets, moderation, and every other Admin-only privileged
// action live ONLY under these sections — deliberately not surfaced
// anywhere in the CS agent's own tabs (see TicketsSection's dropped
// ESCALATED filter option).
const ADMIN_SECTIONS = [
  { key: "admin_inbox", label: "เคสระดับแอดมิน", icon: "assignment_late" },
  { key: "products", label: "จัดการสินค้า", icon: "inventory_2" },
  { key: "auction_approvals", label: "อนุมัติประมูล", icon: "sell" },
  { key: "kyc", label: "คิวตรวจ KYC", icon: "how_to_reg" },
  { key: "audit", label: "Audit Logs", icon: "receipt_long" },
];

export default function SupportPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState("dashboard");
  const [ticketsFilter, setTicketsFilter] = useState("");
  const [disputesFilter, setDisputesFilter] = useState("");

  function navigateTo(tab, filter) {
    setSection(tab);
    if (tab === "tickets") setTicketsFilter(filter);
    if (tab === "disputes") setDisputesFilter(filter);
  }

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  if (user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }
  if (user?.role !== "CUSTOMER_SERVICE" && user?.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะเจ้าหน้าที่ซัพพอร์ตเท่านั้น
        </p>
      </main>
    );
  }

  const token = getAccessToken();
  const visibleSections =
    user?.role === "ADMIN" ? [...SECTIONS, ...ADMIN_SECTIONS] : SECTIONS;
  const activeSection = visibleSections.find((s) => s.key === section);

  return (
    // Toasts are mounted at the panel root so every section beneath it can
    // report the outcome of an action without a blocking alert().
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-slate-50/50">
        <NavBar />
        <div className="flex flex-1">
          {/* ── Sidebar ── */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex shadow-[2px_0_10px_-3px_rgba(6,81,237,0.03)] z-10">
            {/* Brand */}
            <div className="flex h-16 items-center border-b border-slate-200/60 px-4 bg-white">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-600">
                  <span className="material-symbols-outlined text-[19px]">
                    headset_mic
                  </span>
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold tracking-tight text-slate-800">
                    Re-loop panel
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider text-emerald-600 uppercase">
                    {user?.role === "ADMIN" ? "Administrator" : "Support Agent"}
                  </span>
                </div>
              </div>
            </div>

            {/* Nav items */}
            <nav className="flex flex-1 flex-col gap-1 p-2">
              {visibleSections.map((s) => {
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
                        active ? "text-white" : "text-slate-500 group-hover:text-slate-700"
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
            <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
              <Link
                href="/support/tickets"
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
                ตั๋วซัพพอร์ตทั่วไป
              </Link>
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            {/* Top bar */}
            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-6 lg:px-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]">
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
              {/* Mobile section switcher */}
              <div className="flex items-center gap-3 sm:hidden">
                <RadioSelect
                  value={section}
                  onChange={setSection}
                  options={visibleSections.map((s) => ({
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

            {/* Content */}
            <div className="p-8 max-w-7xl mx-auto">
              {section === "dashboard" && (
                <DashboardSection
                  token={token}
                  userRole={user?.role}
                  onNavigate={navigateTo}
                />
              )}
              {section === "tickets" && (
                <TicketsSection
                  token={token}
                  userId={user?.id}
                  statusFilter={ticketsFilter}
                  setStatusFilter={setTicketsFilter}
                />
              )}
              {section === "admin_inbox" && <AdminInboxSection token={token} />}
              {section === "disputes" && (
                <DisputesSection
                  token={token}
                  userRole={user?.role}
                  status={disputesFilter}
                  setStatus={setDisputesFilter}
                />
              )}
              {section === "orders" && <OrdersSection token={token} />}
              {section === "faq" && <FaqSection token={token} />}
              {section === "kyc" && <KycSection token={token} />}
              {section === "audit" && <AuditSection token={token} />}
              {section === "products" && <ProductsSection token={token} />}
              {section === "auction_approvals" && (
                <AuctionApprovalsSection token={token} />
              )}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
