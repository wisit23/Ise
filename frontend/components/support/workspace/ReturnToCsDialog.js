"use client";
import { useState } from "react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Textarea from "../../ui/Textarea";
import Alert from "../../ui/Alert";

const MAX_TASKS = 10;

/** T&S returns an escalated dispute or ticket to the CS agent with explicit to-dos. */
export default function ReturnToCsDialog({ open, onClose, onSubmit, subject = "dispute" }) {
  const ticket = subject === "ticket";
  const [reason, setReason] = useState("");
  const [tasks, setTasks] = useState([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filled = tasks.map((task) => task.trim()).filter(Boolean);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSubmit({ reason: reason.trim(), tasks: filled });
      setReason("");
      setTasks([""]);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const setTask = (index, value) =>
    setTasks((old) => old.map((task, i) => (i === index ? value : task)));
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="ส่งกลับให้ CS ดำเนินการเพิ่ม"
      description="เคสจะกลับไปที่เจ้าหน้าที่ CS ที่ส่งต่อมา พร้อมรายการสิ่งที่ต้องทำ"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={busy}
            disabled={busy || !reason.trim() || filled.length === 0}
            onClick={submit}
          >
            ส่งกลับให้ CS
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="space-y-4">
        <Textarea
          label={ticket ? "เหตุผลที่ส่งกลับ" : "เหตุผลที่ยังตัดสินไม่ได้"}
          hint={
            ticket
              ? "เห็นเฉพาะเจ้าหน้าที่ ผู้แจ้งจะไม่เห็นข้อความนี้"
              : "ข้อความนี้จะแจ้งผู้ซื้อและร้านค้าในแชทด้วย"
          }
          rows={2}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">
            สิ่งที่ CS ต้องทำ <span className="text-red-600">*</span>
          </legend>
          <p className="text-xs text-slate-500">
            เห็นเฉพาะเจ้าหน้าที่ ระบุทีละข้อให้ชัด เช่น “ขอรูปกล่องพัสดุจากผู้ซื้อ”
          </p>
          {tasks.map((task, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-sm font-semibold text-slate-500">
                {index + 1}.
              </span>
              <input
                aria-label={`สิ่งที่ต้องทำข้อ ${index + 1}`}
                value={task}
                maxLength={300}
                onChange={(e) => setTask(index, e.target.value)}
                className="min-h-11 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
              {tasks.length > 1 && (
                <button
                  type="button"
                  aria-label={`ลบข้อ ${index + 1}`}
                  onClick={() => setTasks((old) => old.filter((_, i) => i !== index))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          ))}
          {tasks.length < MAX_TASKS && (
            <Button
              variant="ghost"
              size="sm"
              icon="add"
              onClick={() => setTasks((old) => [...old, ""])}
            >
              เพิ่มข้อ
            </Button>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
