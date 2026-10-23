"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./CaseHandoffBanner.module.css";

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

function TaskRow({ task, index, disabled, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.note || "");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  async function save(patch) {
    setState("saving");
    setError("");
    try {
      await onChange(task.id, patch);
      setState("saved");
      return true;
    } catch (err) {
      setState("idle");
      setError(err.message);
      return false;
    }
  }
  async function saveNote() {
    if (await save({ note: draft })) setEditing(false);
  }
  return (
    <li className={`${styles.task} ${task.done ? styles.taskDone : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${index + 1}. ${task.text}`}
        disabled={disabled || state === "saving"}
        onClick={() => save({ done: !task.done })}
        className={styles.check}
      >
        <span aria-hidden="true" className="material-symbols-outlined">
          {task.done ? "check_box" : "check_box_outline_blank"}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className={styles.taskText}>
          <span className={styles.taskIndex}>{index + 1}.</span> {task.text}
          {state === "saving" && <span className={styles.saveState}>กำลังบันทึก…</span>}
          {state === "saved" && <span className={styles.saveState}>บันทึกแล้ว</span>}
        </p>
        {editing ? (
          <div className={styles.noteEditor}>
            <input
              autoFocus
              aria-label={`สิ่งที่ได้สำหรับข้อ ${index + 1}`}
              value={draft}
              maxLength={500}
              placeholder="เช่น ได้วิดีโอแล้ว ผู้ซื้อส่งในแชท"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNote();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(false);
                  setDraft(task.note || "");
                }
              }}
            />
            <button type="button" onClick={saveNote} disabled={state === "saving"} className={styles.linkButton}>
              บันทึก
            </button>
          </div>
        ) : task.note ? (
          <p className={styles.note}>
            <span aria-hidden="true">└</span> {task.note}
            {!disabled && (
              <button type="button" onClick={() => setEditing(true)} className={styles.linkButton}>
                แก้ไข
              </button>
            )}
          </p>
        ) : (
          !disabled && (
            <button type="button" onClick={() => setEditing(true)} className={styles.addNote}>
              + จดสิ่งที่ได้ (ไม่บังคับ)
            </button>
          )
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </li>
  );
}

/**
 * Where a case stands in the CS ⇄ T&S handoff: a slim progress bar with
 * a checklist popover when returned, or a read-only waiting notice.
 */
export default function CaseHandoffBanner({ caseItem, caps, onEscalate, onTaskChange, busy }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (caps?.isReturned) {
    const tasks = caseItem.returnTasks || [];
    const done = tasks.filter((task) => task.done).length;
    const complete = tasks.length > 0 && done === tasks.length;
    return (
      <section ref={root} aria-label="งานที่ Trust & Safety ส่งกลับ" className={styles.bar}>
        <span aria-hidden="true" className={`material-symbols-outlined ${styles.barIcon}`}>
          assignment_return
        </span>
        <p className={styles.barTitle}>
          T&amp;S ตีกลับ
          <span className={styles.barTime}>{formatTime(caseItem.returnedAt)}</span>
        </p>
        {tasks.length > 0 && (
          <div className={styles.progress} title={`ทำแล้ว ${done} จาก ${tasks.length} ข้อ`}>
            <span
              role="progressbar"
              aria-label="ความคืบหน้า"
              aria-valuemin={0}
              aria-valuemax={tasks.length}
              aria-valuenow={done}
              className={styles.track}
            >
              <span className={styles.fill} style={{ width: `${(done / tasks.length) * 100}%` }} />
            </span>
            <span className={styles.count}>{done}/{tasks.length}</span>
          </div>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`return-tasks-${caseItem.id}`}
          onClick={() => setOpen((v) => !v)}
          className={styles.toggle}
        >
          {open ? "ย่อ" : "ดูรายการ"}
          <span aria-hidden="true" className="material-symbols-outlined">
            {open ? "expand_less" : "expand_more"}
          </span>
        </button>
        {caps.canEscalate && (
          <button
            type="button"
            disabled={busy}
            onClick={onEscalate}
            className={complete ? styles.sendReady : styles.send}
          >
            ส่งกลับให้ T&amp;S
          </button>
        )}
        {open && (
          <div id={`return-tasks-${caseItem.id}`} className={styles.popover}>
            <p className={styles.popoverTitle}>สิ่งที่ T&amp;S ขอ</p>
            {caseItem.returnReason && (
              <div className={styles.reason}>
                <p className={styles.reasonLabel}>เหตุผลที่ตีกลับ</p>
                <p className={styles.reasonText}>{caseItem.returnReason}</p>
              </div>
            )}
            <ol className={styles.tasks}>
              {tasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={index}
                  disabled={!caps.canEscalate || !onTaskChange}
                  onChange={onTaskChange}
                />
              ))}
            </ol>
          </div>
        )}
      </section>
    );
  }
  if (caps?.isWatching) {
    return (
      <section aria-label="สถานะการส่งต่อ" className={`${styles.bar} ${styles.waiting}`}>
        <span aria-hidden="true" className={`material-symbols-outlined ${styles.barIcon}`}>
          hourglass_top
        </span>
        <p className={styles.barTitle}>รอ Trust &amp; Safety ตรวจ</p>
        <p className={styles.waitingText}>
          {caseItem.assignedTo ? `ผู้ตรวจ: ${caseItem.assigneeName || "เจ้าหน้าที่ T&S"}` : "ยังไม่มีผู้รับเรื่อง"}
          {" · "}ดูได้อย่างเดียว
        </p>
      </section>
    );
  }
  return null;
}
