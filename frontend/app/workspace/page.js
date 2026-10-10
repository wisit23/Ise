"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import { ToastProvider } from "../../components/ui/ToastProvider";
import RadioSelect from "../../components/ui/RadioSelect";
import Link from "next/link";
import motion from "./workspaceMotion.module.css";
import { navigateWorkspaceSection } from '../../components/support/workspace/useCaseWorkspace';

import DashboardSection from "../../components/support/sections/DashboardSection";
import TicketsSection from "../../components/support/sections/TicketsSection";
import DisputesSection from "../../components/support/sections/DisputesSection";
import OrdersSection from "../../components/support/sections/OrdersSection";
import FaqSection from "../../components/support/sections/FaqSection";
import KycSection from "../../components/support/sections/KycSection";
import AuditSection from "../../components/support/sections/AuditSection";
import AdminInboxSection from "../../components/support/sections/AdminInboxSection";
import ProductsSection from "../../components/support/sections/ProductsSection";
import SellerChangeRequestsSection from "../../components/support/sections/SellerChangeRequestsSection";

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "tickets", label: "Tickets", icon: "confirmation_number" },
  { key: "disputes", label: "Disputes", icon: "gavel" },
  { key: "orders", label: "ค้นหา", icon: "manage_search" },
  { key: "faq", label: "จัดการ FAQ", icon: "menu_book" },
];

// Escalated tickets, moderation, and every other Admin-only privileged
// action live ONLY under these sections — deliberately not surfaced
// anywhere in the CS agent's own tabs (see TicketsSection's dropped
// ESCALATED filter option).
const ADMIN_SECTIONS = [
  { key: "admin_inbox", label: "เคสส่งต่อ", icon: "assignment_late" },
  { key: "products", label: "จัดการสินค้า", icon: "inventory_2" },
  { key: "kyc", label: "คิวตรวจ KYC", icon: "how_to_reg" },
  { key: "audit", label: "Audit Logs", icon: "receipt_long" },
];

const ADMIN_ONLY_SECTIONS = [
  { key: "shop_changes", label: "ตรวจข้อมูลร้านค้า", icon: "storefront" },
];
const SECTION_KEYS = [...SECTIONS,...ADMIN_SECTIONS,...ADMIN_ONLY_SECTIONS].map(item=>item.key);

