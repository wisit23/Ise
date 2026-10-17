"use client";

import { useState } from "react";
import Modal from "../../ui/Modal";
import Input from "../../ui/Input";
import Button from "../../ui/Button";
import { apiFetch } from "../../../lib/api";

const TIME_FIELDS = [
  ["submissionStartsAt", "เริ่มรับสินค้า"], ["submissionEndsAt", "ปิดรับสินค้า"],
  ["auctionStartsAt", "เริ่มประมูล"], ["auctionEndsAt", "ปิดประมูล"],
];

function localDateTime(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function RoundEditModal({ round, token, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(TIME_FIELDS.map(([key]) => [key, localDateTime(round[key])])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [pendingRequest, setPendingRequest] = useState(null);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const formValues = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const request = pendingRequest || {
        ...Object.fromEntries(TIME_FIELDS.map(([key]) => {
          const value = formValues.get(key) ?? values[key];
          return [key, value === localDateTime(round[key])
            ? new Date(round[key]).toISOString() : new Date(value).toISOString()];
        })),
        expectedUpdatedAt: round.updatedAt,
        idempotencyKey: crypto.randomUUID(),
      };
      // Keep the same operation on network failure or partially delivered side effects.
      setPendingRequest(request);
      const result = await apiFetch(`/api/products/auctions/rounds/${round.id}`, { method: "PATCH", token, body: request });
      onSaved();
      if (result.warnings?.length) setWarnings(result.warnings);
      else onClose();
    } catch (err) {
      if (err.status >= 400 && err.status < 500) setPendingRequest(null);
      setError(err.message || "บันทึกเวลาไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`แก้ไขเวลารอบ ${round.title}`} size="lg"
      description="เวลาแสดงตามเขตเวลาของเครื่อง รอบที่เริ่มแล้วแก้ได้เฉพาะเวลาที่ยังไม่สิ้นสุด Backend จะตรวจซ้ำก่อนบันทึก">
      <form onSubmit={save} className="space-y-4 pt-3">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {warnings.length > 0 && <div role="status" className="text-sm text-amber-700">บันทึกเวลาแล้ว แต่ยังดำเนินการไม่ครบ กรุณากดส่งซ้ำ: {warnings.join(" · ")}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TIME_FIELDS.map(([key, label]) => (
            <Input key={key} id={`round-edit-${key}`} name={key} label={label} type="datetime-local" required
              value={values[key]} disabled={busy || Boolean(pendingRequest) || (key !== "auctionEndsAt" && new Date(round[key]) <= new Date())}
              onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} />
          ))}
        </div>
        <p className="text-xs text-slate-500">ผู้ขายและผู้เสนอราคาที่ได้รับผลกระทบจะได้รับแจ้ง รายการที่ปิดแล้วไม่เปลี่ยน และเวลาต่อจาก Bid จะไม่ถูกตัด</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>ปิด</Button>
          <Button type="submit" loading={busy}>{pendingRequest ? "ส่งคำขอเดิมซ้ำ" : "บันทึกเวลา"}</Button>
        </div>
      </form>
    </Modal>
  );
}
