"use client";

import { useMemo, useState } from "react";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import { apiFetch } from "../../../lib/api";

const ACTIONS = {
  WARN_USER: {
    label: "ตักเตือนบัญชี",
    confirm: "ยืนยันการตักเตือน",
  },
  SUSPEND_USER: {
    label: "ระงับบัญชี",
    confirm: "ยืนยันการระงับ",
  },
  RESTORE_USER: {
    label: "ปลดการระงับบัญชี",
    confirm: "ยืนยันการปลดระงับ",
  },
};

function parseIds(value) {
  return [...new Set(value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
}

function createOperationKey(prefix = "bulk") {
  const suffix = globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${suffix}`;
}

function Results({ result, title }) {
  if (!result) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs font-semibold text-slate-600">
          สำเร็จ {result.succeeded} · ไม่สำเร็จ {result.failed} · ทั้งหมด {result.total}
        </p>
      </div>
      <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">Account ID</th>
              <th className="px-3 py-2">ผล</th>
              <th className="px-3 py-2">เหตุผล</th>
            </tr>
          </thead>
          <tbody>
            {(result.results || []).map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="break-all px-3 py-2 font-mono">{item.id}</td>
                <td className={`px-3 py-2 font-bold ${item.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {item.ok ? "ทำได้" : "ทำไม่ได้"}
                </td>
                <td className="px-3 py-2 text-slate-600">{item.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BulkActionsSection({ token }) {
  const [action, setAction] = useState("WARN_USER");
  const [rawIds, setRawIds] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewSignature, setPreviewSignature] = useState("");
  const [result, setResult] = useState(null);
  const [operation, setOperation] = useState(null);
  const [parentOperationKey, setParentOperationKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const ids = useMemo(() => parseIds(rawIds), [rawIds]);
  const signature = JSON.stringify({ action, ids, reason: reason.trim() });
  const previewIsCurrent = preview && previewSignature === signature;
  const failedIds = (result?.results || []).filter((item) => !item.ok).map((item) => item.id);
  const validationError = ids.length > 100
    ? "เลือกได้สูงสุด 100 บัญชีต่อครั้ง"
    : ids.length === 0
      ? "กรุณาระบุ Account ID อย่างน้อย 1 รายการ"
      : !reason.trim()
        ? "กรุณาระบุเหตุผล"
        : "";

  async function requestPreview() {
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy("preview");
    setError("");
    setResult(null);
    setOperation(null);
    setParentOperationKey("");
    try {
      const data = await apiFetch("/api/auth/admin/bulk", {
        method: "POST",
        token,
        body: { action, ids, reason: reason.trim(), dryRun: true },
      });
      setPreview(data);
      setPreviewSignature(signature);
    } catch (err) {
      setError(err.message || "สร้าง Preview ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function executeOperation(nextOperation, parentKey = "") {
    setBusy("execute");
    setError("");
    setOperation(nextOperation);
    setParentOperationKey(parentKey);
    try {
      const data = await apiFetch("/api/auth/admin/bulk", {
        method: "POST",
        token,
        body: {
          action: nextOperation.action,
          ids: nextOperation.ids,
          reason: nextOperation.reason,
          idempotencyKey: nextOperation.key,
        },
      });
      setResult(data);
    } catch (err) {
      setError(
        `${err.message || "คำสั่งไม่สำเร็จ"} — หากผลไม่แน่ชัดให้ตรวจซ้ำด้วย Operation ID เดิม`,
      );
    } finally {
      setBusy("");
    }
  }

  function confirmPreview() {
    if (!previewIsCurrent || validationError) return;
    const nextOperation = {
      key: createOperationKey(),
      action,
      ids,
      reason: reason.trim(),
    };
    executeOperation(nextOperation);
  }

  function replayOperation() {
    if (operation) executeOperation(operation, parentOperationKey);
  }

  function retryFailures() {
    if (!operation || failedIds.length === 0) return;
    const nextOperation = {
      key: createOperationKey(`${operation.key}:retry`),
      action: operation.action,
      ids: failedIds,
      reason: operation.reason,
    };
    executeOperation(nextOperation, operation.key);
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Bulk Account Actions</h2>
        <p className="mt-1 text-sm text-slate-500">
          เลือกได้ไม่เกิน 100 บัญชี · Preview เป็นการอ่านสถานะ ณ เวลานั้น ไม่รับประกันผลตอนยืนยัน
        </p>
      </div>

      {error && (
        <Alert title="ดำเนินการไม่สำเร็จ">
          <p>{error}</p>
          {operation && (
            <Button className="mt-3" size="sm" variant="secondary" onClick={replayOperation} loading={busy === "execute"}>
              ตรวจซ้ำด้วย Operation ID เดิม
            </Button>
          )}
        </Alert>
      )}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">
          คำสั่ง
          <select
            aria-label="คำสั่ง Bulk"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {Object.entries(ACTIONS).map(([value, item]) => (
              <option key={value} value={value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          เหตุผล
          <input
            aria-label="เหตุผล Bulk"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="เหตุผลที่ตรวจสอบย้อนหลังได้"
          />
        </label>
        <label className="text-xs font-bold text-slate-700 lg:col-span-2">
          Account IDs — คั่นด้วยบรรทัด ช่องว่าง หรือ comma
          <textarea
            aria-label="Account IDs"
            value={rawIds}
            onChange={(event) => setRawIds(event.target.value)}
            rows={7}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            placeholder={"user-id-1\nuser-id-2"}
          />
          <span className={`mt-1 block ${ids.length > 100 ? "text-red-600" : "text-slate-500"}`}>
            เลือกแล้ว {ids.length} / 100 บัญชี (ตัด ID ซ้ำให้อัตโนมัติ)
          </span>
        </label>
        <div className="flex flex-wrap gap-2 lg:col-span-2">
          <Button onClick={requestPreview} loading={busy === "preview"} disabled={busy === "execute"}>
            Preview / Dry-run
          </Button>
          <Button
            variant={action === "SUSPEND_USER" ? "danger" : "primary"}
            onClick={confirmPreview}
            loading={busy === "execute"}
            disabled={!previewIsCurrent || !!validationError || busy === "preview"}
          >
            {ACTIONS[action].confirm}
          </Button>
        </div>
      </section>

      <Results result={previewIsCurrent ? preview : null} title="ผล Preview — ยังไม่มีการเขียนข้อมูล" />

      {operation && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p><strong>Operation ID:</strong> <span className="break-all font-mono">{operation.key}</span></p>
          {parentOperationKey && <p className="mt-1"><strong>Retry จาก:</strong> <span className="break-all font-mono">{parentOperationKey}</span></p>}
          <p className="mt-1">คำขอที่ผลไม่แน่ชัดต้อง replay ด้วย ID นี้และ payload เดิมเท่านั้น</p>
        </section>
      )}

      <Results result={result} title="ผลการดำเนินการจริง" />

      {failedIds.length > 0 && (
        <Button variant="secondary" onClick={retryFailures} loading={busy === "execute"}>
          Retry เฉพาะ {failedIds.length} รายการที่ล้มเหลว
        </Button>
      )}
    </div>
  );
}
