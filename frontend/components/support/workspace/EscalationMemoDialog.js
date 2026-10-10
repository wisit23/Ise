"use client";
import { useState } from "react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Textarea from "../../ui/Textarea";
import Alert from "../../ui/Alert";

export default function EscalationMemoDialog({ open, onClose, onSubmit }) {
  const [memo, setMemo] = useState({
    problem: "",
    authority: "",
    recommendation: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSubmit(
        `ปัญหา: ${memo.problem.trim()}\nขาดอำนาจ: ${memo.authority.trim()}\nข้อเสนอแนะ: ${memo.recommendation.trim()}`,
      );
      setMemo({ problem: "", authority: "", recommendation: "" });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="ส่งต่อให้ Admin"
      description="เคสจะส่งเข้า Admin Inbox พร้อมสรุปข้อมูลสำหรับเจ้าหน้าที่รับช่วงต่อ"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={busy}
            disabled={busy || Object.values(memo).some((v) => !v.trim())}
            onClick={submit}
          >
            ส่งต่อให้ Admin
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="space-y-3">
        {[
          ["problem", "ปัญหาคืออะไร"],
          ["authority", "ขาดอำนาจอะไร"],
          ["recommendation", "ข้อเสนอแนะของ CS"],
        ].map(([key, label]) => (
          <Textarea
            key={key}
            label={label}
            rows={3}
            required
            value={memo[key]}
            onChange={(e) =>
              setMemo((old) => ({ ...old, [key]: e.target.value }))
            }
          />
        ))}
      </div>
    </Modal>
  );
}
