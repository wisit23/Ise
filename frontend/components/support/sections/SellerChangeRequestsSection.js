"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

const STATUS_STYLE = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-600",
};

// ─── Admin Section: Shop Change Requests ──────────────────────────────────────
export default function SellerChangeRequestsSection({ token }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteById, setNoteById] = useState({});
  const [decidingId, setDecidingId] = useState(null);

  function loadQueue() {
    setLoading(true);
    apiFetch("/api/auth/admin/shop/change-requests", { token })
      .then((data) => setRequests(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function decide(req, decision) {
    setError("");
    setDecidingId(req.id);
    try {
      await apiFetch(`/api/auth/admin/shop/change-requests/${req.id}/decide`, {
        method: "PATCH",
        token,
        body: { decision, adminNote: noteById[req.id] || "" },
      });
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDecidingId(null);
    }
  }

  if (loading) {
    return <p className="py-10 text-slate-400">กำลังโหลด...</p>;
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">คำขอแก้ไขข้อมูลร้านค้า</h1>
        <p className="mt-1 text-sm text-slate-500">
          รอตรวจสอบ {requests.length} รายการ — อนุมัติแล้วข้อมูลจะอัปเดตทันที
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <span className="material-symbols-outlined text-[15px]">error</span>
          {error}
        </p>
      )}

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200/60 bg-white p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-300">
            check_circle
          </span>
          <p className="mt-2 text-sm text-slate-400">ไม่มีคำขอที่รอตรวจสอบ</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {requests.map((req) => (
            <li
              key={req.id}
              className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm"
            >
              {/* Seller info */}
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="font-semibold text-slate-900">
                    {req.seller?.firstName} {req.seller?.lastName}
                  </p>
                  <p className="text-xs text-slate-500">{req.seller?.email}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    ส่งเมื่อ:{" "}
                    {new Date(req.createdAt).toLocaleString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  รอตรวจสอบ
                </span>
              </div>

              {/* Comparison: current → requested */}
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Current values */}
                <div className="rounded-lg bg-slate-50 p-4 text-sm">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    ข้อมูลปัจจุบัน
                  </p>
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ชื่อร้าน</dt>
                      <dd className="font-medium text-slate-700">
                        {req.seller?.sellerProfile?.shopName || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ที่อยู่</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-700">
                        {req.seller?.sellerProfile?.address || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">บัญชีธนาคาร</dt>
                      <dd className="font-mono font-medium text-slate-700">
                        {req.seller?.sellerProfile?.bankAccount || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Requested new values */}
                <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/40 p-4 text-sm">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    ขอเปลี่ยนเป็น
                  </p>
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ชื่อร้าน</dt>
                      <dd className={`font-medium ${req.shopName ? "text-emerald-700" : "text-slate-300"}`}>
                        {req.shopName || "ไม่เปลี่ยน"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ที่อยู่</dt>
                      <dd className={`max-w-[55%] text-right font-medium whitespace-pre-line ${req.address ? "text-emerald-700" : "text-slate-300"}`}>
                        {req.address || "ไม่เปลี่ยน"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">บัญชีธนาคาร</dt>
                      <dd className={`font-mono font-medium ${req.bankAccount ? "text-emerald-700" : "text-slate-300"}`}>
                        {req.bankAccount || "ไม่เปลี่ยน"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Seller's comment */}
              <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">เหตุผลจากผู้ขาย: </span>
                {req.comment}
              </div>

              {/* Admin decision */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  placeholder="หมายเหตุถึงผู้ขาย (optional)"
                  value={noteById[req.id] || ""}
                  onChange={(e) =>
                    setNoteById((prev) => ({ ...prev, [req.id]: e.target.value }))
                  }
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <button
                  disabled={decidingId === req.id}
                  onClick={() => decide(req, "APPROVED")}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  อนุมัติ
                </button>
                <button
                  disabled={decidingId === req.id}
                  onClick={() => decide(req, "REJECTED")}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
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
