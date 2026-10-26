"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import RadioSelect from "../../components/ui/RadioSelect";
import { getAccessToken, getStoredUser } from "../../lib/auth";

import DashboardSection from "../../components/marketing/sections/DashboardSection";
import AuctionScheduleSection from "../../components/marketing/sections/AuctionScheduleSection";
import ArticlesSection from "../../components/marketing/sections/ArticlesSection";
import CampaignsSection from "../../components/marketing/sections/CampaignsSection";
import AuditTrailSection from "../../components/marketing/sections/AuditTrailSection";
import CustomerInsightsSection from "../../components/marketing/sections/CustomerInsightsSection";

const DEFAULT_SECTION = "dashboard";

const SECTIONS = [
  { key: DEFAULT_SECTION, label: "Dashboard", icon: "dashboard" },
  { key: "customer-insights", label: "ความสนใจลูกค้า", icon: "insights" },
  { key: "campaigns", label: "แคมเปญและคูปอง", icon: "confirmation_number" },
  { key: "auctions", label: "ตารางประมูล", icon: "gavel" },
  { key: "articles", label: "จัดการบทความ", icon: "article" },
  { key: "audit", label: "ประวัติการดำเนินงาน", icon: "history" },
];

export default function MarketingPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState(DEFAULT_SECTION);
  const [campaignAudienceSeed, setCampaignAudienceSeed] = useState(null);
  const mainContentRef = useRef(null);

  const resetMainContentScroll = useCallback(() => {
    const mainElement = mainContentRef.current;
    if (!mainElement) return;
    if (typeof mainElement.scrollTo === "function") {
      mainElement.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    mainElement.scrollTop = 0;
  }, []);

  const handleSectionChange = useCallback(
    (nextSection) => {
      setSection(nextSection);
      resetMainContentScroll();
    },
    [resetMainContentScroll],
  );

  const handleCreateCampaignFromInsights = useCallback(
    (criteria) => {
      setCampaignAudienceSeed({ ...criteria, requestedAt: Date.now() });
      handleSectionChange("campaigns");
    },
    [handleSectionChange],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  useEffect(() => {
    resetMainContentScroll();
  }, [section, resetMainContentScroll]);

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
  if (user?.role !== "MARKETING") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะบัญชีฝ่ายการตลาด (Marketing) เท่านั้น
        </p>
      </main>
    );
  }

  const token = getAccessToken();
  const activeSection = SECTIONS.find((s) => s.key === section);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50/50">
      <NavBar />
      <div className="isolate flex min-h-0 flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="hidden min-h-0 w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200/60 bg-white lg:flex shadow-[2px_0_10px_-3px_rgba(6,81,237,0.03)] z-10">
          <div className="flex h-16 shrink-0 items-center border-b border-slate-200/60 px-4 bg-white">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-600">
                <span className="material-symbols-outlined text-[19px]">
                  campaign
                </span>
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold tracking-tight text-slate-800">
                  Re-loop panel
                </span>
                <span className="text-[10px] font-semibold tracking-wider text-emerald-600 uppercase">
                  Marketing
                </span>
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 p-2">
            {SECTIONS.map((s) => {
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleSectionChange(s.key)}
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
        </aside>

        {/* ── Main Content ── */}
        <main
          ref={mainContentRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        >
          <div className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-md shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]">
            <div className="flex h-16 items-center justify-between px-3.5 sm:px-6 lg:px-8 max-w-7xl mx-auto">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <span className="material-symbols-outlined text-[18px]">
                    {activeSection?.icon}
                  </span>
                </span>
                <h1 className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-slate-900 truncate">
                  {activeSection?.label}
                </h1>
              </div>
              <div className="flex items-center gap-2 lg:hidden shrink-0">
                <RadioSelect
                  value={section}
                  onChange={handleSectionChange}
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

          <div className="p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto min-w-0">
            {section === "dashboard" && (
              <DashboardSection token={token} onNavigate={handleSectionChange} />
            )}
            {section === "customer-insights" && (
              <CustomerInsightsSection
                token={token}
                onCreateCampaign={handleCreateCampaignFromInsights}
              />
            )}
            {section === "campaigns" && (
              <CampaignsSection
                token={token}
                audienceSeed={campaignAudienceSeed}
                onAudienceSeedConsumed={() => setCampaignAudienceSeed(null)}
              />
            )}
            {section === "auctions" && <AuctionScheduleSection token={token} />}
            {section === "articles" && <ArticlesSection token={token} />}
            {section === "audit" && <AuditTrailSection token={token} />}
          </div>
        </main>
      </div>
    </div>
  );
}
