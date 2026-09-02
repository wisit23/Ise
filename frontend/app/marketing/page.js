"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import RadioSelect from "../../components/ui/RadioSelect";
import { getAccessToken, getStoredUser } from "../../lib/auth";

import DashboardSection from "../../components/marketing/sections/DashboardSection";
import AuctionScheduleSection from "../../components/marketing/sections/AuctionScheduleSection";

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "auctions", label: "ตารางประมูล", icon: "gavel" },
];

export default function MarketingPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState("dashboard");

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
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <NavBar />
      <div className="flex flex-1">
        {/* ── Sidebar ── */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex shadow-[2px_0_10px_-3px_rgba(6,81,237,0.03)] z-10">
          <div className="flex h-16 items-center border-b border-slate-200/60 px-4 bg-white">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-violet-50 text-violet-600">
                <span className="material-symbols-outlined text-[19px]">
                  campaign
                </span>
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold tracking-tight text-slate-800">
                  Re-loop panel
                </span>
                <span className="text-[10px] font-semibold tracking-wider text-violet-600 uppercase">
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
                  onClick={() => setSection(s.key)}
                  className={`group flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left text-xs transition-colors ${
                    active
                      ? "bg-violet-600 text-white font-semibold shadow-sm"
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
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex-1 overflow-y-auto">
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
            <div className="flex items-center gap-3 sm:hidden">
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

          <div className="p-8 max-w-7xl mx-auto">
            {section === "dashboard" && (
              <DashboardSection token={token} onNavigate={setSection} />
            )}
            {section === "auctions" && <AuctionScheduleSection token={token} />}
          </div>
        </main>
      </div>
    </div>
  );
}
