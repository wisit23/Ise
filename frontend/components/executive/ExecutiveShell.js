"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../NavBar";
import Footer from "../Footer";
import { getAccessToken, getStoredUser } from "../../lib/auth";

const TABS = [
  { href: "/executive", label: "ภาพรวม" },
  { href: "/executive/reports", label: "รายงานผลการดำเนินงาน" },
  { href: "/executive/complaints", label: "ข้อร้องเรียน" },
];

/**
 * Chrome + role guard shared by every /executive page. Holding the guard in
 * one place keeps the three pages from drifting apart on what "not an
 * executive" looks like, and means children only mount once the role is
 * confirmed — so their data effects never fire for a non-executive.
 */
export default function ExecutiveShell({
  title,
  activeTab,
  actions,
  children,
}) {
  const router = useRouter();
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!getAccessToken()) {
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

  if (user?.role !== "EXECUTIVE") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะบัญชีผู้บริหารเท่านั้น
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {actions}
        </div>

        <nav
          aria-label="ส่วนต่างๆ ของผู้บริหาร"
          className="mb-6 flex flex-wrap gap-1 border-b border-gray-200"
        >
          {TABS.map((tab) => {
            const isActive = tab.href === activeTab;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </section>
      <Footer />
    </main>
  );
}
