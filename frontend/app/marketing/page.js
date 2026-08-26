"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
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
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200/60 bg-white sm:flex shadow-[2px_0_10px_-3px_rgba(6,81,237,0.03)] z-10">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <span className="material-symbols-outlined text-[22px]">
                  campaign
                </span>
              </span>
              <div className="flex flex-col">
                <span className="text-[15px] font-extrabold tracking-tight text-slate-800">
                  Re-loop panel
                </span>
                <span className="text-[10px] font-bold tracking-wider text-violet-600 uppercase">
                  Marketing
                </span>
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
            {SECTIONS.map((s) => {
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
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
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex-1 overflow-y-auto">
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
            <div className="flex items-center gap-3 sm:hidden">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium shadow-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
              >
                {SECTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
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
