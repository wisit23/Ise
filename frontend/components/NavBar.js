"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getStoredUser, clearSession, getAccessToken } from "../lib/auth";
import { apiFetch } from "../lib/api";
import Button from "./ui/Button";

const ROLE_LABEL = {
  BUYER: "ผู้ซื้อ",
  SELLER: "ผู้ขาย",
  ADMIN: "แอดมิน",
  MARKETING: "การตลาด",
  CUSTOMER_SERVICE: "ฝ่ายบริการลูกค้า",
  EXECUTIVE: "ผู้บริหาร",
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
      apiFetch("/api/orders/mine?status=pending_payment&limit=1", { token })
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
    // Escape closes the menu and hands focus back to the avatar button, so a
    // keyboard user is not stranded inside a menu they cannot dismiss.
    function handleEscape(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
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
  const isExecutive = user?.role === "EXECUTIVE";
  const isMarketing = user?.role === "MARKETING";
  const isSupportAgent =
    user?.role === "CUSTOMER_SERVICE" || user?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-nav border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-xl font-bold tracking-tight text-emerald-600"
        >
          RE-LOOP
        </Link>

        <form onSubmit={handleSearch} className="hidden flex-1 sm:flex">
          <div className="focus-within:border-brand-500 flex w-full overflow-hidden rounded-md border border-line-strong transition">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="ค้นหาสินค้า"
              placeholder="ค้นหาสินค้า เช่น เสื้อ, กระเป๋า, รองเท้า..."
              className="placeholder:text-ink-subtle w-full px-3 py-2 text-sm text-gray-900 outline-none"
            />
            <button
              type="submit"
              className="flex items-center bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              ค้นหา
            </button>
          </div>
        </form>

        {/* On small screens the label is hidden and only the icon remains, so
            each link carries its own aria-label rather than relying on text
            that may not be rendered. */}
        <Link
          href="/swipe"
          aria-label="ปัดดูสินค้า"
          className="focus-ring flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-sm text-gray-600 transition hover:text-brand-600"
        >
          <span
            className="material-symbols-outlined text-[20px] leading-none"
            aria-hidden="true"
          >
            swipe
          </span>
          <span className="hidden sm:inline">ปัดดูสินค้า</span>
        </Link>

        <Link
          href="/auctions"
          aria-label="ประมูล"
          className="focus-ring flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-sm text-gray-600 transition hover:text-brand-600"
        >
          <span
            className="material-symbols-outlined text-[20px] leading-none"
            aria-hidden="true"
          >
            gavel
          </span>
          <span className="hidden sm:inline">ประมูล</span>
        </Link>

        <div className="ml-auto shrink-0">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="เมนูโปรไฟล์"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 ring-2 ring-transparent transition hover:ring-brand-200"
              >
                {user.firstName?.[0] || "?"}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="animate-dropdown-in absolute right-0 top-11 w-64 overflow-hidden rounded-lg border border-line bg-white py-2 shadow-lg"
                >
                  <div className="border-b border-gray-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      {ROLE_LABEL[user.role] || user.role}
                    </span>
                  </div>

                  {isSupportAgent && (
                    <Link
                      href="/workspace"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white">
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          headset_mic
                        </span>
                      </span>
                      Backoffice Workspace
                    </Link>
                  )}

                  <Link
                    href="/sell"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <span className="material-symbols-outlined text-[14px] leading-none">
                        add
                      </span>
                    </span>
                    ลงขายสินค้า
                  </Link>

                  {isExecutive && (
                    <Link
                      href="/executive"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          insights
                        </span>
                      </span>
                      แดชบอร์ดผู้บริหาร
                    </Link>
                  )}

                  {isSeller && (
                    <Link
                      href="/seller/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          storefront
                        </span>
                      </span>
                      แดชบอร์ดผู้ขาย
                    </Link>
                  )}

                  {isSeller && (
                    <Link
                      href="/seller/videos/new"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          videocam
                        </span>
                      </span>
                      อัปโหลดคลิปรีวิว
                    </Link>
                  )}

                  {isSeller && (
                    <Link
                      href="/seller/auctions"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          gavel
                        </span>
                      </span>
                      ส่งสินค้าประมูล
                    </Link>
                  )}

                  {isMarketing && (
                    <Link
                      href="/marketing"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          campaign
                        </span>
                      </span>
                      ศูนย์การตลาด
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
                    href="/help"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    ศูนย์ช่วยเหลือ
                  </Link>

                  <Link
                    href="/support/tickets"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    ตั๋วแจ้งปัญหาของฉัน
                  </Link>

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
                className="focus-ring rounded-md px-1 py-1 text-gray-600 transition hover:text-brand-600"
              >
                เข้าสู่ระบบ
              </Link>
              <Button href="/register">สมัครสมาชิก</Button>
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
          aria-label="ค้นหาสินค้า"
          placeholder="ค้นหาสินค้า..."
          className="focus-ring placeholder:text-ink-subtle w-full rounded-md border border-line-strong px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500"
        />
      </form>
    </header>
  );
}
