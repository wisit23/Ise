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

/* Everywhere a buyer browses to find something. Shown as top-level links —
   this is the "single row" pattern chosen after prototyping it alongside a
   two-row collapsing header and a hidden-search variant: three destinations
   is few enough to sit beside the search field without crowding it, and
   nothing here ever moves or hides. */
const DISCOVERY_LINKS = [
  { href: "/products", label: "สินค้าทั้งหมด", icon: "storefront" },
  { href: "/swipe", label: "ปัดดู", icon: "swipe" },
  { href: "/auctions", label: "ประมูล", icon: "gavel" },
];

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
        .catch((err) =>
          console.error("โหลดจำนวนสินค้าในตะกร้าไม่สำเร็จ:", err),
        );
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
  // Every one of these is a role someone can hold *in addition to* being a
  // buyer on this same account — the header never assumes a visitor is only
  // one thing, which is why these sit in their own labelled group instead of
  // gating an entirely separate header.
  const hasWorkLinks = isSupportAgent || isSeller || isExecutive || isMarketing;

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          aria-label="RE-LOOP หน้าแรก"
          className="focus-ring flex shrink-0 items-center gap-2 rounded text-xl font-bold tracking-tight text-brand-600"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <span
              className="material-symbols-outlined text-[18px]"
              aria-hidden="true"
            >
              autorenew
            </span>
          </span>
          <span className="hidden sm:inline">RE-LOOP</span>
        </Link>

        <form onSubmit={handleSearch} className="hidden min-w-0 flex-1 sm:flex">
          <div className="focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 flex w-full max-w-md overflow-hidden rounded-full border border-line-strong bg-white transition">
            <span className="material-symbols-outlined pl-4 text-[19px] text-ink-subtle">
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="ค้นหาสินค้า"
              placeholder="ค้นหาแบรนด์ หมวดหมู่ หรือสไตล์..."
              className="placeholder:text-ink-subtle min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none"
            />
            <button
              type="submit"
              className="shrink-0 self-stretch bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              ค้นหา
            </button>
          </div>
        </form>

        {/* On small screens the label is hidden and only the icon remains, so
            each link carries its own aria-label rather than relying on text
            that may not be rendered. */}
        <nav
          aria-label="สำรวจสินค้า"
          className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0"
        >
          {DISCOVERY_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="focus-ring flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-brand-700 md:px-3"
            >
              <span
                className="material-symbols-outlined text-[20px] leading-none"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          ))}
        </nav>

        {user && (
          <Link
            href="/sell"
            className="focus-ring hidden shrink-0 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 md:flex"
          >
            <span
              className="material-symbols-outlined text-[18px] leading-none"
              aria-hidden="true"
            >
              add_circle
            </span>
            ลงขาย
          </Link>
        )}

        {user && (
          <Link
            href="/cart"
            aria-label={`ตะกร้า${cartCount > 0 ? ` มี ${cartCount} รายการ` : ""}`}
            className="focus-ring relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-brand-700"
          >
            <span
              className="material-symbols-outlined text-[22px] leading-none"
              aria-hidden="true"
            >
              shopping_cart
            </span>
            {cartCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                {cartCount}
              </span>
            )}
          </Link>
        )}

        <div className="shrink-0">
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
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                      {ROLE_LABEL[user.role] || user.role}
                    </span>
                  </div>

                  {/* Work links live in their own labelled section rather
                      than mixed in with "my stuff" — the twelve items this
                      menu used to hold in one flat list were exactly this
                      plus the buyer links below, undivided. Nothing here was
                      removed, only grouped. */}
                  {hasWorkLinks && (
                    <>
                      <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                        การทำงาน
                      </p>

                      {isSupportAgent && (
                        <Link
                          href="/workspace"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            headset_mic
                          </span>
                          Backoffice Workspace
                        </Link>
                      )}

                      {isExecutive && (
                        <Link
                          href="/executive"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            insights
                          </span>
                          แดชบอร์ดผู้บริหาร
                        </Link>
                      )}

                      {isSeller && (
                        <Link
                          href="/seller/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            storefront
                          </span>
                          แดชบอร์ดผู้ขาย
                        </Link>
                      )}

                      {isSeller && (
                        <Link
                          href={`/store/${user.id}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            storefront
                          </span>
                          ร้านค้าของฉัน
                        </Link>
                      )}

                      {isSeller && (
                        <Link
                          href="/seller/videos/new"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            videocam
                          </span>
                          อัปโหลดคลิปรีวิว
                        </Link>
                      )}

                      {isSeller && (
                        <Link
                          href="/seller/auctions"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            gavel
                          </span>
                          ส่งสินค้าประมูล
                        </Link>
                      )}

                      {isMarketing && (
                        <Link
                          href="/marketing"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className="material-symbols-outlined text-[18px] text-ink-subtle"
                            aria-hidden="true"
                          >
                            campaign
                          </span>
                          ศูนย์การตลาด
                        </Link>
                      )}

                      <div className="my-1 border-t border-line" />
                    </>
                  )}

                  <p className="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                    บัญชีของฉัน
                  </p>

                  {/* Also a header pill at md+ (next to the cart icon), but
                      that pill is hidden below md to leave room for the
                      search field — this is the only path to /sell on a
                      phone, so it has to exist here too, not just as a
                      shortcut. */}
                  <Link
                    href="/sell"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      aria-hidden="true"
                    >
                      add_circle
                    </span>
                    ลงขายสินค้า
                  </Link>

                  <Link
                    href="/orders"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span
                      className="material-symbols-outlined text-[18px] text-ink-subtle"
                      aria-hidden="true"
                    >
                      receipt_long
                    </span>
                    คำสั่งซื้อของฉัน
                  </Link>

                  <Link
                    href="/support/tickets"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span
                      className="material-symbols-outlined text-[18px] text-ink-subtle"
                      aria-hidden="true"
                    >
                      confirmation_number
                    </span>
                    ตั๋วแจ้งปัญหาของฉัน
                  </Link>

                  <Link
                    href="/help"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span
                      className="material-symbols-outlined text-[18px] text-ink-subtle"
                      aria-hidden="true"
                    >
                      help
                    </span>
                    ศูนย์ช่วยเหลือ
                  </Link>

                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span
                      className="material-symbols-outlined text-[18px] text-ink-subtle"
                      aria-hidden="true"
                    >
                      person
                    </span>
                    ตั้งค่าโปรไฟล์
                  </Link>

                  <div className="my-1 border-t border-line" />

                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      aria-hidden="true"
                    >
                      logout
                    </span>
                    ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/login"
                className="focus-ring rounded-md px-2 py-1.5 text-gray-600 transition hover:text-brand-600"
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
        className="border-t border-line px-4 py-2 sm:hidden"
      >
        <div className="flex items-center overflow-hidden rounded-full border border-line-strong bg-white">
          <span className="material-symbols-outlined pl-3 text-[18px] text-ink-subtle">
            search
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหาสินค้า..."
            className="focus-ring placeholder:text-ink-subtle min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-gray-900 outline-none"
          />
        </div>
      </form>
    </header>
  );
}
