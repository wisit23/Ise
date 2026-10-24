"use client";
import ReferenceCode from "../../../components/ui/ReferenceCode";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import MediaGallery from "../../../components/MediaGallery";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { apiFetch, apiUrl } from "../../../lib/api";
import {
  getAccessToken,
  getAccessTokenClaims,
  getStoredUser,
  getCurrentRoles,
  isCustomerAccountRoles,
} from "../../../lib/auth";

const MAX_BID_AMOUNT = 1_000_000;
const BID_CONFIRMATION_INCREASE = 10_000;
const BID_COOLDOWN_SECONDS = 2;

const STATUS_LABEL = {
  pending_approval: "รออนุมัติ",
  rejected: "ถูกปฏิเสธ",
  approved: "รอกำหนดเวลา",
  scheduled: "เร็วๆ นี้",
  open: "กำลังประมูล",
  closed: "ปิดประมูลแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

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

export default function AuctionDetailPage() {
  const { id } = useParams();
  const [auction, setAuction] = useState(undefined);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [bidding, setBidding] = useState(false);
  const [bidCooldown, setBidCooldown] = useState(0);
  const [pendingBid, setPendingBid] = useState(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [viewer, setViewer] = useState({
    ready: false,
    isAuthenticated: false,
    userId: null,
    roles: [],
  });

  useEffect(() => {
    const token = getAccessToken();
    const user = getStoredUser();
    const claims = getAccessTokenClaims();
    setViewer({
      ready: true,
      isAuthenticated: Boolean(token),
      userId: claims?.sub || user?.id || null,
      roles: getCurrentRoles(),
    });
  }, []);

  const load = useCallback(() => {
    apiFetch(`/api/products/auctions/${id}`)
      .then(setAuction)
      .catch((err) =>
        setError(
          err.message ||
            "เกิดข้อผิดพลาดในการโหลดข้อมูลการประมูล กรุณาลองใหม่อีกครั้ง",
        ),
      );
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (bidCooldown <= 0) return undefined;
    const timer = setTimeout(
      () => setBidCooldown((remaining) => Math.max(0, remaining - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [bidCooldown]);

  // TC_AUC15: only the auction detail page holds a real-time connection.
  // The event contains no bid data; it tells the page to reload the committed
  // auction snapshot, keeping the API as the single source of truth.
  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    const source = new EventSource(
      apiUrl(`/api/products/auctions/${id}/events`),
    );
    source.onopen = () => setRealtimeConnected(true);
    source.addEventListener("auction-update", load);
    source.onerror = () => setRealtimeConnected(false);
    return () => {
      source.removeEventListener("auction-update", load);
      source.close();
    };
  }, [id, load]);

  // Keep the accepted 4-second polling behavior only as a fallback when SSE
  // is unavailable or temporarily disconnected.
  useEffect(() => {
    if (
      realtimeConnected ||
      !auction ||
      ["closed", "cancelled", "rejected"].includes(auction.status)
    ) {
      return;
    }
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [auction, load, realtimeConnected]);

  // Auto-fill price input with the minimum valid next bid, while allowing buyer to edit.
  useEffect(() => {
    if (auction && auction.status === "open") {
      const bids = auction.bids || [];
      const highest = bids[0];
      const min = highest
        ? highest.amount + auction.bidIncrement
        : auction.startingPrice;

      setAmount((prev) => {
        if (!prev || Number(prev) < min) {
          return String(min);
        }
        return prev;
      });
    }
  }, [auction]);

  async function submitBid(value) {
    if (bidding || bidCooldown > 0) return;
    setBidding(true);
    try {
      await apiFetch(`/api/products/auctions/${id}/bids`, {
        method: "POST",
        body: {
          amount: value,
          idempotencyKey:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
        },
      });
      setBidCooldown(BID_COOLDOWN_SECONDS);
      setAmount("");
      load();
    } catch (err) {
      setError(
        err.message || "เกิดข้อผิดพลาดในการเสนอราคา กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setBidding(false);
    }
  }

  function handleBid(e) {
    e.preventDefault();
    setError("");
    if (!getAccessToken()) {
      window.location.href = "/login";
      return;
    }
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError("จำนวนเงินเสนอราคาต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
      return;
    }
    if (value > MAX_BID_AMOUNT) {
      setError(
        `ราคาเสนอประมูลต่อครั้งต้องไม่เกิน ${MAX_BID_AMOUNT.toLocaleString("th-TH")} บาท`,
      );
      return;
    }

    const currentPrice = auction.bids?.[0]?.amount ?? auction.startingPrice;
    const increase = value - currentPrice;
    if (increase >= BID_CONFIRMATION_INCREASE) {
      setPendingBid({ amount: value, currentPrice, increase });
      return;
    }

    submitBid(value);
  }

  function handleConfirmBid() {
    const value = pendingBid?.amount;
    setPendingBid(null);
    if (value !== undefined) submitBid(value);
  }

  if (auction === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-4xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (!auction) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-4xl px-4 py-10 text-red-600">
          {error || "ไม่พบข้อมูลรายการประมูลที่ระบุ"}
        </p>
      </main>
    );
  }

  const bids = auction.bids || [];
  const highest = bids[0];
  const winningBid = auction.winningBidId
    ? bids.find((b) => b.id === auction.winningBidId) || null
    : null;
  const minNext = highest
    ? highest.amount + auction.bidIncrement
    : auction.startingPrice;
  const isCancelled =
    auction.status === "cancelled" || Boolean(auction.round?.cancelledAt);
  const isOpen = auction.status === "open" && !isCancelled;
  const isOwnAuction = viewer.userId === auction.sellerId;
  const isWinner = Boolean(
    viewer.userId && winningBid && viewer.userId === winningBid.bidderId,
  );

  const productMedia = [
    ...(auction.product?.photos || []).map((p) => ({ ...p, type: "image" })),
    ...(auction.product?.videos || []).map((v) => ({ ...v, type: "video" })),
  ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const canBid =
    viewer.ready &&
    (!viewer.isAuthenticated || isCustomerAccountRoles(viewer.roles));

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Navigation Breadcrumb / Round Link */}
        <div className="mb-4 flex items-center justify-between">
          {auction.roundId || auction.round ? (
            <Link
              href={`/auctions/rounds/${auction.roundId || auction.round?.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              <span>← กลับไปดูสินค้าทั้งหมดในรอบนี้</span>
              {auction.round?.title && (
                <span className="text-gray-500 font-normal">
                  ({auction.round.title})
                </span>
              )}
            </Link>
          ) : (
            <Link
              href="/auctions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              ← กลับหน้ารวมรอบประมูล
            </Link>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-4 sm:p-6 bg-white border-b border-gray-100 max-w-md mx-auto">
            <MediaGallery
              media={productMedia}
              alt={auction.product?.title || "ภาพสินค้าประมูล"}
            />
          </div>

          <div className="p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/products/${auction.productId}`}
                  className="text-lg font-bold text-gray-900 hover:text-emerald-600"
                >
                  {auction.product?.title || auction.productId}
                </Link>
                {auction.referenceCode && <ReferenceCode value={auction} className="mt-2 text-xs text-gray-500" />}
                {auction.round?.title && (
                  <p className="text-xs text-emerald-800 font-medium mt-0.5">
                    รอบประมูล: {auction.round.title}
                  </p>
                )}
                <p className="text-sm text-gray-500">
                  เปิด {fmt(auction.scheduledStartAt)} · ปิด{" "}
                  {fmt(auction.scheduledEndAt)}
                </p>
                {auction.status === "open" && (
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200/60">
                    <span>
                      ⏱️ หากมีผู้เสนอราคาใน 5 นาทีสุดท้าย ระบบจะต่อเวลาออกไปอีก
                      5 นาทีอัตโนมัติ
                    </span>
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  isCancelled
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {isCancelled
                  ? "ยกเลิกแล้ว"
                  : STATUS_LABEL[auction.status] || auction.status}
              </span>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">
                {!highest
                  ? "ราคาเริ่มต้น"
                  : auction.status === "closed"
                    ? "ราคาสูงสุดที่เคยมี"
                    : "ราคาสูงสุดตอนนี้"}
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {baht(highest ? highest.amount : auction.startingPrice)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                บิดถัดไปต้อง ≥ {baht(minNext)} · มีผู้เสนอราคาแล้ว {bids.length}{" "}
                ครั้ง
              </p>
            </div>

            {isCancelled && (
              <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-base">
                  <span>🛑 การประมูลนี้ถูกยกเลิกแล้ว</span>
                </div>
                {(auction.cancellationReason ||
                  auction.round?.cancellationReason) && (
                  <p className="mt-1 text-xs text-rose-800">
                    เหตุผลในการยกเลิก:{" "}
                    {auction.cancellationReason ||
                      auction.round?.cancellationReason}
                  </p>
                )}
              </div>
            )}

            {auction.status === "closed" && (
              <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
                {auction.winningBidId ? (
                  isWinner ? (
                    <div>
                      <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
                        <span>
                          🎉 ยินดีด้วย! คุณเป็นผู้ชนะการประมูลสินค้านี้
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-emerald-800">
                        รายการสินค้านี้ถูกสร้างเป็นคำสั่งซื้อและส่งไปยังตะกร้าของคุณเรียบร้อยแล้ว
                        ที่ราคา {baht(winningBid.amount)}
                      </p>
                      <Link
                        href="/cart"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          shopping_cart_checkout
                        </span>
                        💳 ไปชำระเงินที่ตะกร้าสินค้า
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-emerald-800">
                      🏆 การประมูลปิดแล้ว (มีผู้ชนะการประมูลที่ราคา{" "}
                      {baht(winningBid?.amount)})
                    </p>
                  )
                ) : (
                  <p className="text-sm font-medium text-gray-600">
                    การประมูลปิดแล้วโดยไม่มีผู้เสนอราคา
                  </p>
                )}
              </div>
            )}

            {isOwnAuction ? (
              <p className="text-sm text-gray-500">
                นี่คือสินค้าของคุณเอง ไม่สามารถประมูลสินค้าของตัวเองได้
              </p>
            ) : !canBid ? (
              <p className="text-sm text-gray-500">
                บัญชีพนักงานสามารถดูรายละเอียดได้ แต่ไม่สามารถเสนอราคาได้
              </p>
            ) : isOpen ? (
              <form
                onSubmit={handleBid}
                noValidate
                className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3"
              >
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      เสนอราคา (บาท)
                    </label>
                    <span className="text-xs text-emerald-700 font-medium">
                      ขั้นต่ำถัดไป: {baht(minNext)}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={minNext}
                    max={MAX_BID_AMOUNT}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`อย่างน้อย ${minNext}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    * ใส่ราคาขั้นต่ำให้อัตโนมัติ
                    สามารถพิมพ์เปลี่ยนเป็นจำนวนเงินที่ต้องการได้
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={bidding || bidCooldown > 0}
                  className="sm:mt-6 rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 shadow-sm text-center"
                >
                  {bidding
                    ? "กำลังส่ง..."
                    : bidCooldown > 0
                      ? `รอ ${bidCooldown} วินาที`
                    : Number.isInteger(Number(amount)) && Number(amount) > 0
                      ? `เสนอราคา ${baht(Number(amount))}`
                      : "เสนอราคา"}
                </button>
              </form>
            ) : (
              <p className="text-sm text-gray-500">
                ยังไม่สามารถเสนอราคาได้ในสถานะนี้
              </p>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {/* ประวัติการเสนอราคา (Bid History) */}
            <div className="mt-6 border-t border-gray-200 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                  <span className="material-symbols-outlined text-base text-gray-500">
                    history
                  </span>
                  ประวัติการเสนอราคา ({bids.length} ครั้ง)
                </h3>
                {isOwnAuction && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    สินค้าของคุณ
                  </span>
                )}
              </div>

              {bids.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-xs text-gray-500">
                  ยังไม่มีผู้เสนอราคาในขณะนี้ เป็นคนแรกที่เริ่มเสนอราคา!
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xs">
                  <table className="min-w-full divide-y divide-gray-100 text-xs">
                    <thead className="sticky top-0 bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">ผู้เสนอราคา</th>
                        <th className="px-3 py-2 text-right font-semibold">จำนวนเงิน</th>
                        <th className="px-3 py-2 text-right font-semibold">เวลา</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bids.map((b, idx) => {
                        const isHighest = idx === 0;
                        const isWinningRow =
                          auction.status === "closed" &&
                          winningBid &&
                          b.id === winningBid.id;
                        const isForfeitedHighest =
                          auction.status === "closed" &&
                          isHighest &&
                          !isWinningRow;
                        return (
                          <tr
                            key={b.id || idx}
                            className={
                              isWinningRow || (isHighest && auction.status !== "closed")
                                ? "bg-emerald-50/60 font-semibold"
                                : "hover:bg-gray-50"
                            }
                          >
                            <td className="px-3 py-2 text-gray-800">
                              <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-xs text-gray-400">
                                  person
                                </span>
                                <span>
                                  {b.bidderName ||
                                    (b.bidderId
                                      ? `ผู้ใช้ ${b.bidderId.slice(-6)}`
                                      : "ผู้ใช้นิรนาม")}
                                </span>
                                {isWinningRow && (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                    🏆 ผู้ชนะ
                                  </span>
                                )}
                                {isForfeitedHighest && (
                                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                    เสียสิทธิ์
                                  </span>
                                )}
                                {isHighest && auction.status !== "closed" && (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                    สูงสุด
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">
                              {baht(b.amount)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500 text-[11px]">
                              {fmt(b.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(pendingBid)}
        title="ยืนยันยอดเสนอราคา"
        description={
          pendingBid
            ? `ราคาปัจจุบัน ${baht(pendingBid.currentPrice)} คุณกำลังเสนอ ${baht(pendingBid.amount)} ซึ่งเพิ่มขึ้น ${baht(pendingBid.increase)}`
            : ""
        }
        confirmLabel={
          pendingBid ? `ยืนยันเสนอราคา ${baht(pendingBid.amount)}` : "ยืนยัน"
        }
        tone="primary"
        note="โปรดตรวจสอบยอดเสนอราคาให้ถูกต้องก่อนยืนยัน"
        busy={bidding}
        onConfirm={handleConfirmBid}
        onCancel={() => setPendingBid(null)}
      />
      <Footer />
    </main>
  );
}
