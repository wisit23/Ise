"use client";
import Icon from "../../../ui/Icon";

import { formatReferenceCode } from "../../../../lib/referenceCodes";


import { useCallback, useEffect, useRef, useState } from "react";
import config from "../../../../lib/customerServiceConfig";
import { apiFetch } from "../../../../lib/api";
import ConfirmDialog from "../../../ui/ConfirmDialog";
import Button from "../../../ui/Button";
import ReturnToCsDialog from "../../workspace/ReturnToCsDialog";
import ReturnTaskResults from "../../workspace/ReturnTaskResults";
import AuditChatMessages from "./AuditChatMessages";
import CaseDate from "../case/CaseDate";
import Modal from "../../../ui/Modal";
import { PrivateFile } from "../../workspace/EvidenceInspector";

/* One labelled fact in the case summary strip. */
function Fact({ label, children, className = "" }) {
  return <div className={`min-w-0 ${className}`}><dt className="mb-1 text-xs font-medium text-slate-500">{label}</dt><dd className="min-w-0 break-words text-sm font-semibold text-slate-900">{children}</dd></div>;
}
function Card({ title, icon, children, tone = "default" }) {
  return <section className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${tone === "success" ? "border-emerald-200" : "border-slate-200"}`}>
    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">{icon && <Icon name={icon} className="text-slate-500" />}{title}</h3>
    {children}
  </section>;
}

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
  const [pendingDelivery, setPendingDelivery] = useState(null);
  const transcriptRequest = useRef(0);
  const detailRequest = useRef(0);
  const latestDetail = useRef(null);
  const alive = useRef(false);
  const panelState = useRef({});
  panelState.current = { busy, returning, pendingAction };
  const [refreshError, setRefreshError] = useState("");
  const applyDetail = useCallback((data) => {
    if (!alive.current || data.id !== dispute.id || (latestDetail.current?.version ?? -1) > (data.version ?? -1)) return;
    if (!panelState.current.busy && panelState.current.pendingAction && latestDetail.current?.version !== data.version) {
      setPendingAction(null);
      setError("เคสมีข้อมูลใหม่ กรุณาตรวจสอบก่อนยืนยันอีกครั้ง");
    }
    latestDetail.current = data;
    setDetail(data);
  }, [dispute.id]);

  useEffect(() => {
    alive.current = true;
    latestDetail.current = null;
    setDetail(null);
    setSelectedEvidence(null);
    const refresh = async () => {
      if (panelState.current.busy || panelState.current.returning || document.visibilityState === "hidden") return;
      const request = ++detailRequest.current;
      try {
        const data = await apiFetch(`/api/orders/disputes/${dispute.id}`, { token });
        if (!alive.current || request !== detailRequest.current || panelState.current.busy || panelState.current.returning) return;
        applyDetail(data);
        setRefreshError("");
      } catch (err) {
        if (alive.current && request === detailRequest.current) setRefreshError(err.message);
      }
    };
    refresh();
    const timer = setInterval(refresh, config.timing.dashboardRefreshMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false;
      detailRequest.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [dispute.id, token, applyDetail]);

  useEffect(() => {
    const request = ++transcriptRequest.current;
    if (!showLogs) return;
    let cancelled = false;
    setLogsLoading(true);
    setMessages([]);
    setCursor(null);
    apiFetch(`/api/orders/disputes/${dispute.id}/audit-transcript?side=${side}`, { token })
      .then((page) => { if (!cancelled) { setMessages(page.messages || []); setCursor(page.nextCursor || null); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; if (transcriptRequest.current === request) transcriptRequest.current++; };
  }, [showLogs, side, dispute.id, token]);

  async function loadOlder() {
    if (!cursor || logsLoading) return;
    const request = transcriptRequest.current;
    setLogsLoading(true);
    try {
      const page = await apiFetch(`/api/orders/disputes/${dispute.id}/audit-transcript?side=${side}&before=${encodeURIComponent(cursor)}`, { token });
      if (request !== transcriptRequest.current) return;
      setMessages((current) => [...(page.messages || []), ...current]);
      setCursor(page.nextCursor || null);
    } catch (err) { if (request === transcriptRequest.current) setError(err.message); }
    finally { if (request === transcriptRequest.current) setLogsLoading(false); }
  }

  async function returnToCs({ reason: text, tasks }) {
    panelState.current.busy = true;
    detailRequest.current++;
    setBusy(true);
    try {
      const updated = await apiFetch(`/api/orders/disputes/${detail.id}/request-evidence`, {
        method: "POST", token, body: { reason: text, tasks, version: detail.version },
      });
      applyDetail(updated);
      onUpdated?.();
      if (updated.chatNoticeError) setError("ส่งกลับให้ CS แล้ว แต่ส่งประกาศเข้าแชทไม่สำเร็จ");
    } finally { panelState.current.busy = false; setBusy(false); }
  }

  async function action(kind, retryBody) {
    if (!detail || busy || (!retryBody && !reason.trim())) return;
    panelState.current.busy = true;
    detailRequest.current++;
    setBusy(true);
    setError("");
    try {
      const url = "decision";
      const body = retryBody || {
        reason: reason.trim(),
        version: detail.version,
        decision: kind,
        idempotencyKey: `${detail.id}:${detail.version}:${kind}`,
      };
      const updated = await apiFetch(`/api/orders/disputes/${detail.id}/${url}`, { method: "POST", token, body });
      applyDetail(updated);
      apiFetch(`/api/orders/disputes/${detail.id}`, { token }).then(applyDetail).catch((err) => console.error("Could not refresh dispute after action:", err));
      setReason("");
      setPendingAction(null);
      onUpdated?.();
      if (updated.chatLockError || updated.chatNoticeError) {
        setPendingDelivery(body);
        setError("บันทึกผลแล้ว แต่ส่งประกาศหรือปิดแชทยังไม่ครบ กรุณาลองส่งผลอีกครั้ง");
      } else setPendingDelivery(null);
    } catch (err) { if (err.status === 409) setPendingAction(null); setError(err.message); }
    finally { panelState.current.busy = false; setBusy(false); }
  }

  async function claim() {
    panelState.current.busy = true;
    detailRequest.current++;
    setBusy(true);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/disputes/${detail.id}/claim`, { method: "POST", token, body: { version: detail.version } });
      applyDetail(updated);
      onUpdated?.();
    } catch (err) { setError(err.message); }
    finally { panelState.current.busy = false; setBusy(false); }
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
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {refreshError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">โหลดข้อมูลล่าสุดไม่สำเร็จ: {refreshError} ระบบจะลองใหม่อัตโนมัติ</p>}
        {pendingDelivery && <Button variant="secondary" disabled={busy} onClick={() => action(pendingDelivery.decision, pendingDelivery)}>ลองส่งผลการตัดสินอีกครั้ง</Button>}
        <section aria-label="สรุปเคส" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-6 gap-y-4">
            <Fact label="Escrow Hold"><span className="text-lg font-bold text-amber-700">{typeof amount === "number" ? `฿${amount.toLocaleString("th-TH")}` : "—"}</span></Fact>
            <Fact label="SLA"><CaseDate value={detail?.slaExpiresAt} /></Fact>
            <Fact label="CS ผู้ส่งต่อ"><span className="break-all font-mono text-xs">{formatReferenceCode(detail?.escalatedBy) || "—"}</span></Fact>
            <Fact label="วันที่แจ้งปัญหา"><CaseDate value={detail?.createdAt || dispute.createdAt} /></Fact>
            <Fact label="วันที่รับงาน"><CaseDate value={detail?.assignedAt} /></Fact>
            <Fact label="วันที่ตัดสิน"><CaseDate value={detail?.decidedAt} /></Fact>
          </dl>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">วันและเวลาแสดงตามเวลาไทย (UTC+7)</p>
        </section>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="min-w-0 space-y-4">
            <Card title="CS Memo" icon="description">
              {detail?.escalationNote?.startsWith("ตอบกลับคำขอ")
                // A follow-up memo is a checklist summary, not problem/authority fields.
                ? <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{detail.escalationNote}</p>
                : <dl className="space-y-3 text-sm">
                  {[["ปัญหา", memo["ปัญหา"] || detail?.reason || dispute.reason], ["ขาดอำนาจ", memo["ขาดอำนาจ"] || detail?.escalationNote || "ยังไม่มีสรุปจาก CS"], ["ข้อเสนอแนะ", memo["ข้อเสนอแนะ"] || "ยังไม่มีข้อเสนอแนะ"]].map(([label, value]) => <div key={label} className="grid gap-1 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3"><dt className="font-semibold text-slate-500">{label}</dt><dd className="min-w-0 break-words text-slate-800">{value}</dd></div>)}
                </dl>}
            </Card>
            <Card title="หลักฐานเปรียบเทียบ" icon="photo_library">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{parties.map(([id, label, border]) => {
                const files = (detail?.evidence || []).filter((ev) => ev.uploaderId === id);
                return <div key={label} className={`rounded-xl border p-3 ${border}`}><h4 className="mb-2 flex items-center justify-between text-sm font-bold">{label}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{files.length} ไฟล์</span></h4>
                  {files.map((ev) => <button type="button" key={ev.id} onClick={() => setSelectedEvidence(ev)} className="focus-ring mb-2 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs transition hover:border-emerald-300 hover:bg-emerald-50/40">{ev.fileType?.startsWith("video/") ? <><Icon name="play_arrow" /> วิดีโอ</> : <><Icon name="image" /> รูปภาพ</>}<span className="text-slate-500">· {new Date(ev.createdAt).toLocaleString("th-TH")}</span></button>)}
                  {files.length === 0 && <p className="text-xs text-slate-500">ยังไม่มีหลักฐาน</p>}
                </div>;
              })}</div>
            </Card>
            {detail && !detail.returnedAt && detail.returnTasks?.length > 0 && detail.status !== "DECIDED" && (
              <Card title="ผลจาก CS ตามที่ขอไว้" icon="task_alt" tone="success">
                <p className="text-xs text-slate-500">เหตุผลที่ตีกลับ: {detail.returnReason}</p>
                <ReturnTaskResults tasks={detail.returnTasks} />
              </Card>
            )}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><button type="button" aria-expanded={showLogs} onClick={() => setShowLogs((v) => !v)} className="focus-ring flex w-full items-center justify-between gap-2 rounded-lg text-sm font-bold text-slate-900"><span className="flex items-center gap-2"><Icon name="forum" className="text-slate-500" />{showLogs ? "ซ่อน" : "คลี่ดู"} Log แชทย้อนหลัง</span><Icon name={showLogs ? "expand_less" : "expand_more"} className="text-slate-500" /></button>
              {showLogs && <div className="mt-3"><div role="tablist" className="flex flex-wrap gap-2">{SIDES.map(([value, label]) => <button type="button" role="tab" aria-selected={side === value} key={value} onClick={() => setSide(value)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${side === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{label}</button>)}</div>
                {cursor && <button type="button" onClick={loadOlder} disabled={logsLoading} className="mt-3 text-xs font-bold text-emerald-700">โหลดข้อความเก่ากว่า</button>}
                {logsLoading && <p className="mt-2 text-xs">กำลังโหลด...</p>}
                {!logsLoading && messages.length === 0 && <p className="mt-3 text-xs text-slate-500">ไม่มีข้อความในห้องนี้</p>}
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/30">
                  <div className="max-h-[420px] overflow-y-auto"><AuditChatMessages messages={messages} /></div>
                  <p className="border-t border-slate-200 bg-white px-3 py-2 text-center text-[11px] text-slate-400">ดูประวัติแบบอ่านอย่างเดียว</p>
                </div>
              </div>}
            </section>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><Icon name="gavel" className="text-slate-500" />Verdict Console</h3>
            {detail?.status === "DECIDED" ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-semibold">{detail.decision === "APPROVE_REFUND" ? "คืนเงินผู้ซื้อ" : "ปล่อยเงินให้ผู้ขาย"}</p><p className="mt-1 whitespace-pre-wrap text-emerald-800">{detail.decisionReason}</p></div>
            : !detail ? <p className="text-sm text-slate-500">กำลังโหลด…</p>
            : !["ADMIN", "TRUST_AND_SAFETY"].includes(detail.assignedRole) ? (
              detail.returnedAt
                ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">ส่งกลับให้ CS แล้ว · รอ CS ส่งต่อกลับมา</p>
                    <ReturnTaskResults tasks={detail.returnTasks} />
                  </div>
                : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">รอ CS ส่งต่อเคสให้ Trust and Safety</p>)
            : !detail.assignedTo ? <div className="space-y-3"><p className="text-sm text-slate-600">รับเคสนี้ก่อน จึงจะตัดสินหรือส่งกลับให้ CS ได้</p><Button className="w-full" icon="assignment_ind" disabled={busy || !detail.capabilities?.canClaim} onClick={claim}>รับเคสเพื่อพิจารณา</Button></div>
            : detail.assignedTo !== currentUserId ? <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">เจ้าหน้าที่ Trust and Safety คนอื่นกำลังรับผิดชอบเคสนี้ ({detail.assigneeName || formatReferenceCode(detail.assignedTo)})</p>
            : <div className="space-y-4">
              {detail.capabilities?.canDecide !== false && <div className="space-y-3">
                <textarea aria-label="เหตุผลการตัดสิน" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="ระบุเหตุผลการตัดสิน (จำเป็น)" className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
                <div className="grid gap-2">{[["APPROVE_REFUND", "คืนเงินผู้ซื้อ", "undo"], ["RELEASE_ESCROW", "ปล่อยเงินให้ผู้ขาย", "storefront"]].map(([value, label, icon]) => <Button key={value} variant="secondary" className="w-full" icon={icon} disabled={busy || !reason.trim()} onClick={() => setPendingAction(value)}>{label}</Button>)}</div>
                {!reason.trim() && <p className="text-xs text-slate-500">กรอกเหตุผลก่อน ปุ่มตัดสินจึงจะกดได้</p>}
              </div>}
              {detail.capabilities?.canRequestEvidence !== false && <div className={`space-y-2 ${detail.capabilities?.canDecide !== false ? "border-t border-slate-100 pt-4" : ""}`}>
                <p className="text-xs text-slate-600">ข้อมูลยังไม่พอตัดสิน? ส่งกลับให้ CS พร้อมระบุสิ่งที่ต้องทำ</p>
                <Button variant="secondary" className="w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" icon="assignment_return" disabled={busy} onClick={() => setReturning(true)}>ตีกลับให้ CS</Button>
              </div>}
            </div>}
          </section>
        </div>
      </div>
      </div>
      <ConfirmDialog open={Boolean(pendingAction)} busy={busy} onCancel={() => setPendingAction(null)} onConfirm={() => action(pendingAction)} title={pendingAction === "APPROVE_REFUND" ? "ยืนยันคืนเงินผู้ซื้อ" : "ยืนยันปล่อยเงินให้ผู้ขาย"} description={reason} confirmLabel="ยืนยันคำสั่ง" tone="danger" />
      <ReturnToCsDialog open={returning} onClose={() => setReturning(false)} onSubmit={returnToCs} />
      <Modal open={Boolean(selectedEvidence)} onClose={() => setSelectedEvidence(null)} title="หลักฐานประกอบข้อพิพาท" size="xl">
        {selectedEvidence && detail && <PrivateFile key={`${detail.id}:${selectedEvidence.id}`} disputeId={detail.id} file={selectedEvidence} />}
      </Modal>
  </Modal>;
}
