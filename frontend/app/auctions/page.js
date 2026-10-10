"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { apiFetch } from "../../lib/api";

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

export default function AuctionsBrowsePage() {
  const [data, setData] = useState({
    activeAuctionRounds: [],
    upcomingRounds: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch("/api/products/auctions/rounds/browse")
      .then((res) => {
        setData({
          activeAuctionRounds: Array.isArray(res?.activeAuctionRounds)
            ? res.activeAuctionRounds
            : [],
          upcomingRounds: Array.isArray(res?.upcomingRounds)
            ? res.upcomingRounds
            : [],
        });
      })
      .catch((err) =>
        setError(
          err.message ||
            "เกิดข้อผิดพลาดในการโหลดรอบการประมูล กรุณาลองใหม่อีกครั้ง",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nowMs = Date.now();
  const isVisibleRound = (r) => {
    const isCancelled = Boolean(r?.cancelledAt || r?.phase === "cancelled");
    if (isCancelled && r?.auctionEndsAt) {
      return new Date(r.auctionEndsAt).getTime() > nowMs;
    }
    return true;
  };
  const activeRounds = data.activeAuctionRounds.filter(isVisibleRound);
  const upcomingRounds = data.upcomingRounds.filter(isVisibleRound);
  const hasNoRounds = activeRounds.length === 0 && upcomingRounds.length === 0;

  function RoundCard({ round, isActive }) {
    const categories = Array.isArray(round.categories) ? round.categories : [];
    const itemCount = round.visibleItemCount ?? round._count?.auctions ?? 0;
    const isCancelled = Boolean(
      round.cancelledAt || round.phase === "cancelled",
    );

    return (
      <div
        className={`flex flex-col justify-between overflow-hidden rounded-2xl border p-5 shadow-sm transition ${
          isCancelled
            ? "border-rose-200 bg-rose-50/20"
            : "border-gray-200 bg-white hover:shadow-md"
        }`}
      >
        <div>
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-base">{round.title}</h3>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isCancelled
                  ? "bg-rose-100 text-rose-800"
                  : isActive
                    ? "bg-emerald-100 text-emerald-800 animate-pulse"
                    : "bg-sky-100 text-sky-800"
              }`}
            >
              {isCancelled
                ? "ยกเลิกแล้ว"
                : isActive
                  ? "🟢 กำลังประมูล"
                  : "🗓️ เร็วๆ นี้"}
            </span>
          </div>

          <div className="mt-3 space-y-2 text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">ช่วงเวลาประมูล:</span>
              <span className="font-medium text-gray-800">
                {fmt(round.auctionStartsAt)} — {fmt(round.auctionEndsAt)}
              </span>
            </div>

            <div className="pt-2">
              <span className="block text-gray-500 mb-1">หมวดหมู่สินค้า:</span>
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <span
                      key={c}
                      className="inline-block rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  ทุกหมวดหมู่ (All Categories)
                </span>
              )}
            </div>

            <div className="pt-2 text-xs text-gray-500">
              จำนวนสินค้าในรอบนี้:{" "}
              <span className="font-bold text-gray-900">{itemCount}</span>{" "}
              รายการ
            </div>

            {isCancelled && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <span className="font-semibold">เหตุผลที่ยกเลิก:</span>{" "}
                {round.cancellationReason || "ฝ่ายการตลาดยกเลิกรอบการประมูล"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-gray-100">
          {isCancelled ? (
            <button
              type="button"
              disabled
              className="block w-full cursor-not-allowed rounded-lg bg-gray-200 py-2.5 text-center text-xs font-semibold text-gray-500"
            >
              รอบประมูลถูกยกเลิกแล้ว
            </button>
          ) : (
            <Link
              href={`/auctions/rounds/${round.id}`}
              className="block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
            >
              ดูสินค้าประมูลในรอบนี้
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              รอบการประมูลสินค้า (Auction Rounds)
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              เลือกรอบการประมูลที่ต้องการเพื่อดูสินค้าที่เปิดให้เคาะราคา
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 animate-pulse">
            กำลังโหลดข้อมูลรอบการประมูล...
          </div>
        ) : hasNoRounds ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
            <span className="material-symbols-outlined mx-auto text-5xl text-gray-400 mb-3">
              event_busy
            </span>
            <h2 className="text-lg font-bold text-gray-800">
              ขณะนี้ยังไม่มีรอบการประมูล
            </h2>
            <p className="mt-1.5 text-sm text-gray-500 max-w-md mx-auto">
              ยังไม่มีรอบประมูลที่กำลังเปิดหรือกำลังจะเริ่ม
              กรุณากลับมาตรวจสอบอีกครั้งในภายหลัง
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              ลองโหลดอีกครั้ง
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Auction Rounds */}
            {activeRounds.length > 0 && (
              <div>
                <h2 className="mb-4 text-base font-bold text-gray-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-lg">
                    gavel
                  </span>
                  รอบที่กำลังประมูล ({activeRounds.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {activeRounds.map((r) => (
                    <RoundCard key={r.id} round={r} isActive={true} />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Rounds */}
            {upcomingRounds.length > 0 && (
              <div>
                <h2 className="mb-4 text-base font-bold text-gray-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sky-600 text-lg">
                    schedule
                  </span>
                  รอบที่กำลังจะเปิดประมูลเร็วๆ นี้ ({upcomingRounds.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {upcomingRounds.map((r) => (
                    <RoundCard key={r.id} round={r} isActive={false} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
