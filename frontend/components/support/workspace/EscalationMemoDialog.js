"use client";
import { useState } from "react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Textarea from "../../ui/Textarea";
import Alert from "../../ui/Alert";

/** Text summary of a returned checklist, sent back to T&S as the memo. */
export function followUpSummary(tasks, reasons = {}, recommendation = "") {
  const lines = tasks.map((task) => {
    const detail = task.done ? task.note || "ทำแล้ว" : reasons[task.id]?.trim() || task.note || "";
    return `${task.done ? "✓" : "✗"} ${task.text}${detail ? ` — ${detail}` : ""}`;
  });
  return [
    "ตอบกลับคำขอ Trust & Safety:",
    ...lines,
    ...(recommendation.trim() ? [`ข้อเสนอแนะ: ${recommendation.trim()}`] : []),
  ].join("\n");
}

export default function EscalationMemoDialog({
  open,
  onClose,
  onSubmit,
  dispute = false,
  returnTasks,
  onTaskChange,
}) {
  const target = dispute ? "Trust & Safety" : "Admin";
  const followUp = Array.isArray(returnTasks) && returnTasks.length > 0;
  const [memo, setMemo] = useState({
    problem: "",
    authority: "",
    recommendation: "",
  });
  const [reasons, setReasons] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = followUp ? returnTasks.filter((task) => !task.done) : [];
  const missingReason = pending.some(
    (task) => !(reasons[task.id]?.trim() || task.note?.trim()),
  );
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (followUp) {
        // Keep the reason on the item itself so T&S sees it per task.
        for (const task of pending) {
          const reason = reasons[task.id]?.trim();
          if (reason && reason !== task.note) await onTaskChange?.(task.id, { note: reason });
        }
        await onSubmit(followUpSummary(returnTasks, reasons, memo.recommendation));
      } else {
        await onSubmit(
          `ปัญหา: ${memo.problem.trim()}\nขาดอำนาจ: ${memo.authority.trim()}\nข้อเสนอแนะ: ${memo.recommendation.trim()}`,
        );
      }
      setMemo({ problem: "", authority: "", recommendation: "" });
      setReasons({});
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const disabled = followUp
    ? missingReason
    : !memo.problem.trim() || !memo.authority.trim();
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`ส่ง${followUp ? "กลับ" : "ต่อ"}ให้ ${target}`}
      description={
        followUp
          ? `สรุปจากรายการที่ ${target} ขอ แก้ไขได้ก่อนส่ง`
          : `เคสจะส่งเข้าคิว ${target} พร้อมสรุปข้อมูลสำหรับเจ้าหน้าที่รับช่วงต่อ`
      }
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={busy} disabled={busy || disabled} onClick={submit}>
            ส่ง{followUp ? "กลับ" : "ต่อ"}ให้ {target}
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      {followUp ? (
        <div className="space-y-3">
          <ul className="space-y-2 rounded-lg border border-slate-200 p-3">
            {returnTasks.map((task) => (
              <li key={task.id} className="text-sm">
                <p className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[18px] ${task.done ? "text-emerald-600" : "text-amber-600"}`}
                  >
                    {task.done ? "check_circle" : "error"}
                  </span>
                  <span>
                    <span className="sr-only">{task.done ? "ทำแล้ว: " : "ยังไม่ได้ทำ: "}</span>
                    {task.text}
                    {task.done && (
                      <span className="block text-xs text-slate-500">{task.note || "ทำแล้ว"}</span>
                    )}
                  </span>
                </p>
                {!task.done && (
                  <input
                    aria-label={`เหตุผลที่ยังไม่ได้ทำ: ${task.text}`}
                    placeholder="ทำไมยังไม่ได้ทำ เช่น ร้านค้ายังไม่ตอบ"
                    maxLength={500}
                    value={reasons[task.id] ?? task.note ?? ""}
                    onChange={(e) =>
                      setReasons((old) => ({ ...old, [task.id]: e.target.value }))
                    }
                    className="ml-6 mt-1 min-h-10 w-[calc(100%-1.5rem)] rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  />
                )}
              </li>
            ))}
          </ul>
          {pending.length > 0 && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ยังไม่ได้ทำ {pending.length} ข้อ ระบุเหตุผลในข้อนั้นก่อนส่ง
            </p>
          )}
          <Textarea
            label="ข้อเสนอแนะของ CS (ไม่บังคับ)"
            rows={2}
            value={memo.recommendation}
            onChange={(e) =>
              setMemo((old) => ({ ...old, recommendation: e.target.value }))
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {[
            ["problem", "ปัญหาคืออะไร"],
            ["authority", "ขาดอำนาจอะไร"],
            ["recommendation", "ข้อเสนอแนะของ CS"],
          ].map(([key, label]) => (
            <Textarea
              key={key}
              label={key === "recommendation" ? `${label} (ไม่บังคับ)` : label}
              rows={3}
              required={key !== "recommendation"}
              value={memo[key]}
              onChange={(e) =>
                setMemo((old) => ({ ...old, [key]: e.target.value }))
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
