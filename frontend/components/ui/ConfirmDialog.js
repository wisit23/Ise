"use client";

import { useEffect, useState } from "react";
import Button from "./Button";
import Modal from "./Modal";
import Textarea from "./Textarea";

/* Replaces window.confirm() and window.prompt(), which froze the tab, could
   not be styled or translated consistently, and gave no room to explain what
   the action actually does.

   `reason` controls the free-text field: "none" | "optional" | "required". */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "danger",
  reason = "none",
  reasonLabel = "เหตุผล",
  reasonHint,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setText("");
      setError("");
    }
  }, [open]);

  function handleConfirm() {
    if (reason === "required" && !text.trim()) {
      setError(`กรุณาระบุ${reasonLabel}`);
      return;
    }
    onConfirm(text.trim());
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {reason === "none" ? (
        <p className="text-sm text-ink-muted">
          การกระทำนี้จะถูกบันทึกไว้ใน Audit Log
        </p>
      ) : (
        <Textarea
          label={reasonLabel}
          hint={reasonHint ?? (reason === "optional" ? "ไม่บังคับ" : undefined)}
          error={error}
          required={reason === "required"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
        />
      )}
    </Modal>
  );
}
