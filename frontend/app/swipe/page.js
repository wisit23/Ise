"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SwipeFeedViewer from "../../components/swipe/SwipeFeedViewer";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { apiFetch } from "../../lib/api";
import { clearSession, getStoredUser } from "../../lib/auth";

export default function SwipeFeed() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [initialVideoId, setInitialVideoId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setUser(getStoredUser());

    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const vid = params.get("video") || params.get("videoId");
        if (vid) setInitialVideoId(vid);
      } catch {
        // Safe fallback
      }
    }

    apiFetch("/api/products/videos/feed?limit=20")
      .then((data) => {
        if (isMounted) setVideos(data.items || []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function handleLogout() {
    clearSession();
    setUser(null);
    window.location.href = "/";
  }

  return (
    <div className="relative flex h-screen h-dvh w-full overflow-hidden bg-zinc-950 text-white font-sans">
      {/* Left Rail / Desktop Sidebar */}
      <aside
        aria-label="เมนูหลัก RELOOP"
        className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col justify-between border-r border-zinc-800/80 bg-zinc-950 p-5 lg:p-6 overflow-y-auto overscroll-contain z-30 select-none"
      >
        <div className="flex flex-col">
          {/* RELOOP Logo */}
          <Link
            href="/"
            aria-label="RE-LOOP หน้าแรก"
            className="focus-ring mb-6 flex items-center gap-2.5 rounded font-display text-xl font-bold tracking-tight text-white transition hover:opacity-90"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(140deg,theme(colors.brand.600),theme(colors.brand.300))] text-white shadow-brand">
              <span
                className="material-symbols-outlined text-[18px] leading-none"
                aria-hidden="true"
              >
                autorenew
              </span>
            </span>
            <span>RE-LOOP</span>
          </Link>

          {/* Main Navigation Links */}
          <nav aria-label="แถบนำทางหลัก" className="flex flex-col gap-1.5">
            <Link
              href="/"
              className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              <span
                className="material-symbols-outlined text-[20px] text-zinc-400"
                aria-hidden="true"
              >
                home
              </span>
              <span>หน้าแรก</span>
            </Link>
            <Link
              href="/swipe"
              aria-current="page"
              className="focus-ring flex items-center gap-3.5 rounded-xl bg-brand-600/15 px-3.5 py-2.5 text-sm font-semibold text-brand-400 transition"
            >
              <span
                className="material-symbols-outlined text-[20px] text-brand-400"
                aria-hidden="true"
              >
                swipe
              </span>
              <span>ปัดดู</span>
            </Link>
            <Link
              href="/products"
              className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              <span
                className="material-symbols-outlined text-[20px] text-zinc-400"
                aria-hidden="true"
              >
                storefront
              </span>
              <span>สินค้าทั้งหมด</span>
            </Link>
            <Link
              href="/auctions"
              className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              <span
                className="material-symbols-outlined text-[20px] text-zinc-400"
                aria-hidden="true"
              >
                gavel
              </span>
              <span>ประมูล</span>
            </Link>
            <Link
              href="/articles"
              className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              <span
                className="material-symbols-outlined text-[20px] text-zinc-400"
                aria-hidden="true"
              >
                menu_book
              </span>
              <span>บทความ</span>
            </Link>
          </nav>

          <div className="my-5 border-t border-zinc-800/80" />

          {/* User / Auth section */}
          {user ? (
            <div className="flex flex-col gap-1.5">
              <Link
                href="/sell"
                className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-brand-400 transition hover:bg-zinc-900"
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  aria-hidden="true"
                >
                  add_circle
                </span>
                <span>ลงขายสินค้า</span>
              </Link>
              <Link
                href="/chat"
                className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                <span
                  className="material-symbols-outlined text-[20px] text-zinc-400"
                  aria-hidden="true"
                >
                  chat_bubble
                </span>
                <span>ข้อความ</span>
              </Link>
              <Link
                href="/orders"
                className="focus-ring flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                <span
                  className="material-symbols-outlined text-[20px] text-zinc-400"
                  aria-hidden="true"
                >
                  receipt_long
                </span>
                <span>คำสั่งซื้อของฉัน</span>
              </Link>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 font-semibold text-xs text-white">
                    {user.firstName?.[0] || user.displayName?.[0] || "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">
                      {user.firstName
                        ? `${user.firstName} ${user.lastName || ""}`
                        : user.displayName || "ผู้ใช้งาน"}
                    </p>
                    <p className="text-[11px] text-zinc-400 capitalize">
                      {user.role?.toLowerCase() || "ผู้ซื้อ"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="focus-ring mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-rose-400"
                >
                  <span
                    className="material-symbols-outlined text-[15px]"
                    aria-hidden="true"
                  >
                    logout
                  </span>
                  ออกจากระบบ
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <p className="text-xs leading-relaxed text-zinc-400">
                เข้าสู่ระบบเพื่อกดถูกใจและบันทึกคลิปสินค้ามือสอง
              </p>
              <div className="mt-3.5 flex flex-col gap-2">
                <Button
                  href="/login"
                  variant="primary"
                  size="sm"
                  className="w-full justify-center"
                >
                  เข้าสู่ระบบ
                </Button>
                <Link
                  href="/register"
                  className="focus-ring block rounded-lg py-1 text-center text-xs font-medium text-zinc-400 transition hover:text-white"
                >
                  สมัครสมาชิกใหม่
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="pt-6 text-[11px] text-zinc-500 space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/products" className="hover:text-zinc-300 transition">
              สินค้า
            </Link>
            <Link href="/articles" className="hover:text-zinc-300 transition">
              บทความ
            </Link>
            <Link
              href="/support/tickets"
              className="hover:text-zinc-300 transition"
            >
              ศูนย์ช่วยเหลือ
            </Link>
          </div>
          <p>© 2026 RE-LOOP Marketplace</p>
        </div>
      </aside>

      {/* Center Stage & Main Feed */}
      <div className="relative flex min-w-0 flex-1 flex-col h-full overflow-hidden bg-black">
        {/* Floating Mobile Header (visible on mobile / small screens) */}
        <header className="lg:hidden absolute top-0 left-0 right-0 z-40 flex items-center justify-between pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] bg-gradient-to-b from-black/85 via-black/50 to-transparent pointer-events-none">
          <Link
            href="/"
            className="focus-ring pointer-events-auto flex min-h-[44px] items-center gap-2 rounded-full bg-black/50 px-3.5 py-2 text-xs font-semibold text-white/90 backdrop-blur-md border border-white/10 transition hover:bg-black/80 hover:text-white"
          >
            <svg
              className="h-4 w-4 stroke-current stroke-2 fill-none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            กลับหน้าหลัก
          </Link>

          <div className="pointer-events-auto flex items-center gap-2">
            <span className="text-sm font-black tracking-wider text-brand-400 drop-shadow">
              RELOOP FEED
            </span>
          </div>

          <Link
            href="/products"
            aria-label="ค้นหาสินค้า"
            className="focus-ring pointer-events-auto flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md border border-white/10 transition hover:bg-black/80 hover:text-white"
          >
            <svg
              className="h-5 w-5 stroke-current stroke-2 fill-none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </Link>
        </header>

        {/* Main Feed Content Area */}
        <main className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          {loading ? (
            <div
              className="flex flex-col items-center gap-3"
              role="status"
              aria-live="polite"
            >
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
              <p className="animate-pulse text-sm font-medium text-zinc-400">
                กำลังโหลดคลิปรีวิวสินค้า...
              </p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="max-w-md mx-4 rounded-2xl border border-danger/30 bg-zinc-900/90 p-6 text-center backdrop-blur-md shadow-2xl"
            >
              <div
                className="mb-3 flex justify-center text-danger"
                aria-hidden="true"
              >
                <svg
                  className="h-10 w-10 stroke-current stroke-2 fill-none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-danger">
                เกิดข้อผิดพลาดในการโหลดข้อมูล
              </p>
              <p className="mt-1.5 text-xs text-zinc-400">{error}</p>
            </div>
          ) : videos.length === 0 ? (
            <EmptyState
              icon="videocam_off"
              title="ยังไม่มีคลิปรีวิวในขณะนี้"
              description="ผู้ขายสามารถอัปโหลดคลิปวิดีโอรีวิวเพื่อแนะนำสินค้าได้ผ่านระบบหลังบ้านร้านค้า"
              action={
                <Button href="/" variant="primary" size="sm">
                  เลือกดูสินค้าทั้งหมด
                </Button>
              }
              className="max-w-sm mx-4 border-zinc-800 bg-zinc-900/90 shadow-2xl backdrop-blur-md [&>span]:text-zinc-400 [&>p.text-gray-800]:text-white [&>p.text-ink-muted]:text-zinc-400"
            />
          ) : (
            <SwipeFeedViewer
              videos={videos}
              initialVideoId={initialVideoId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
