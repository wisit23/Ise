"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandLogo from "./BrandLogo";
import { useEffect, useRef, useState } from "react";
import {
  getStoredUser,
  clearSession,
  getAccessToken,
  getAccessTokenClaims,
  getCurrentRoles,
  isCustomerAccountRoles,
  isValidRoleCombinationRoles,
} from "../lib/auth";
import { apiFetch } from "../lib/api";
import Button from "./ui/Button";
import { fetchActiveCategories } from "../lib/catalog";
import { getUnreadCount } from "../lib/chat";
import { useChatSocket, useChatSocketEvent } from "./chat/ChatSocketProvider";

// Only used while the shared socket is down — the badge's normal path is a
// pushed "conversation:activity" event (see the effects below). 15s keeps
// the degraded case feeling current without hammering the endpoint from
// every open tab on every page.
const UNREAD_POLL_INTERVAL_MS = 15000;

const ROLE_LABEL = {
  BUYER: "ผู้ซื้อ",
  SELLER: "ผู้ขาย",
  ADMIN: "Trust and Safety",
  TRUST_AND_SAFETY: "Trust and Safety",
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
  { href: "/swipe", label: "ปัดดู", icon: "swipe" },
  { href: "/campaigns", label: "คูปอง", icon: "confirmation_number" },
  { href: "/auctions", label: "ประมูล", icon: "gavel" },
  { href: "/articles", label: "บทความ", icon: "menu_book" },
];

const WORK_MENU_ITEMS = [
  {
    href: "/workspace",
    label: "Backoffice Workspace",
    icon: "headset_mic",
    roles: ["CUSTOMER_SERVICE", "ADMIN", "TRUST_AND_SAFETY"],
  },
  {
    href: "/executive",
    label: "แดชบอร์ดผู้บริหาร",
    icon: "insights",
    roles: ["EXECUTIVE"],
  },
  {
    href: "/seller/dashboard",
    label: "แดชบอร์ดผู้ขาย",
    icon: "storefront",
    roles: ["SELLER"],
    requiresVerifiedSeller: true,
  },
  {
    href: ({ userId }) => `/store/${userId}`,
    label: "ร้านค้าของฉัน",
    icon: "storefront",
    roles: ["SELLER"],
    requiresVerifiedSeller: true,
  },
  {
    href: "/seller/videos/new",
    label: "อัปโหลดคลิปรีวิว",
    icon: "videocam",
    roles: ["SELLER"],
    requiresVerifiedSeller: true,
  },
  {
    href: "/seller/auctions",
    label: "ส่งสินค้าประมูล",
    icon: "gavel",
    roles: ["SELLER"],
    requiresVerifiedSeller: true,
  },
  {
    href: "/marketing",
    label: "ศูนย์การตลาด",
    icon: "campaign",
    roles: ["MARKETING"],
  },
];

const CUSTOMER_ACCOUNT_MENU_ITEMS = [
  {
    href: "/sell",
    label: "ลงขายสินค้า",
    icon: "add_circle",
    accent: true,
  },
  { href: "/orders", label: "คำสั่งซื้อของฉัน", icon: "receipt_long" },
  {
    href: "/campaigns?tab=mine",
    label: "คูปองส่วนลดของฉัน",
    icon: "loyalty",
  },
  {
    href: "/support/tickets",
    label: "ตั๋วแจ้งปัญหาของฉัน",
    icon: "confirmation_number",
  },
  { href: "/help", label: "ศูนย์ช่วยเหลือ", icon: "help" },
  { href: "/profile", label: "ตั้งค่าโปรไฟล์", icon: "person" },
];

function resolveMenuHref(item, context) {
  return typeof item.href === "function" ? item.href(context) : item.href;
}

