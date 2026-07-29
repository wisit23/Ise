"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getStoredUser, clearSession, getAccessToken } from "../lib/auth";
import { apiFetch } from "../lib/api";

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
  const menuRef = useRef(null);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);

    const token = getAccessToken();
    if (token) {
      apiFetch("/api/orders/mine?status=pending&limit=1", { token })
        .then((data) => setCartCount(data.total))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
            />
            <button
              type="submit"
              aria-label="ค้นหา"
              className="flex items-center bg-emerald-600 px-4 text-white hover:bg-emerald-700"
            >
              ค้นหา
            </button>
          </div>
        </form>

        <div className="ml-auto shrink-0">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="เมนูโปรไฟล์"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 ring-2 ring-transparent hover:ring-emerald-200"
              >
                {user.firstName?.[0] || "?"}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-11 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      {ROLE_LABEL[user.role] || user.role}
                    </span>
                  </div>

                  <Link
                    href="/sell"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                      +
                    </span>
                    ลงขายสินค้า
                  </Link>

                  {isSeller && (
                    <Link
                      href="/seller/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                        🏪
                      </span>
                      แดชบอร์ดผู้ขาย
                    </Link>
                  )}

                  <Link
                    href="/cart"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    ตะกร้า
                    {cartCount > 0 && (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] text-white">
                        {cartCount}
                      </span>
                    )}
                  </Link>

                  <Link
                    href="/orders"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    คำสั่งซื้อของฉัน
                  </Link>

                  {isSeller && (
                    <Link
                      href={`/store/${user.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      ร้านค้าของฉัน
                    </Link>
                  )}

                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    ตั้งค่าโปรไฟล์
                  </Link>

                  <div className="my-1 border-t border-gray-100" />

                  <button
                    onClick={handleLogout}
                    className="block w-full px-4 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
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
            </div>
          )}
        </div>
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
    </header>
  );
}
