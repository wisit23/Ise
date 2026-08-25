"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";

const STATUS_LABEL = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติจาก Admin",
  rejected: "ถูกปฏิเสธ",
  approved: "อนุมัติแล้ว รอกำหนดเวลา",
  scheduled: "ตั้งเวลาแล้ว รอเปิด",
  open: "กำลังประมูล",
  closed: "ปิดประมูลแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

const STATUS_STYLE = {
  draft: "bg-gray-100 text-gray-600",
  pending_approval: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  approved: "bg-sky-50 text-sky-700",
  scheduled: "bg-sky-50 text-sky-700",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-400",
};

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString("th-TH") : "—";
}

function BulkScheduleBar({ count, onApply, onClear }) {
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!startsAt || !endsAt) {
      setError("กรุณาระบุเวลาเปิดและปิดประมูล");
      return;
    }
    setSaving(true);
    try {
      await onApply({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      setStartsAt("");
      setEndsAt("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky top-0 z-10 mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
    >
      <p className="w-full text-sm font-medium text-emerald-800">
        เลือกไว้ {count} รายการ — ตั้งเวลาให้พร้อมกันทีเดียว
      </p>
      <div>
        <label className="block text-xs text-gray-600">เวลาเปิดประมูล</label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600">เวลาปิดประมูล</label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? "กำลังตั้งเวลา..." : `ตั้งเวลาให้ ${count} รายการที่เลือก`}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="text-sm text-gray-500 hover:underline"
      >
        ล้างการเลือก
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

export default function MarketingAuctionsPage() {
  const [auctions, setAuctions] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    const qs = statusFilter ? `&status=${statusFilter}` : "";
    apiFetch(`/api/products/auctions?limit=50${qs}`)
      .then((data) => setAuctions(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkSchedule({ startsAt, endsAt }) {
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/products/auctions/${id}/schedule`, {
          method: "PATCH",
          body: { startsAt, endsAt },
        }),
      ),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    load();
    if (failed > 0) {
      throw new Error(
        `ตั้งเวลาสำเร็จ ${ids.length - failed}/${ids.length} รายการ — ${failed} รายการล้มเหลว (สถานะอาจเปลี่ยนไปแล้ว)`,
      );
    }
  }

  async function handleCancel(id) {
    try {
      await apiFetch(`/api/products/auctions/${id}/cancel`, {
        method: "PATCH",
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const eligibleIds = new Set(
    auctions.filter((a) => a.status === "approved").map((a) => a.id),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          ควบคุมตารางประมูล
        </h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <BulkScheduleBar
          count={selected.size}
          onApply={handleBulkSchedule}
          onClear={() => setSelected(new Set())}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">กำลังโหลด...</p>
      ) : auctions.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีรายการประมูล</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {auctions.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              {eligibleIds.has(a.id) && (
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggleSelected(a.id)}
                  aria-label={`เลือก ${a.product?.title || a.productId}`}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
                />
              )}

              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${a.productId}`}
                      className="truncate font-medium text-gray-900 hover:text-emerald-600"
                    >
                      {a.product?.title || a.productId}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      ราคาเริ่มต้น {baht(a.startingPrice)} · เพิ่มขั้นต่ำครั้งละ{" "}
                      {baht(a.bidIncrement)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      เปิด {fmt(a.scheduledStartAt)} · ปิด{" "}
                      {fmt(a.scheduledEndAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      STATUS_STYLE[a.status] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                </div>

                {["approved", "scheduled"].includes(a.status) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <button
                      onClick={() => handleCancel(a.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      ยกเลิกการประมูลนี้
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
