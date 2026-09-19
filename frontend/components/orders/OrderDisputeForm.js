"use client";

import { useState } from "react";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { apiFetch, uploadDisputeEvidence } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

export default function OrderDisputeForm({ order, onSubmitted }) {
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const token = getAccessToken();
      const dispute = await apiFetch(`/api/orders/${order.id}/disputes`, {
        method: "POST",
        token,
        body: { reason },
      });
      for (const file of files) {
        await uploadDisputeEvidence(dispute.id, file, token);
      }
      onSubmitted(dispute);
    } catch (err) {
      setError(err.message || "ส่งรายงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-ink-muted">
        อธิบายปัญหา เช่น สินค้าชำรุดหรือไม่ตรงตามที่ตกลง
        และแนบหลักฐานเพื่อให้เจ้าหน้าที่ตรวจสอบ
      </p>
      <textarea
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={4}
        placeholder="รายละเอียดปัญหา"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
        onChange={(event) => setFiles(Array.from(event.target.files || []))}
        className="text-xs text-gray-600"
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="danger" loading={submitting} icon="report">
        ส่งรายงาน
      </Button>
    </form>
  );
}
