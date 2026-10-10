"use client";

import { useEffect, useState } from "react";
import { apiFetch, fetchAuthedBlobUrl } from "../../../../lib/api";
import ConfirmDialog from "../../../ui/ConfirmDialog";

const SIDES = [["buyer", "ผู้ซื้อ"], ["seller", "ผู้ขาย"], ["legacy", "ห้องเก่า"]];

export default function AdminDisputeAuditPanel({ dispute, token, currentUserId, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [side, setSide] = useState("buyer");
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    apiFetch(`/api/orders/disputes/${dispute.id}`, { token })
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [dispute.id, token]);

  useEffect(() => {
    if (!showLogs) return;
    let cancelled = false;
    setLogsLoading(true);
    setMessages([]);
    setCursor(null);
    apiFetch(`/api/orders/disputes/${dispute.id}/audit-transcript?side=${side}`, { token })
      .then((page) => { if (!cancelled) { setMessages(page.messages || []); setCursor(page.nextCursor || null); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [showLogs, side, dispute.id, token]);

  async function loadOlder() {
    if (!cursor || logsLoading) return;
    setLogsLoading(true);
    try {
      const page = await apiFetch(`/api/orders/disputes/${dispute.id}/audit-transcript?side=${side}&before=${encodeURIComponent(cursor)}`, { token });
      setMessages((current) => [...(page.messages || []), ...current]);
      setCursor(page.nextCursor || null);
    } catch (err) { setError(err.message); }
    finally { setLogsLoading(false); }
  }

  async function action(kind) {
    if (!detail || busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      const url = kind === "MORE" ? "request-evidence" : "decision";
      const body = { reason: reason.trim(), version: detail.version };
      if (kind !== "MORE") {
        body.decision = kind;
        body.idempotencyKey = `${detail.id}:${detail.version}:${kind}`;
      }
      const updated = await apiFetch(`/api/orders/disputes/${detail.id}/${url}`, { method: "POST", token, body });
      setDetail(updated);
      apiFetch(`/api/orders/disputes/${detail.id}`, { token }).then(setDetail).catch((err) => console.error("Could not refresh dispute after action:", err));
      setReason("");
      setPendingAction(null);
      onUpdated?.();
      if (updated.chatLockError || updated.chatNoticeError) setError("บันทึกผลแล้ว แต่ส่งประกาศเข้าแชทไม่ครบ กรุณาลองยืนยันคำสั่งเดิมอีกครั้ง");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/disputes/${detail.id}/claim`, { method: "POST", token, body: { version: detail.version } });
      setDetail(updated);
      onUpdated?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function openEvidence(ev) {
    try {
      const url = await fetchAuthedBlobUrl(`/api/orders/disputes/${detail.id}/evidence/${ev.id}`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) { setError(err.message); }
  }

  const order = dispute.order || {};
  const amount = order.finalPrice ?? order.price;
  const parties = [[order.buyerId, "หลักฐานผู้ซื้อ", "border-emerald-200"], [order.sellerId, "หลักฐานผู้ขาย", "border-blue-200"]];
  const memo = Object.fromEntries((detail?.escalationNote || "").split("\n").map((line) => {
    const colon = line.indexOf(":");
    return colon < 0 ? ["", ""] : [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));

  return <div className="fixed inset-0 z-drawer flex justify-end bg-slate-900/50" onClick={onClose} role="presentation">
    <section role="dialog" aria-modal="true" aria-label="ตรวจสอบข้อพิพาท" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-4xl flex-col bg-slate-50 shadow-2xl">
      <header className="flex items-center justify-between border-b bg-white p-5">
        <div><h2 className="text-lg font-bold">ตรวจสอบข้อพิพาท</h2><p className="font-mono text-xs text-slate-500">{dispute.orderId}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-sm font-bold hover:bg-slate-100">ปิด ✕</button>
      </header>
      <div className="overflow-y-auto p-5 space-y-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div><span className="block text-xs text-slate-500">Escrow Hold</span><strong>{typeof amount === "number" ? `฿${amount.toLocaleString("th-TH")}` : "—"}</strong></div>
          <div><span className="block text-xs text-slate-500">SLA</span><strong>{detail?.slaExpiresAt ? new Date(detail.slaExpiresAt).toLocaleString("th-TH") : "—"}</strong></div>
          <div><span className="block text-xs text-slate-500">CS ผู้ส่งต่อ</span><strong className="font-mono">{detail?.escalatedBy || "—"}</strong></div>
        </div>
        <section className="rounded-xl border bg-white p-4"><h3 className="font-bold">CS Memo</h3>
          <p className="mt-2 text-sm"><b>ปัญหา:</b> {memo["ปัญหา"] || detail?.reason || dispute.reason}</p>
          <p className="mt-1 text-sm"><b>ขาดอำนาจ:</b> {memo["ขาดอำนาจ"] || detail?.escalationNote || "ยังไม่มีสรุปจาก CS"}</p>
          <p className="mt-1 text-sm"><b>ข้อเสนอแนะ:</b> {memo["ข้อเสนอแนะ"] || "ยังไม่มีข้อเสนอแนะ"}</p>
        </section>
        <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">หลักฐานเปรียบเทียบ</h3>
          <div className="grid grid-cols-2 gap-3">{parties.map(([id, label, border]) => <div key={label} className={`min-h-28 rounded-lg border p-3 ${border}`}><h4 className="mb-2 text-sm font-bold">{label}</h4>
            {(detail?.evidence || []).filter((ev) => ev.uploaderId === id).map((ev) => <button type="button" key={ev.id} onClick={() => openEvidence(ev)} className="mb-2 block w-full rounded border p-2 text-left text-xs hover:bg-slate-50">{ev.fileType.startsWith("video/") ? "▶ วิดีโอ" : "▣ รูปภาพ"} · {new Date(ev.createdAt).toLocaleString("th-TH")}</button>)}
            {!(detail?.evidence || []).some((ev) => ev.uploaderId === id) && <p className="text-xs text-slate-500">ยังไม่มีหลักฐาน</p>}
          </div>)}</div>
        </section>
        <section className="rounded-xl border bg-white p-4"><button type="button" onClick={() => setShowLogs((v) => !v)} className="font-bold text-indigo-700">{showLogs ? "ซ่อน" : "คลี่ดู"} Log แชทย้อนหลัง</button>
          {showLogs && <div className="mt-3"><div role="tablist" className="flex gap-2">{SIDES.map(([value, label]) => <button type="button" role="tab" aria-selected={side === value} key={value} onClick={() => setSide(value)} className={`rounded-lg px-3 py-1 text-xs ${side === value ? "bg-indigo-600 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>
            {cursor && <button type="button" onClick={loadOlder} disabled={logsLoading} className="mt-3 text-xs font-bold text-indigo-700">โหลดข้อความเก่ากว่า</button>}
            {logsLoading && <p className="mt-2 text-xs">กำลังโหลด...</p>}
            {!logsLoading && messages.length === 0 && <p className="mt-3 text-xs text-slate-500">ไม่มีข้อความในห้องนี้</p>}
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{messages.map((m) => <div key={m.id} className="rounded-lg border p-2 text-xs"><div className="mb-1 text-slate-500">{m.senderRole} · {new Date(m.createdAt).toLocaleString("th-TH")}</div><p className="whitespace-pre-wrap">{m.body || `[${m.type}]`}</p></div>)}</div>
          </div>}
        </section>
        <section className="rounded-xl border bg-white p-4"><h3 className="font-bold">Verdict Console</h3>
          {detail?.status === "DECIDED" ? <p className="mt-2 text-sm">{detail.decision === "APPROVE_REFUND" ? "คืนเงินผู้ซื้อ" : "ปล่อยเงินให้ผู้ขาย"}: {detail.decisionReason}</p>
          : detail?.assignedRole !== "ADMIN" ? <p className="mt-2 text-sm text-amber-700">รอ CS ส่งต่อเคสให้ Admin</p>
          : !detail?.assignedTo ? <button type="button" disabled={busy} onClick={claim} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">รับเคสเพื่อพิจารณา</button>
          : detail.assignedTo !== currentUserId ? <p className="mt-2 text-sm text-slate-600">Admin คนอื่นกำลังรับผิดชอบเคสนี้ ({detail.assignedTo})</p>
          : <><textarea aria-label="เหตุผลการตัดสิน" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="ระบุเหตุผลการตัดสินหรือหลักฐานที่ต้องการเพิ่ม" className="mt-3 w-full rounded-lg border p-3 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">{[["APPROVE_REFUND", "คืนเงินผู้ซื้อ"], ["RELEASE_ESCROW", "ปล่อยเงินให้ผู้ขาย"], ["MORE", "ตีกลับขอหลักฐานเพิ่ม"]].map(([value, label]) => <button key={value} type="button" disabled={busy || !reason.trim()} onClick={() => setPendingAction(value)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{label}</button>)}</div>
          </>}
        </section>
      </div>
      <ConfirmDialog open={Boolean(pendingAction)} busy={busy} onCancel={() => setPendingAction(null)} onConfirm={() => action(pendingAction)} title={pendingAction === "APPROVE_REFUND" ? "ยืนยันคืนเงินผู้ซื้อ" : pendingAction === "RELEASE_ESCROW" ? "ยืนยันปล่อยเงินให้ผู้ขาย" : "ยืนยันขอหลักฐานเพิ่ม"} description={reason} confirmLabel="ยืนยันคำสั่ง" tone={pendingAction === "MORE" ? "primary" : "danger"} />
    </section>
  </div>;
}
