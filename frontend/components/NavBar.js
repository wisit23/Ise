"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredUser, clearSession, getAccessToken } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { CATEGORIES } from "../lib/constants";

const ROLE_LABEL = {
  BUYER: "ผู้ซื้อ",
  SELLER: "ผู้ขาย",
  ADMIN: "แอดมิน",
};

export default function NavBar() {
  const [user, setUser] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);

    const token = getAccessToken();
    if (token && stored?.role !== "SELLER") {
      apiFetch("/api/orders/mine", { token })
        .then((data) =>
          setCartCount(data.items.filter((o) => o.status === "pending").length),
        )
        .catch(() => {});
    }
  }, []);

  function handleLogout() {
    clearSession();
    setUser(null);
    window.location.href = "/";
  }

  function handleSearch(e) {
    e.preventDefault();
    window.location.href = q
      ? `/products?q=${encodeURIComponent(q)}`
      : "/products";
  }

  const isSeller = user?.role === "SELLER";

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-xl font-bold tracking-tight text-emerald-600"
        >
          RE-LOOP
        </Link>

        <form onSubmit={handleSearch} className="hidden flex-1 sm:flex">
          <div className="flex w-full overflow-hidden rounded-md border border-gray-300 focus-within:border-emerald-500">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า เช่น เสื้อ, กระเป๋า, รองเท้า..."
              className="w-full px-3 py-2 text-sm outline-none"
              suppressHydrationWarning
            />
            <button
              type="submit"
              aria-label="ค้นหา"
              suppressHydrationWarning={true}
              className="flex items-center bg-emerald-600 px-4 text-white hover:bg-emerald-700"
            >
              ค้นหา
            </button>
          </div>
        </form>
          <Link href="/swipe" className="text-gray-600 hover:text-emerald-600">
                ปัดดูสินค้า
              </Link>

        <nav className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {user ? (
            <>
              {isSeller ? (
                <>
                  <Link
                    href="/sell"
                    className="text-gray-600 hover:text-emerald-600"
                  >
                    ลงขายสินค้า
                  </Link>
                  <Link
                    href="/seller/dashboard"
                    className="text-gray-600 hover:text-emerald-600"
                  >
                    แดชบอร์ดผู้ขาย
                  </Link>
                </>
              ) : (
                <Link
                  href="/cart"
                  className="relative text-gray-600 hover:text-emerald-600"
                >
                  ตะกร้า
                  {cartCount > 0 && (
                    <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-medium text-white">
                      {cartCount}
                    </span>
                  )}
                </Link>
              )}
              <Link
                href="/orders"
                className="text-gray-600 hover:text-emerald-600"
              >
                คำสั่งซื้อของฉัน
              </Link>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-gray-700 hover:bg-gray-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                    {user.firstName?.[0] || "?"}
                  </span>
                  <span className="max-w-[8rem] truncate">
                    {user.firstName}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    {ROLE_LABEL[user.role] || user.role}
                  </span>
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-10 w-40 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <button
                      onClick={handleLogout}
                      className="block w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-gray-600 hover:text-emerald-600"
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
              >
                สมัครสมาชิก
              </Link>
            </>
          )}
        </nav>
      </div>

      <form
        onSubmit={handleSearch}
        className="border-t border-gray-100 px-4 py-2 sm:hidden"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาสินค้า..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </form>

      <div className="scrollbar-none flex gap-5 overflow-x-auto border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
        <Link href="/products" className="shrink-0 hover:text-emerald-600">
          สินค้าทั้งหมด
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/products?category=${encodeURIComponent(c)}`}
            className="shrink-0 hover:text-emerald-600"
          >
            {c}
          </Link>
        ))}
      </div>
    </header>
  );
}
