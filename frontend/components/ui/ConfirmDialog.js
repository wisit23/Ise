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
  description: propDescription,
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "danger",
  danger,
  reason = "none",
  reasonLabel = "เหตุผล",
  reasonHint,
  initialReason = "",
  note,
  busy = false,
  loading,
  onConfirm,
  onCancel,
}) {
  const description = propDescription ?? message;
  const isBusy = busy || Boolean(loading);
  const effectiveTone = danger ? "danger" : tone;
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setText(initialReason);
      setError((prev) => (prev ? "" : prev));
    }
  }, [open, initialReason]);

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
      onClose={isBusy ? () => {} : onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </Button>
          <Button variant={effectiveTone} onClick={handleConfirm} loading={isBusy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {reason === "none" ? (
        note ? <p className="text-sm text-ink-muted">{note}</p> : null
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
