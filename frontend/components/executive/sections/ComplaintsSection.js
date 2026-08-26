"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import KpiCard from "../../panel/ui/KpiCard";

const STATUS_LABEL = {
  OPEN: "ยังไม่ตรวจสอบ",
  REVIEWED: "กำลังตรวจสอบ",
  ACTIONED: "ดำเนินการแล้ว",
  DISMISSED: "ยกคำร้อง",
};

const FILTERS = [
  { value: "", label: "ที่ยังเปิดอยู่" },
  { value: "OPEN", label: "ยังไม่ตรวจสอบ" },
  { value: "REVIEWED", label: "กำลังตรวจสอบ" },
  { value: "ACTIONED", label: "ดำเนินการแล้ว" },
  { value: "DISMISSED", label: "ยกคำร้อง" },
];

// ─── Complaints Section ─────────────────────────────────────────────────
// Reads the same `reports` table Admin's inbox works off of — every
// user-submitted complaint/report is the "something looks wrong here"
// signal available today (no separate anomaly-detection store yet).

export default function ComplaintsSection({ token }) {
  const [status, setStatus] = useState("");
  const [data, setData] = useState({
    items: [],
    statusCounts: {},
    totalOpen: 0,
    topReported: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: 50 });
    if (status) params.set("status", status);
    apiFetch(`/api/auth/executive/reports?${params}`, { token })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, token]);

  return (
    <div className="animate-fade-in-up">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || "open"}
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f.value
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="เรื่องที่ยังเปิดอยู่"
          value={data.totalOpen}
          icon="report"
          color="red"
        />
        {["OPEN", "REVIEWED", "ACTIONED"].map((key) => (
          <KpiCard
            key={key}
            label={STATUS_LABEL[key]}
            value={data.statusCounts[key] || 0}
            icon={
              key === "OPEN"
                ? "mark_email_unread"
                : key === "REVIEWED"
                  ? "visibility"
                  : "task_alt"
            }
            color={
              key === "OPEN" ? "amber" : key === "REVIEWED" ? "sky" : "emerald"
            }
          />
        ))}
      </div>

      {data.topReported.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            ผู้ถูกร้องเรียนซ้ำ
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {data.topReported.map((row) => (
              <li key={row.targetId} className="text-sm text-amber-800">
                <span className="font-mono text-xs">{row.targetId}</span> —
                ถูกร้องเรียน {row.count.toLocaleString("th-TH")} ครั้ง
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
          รายการข้อร้องเรียน
        </h2>

        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-400">กำลังโหลด...</p>
        ) : data.items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400">
            ไม่มีข้อร้องเรียนในหมวดนี้
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {r.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      โดย {r.reporterName || "ไม่ทราบชื่อ"} ·{" "}
                      {new Date(r.reportedAt).toLocaleDateString("th-TH")}
                      {r.targetId && (
                        <>
                          {" "}
                          · เป้าหมาย{" "}
                          <span className="font-mono">
                            {r.targetId.slice(0, 8)}
                          </span>
                        </>
                      )}
                      {r.productId && (
                        <>
                          {" "}
                          · สินค้า{" "}
                          <span className="font-mono">
                            {r.productId.slice(0, 8)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
