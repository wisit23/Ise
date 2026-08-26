"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import { getAccessToken, getStoredUser } from "../../lib/auth";
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
    // Inject Material Symbols font
    if (!document.getElementById("material-symbols-font")) {
      const link = document.createElement("link");
      link.id = "material-symbols-font";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
      document.head.appendChild(link);
    }
  }, []);

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
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <NavBar />
      <div className="flex flex-1">
        {/* ── Sidebar ── */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex shadow-[2px_0_10px_-3px_rgba(6,81,237,0.03)] z-10">
          {/* Brand */}
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <span className="material-symbols-outlined text-[22px]">
                  headset_mic
                </span>
              </span>
              <div className="flex flex-col">
                <span className="text-[13px] font-extrabold tracking-tight text-slate-800">
                  Re-loop panel
                </span>
                <span className="text-[10px] font-bold tracking-wider text-emerald-600 uppercase">
                  {user?.role === "ADMIN" ? "Administrator" : "Support Agent"}
                </span>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {visibleSections.map((s) => {
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] transition-transform ${active ? "scale-110" : ""}`}
                  >
                    {s.icon}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
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
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-8 py-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]">
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
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium shadow-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              >
                {visibleSections.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
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
  );
}
