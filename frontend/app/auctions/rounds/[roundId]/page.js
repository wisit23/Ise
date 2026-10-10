"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import { apiFetch, mediaUrl } from "../../../../lib/api";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function RoundDetailPage() {
  const { roundId } = useParams();
  const router = useRouter();

  const [round, setRound] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Switcher state
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [browseRounds, setBrowseRounds] = useState({
    activeAuctionRounds: [],
    upcomingRounds: [],
  });
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [switcherError, setSwitcherError] = useState("");
  const switcherRef = useRef(null);

  const loadRoundItems = useCallback(() => {
    if (!roundId) return;
    setLoading(true);
    setError("");
    apiFetch(`/api/products/auctions/rounds/${roundId}/items`)
      .then((data) => {
        setRound(data.round);
        setItems(data.items || []);
      })
      .catch((err) => {
        setError(
          err.message?.includes("ไม่พบ") || err.status === 404
            ? "ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่"
            : err.message || "เกิดข้อผิดพลาดในการโหลดสินค้าในรอบนี้",
        );
      })
      .finally(() => setLoading(false));
  }, [roundId]);

  useEffect(() => {
    loadRoundItems();
  }, [loadRoundItems]);

  const loadSwitcherRounds = useCallback(() => {
    setLoadingBrowse(true);
    setSwitcherError("");
    apiFetch("/api/products/auctions/rounds/browse")
      .then((data) => {
        setBrowseRounds({
          activeAuctionRounds: data.activeAuctionRounds || [],
          upcomingRounds: data.upcomingRounds || [],
        });
      })
      .catch(() => {
        setSwitcherError(
          "ไม่สามารถโหลดรายการรอบประมูลได้ กรุณาลองใหม่อีกครั้ง",
        );
      })
      .finally(() => setLoadingBrowse(false));
  }, []);

  // Load switcher rounds when open
  useEffect(() => {
    if (isSwitcherOpen) {
      loadSwitcherRounds();
    }
  }, [isSwitcherOpen, loadSwitcherRounds]);

  // Keyboard escape listener for Round Switcher
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isSwitcherOpen) {
        setIsSwitcherOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSwitcherOpen]);

  const allAvailableRounds = [
    ...(browseRounds.activeAuctionRounds || []),
    ...(browseRounds.upcomingRounds || []),
  ];
  const otherRounds = allAvailableRounds.filter((r) => r.id !== roundId);

  const openItems = items.filter((a) => a.status === "open");
  const scheduledItems = items.filter((a) => a.status === "scheduled");
  const cancelledItems = items.filter((a) => a.status === "cancelled");

  function ItemCard({ a }) {
    const cover = a.product?.photos?.[0]?.url;
    const isCancelled = a.status === "cancelled";
    const itemReason =
      a.cancellationReason ||
      round?.cancellationReason ||
      "ฝ่ายการตลาดยกเลิกรายการประมูล";

    if (isCancelled) {
      return (
        <div
          data-testid={`cancelled-item-card-${a.id}`}
          className="flex flex-col justify-between overflow-hidden rounded-xl border border-rose-200 bg-rose-50/20 shadow-sm"
        >
          <div>
            <div className="relative aspect-square w-full bg-gray-100 overflow-hidden">
              {cover ? (
                <img
                  src={mediaUrl(cover)}
                  alt={a.product?.title || ""}
                  className="h-full w-full object-cover grayscale opacity-75"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  <span className="material-symbols-outlined text-4xl">
                    image
                  </span>
                </div>
              )}
              <span className="absolute right-2 top-2 rounded-full bg-rose-100 border border-rose-300 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 shadow-2xs">
                ยกเลิกแล้ว
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              <Link
                href={`/auctions/${a.id}`}
                className="block truncate text-sm font-medium text-gray-900 hover:text-rose-700"
              >
                {a.product?.title || a.productId}
              </Link>
              <p className="text-xs font-semibold text-gray-500 line-through">
                เริ่มต้น {baht(a.startingPrice)}
              </p>
              <p className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1.5 text-[11px] text-rose-800">
                <span className="font-semibold">เหตุผลที่ยกเลิก:</span>{" "}
                {itemReason}
              </p>
            </div>
          </div>
          <div className="px-3 pb-3">
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-lg bg-gray-200 py-2 text-xs font-semibold text-gray-500"
            >
              ไม่สามารถประมูลได้ (ยกเลิกแล้ว)
            </button>
          </div>
        </div>
      );
    }

    return (
      <Link
        href={`/auctions/${a.id}`}
        className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <div className="aspect-square w-full bg-gray-100 overflow-hidden">
          {cover ? (
            <img
              src={mediaUrl(cover)}
              alt={a.product?.title || ""}
              className="h-full w-full object-cover transition duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <span className="material-symbols-outlined text-4xl">image</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-gray-900">
            {a.product?.title || a.productId}
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-700">
            เริ่มต้น {baht(a.startingPrice)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-4">
          <Link
            href="/auctions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            ← กลับหน้ารวมรอบประมูล
          </Link>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
            <span className="material-symbols-outlined mx-auto text-4xl text-red-500 mb-2">
              error
            </span>
            <h2 className="text-base font-bold text-red-900">{error}</h2>
            <div className="mt-4">
              <Link
                href="/auctions"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
              >
                ดูรอบการประมูลอื่น
              </Link>
            </div>
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 animate-pulse">
            กำลังโหลดข้อมูลรอบการประมูลและสินค้า...
          </div>
        ) : round ? (
          <>
            {/* Round Header with Switcher Button */}
            <div className="relative mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-gray-900">
                      {round.title}
                    </h1>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        round.phase === "cancelled" || round.cancelledAt
                          ? "bg-rose-100 text-rose-800"
                          : round.phase === "auction"
                            ? "bg-emerald-100 text-emerald-800 animate-pulse"
                            : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {round.phase === "cancelled" || round.cancelledAt
                        ? "🛑 ยกเลิกแล้ว"
                        : round.phase === "auction"
                          ? "🟢 กำลังประมูล"
                          : "🗓️ เร็วๆ นี้"}
                    </span>
                  </div>

                  <p className="text-xs text-gray-600">
                    <strong>ช่วงเวลาประมูล:</strong>{" "}
                    {fmt(round.auctionStartsAt)} — {fmt(round.auctionEndsAt)}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 pt-1">
                    <span>หมวดหมู่:</span>
                    {Array.isArray(round.categories) &&
                    round.categories.length > 0 ? (
                      round.categories.map((c) => (
                        <span
                          key={c}
                          className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                        >
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        ทุกหมวดหมู่ (All Categories)
                      </span>
                    )}
                    <span className="ml-2 font-medium text-gray-700">
                      · สินค้าทั้งหมด {round.visibleItemCount ?? items.length}{" "}
                      รายการ
                    </span>
                  </div>

                  {(round.phase === "cancelled" || round.cancelledAt) && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                      <p className="font-bold text-rose-900">
                        🛑 รอบการประมูลนี้ถูกยกเลิกแล้ว
                      </p>
                      <p className="mt-1">
                        เหตุผล:{" "}
                        {round.cancellationReason ||
                          "ฝ่ายการตลาดยกเลิกรอบการประมูล"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Round Switcher Button & Dropdown */}
                <div className="relative shrink-0" ref={switcherRef}>
                  <button
                    type="button"
                    aria-label="เปลี่ยนรอบประมูล"
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <span className="material-symbols-outlined text-base">
                      swap_horiz
                    </span>
                    เปลี่ยนรอบประมูล
                  </button>

                  {/* Switcher Popover */}
                  {isSwitcherOpen && (
                    <div className="absolute right-0 top-full mt-2 z-30 w-80 sm:w-96 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          สลับไปดูรอบประมูลอื่น
                        </h3>
                        <button
                          type="button"
                          aria-label="ปิด"
                          onClick={() => setIsSwitcherOpen(false)}
                          className="text-gray-400 hover:text-gray-600 text-sm"
                        >
                          ✕
                        </button>
                      </div>

                      {loadingBrowse ? (
                        <p className="text-xs text-gray-400 py-3 text-center">
                          กำลังโหลดรอบประมูล...
                        </p>
                      ) : switcherError ? (
                        <div className="py-3 text-center space-y-2">
                          <p className="text-xs text-red-600">
                            {switcherError}
                          </p>
                          <button
                            type="button"
                            onClick={loadSwitcherRounds}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                          >
                            ลองใหม่
                          </button>
                        </div>
                      ) : otherRounds.length === 0 ? (
                        <p className="text-xs text-gray-500 py-3 text-center">
                          ขณะนี้ยังไม่มีรอบประมูลอื่นให้เลือก
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {allAvailableRounds.map((r) => {
                            const isCurrent = r.id === roundId;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setIsSwitcherOpen(false);
                                  if (!isCurrent) {
                                    router.push(`/auctions/rounds/${r.id}`);
                                  }
                                }}
                                className={`w-full text-left rounded-xl p-3 text-xs transition border ${
                                  isCurrent
                                    ? "bg-emerald-50 border-emerald-300 font-semibold text-emerald-950"
                                    : "bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-800"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="truncate font-bold">
                                    {r.title}
                                  </span>
                                  {isCurrent && (
                                    <span className="shrink-0 text-[10px] bg-emerald-600 text-white rounded px-1.5 py-0.2">
                                      รอบปัจจุบัน
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  สิ้นสุด: {fmt(r.auctionEndsAt)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Items Grid */}
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
                <span className="material-symbols-outlined mx-auto text-4xl text-gray-400 mb-2">
                  inventory_2
                </span>
                <h3 className="text-base font-bold text-gray-800">
                  ยังไม่มีสินค้าที่เปิดประมูลในรอบนี้
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  กรุณากลับมาตรวจสอบอีกครั้งเมื่อผู้ขายลงสินค้าหรือตรวจสอบรอบประมูลอื่น
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {openItems.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-base font-bold text-gray-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-lg">
                        gavel
                      </span>
                      กำลังประมูล ({openItems.length})
                    </h2>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {openItems.map((a) => (
                        <ItemCard key={a.id} a={a} />
                      ))}
                    </div>
                  </div>
                )}

                {scheduledItems.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-base font-bold text-gray-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sky-600 text-lg">
                        schedule
                      </span>
                      เร็วๆ นี้ ({scheduledItems.length})
                    </h2>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {scheduledItems.map((a) => (
                        <ItemCard key={a.id} a={a} />
                      ))}
                    </div>
                  </div>
                )}

                {cancelledItems.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-base font-bold text-rose-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-rose-600 text-lg">
                        cancel
                      </span>
                      รายการที่ถูกยกเลิก ({cancelledItems.length})
                    </h2>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {cancelledItems.map((a) => (
                        <ItemCard key={a.id} a={a} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </section>
      <Footer />
    </main>
  );
}
