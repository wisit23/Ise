"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import Badge from "../../panel/ui/Badge";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

// ─── Auction Approvals Section (Admin only) ────────────────────────────────
// Sellers submit auctions -> status "pending_approval" -> only an ADMIN can
// approve/reject (auctionService.approve/reject, both already enforced
// server-side) — this was previously unreachable from any UI, so submitted
// auctions sat stuck in pending_approval forever.

export default function AuctionApprovalsSection({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    apiFetch("/api/products/auctions?status=pending_approval&limit=50", {
      token,
    })
      .then((data) => setItems(data.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, refreshKey]);

  async function handleDecision(id, action) {
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/api/products/auctions/${id}/${action}`, {
        method: "PATCH",
        token,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-fade-in-up flex flex-col min-h-full">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">
          คำขอเปิดประมูลที่รอการอนุมัติ
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          ผู้ขายส่งคำขอเปิดประมูลสินค้า —
          ต้องได้รับการอนุมัติจากแอดมินก่อนฝ่ายการตลาดจะตั้งเวลาเปิดประมูลได้
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-500 mb-2">
            gavel
          </span>
          <p className="text-sm font-semibold text-slate-600">
            ไม่มีคำขอรออนุมัติในขณะนี้
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {a.product?.title || a.productId}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ราคาเริ่มต้น {baht(a.startingPrice)} · เพิ่มขั้นต่ำครั้งละ{" "}
                    {baht(a.bidIncrement)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    รหัส {a.id.slice(0, 8)} · ผู้ขาย {a.sellerId?.slice(0, 8)}
                  </p>
                </div>
                <Badge text="รออนุมัติ" style="bg-amber-50 text-amber-700" />
              </div>
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => handleDecision(a.id, "approve")}
                  disabled={busyId === a.id}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  อนุมัติ
                </button>
                <button
                  onClick={() => handleDecision(a.id, "reject")}
                  disabled={busyId === a.id}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  ปฏิเสธ
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
