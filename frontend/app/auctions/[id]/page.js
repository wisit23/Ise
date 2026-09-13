"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import MediaGallery from "../../../components/MediaGallery";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

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
  return dt ? new Date(dt).toLocaleString("th-TH") : "—";
}

export default function AuctionDetailPage() {
  const { id } = useParams();
  const [auction, setAuction] = useState(undefined);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [bidding, setBidding] = useState(false);
  const user = typeof window !== "undefined" ? getStoredUser() : null;

  const load = useCallback(() => {
    apiFetch(`/api/products/auctions/${id}`)
      .then(setAuction)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  // Poll while the auction can still change (bids coming in, or a
  // scheduled/open transition due) so the page doesn't go stale mid-bid war.
  useEffect(() => {
    if (
      !auction ||
      ["closed", "cancelled", "rejected"].includes(auction.status)
    ) {
      return;
    }
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [auction, load]);

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

  async function handleBid(e) {
    e.preventDefault();
    setError("");
    if (!getAccessToken()) {
      window.location.href = "/login";
      return;
    }
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError("กรุณาระบุจำนวนเงินให้ถูกต้อง");
      return;
    }
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
      setAmount("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBidding(false);
    }
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
        <p className="mx-auto max-w-4xl px-4 py-10 text-red-600">{error}</p>
      </main>
    );
  }

  const bids = auction.bids || [];
  const highest = bids[0];
  const minNext = highest
    ? highest.amount + auction.bidIncrement
    : auction.startingPrice;
  const isOpen = auction.status === "open";
  const isOwnAuction = user && user.id === auction.sellerId;
  const isWinner = Boolean(user && highest && user.id === highest.bidderId);

  const productMedia = [
    ...(auction.product?.photos || []).map((p) => ({ ...p, type: "image" })),
    ...(auction.product?.videos || []).map((v) => ({ ...v, type: "video" })),
  ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
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
                <p className="text-sm text-gray-500">
                  เปิด {fmt(auction.scheduledStartAt)} · ปิด{" "}
                  {fmt(auction.scheduledEndAt)}
                </p>
                {auction.status === "open" && (
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200/60">
                    <span>⏱️ หากมีผู้เสนอราคาใน 5 นาทีสุดท้าย ระบบจะต่อเวลาออกไปอีก 5 นาทีอัตโนมัติ</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                {STATUS_LABEL[auction.status] || auction.status}
              </span>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">
                {highest ? "ราคาสูงสุดตอนนี้" : "ราคาเริ่มต้น"}
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {baht(highest ? highest.amount : auction.startingPrice)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                บิดถัดไปต้อง ≥ {baht(minNext)} · มีผู้เสนอราคาแล้ว {bids.length}{" "}
                ครั้ง
              </p>
            </div>

            {auction.status === "closed" && (
              <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
                {auction.winningBidId ? (
                  isWinner ? (
                    <div>
                      <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
                        <span>🎉 ยินดีด้วย! คุณเป็นผู้ชนะการประมูลสินค้านี้</span>
                      </div>
                      <p className="mt-1 text-sm text-emerald-800">
                        รายการสินค้านี้ถูกสร้างเป็นคำสั่งซื้อและส่งไปยังตะกร้าของคุณเรียบร้อยแล้ว ที่ราคา {baht(highest.amount)}
                      </p>
                      <Link
                        href="/cart"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                      >
                        <span className="material-symbols-outlined text-[18px]">shopping_cart_checkout</span>
                        💳 ไปชำระเงินที่ตะกร้าสินค้า
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-emerald-800">
                      🏆 การประมูลปิดแล้ว (มีผู้ชนะการประมูลที่ราคา {baht(highest?.amount)})
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
            ) : isOpen ? (
              <form onSubmit={handleBid} className="flex items-start gap-3">
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
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`อย่างน้อย ${minNext}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    * ใส่ราคาขั้นต่ำให้อัตโนมัติ สามารถพิมพ์เปลี่ยนเป็นจำนวนเงินที่ต้องการได้
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={bidding}
                  className="mt-6 rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
                >
                  {bidding ? "กำลังส่ง..." : "เสนอราคา"}
                </button>
              </form>
            ) : (
              <p className="text-sm text-gray-500">
                ยังไม่สามารถเสนอราคาได้ในสถานะนี้
              </p>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