export default function SupportPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState(() => typeof window !== "undefined" && SECTION_KEYS.includes(new URLSearchParams(window.location.search).get("section")) ? new URLSearchParams(window.location.search).get("section") : "dashboard");
  useEffect(() => { const sync = () => { const value = new URLSearchParams(window.location.search).get("section"); setSection(SECTION_KEYS.includes(value)?value:'dashboard'); }; window.addEventListener("popstate",sync); return () => window.removeEventListener("popstate",sync); }, []);
  useEffect(()=>{if(!user)return;const roles=new Set([user.role,...(user.roles||[])]);const allowed=[...SECTIONS,...(roles.has('ADMIN')||roles.has('TRUST_AND_SAFETY')?ADMIN_SECTIONS:[]),...(roles.has('ADMIN')?ADMIN_ONLY_SECTIONS:[])];if(!allowed.some(item=>item.key===section)){setSection('dashboard');navigateWorkspaceSection('dashboard',user.id);}},[user,section]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem("reloop:workspace:sidebar-collapsed") === "true"); } catch { /* Storage may be unavailable; keep the current preference. */ }
  }, []);
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem("reloop:workspace:sidebar-collapsed", String(next)); } catch { /* Storage may be unavailable; keep the current preference. */ }
  }
  const [ticketsFilter, setTicketsFilter] = useState("");
  const [disputesFilter, setDisputesFilter] = useState("");

  function navigateTo(tab, filter) {
    navigateWorkspaceSection(tab,user?.id,filter);
    setSection(tab);
    if (tab === "tickets" && filter!==undefined) setTicketsFilter(filter);
    if (tab === "disputes" && filter!==undefined) setDisputesFilter(filter);
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
  const roles = new Set([user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])]);
  const staffRole = ["ADMIN", "TRUST_AND_SAFETY", "CUSTOMER_SERVICE"].find((role) => roles.has(role));
  if (!staffRole) {
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
  const isAdminOrSafety = staffRole === "ADMIN" || staffRole === "TRUST_AND_SAFETY";
  const visibleSections = isAdminOrSafety
    ? [
        ...SECTIONS,
        ...ADMIN_SECTIONS,
        ...(staffRole === "ADMIN" ? ADMIN_ONLY_SECTIONS : []),
      ]
    : SECTIONS;
  const activeSection = visibleSections.find((s) => s.key === section);

  return (
    // Toasts are mounted at the panel root so every section beneath it can
    // report the outcome of an action without a blocking alert().
    <ToastProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-50/50">
        <NavBar />
        {/* Keep workspace sticky bars below the navbar and its profile menu. */}
        <div className="isolate flex min-h-0 flex-1">
          {/* ── Sidebar ── */}
          <aside aria-label="เมนู workspace" className={`hidden shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex transition-[width] duration-200 motion-reduce:transition-none z-10 ${sidebarCollapsed ? "w-16" : "w-60"}`}>
            {/* Brand */}
            <div className={`flex h-12 shrink-0 items-center border-b border-slate-200/60 bg-white ${sidebarCollapsed ? "justify-center px-2" : "justify-between gap-1 px-2"}`}>
              <div className={`${sidebarCollapsed ? "hidden" : "flex"} min-w-0 items-center gap-2`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-600">
                  <span className="material-symbols-outlined text-[19px]">
                    headset_mic
                  </span>
                </span>
                <div className={sidebarCollapsed ? "hidden" : "flex flex-col min-w-0"}>
                  <span className="text-xs font-bold tracking-tight text-slate-800">
                    Re-loop panel
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider text-emerald-600 uppercase">
                    {isAdminOrSafety ? "Trust and Safety" : "Support Agent"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "ขยายเมนูซ้าย" : "ย่อเมนูซ้าย"}
                title={sidebarCollapsed ? "ขยายเมนูซ้าย" : "ย่อเมนูซ้าย"}
                aria-expanded={!sidebarCollapsed}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 motion-reduce:transition-none"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                  <path d={sidebarCollapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <nav className="relative flex flex-1 flex-col gap-1 p-2">
              <span aria-hidden="true" className={motion.selection} style={{ transform: `translateY(${Math.max(0, visibleSections.findIndex(item => item.key === section)) * 48}px)` }} />
              {visibleSections.map((s) => {
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    aria-label={s.label}
                    aria-current={active ? "page" : undefined}
                    title={sidebarCollapsed ? s.label : undefined}
                    onClick={() => navigateTo(s.key)}
                    className={`group relative z-[1] flex h-11 shrink-0 w-full items-center gap-3 rounded-[8px] py-2.5 text-left text-xs transition-colors ${sidebarCollapsed ? "justify-center px-0" : "px-3"} ${
                      active
                        ? "text-white font-semibold"
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
                    <span className={sidebarCollapsed ? "sr-only" : "truncate"}>{s.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Footer */}
            <div className={`border-t border-slate-100 py-3 bg-slate-50/50 ${sidebarCollapsed ? "px-2" : "px-4"}`}>
              <Link
                href="/support/tickets"
                title={sidebarCollapsed ? "ตั๋วซัพพอร์ตทั่วไป" : undefined}
                aria-label="ตั๋วซัพพอร์ตทั่วไป"
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
                <span className={sidebarCollapsed ? "sr-only" : ""}>ตั๋วซัพพอร์ตทั่วไป</span>
              </Link>
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main
            className={`min-h-0 min-w-0 flex-1 flex flex-col ${
              ["tickets","disputes"].includes(section) ? "overflow-hidden" : "overflow-y-auto"
            }`}
          >
            {/* Top bar */}
            <div className={`${section === "dashboard" && staffRole === "CUSTOMER_SERVICE" ? motion.dashboardToolbar : ""} sticky top-0 z-30 flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 bg-white/80 backdrop-blur-md px-3 py-2 sm:px-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]`}>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <span className="material-symbols-outlined text-[18px]">
                    {activeSection?.icon}
                  </span>
                </span>
                <h1 className="text-base font-semibold tracking-tight text-slate-900">
                  {activeSection?.label}
                </h1>
              </div>
              {/* Mobile section switcher */}
              <div className="ml-auto flex items-center gap-2">
                <div id="workspace-view-control" />
                <div className="flex items-center gap-3 sm:hidden">
                  <RadioSelect
                    value={section}
                    onChange={value=>navigateTo(value)}
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
            </div>

            {/* Content */}
            {["tickets","disputes"].includes(section) ? (
              <div key={section} className={`flex-1 min-h-0 overflow-hidden flex flex-col ${motion.content}`}>
                {section === "tickets" ? <TicketsSection token={token} currentUser={{...user,role:staffRole}} statusFilter={ticketsFilter} /> : <DisputesSection token={token} currentUser={{...user,role:staffRole}} status={disputesFilter} />}
              </div>
            ) : (
              <div key={section} className={`${section === 'dashboard' ? 'h-full min-h-0 p-3 sm:p-4' : 'p-8'} ${section === "dashboard" && staffRole === "CUSTOMER_SERVICE" ? "max-w-none" : "max-w-7xl"} mx-auto w-full ${motion.content}`}>
                {section === "dashboard" && (
                  <DashboardSection
                    token={token}
                    userRole={staffRole}
                    currentUserId={user.id}
                    onNavigate={navigateTo}
                  />
                )}
                {section === "admin_inbox" && (
                  <AdminInboxSection token={token} currentUserId={user?.id} />
                )}
                {section === "orders" && <OrdersSection token={token} />}
                {section === "faq" && <FaqSection token={token} />}
                {section === "kyc" && <KycSection token={token} />}
                {section === "audit" && <AuditSection token={token} />}
                {section === "products" && <ProductsSection token={token} />}
                {section === "shop_changes" && (
                  <SellerChangeRequestsSection token={token} />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
