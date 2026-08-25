"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { getAccessToken, getStoredUser } from "../../lib/auth";

const TABS = [{ href: "/marketing/auctions", label: "ประมูล" }];

export default function MarketingLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(undefined);

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

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4">
          <h1 className="mr-6 py-4 text-lg font-bold text-gray-900">
            ศูนย์การตลาด
          </h1>
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`border-b-2 px-3 py-4 text-sm font-medium ${
                pathname?.startsWith(tab.href)
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </section>
      <Footer />
    </main>
  );
}