export default function NavBar() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [kycStatus, setKycStatus] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const menuRef = useRef(null);
  const discoveryRef = useRef(null);
  const discoveryTrigger = useRef(null);
  const { connected: socketConnected } = useChatSocket();

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);

    const token = getAccessToken();
    if (token) {
      const claims = getAccessTokenClaims();
      setKycStatus(claims?.kycStatus || null);

      if (isCustomerAccountRoles(getCurrentRoles())) {
        apiFetch("/api/orders/mine?status=pending_payment&limit=1", { token })
          .then((data) => setCartCount(data.total))
          .catch((err) =>
            console.error("โหลดจำนวนสินค้าในตะกร้าไม่สำเร็จ:", err),
          );
        getUnreadCount(token)
          .then((data) => setUnreadCount(data.total))
          .catch((err) =>
            console.error("โหลดจำนวนข้อความที่ยังไม่อ่านไม่สำเร็จ:", err),
          );
      }
    }
  }, []);

  // Live path: the server nudges every participant's own socket room on any
  // new message (broadcast.js's "conversation:activity"), so the badge
  // updates on whatever page the user happens to be on — not just while a
  // chat room is open. The nudge deliberately carries no count; the
  // authoritative total is re-read here, because a server-computed number
  // would race this user's own concurrent mark-read calls.
  useChatSocketEvent("conversation:activity", () => {
    const token = getAccessToken();
    if (!token || !isCustomerAccountRoles(getCurrentRoles())) return;
    getUnreadCount(token)
      .then((data) => setUnreadCount(data.total))
      .catch(() => {});
  });

  // Fallback path: only runs while the socket ISN'T connected (blocked by a
  // strict network, dropped mid-session, still connecting). Without this
  // gate the badge would be both pushed and polled at once, doubling the
  // request rate for no benefit.
  useEffect(() => {
    if (socketConnected) return undefined;
    const token = getAccessToken();
    if (!token || !isCustomerAccountRoles(getCurrentRoles())) return undefined;

    const interval = setInterval(() => {
      if (document.hidden) return;
      getUnreadCount(token)
        .then((data) => setUnreadCount(data.total))
        .catch(() => {
          // A missed poll tick isn't worth surfacing — the next one retries.
        });
    }, UNREAD_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [socketConnected, user]);

  // A socket that just (re)connected missed everything that happened while
  // it was down — reconnecting is precisely when a resync is mandatory, not
  // optional. This is what stops the badge from sitting stale after a
  // laptop wakes from sleep.
  useEffect(() => {
    if (!socketConnected) return;
    const token = getAccessToken();
    if (!token || !isCustomerAccountRoles(getCurrentRoles())) return;
    getUnreadCount(token)
      .then((data) => setUnreadCount(data.total))
      .catch(() => {});
  }, [socketConnected]);

  // Local sync path: when a conversation is opened or marked read in this
  // window, this local event fires so the badge refreshes immediately.
  useEffect(() => {
    function handleSync(e) {
      if (typeof e?.detail?.total === "number") {
        setUnreadCount(e.detail.total);
      } else {
        const token = getAccessToken();
        if (token && isCustomerAccountRoles(getCurrentRoles())) {
          getUnreadCount(token)
            .then((data) => setUnreadCount(data.total))
            .catch(() => {});
        }
      }
    }
    window.addEventListener("chat:unread-sync", handleSync);
    return () => window.removeEventListener("chat:unread-sync", handleSync);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        !discoveryRef.current?.contains(e.target) &&
        !discoveryTrigger.current?.contains(e.target)
      )
        setMobileMenuOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    // Escape closes the menu and hands focus back to the avatar button, so a
    // keyboard user is not stranded inside a menu they cannot dismiss.
    function handleEscape(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileMenuOpen(false);
        if (
          discoveryRef.current?.contains(document.activeElement) ||
          discoveryTrigger.current === document.activeElement
        )
          discoveryTrigger.current?.focus();
        else menuRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // The catalogue menu is the only place in the header that needs these, and
  // it is cheap: fetchActiveCategories is memoised per page load.
  useEffect(() => {
    fetchActiveCategories()
      .then(setCategories)
      .catch((err) => console.error("โหลดหมวดหมู่ไม่สำเร็จ:", err));
  }, []);

  function handleLogout() {
    clearSession();
    setUser(null);
    setKycStatus(null);
    setCartCount(0);
    setUnreadCount(0);
    setMenuOpen(false);
    setMobileMenuOpen(false);
    // Keep the mounted storefront (and its entrance animation) on home.
    if (window.location.pathname !== "/") router.replace("/");
  }

  function handleSearch(e) {
    e.preventDefault();
    window.location.href = q
      ? `/products?q=${encodeURIComponent(q)}`
      : "/products";
  }

  const currentRoles = user ? getCurrentRoles() : [];
  const hasValidRoleCombination = isValidRoleCombinationRoles(currentRoles);
  const isCustomerAccount =
    Boolean(user) && isCustomerAccountRoles(currentRoles);
  const availableWorkItems = hasValidRoleCombination
    ? WORK_MENU_ITEMS.filter(
        (item) =>
          item.roles.some((role) => currentRoles.includes(role)) &&
          (!item.requiresVerifiedSeller || kycStatus === "VERIFIED"),
      )
    : [];
  const displayRole = currentRoles.includes("SELLER")
    ? "SELLER"
    : currentRoles[0] || user?.role;
  const canUseCart = isCustomerAccount;

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-7xl w-full items-center justify-between gap-2 px-3.5 sm:px-6 lg:px-8 sm:h-[72px]">
        <BrandLogo compact />

        <form
          onSubmit={handleSearch}
          className="hidden min-w-0 flex-1 sm:flex mx-2 lg:mx-4"
        >
          <div className="flex w-full max-w-[520px] items-center gap-[.6rem] rounded-full border-[1.5px] border-line bg-surface-subtle p-[.4rem] pl-[1.1rem] transition duration-[250ms] focus-within:border-brand-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-50">
            <span
              className="material-symbols-outlined shrink-0 text-[18px] leading-none text-ink-subtle"
              aria-hidden="true"
            >
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="ค้นหาสินค้า"
              placeholder="ค้นหาแบรนด์ หมวดหมู่ หรือสไตล์..."
              className="placeholder:text-ink-subtle min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="submit"
              className="focus-ring shrink-0 rounded-full bg-brand-600 px-[1.35em] py-[.62em] text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              ค้นหา
            </button>
          </div>
        </form>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {canUseCart && (
            <Link
              href="/chat"
              aria-label={`ข้อความ${unreadCount > 0 ? ` มี ${unreadCount} รายการที่ยังไม่อ่าน` : ""}`}
              className="focus-ring relative grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-surface-panel hover:text-ink"
            >
              <span
                className="material-symbols-outlined text-[20px] sm:text-[21px] leading-none"
                aria-hidden="true"
              >
                chat_bubble
              </span>
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
          )}

          {canUseCart && (
            <Link
              href="/cart"
              aria-label={`ตะกร้า${cartCount > 0 ? ` มี ${cartCount} รายการ` : ""}`}
              className="focus-ring relative grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-surface-panel hover:text-ink"
            >
              <span
                className="material-symbols-outlined text-[20px] sm:text-[21px] leading-none"
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

          {/* Compact discovery menu on every screen size. */}
          <button
            type="button"
            ref={discoveryTrigger}
            aria-label="เมนูหลัก"
            title="สำรวจสินค้าและเมนูอื่น ๆ"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              setMenuOpen(false);
              setMobileMenuOpen((v) => !v);
            }}
            className={`focus-ring flex h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-xs sm:text-sm font-medium transition-colors ${mobileMenuOpen ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-surface-subtle"}`}
          >
            <span
              className="material-symbols-outlined text-[20px] leading-none"
              aria-hidden="true"
            >
              explore
            </span>
            <span>สำรวจ</span>
            <span
              className={`material-symbols-outlined text-[16px] transition-transform ${mobileMenuOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              expand_more
            </span>
          </button>

          <div className="shrink-0">
            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setMenuOpen((v) => !v);
                  }}
                  aria-label="เมนูโปรไฟล์"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={`focus-ring flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${menuOpen ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-surface-subtle"}`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {displayRole === "ADMIN" ||
                    displayRole === "TRUST_AND_SAFETY"
                      ? "T"
                      : user.firstName?.[0] || "?"}
                  </span>
                  <span className="hidden sm:inline">บัญชี</span>
                  <span
                    className={`material-symbols-outlined hidden sm:inline text-[16px] transition-transform ${menuOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="animate-dropdown-in absolute right-0 top-12 w-72 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-4.75rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white py-2 shadow-lg"
                  >
                    <div className="border-b border-line px-4 py-3">
                      {displayRole === "ADMIN" ||
                      displayRole === "TRUST_AND_SAFETY" ? (
                        <p className="truncate text-sm font-semibold text-gray-900">
                          Trust and Safety
                        </p>
                      ) : (
                        <>
                          <p className="truncate text-sm font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </p>
                          <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            {ROLE_LABEL[displayRole] || displayRole}
                          </span>
                        </>
                      )}
                    </div>

                    {availableWorkItems.length > 0 && (
                      <>
                        <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                          การทำงาน
                        </p>

                        {availableWorkItems.map((item) => (
                          <Link
                            key={item.label}
                            href={resolveMenuHref(item, { userId: user.id })}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <span
                              className="material-symbols-outlined text-[18px] text-ink-subtle"
                              aria-hidden="true"
                            >
                              {item.icon}
                            </span>
                            {item.label}
                          </Link>
                        ))}

                        <div className="my-1 border-t border-line" />
                      </>
                    )}

                    {isCustomerAccount && (
                      <>
                        <p className="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                          บัญชีของฉัน
                        </p>

                        {CUSTOMER_ACCOUNT_MENU_ITEMS.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className={`flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 ${
                              item.accent
                                ? "font-medium text-brand-700 hover:bg-brand-50"
                                : "text-gray-700"
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined text-[18px] ${
                                item.accent ? "" : "text-ink-subtle"
                              }`}
                              aria-hidden="true"
                            >
                              {item.icon}
                            </span>
                            {item.label}
                          </Link>
                        ))}

                        <div className="my-1 border-t border-line" />
                      </>
                    )}

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
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <Link
                  href="/login"
                  className="focus-ring rounded-sm px-2.5 py-1.5 sm:px-[.9em] sm:py-[.55em] font-medium text-ink-muted transition hover:bg-surface-panel hover:text-ink whitespace-nowrap"
                >
                  เข้าสู่ระบบ
                </Link>
                <Button
                  href="/register"
                  size="sm"
                  className="hidden xs:inline-flex sm:inline-flex"
                >
                  สมัครสมาชิก
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discovery panel anchored beneath the profile area. */}
      {mobileMenuOpen && (
        <nav
          ref={discoveryRef}
          id="mobile-navigation"
          data-testid="mobile-nav-drawer"
          aria-label="เมนูนำทางสำหรับอุปกรณ์พกพา"
          className="absolute top-full right-0 left-0 z-dropdown max-h-[calc(100dvh-90px)] overflow-y-auto border border-line bg-white px-4 py-4 shadow-lg sm:left-auto sm:right-4 sm:mt-2 sm:w-[360px] sm:rounded-2xl lg:right-8 animate-dropdown-in"
        >
          <p className="mb-3 text-xs font-semibold text-ink-subtle">
            ช้อปและสำรวจ
          </p>
          <div className="flex flex-col gap-1 pb-3 border-b border-line">
            <Link
              href="/products"
              onClick={() => setMobileMenuOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-surface-panel transition-colors"
            >
              <span
                className="material-symbols-outlined text-[18px] text-ink-muted"
                aria-hidden="true"
              >
                grid_view
              </span>
              สินค้าทั้งหมด
            </Link>
            {DISCOVERY_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-surface-panel transition-colors"
              >
                <span
                  className="material-symbols-outlined text-[18px] text-ink-muted"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>

          {categories.length > 0 && (
            <div className="py-2.5 border-b border-line">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle mb-1.5">
                หมวดหมู่สินค้า
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {categories.slice(0, 8).map((c) => (
                  <Link
                    key={c.name}
                    href={`/products?category=${encodeURIComponent(c.name)}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {isCustomerAccount && (
            <div className="pt-2.5">
              <Link
                href="/sell"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  aria-hidden="true"
                >
                  add_circle
                </span>
                ลงขายสินค้าของคุณ
              </Link>
            </div>
          )}
        </nav>
      )}

      <form
        onSubmit={handleSearch}
        className="border-t border-line px-5 pb-3 sm:hidden"
      >
        <div className="flex items-center gap-2 rounded-full border-[1.5px] border-line bg-surface-subtle px-4 py-2.5 focus-within:border-brand-600 focus-within:bg-white">
          <span
            className="material-symbols-outlined shrink-0 text-[18px] leading-none text-ink-subtle"
            aria-hidden="true"
          >
            search
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหาสินค้า..."
            className="placeholder:text-ink-subtle min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </form>
    </header>
  );
}
