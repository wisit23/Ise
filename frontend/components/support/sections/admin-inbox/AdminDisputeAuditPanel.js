"use client";
import { formatReferenceCode } from "../../../../lib/referenceCodes";


import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api";
import ConfirmDialog from "../../../ui/ConfirmDialog";
import ReturnToCsDialog from "../../workspace/ReturnToCsDialog";
import ReturnTaskResults from "../../workspace/ReturnTaskResults";
import AuditChatMessages from "./AuditChatMessages";
import CaseDate from "../case/CaseDate";
import Modal from "../../../ui/Modal";
import { PrivateFile } from "../../workspace/EvidenceInspector";

const SIDES = [["buyer", "ผู้ซื้อ"], ["seller", "ผู้ขาย"], ["legacy", "บทสนทนาเดิม"]];

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
  const [returning, setReturning] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setSelectedEvidence(null);
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

  async function returnToCs({ reason: text, tasks }) {
    const updated = await apiFetch(`/api/orders/disputes/${detail.id}/request-evidence`, {
      method: "POST", token, body: { reason: text, tasks, version: detail.version },
    });
    setDetail(updated);
    onUpdated?.();
    if (updated.chatNoticeError) setError("ส่งกลับให้ CS แล้ว แต่ส่งประกาศเข้าแชทไม่สำเร็จ");
  }

  async function action(kind) {
    if (!detail || busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      const url = "decision";
      const body = {
        reason: reason.trim(),
        version: detail.version,
        decision: kind,
        idempotencyKey: `${detail.id}:${detail.version}:${kind}`,
      };
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

  const order = dispute.order || {};
  const amount = order.finalPrice ?? order.price;
  const parties = [[order.buyerId, "หลักฐานผู้ซื้อ", "border-emerald-200"], [order.sellerId, "หลักฐานผู้ขาย", "border-blue-200"]];
  const memo = Object.fromEntries((detail?.escalationNote || "").split("\n").map((line) => {
    const colon = line.indexOf(":");
    return colon < 0 ? ["", ""] : [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));

  return <Modal open onClose={onClose} title="ตรวจสอบข้อพิพาท" description={formatReferenceCode(dispute.orderId)} placement="fullscreen">
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5 lg:p-6">
        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 font-bold">วันและเวลาของข้อพิพาท (เวลาไทย)</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="mb-1 text-xs text-slate-500">วันที่แจ้งปัญหา</dt><dd><CaseDate value={detail?.createdAt || dispute.createdAt} /></dd></div>
            <div><dt className="mb-1 text-xs text-slate-500">วันที่รับงาน</dt><dd><CaseDate value={detail?.assignedAt} /></dd></div>
            <div><dt className="mb-1 text-xs text-slate-500">วันที่ตัดสิน</dt><dd><CaseDate value={detail?.decidedAt} /></dd></div>
          </dl>
        </section>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-1 gap-3 break-words rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm sm:grid-cols-3">
          <div><span className="block text-xs text-slate-500">Escrow Hold</span><strong>{typeof amount === "number" ? `฿${amount.toLocaleString("th-TH")}` : "—"}</strong></div>
          <div><span className="block text-xs text-slate-500">SLA</span><strong>{detail?.slaExpiresAt ? new Date(detail.slaExpiresAt).toLocaleString("th-TH") : "—"}</strong></div>
          <div><span className="block text-xs text-slate-500">CS ผู้ส่งต่อ</span><strong className="break-all font-mono">{formatReferenceCode(detail?.escalatedBy) || "—"}</strong></div>
        </div>
        <section className="rounded-xl border bg-white p-4"><h3 className="font-bold">CS Memo</h3>
          {detail?.escalationNote?.startsWith("ตอบกลับคำขอ")
            // A follow-up memo is a checklist summary, not problem/authority fields.
            ? <p className="mt-2 whitespace-pre-line text-sm">{detail.escalationNote}</p>
            : <>
              <p className="mt-2 text-sm"><b>ปัญหา:</b> {memo["ปัญหา"] || detail?.reason || dispute.reason}</p>
              <p className="mt-1 text-sm"><b>ขาดอำนาจ:</b> {memo["ขาดอำนาจ"] || detail?.escalationNote || "ยังไม่มีสรุปจาก CS"}</p>
              <p className="mt-1 text-sm"><b>ข้อเสนอแนะ:</b> {memo["ข้อเสนอแนะ"] || "ยังไม่มีข้อเสนอแนะ"}</p>
            </>}
        </section>
        <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">หลักฐานเปรียบเทียบ</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{parties.map(([id, label, border]) => <div key={label} className={`min-h-28 rounded-lg border p-3 ${border}`}><h4 className="mb-2 text-sm font-bold">{label}</h4>
            {(detail?.evidence || []).filter((ev) => ev.uploaderId === id).map((ev) => <button type="button" key={ev.id} onClick={() => setSelectedEvidence(ev)} className="mb-2 block w-full rounded border p-2 text-left text-xs hover:bg-slate-50">{ev.fileType?.startsWith("video/") ? "▶ วิดีโอ" : "▣ รูปภาพ"} · {new Date(ev.createdAt).toLocaleString("th-TH")}</button>)}
            {!(detail?.evidence || []).some((ev) => ev.uploaderId === id) && <p className="text-xs text-slate-500">ยังไม่มีหลักฐาน</p>}
          </div>)}</div>
        </section>
        <section className="rounded-xl border bg-white p-4"><button type="button" onClick={() => setShowLogs((v) => !v)} className="font-bold text-indigo-700">{showLogs ? "ซ่อน" : "คลี่ดู"} Log แชทย้อนหลัง</button>
          {showLogs && <div className="mt-3"><div role="tablist" className="flex gap-2">{SIDES.map(([value, label]) => <button type="button" role="tab" aria-selected={side === value} key={value} onClick={() => setSide(value)} className={`rounded-lg px-3 py-1 text-xs ${side === value ? "bg-indigo-600 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>
            {cursor && <button type="button" onClick={loadOlder} disabled={logsLoading} className="mt-3 text-xs font-bold text-indigo-700">โหลดข้อความเก่ากว่า</button>}
            {logsLoading && <p className="mt-2 text-xs">กำลังโหลด...</p>}
            {!logsLoading && messages.length === 0 && <p className="mt-3 text-xs text-slate-500">ไม่มีข้อความในห้องนี้</p>}
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/30">
              <div className="max-h-[420px] overflow-y-auto"><AuditChatMessages messages={messages} /></div>
              <p className="border-t border-slate-200 bg-white px-3 py-2 text-center text-[11px] text-slate-400">ดูประวัติแบบอ่านอย่างเดียว</p>
            </div>
          </div>}
        </section>
        {detail && !detail.returnedAt && detail.returnTasks?.length > 0 && detail.status !== "DECIDED" && (
          <section className="rounded-xl border border-emerald-200 bg-white p-4">
            <h3 className="font-bold">ผลจาก CS ตามที่ขอไว้</h3>
            <p className="mt-1 text-xs text-slate-500">เหตุผลที่ตีกลับ: {detail.returnReason}</p>
            <ReturnTaskResults tasks={detail.returnTasks} />
          </section>
        )}
        <section className="rounded-xl border bg-white p-4"><h3 className="font-bold">Verdict Console</h3>
          {detail?.status === "DECIDED" ? <p className="mt-2 text-sm">{detail.decision === "APPROVE_REFUND" ? "คืนเงินผู้ซื้อ" : "ปล่อยเงินให้ผู้ขาย"}: {detail.decisionReason}</p>
          : !detail ? <p className="mt-2 text-sm text-slate-500">กำลังโหลด…</p>
          : !["ADMIN", "TRUST_AND_SAFETY"].includes(detail.assignedRole) ? (
            detail.returnedAt
              ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">ส่งกลับให้ CS แล้ว · รอ CS ส่งต่อกลับมา</p>
                  <ReturnTaskResults tasks={detail.returnTasks} />
                </div>
              : <p className="mt-2 text-sm text-amber-700">รอ CS ส่งต่อเคสให้ Trust and Safety</p>)
          : !detail.assignedTo ? <button type="button" disabled={busy || !detail.capabilities?.canClaim} onClick={claim} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">รับเคสเพื่อพิจารณา</button>
          : detail.assignedTo !== currentUserId ? <p className="mt-2 text-sm text-slate-600">เจ้าหน้าที่ Trust and Safety คนอื่นกำลังรับผิดชอบเคสนี้ ({detail.assigneeName || formatReferenceCode(detail.assignedTo)})</p>
          : <>
            {detail.capabilities?.canDecide !== false && <>
              <textarea aria-label="เหตุผลการตัดสิน" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="ระบุเหตุผลการตัดสิน" className="mt-3 w-full rounded-lg border p-3 text-sm" />
              <div className="mt-2 flex flex-wrap gap-2">{[["APPROVE_REFUND", "คืนเงินผู้ซื้อ"], ["RELEASE_ESCROW", "ปล่อยเงินให้ผู้ขาย"]].map(([value, label]) => <button key={value} type="button" disabled={busy || !reason.trim()} onClick={() => setPendingAction(value)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{label}</button>)}</div>
            </>}
            {detail.capabilities?.canRequestEvidence !== false && <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-slate-600">ข้อมูลยังไม่พอตัดสิน? ส่งกลับให้ CS พร้อมระบุสิ่งที่ต้องทำ</p>
              <button type="button" disabled={busy} onClick={() => setReturning(true)} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50">ตีกลับให้ CS</button>
            </div>}
          </>}
        </section>
      </div>
      </div>
      <ConfirmDialog open={Boolean(pendingAction)} busy={busy} onCancel={() => setPendingAction(null)} onConfirm={() => action(pendingAction)} title={pendingAction === "APPROVE_REFUND" ? "ยืนยันคืนเงินผู้ซื้อ" : "ยืนยันปล่อยเงินให้ผู้ขาย"} description={reason} confirmLabel="ยืนยันคำสั่ง" tone="danger" />
      <ReturnToCsDialog open={returning} onClose={() => setReturning(false)} onSubmit={returnToCs} />
      <Modal open={Boolean(selectedEvidence)} onClose={() => setSelectedEvidence(null)} title="หลักฐานประกอบข้อพิพาท" size="xl">
        {selectedEvidence && detail && <PrivateFile key={`${detail.id}:${selectedEvidence.id}`} disputeId={detail.id} file={selectedEvidence} />}
      </Modal>
  </Modal>;
}
