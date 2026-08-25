"use client";

import { useState } from "react";
import ExecutiveShell from "../../../components/executive/ExecutiveShell";

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

// Placeholder data source: the UI shell (filters, stat tiles, list, empty
// state) is built and wired to `GET /api/auth/executive/reports` already,
// but that endpoint is disconnected here on purpose — the reports table it
// reads has no real user-submitted complaints yet, only seed fixtures, so
// showing them would look like real activity. Swap this constant for the
// fetch (see the previous version in git history) once real complaints
// exist.
const EMPTY_DATA = { items: [], statusCounts: {}, totalOpen: 0, topReported: [] };

function ComplaintsContent() {
  const [status, setStatus] = useState("");
  const data = EMPTY_DATA;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || "open"}
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              status === f.value
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">เรื่องที่ยังเปิดอยู่</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {data.totalOpen.toLocaleString("th-TH")}
          </p>
        </div>
        {["OPEN", "REVIEWED", "ACTIONED"].map((key) => (
          <div
            key={key}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs text-gray-500">{STATUS_LABEL[key]}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {(data.statusCounts[key] || 0).toLocaleString("th-TH")}
            </p>
          </div>
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

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">
          รายการข้อร้องเรียน
        </h2>

        <p className="px-5 py-8 text-sm text-gray-400">
          ไม่มีข้อร้องเรียนในหมวดนี้
        </p>
      </div>

      
    </>
  );
}

export default function ExecutiveComplaintsPage() {
  return (
    <ExecutiveShell
      title="ข้อร้องเรียนและธุรกรรมผิดปกติ"
      activeTab="/executive/complaints"
    >
      <ComplaintsContent />
    </ExecutiveShell>
  );
}
