"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch, mediaUrl } from "../../../lib/api";
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

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {auction.product?.photos?.[0]?.url && (
            <img
              src={mediaUrl(auction.product.photos[0].url)}
              alt={auction.product.title}
              className="max-h-96 w-full object-contain bg-gray-50"
            />
          )}

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
              <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {auction.winningBidId
                  ? "ประมูลปิดแล้ว มีผู้ชนะการประมูลนี้"
                  : "ประมูลปิดแล้วโดยไม่มีผู้เสนอราคา"}
              </p>
            )}

            {isOwnAuction ? (
              <p className="text-sm text-gray-500">
                นี่คือสินค้าของคุณเอง ไม่สามารถประมูลสินค้าของตัวเองได้
              </p>
            ) : isOpen ? (
              <form onSubmit={handleBid} className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-gray-700">
                    เสนอราคา (บาท)
                  </label>
                  <input
                    type="number"
                    min={minNext}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`อย่างน้อย ${minNext}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={bidding}
                  className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
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
