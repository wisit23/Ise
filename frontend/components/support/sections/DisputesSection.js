/* eslint-disable no-unused-vars */
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Pagination from "../../Pagination";

import Badge from "../ui/Badge";
import KpiCard from "../ui/KpiCard";
import ChartCard from "../ui/ChartCard";
import DropdownFilter from "../ui/DropdownFilter";
import {
  TICKET_STATUS_LABEL, TICKET_STATUS_STYLE, PRIORITY_LABEL, PRIORITY_STYLE,
  AGENT_NEXT_STATUS, DISPUTE_STATUS_LABEL, DISPUTE_STATUS_STYLE, ORDER_STATUS_LABEL,
  HELP_CATEGORIES, DONUT_PRIORITY_COLORS, DONUT_DISPUTE_COLORS, PAGE_SIZE
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";


export default // ─── Disputes Section ─────────────────────────────────────────────────────────

function DisputesSection({ token, status, setStatus }) {
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ total: null, open: null, decided: null });

  // Slide-over states
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [closingDispute, setClosingDispute] = useState(false);
  const [showDisputeChat, setShowDisputeChat] = useState(false);
  const [closingChat, setClosingChat] = useState(false);
  const [disputeDetails, setDisputeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState(null);

  function closeDispute() {
    if (showDisputeChat) {
      setClosingChat(true);
      setTimeout(() => {
        setShowDisputeChat(false);
        setClosingChat(false);
        setClosingDispute(true);
        setTimeout(() => { setSelectedDispute(null); setClosingDispute(false); }, 280);
      }, 200);
    } else {
      setClosingDispute(true);
      setTimeout(() => { setSelectedDispute(null); setClosingDispute(false); }, 280);
    }
  }

  function openDisputeChat() {
    setShowDisputeChat(true);
    setClosingChat(false);
  }

  function closeDisputeChat() {
    setClosingChat(true);
    setTimeout(() => { setShowDisputeChat(false); setClosingChat(false); }, 250);
  }

  async function loadDisputeDetails(orderId) {
    setDetailsLoading(true);
    try {
      const data = await apiFetch(`/api/orders/disputes/by-order/${orderId}`, { token });
      setDisputeDetails(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleOpenDispute(d) {
    setSelectedDispute(d);
    setDisputeDetails(null);
    setDecisionReason("");
    setShowDisputeChat(false);
    setClosingChat(false);
    loadDisputeDetails(d.orderId);
  }

  async function handleViewEvidence(ev) {
    setOpeningEvidenceId(ev.id);
    try {
      const objectUrl = await fetchAuthedBlobUrl(
        `/api/orders/disputes/${disputeDetails.id}/evidence/${ev.id}`
      );
      window.open(objectUrl, "_blank", "noreferrer");
    } catch (err) {
      alert("Failed to load evidence: " + err.message);
    } finally {
      setOpeningEvidenceId(null);
    }
  }

  async function handleDecision(decision) {
    if (!decisionReason.trim()) return;
    setDeciding(true);
    try {
      await apiFetch(`/api/orders/disputes/${disputeDetails.id}/decision`, {
        method: "POST",
        token,
        body: { decision, reason: decisionReason },
      });
      // Refresh details and list
      loadDisputeDetails(selectedDispute.orderId);
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/orders/disputes/queue?${params}`, { token });
      setItems(data.items || []);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setDeciding(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    apiFetch(`/api/orders/disputes/queue?${params}`, { token })
      .then((data) => { setItems(data.items || []); setTotalPages(data.totalPages || 1); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, status, q, token]);

  useEffect(() => {
    const fc = (p) =>
      apiFetch(`/api/orders/disputes/queue?${p}&limit=1`, { token })
        .then((d) => d.total).catch(() => null);
    fc("").then((v) => setStats((s) => ({ ...s, total: v })));
    fc("status=OPEN").then((v) => setStats((s) => ({ ...s, open: v })));
    fc("status=DECIDED").then((v) => setStats((s) => ({ ...s, decided: v })));
  }, [token]);

  return (
    <>
      <div className="animate-fade-in-up flex flex-col min-h-full">
        {/* Mini stat row */}
        <div className="mb-5 grid grid-cols-3 gap-4">
        <KpiCard label="ทั้งหมด" value={stats.total} icon="folder" color="gray" />
        <KpiCard label="รอตรวจสอบ" value={stats.open} icon="inbox" color="amber" />
        <KpiCard label="ตัดสินแล้ว" value={stats.decided} icon="check_circle" color="emerald" />
      </div>

      {/* Search & Filter */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => { e.preventDefault(); setQ(qInput); setPage(1); }}
          className="relative flex-1"
        >
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
            search
          </span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search disputes..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium outline-none shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 hover:border-slate-300"
          />
        </form>
          <DropdownFilter
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "", label: "สถานะทั้งหมด" },
              { value: "OPEN", label: "รอตรวจสอบ" },
              { value: "NEEDS_INFO", label: "รอข้อมูล" },
              { value: "DECIDED", label: "ตัดสินแล้ว" },
            ]}
          />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)]">
        <table className="w-full min-w-[700px] border-collapse text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-transparent text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-4 text-left">Dispute ID</th>
              <th className="px-5 py-4 text-left">เหตุผล</th>
              <th className="px-5 py-4 text-left">Buyer → Seller</th>
              <th className="px-5 py-4">ยอดเงิน</th>
              <th className="px-5 py-4">สถานะ</th>
              <th className="px-5 py-4">วันที่เปิด</th>
              <th className="px-5 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-400">กำลังโหลด...</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-slate-400">ไม่มีข้อพิพาทในหมวดนี้</td>
              </tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="group hover:bg-slate-50/80 hover:shadow-sm transition-all duration-200">
                <td className="px-5 py-4 text-left">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center font-mono text-[13px] font-semibold tracking-tight text-slate-800">
                      #{d.id.slice(0, 12).toUpperCase()}
                      <button
                        onClick={() => navigator.clipboard.writeText(d.id)}
                        className="ml-1 text-slate-300 hover:text-emerald-600 transition-colors"
                        title="Copy"
                      >
                        <span className="material-symbols-outlined text-[13px] align-middle">content_copy</span>
                      </button>
                    </div>
                    <span className="font-mono text-xs text-slate-400">
                      Ord #{d.orderId.slice(0, 12).toUpperCase()}
                    </span>
                  </div>
                </td>
                <td className="max-w-[180px] truncate px-5 py-4 text-sm font-medium text-slate-700 text-left">
                  {d.reason}
                </td>
                <td className="px-5 py-4 text-left">
                  {d.order ? (
                    <div className="text-[13px] text-gray-500 flex flex-col gap-0.5">
                      <span className="flex items-center group/b">
                        {d.order.buyerId.slice(0, 12)} (B)
                        <button onClick={() => navigator.clipboard.writeText(d.order.buyerId)} className="ml-1 opacity-0 group-hover/b:opacity-100 text-slate-300 hover:text-emerald-600 transition-all" title="Copy Full ID">
                          <span className="material-symbols-outlined text-[13px] align-middle">content_copy</span>
                        </button>
                      </span>
                      <span className="flex items-center group/s">
                        {d.order.sellerId.slice(0, 12)} (S)
                        <button onClick={() => navigator.clipboard.writeText(d.order.sellerId)} className="ml-1 opacity-0 group-hover/s:opacity-100 text-slate-300 hover:text-emerald-600 transition-all" title="Copy Full ID">
                          <span className="material-symbols-outlined text-[13px] align-middle">content_copy</span>
                        </button>
                      </span>
                    </div>
                  ) : "—"}
                </td>
                <td className="px-5 py-4 font-medium text-slate-700">
                  {d.order?.price ? `฿${d.order.price.toLocaleString("th-TH")}` : "—"}
                </td>
                <td className="px-5 py-4">
                  <Badge
                    text={DISPUTE_STATUS_LABEL[d.status] || d.status}
                    style={DISPUTE_STATUS_STYLE[d.status] || "bg-slate-100 text-slate-600"}
                  />
                </td>
                <td className="px-5 py-4 text-xs font-medium text-slate-400">
                  {new Date(d.createdAt).toLocaleDateString("th-TH")}
                </td>
                <td className="px-5 py-4 text-center">
                  <button
                    onClick={() => handleOpenDispute(d)}
                    className={`rounded-lg px-4 py-1.5 text-[11px] font-bold tracking-wide uppercase transition-all shadow-sm hover:shadow ${
                      d.status === "DECIDED"
                        ? "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 hover:-translate-y-0.5"
                    }`}
                  >
                    {d.status === "DECIDED" ? "ดูรายละเอียด" : "ตรวจสอบ"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {selectedDispute && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeDispute()}
          className={`fixed inset-0 z-[100] flex justify-end bg-slate-900/50 backdrop-blur-sm ${
            closingDispute ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          {/* Chat sub-panel - slides in from left of dispute panel */}
          {(showDisputeChat || closingChat) && (
            <div className={`flex w-full max-w-sm flex-col border-r border-slate-200 bg-white shadow-xl ${
              closingChat ? "animate-slide-out-left" : "animate-slide-in-left"
            }`}>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">แชทกับผู้ซื้อ</h3>
                  <p className="text-xs text-indigo-500 font-medium">Coming Soon</p>
                </div>
                <button
                  onClick={closeDisputeChat}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
                </button>
              </div>
              {/* Buyer info */}
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-xs font-bold">
                    {selectedDispute.order?.buyerId?.slice(0,1)?.toUpperCase() ?? "B"}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">ผู้ซื้อ</p>
                    <p className="font-mono text-[10px] text-slate-400">{(selectedDispute.order?.buyerId ?? "").slice(0, 16)}</p>
                  </div>
                </div>
              </div>
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50/40 flex flex-col gap-3">
                <div className="flex justify-center">
                  <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Today</span>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-[10px] font-bold">
                    {selectedDispute.order?.buyerId?.slice(0,1)?.toUpperCase() ?? "B"}
                  </div>
                  <div className="max-w-[80%]">
                    <p className="text-[10px] text-slate-400 mb-1 ml-1">ผู้ซื้อ</p>
                    <div className="rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 shadow-sm">
                      {selectedDispute.reason}
                    </div>
                  </div>
                </div>
                <div className="flex items-end gap-2 flex-row-reverse">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">
                    <span className="material-symbols-outlined text-[14px]">support_agent</span>
                  </div>
                  <div className="max-w-[80%]">
                    <p className="text-[10px] text-slate-400 mb-1 mr-1 text-right">เจ้าหน้าที่</p>
                    <div className="rounded-2xl rounded-br-sm bg-emerald-600 px-3 py-2 text-xs text-white shadow-sm">
                      รับทราบครับ เรากำลังพิจารณาเคสของคุณ
                    </div>
                  </div>
                </div>
                {/* Coming soon note */}
                <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-center">
                  <p className="text-xs font-bold text-indigo-600">ระบบแชทเต็มรูปแบบ — Coming Soon</p>
                  <p className="text-[11px] text-indigo-400 mt-0.5">ฟีเจอร์นี้กำลังพัฒนาอยู่</p>
                </div>
              </div>
              {/* Input disabled */}
              <div className="border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 opacity-50 cursor-not-allowed">
                  <span className="material-symbols-outlined text-[18px] text-slate-400">attach_file</span>
                  <input disabled placeholder="ระบบแชทจะเปิดเร็วๆ นี้..." className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 cursor-not-allowed" />
                  <button disabled className="flex items-center justify-center rounded-lg bg-emerald-600 p-1.5 text-white opacity-50">
                    <span className="material-symbols-outlined text-[16px]">send</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Dispute Panel */}
          <div className={`flex w-full max-w-2xl flex-col bg-white shadow-2xl h-full border-l border-slate-200 ${
            closingDispute ? "animate-slide-out-right" : "animate-slide-in-right"
          }`}>

            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 bg-white px-7 py-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-[18px] text-amber-500">gavel</span>
                  <h2 className="text-base font-bold text-slate-900">ข้อพิพาทคำสั่งซื้อ</h2>
                  <Badge
                    text={DISPUTE_STATUS_LABEL[selectedDispute.status] || selectedDispute.status}
                    style={DISPUTE_STATUS_STYLE[selectedDispute.status] || "bg-slate-100 text-slate-600"}
                  />
                </div>
                <p className="font-mono text-xs text-slate-400">Order ID: {selectedDispute.orderId}</p>
              </div>
              <button
                onClick={closeDispute}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
              </button>
            </div>

            {/* Info Strip */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/70">
              <div className="px-6 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">ผู้ซื้อ (Buyer)</p>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                    {selectedDispute.order?.buyerId?.slice(0,1)?.toUpperCase() ?? "B"}
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-700 truncate">{selectedDispute.order?.buyerId ?? selectedDispute.buyerId ?? "—"}</span>
                </div>
              </div>
              <div className="px-6 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">ผู้ขาย (Seller)</p>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    {selectedDispute.order?.sellerId?.slice(0,1)?.toUpperCase() ?? "S"}
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-700 truncate">{selectedDispute.order?.sellerId ?? selectedDispute.sellerId ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 bg-slate-50/30">

              {/* Reason */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="material-symbols-outlined text-[15px]">info</span>
                  เหตุผลที่เปิดเคส
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed">{selectedDispute.reason}</p>
                <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">เปิดเคสเมื่อ: <span className="font-semibold text-slate-600">{new Date(selectedDispute.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</span></span>
                </div>
              </div>

              {/* Buyer Contact with Chat button */}
              <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-500">
                  <span className="material-symbols-outlined text-[15px]">person</span>
                  ช่องทางติดต่อผู้ซื้อ
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white font-bold text-sm shadow">
                      {selectedDispute.order?.buyerId?.slice(0, 2)?.toUpperCase() ?? "B"}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">ผู้ซื้อ #{(selectedDispute.order?.buyerId ?? selectedDispute.buyerId ?? "").slice(0, 12)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">กดปุ่ม &quot;แชท&quot; เพื่อเปิดหน้าต่างสนทนา</p>
                    </div>
                  </div>
                  <button
                    onClick={openDisputeChat}
                    className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    แชท
                  </button>
                </div>
              </div>

              {/* Evidence */}
              {!disputeDetails && detailsLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white p-8 text-sm text-slate-400">
                  <span className="material-symbols-outlined text-[20px] text-emerald-500" style={{animation:'spin 1s linear infinite'}}>progress_activity</span>
                  กำลังโหลดข้อมูลเคส...
                </div>
              ) : disputeDetails ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <span className="material-symbols-outlined text-[15px]">folder_open</span>
                      หลักฐานประกอบ ({disputeDetails.evidence?.length || 0} ไฟล์)
                    </h3>
                    {!disputeDetails.evidence?.length ? (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-slate-400">
                        <span className="material-symbols-outlined text-[36px]">image_not_supported</span>
                        <p className="text-sm">ยังไม่มีหลักฐานแนบมา</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3">
                        {disputeDetails.evidence.map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => handleViewEvidence(ev)}
                            disabled={openingEvidenceId === ev.id}
                            className="group flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-md disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[28px] transition-transform group-hover:scale-110">
                              {ev.fileType.startsWith("video/") ? "movie" : "image"}
                            </span>
                            <span className="text-[10px] font-bold">
                              {openingEvidenceId === ev.id ? "กำลังเปิด..." : (ev.fileType.startsWith("video/") ? "วิดีโอ" : "รูปภาพ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {disputeDetails.status === "DECIDED" ? (
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        ผลการตัดสิน
                      </h3>
                      <div className={`mb-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold ${
                        disputeDetails.decision === "APPROVE_REFUND"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {disputeDetails.decision === "APPROVE_REFUND" ? "payments" : "block"}
                        </span>
                        {disputeDetails.decision === "APPROVE_REFUND" ? "อนุมัติคืนเงิน" : "ปฏิเสธคำร้อง"}
                      </div>
                      <p className="mt-2 text-sm text-slate-700 leading-relaxed">{disputeDetails.decisionReason}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <span className="material-symbols-outlined text-[15px]">edit_note</span>
                        บันทึกผลการพิจารณา
                      </h3>
                      <textarea
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                        rows={4}
                        placeholder="ระบุเหตุผลประกอบการตัดสิน (บังคับกรอก)..."
                        className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 resize-none"
                      />
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleDecision("APPROVE_REFUND")}
                            disabled={deciding || !decisionReason.trim()}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">payments</span>
                            อนุมัติคืนเงิน
                          </button>
                          <button
                            onClick={() => handleDecision("REJECT")}
                            disabled={deciding || !decisionReason.trim()}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-40 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                            ปฏิเสธคำร้อง
                          </button>
                        </div>
                        <button
                          onClick={() => handleDecision("ESCALATE")}
                          disabled={deciding || !decisionReason.trim()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white py-2 text-sm font-bold text-amber-600 shadow-sm hover:bg-amber-50 disabled:opacity-40 transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                          ส่งเรื่องให้ Admin (Escalate)
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
