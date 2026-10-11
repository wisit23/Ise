"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { apiFetch, uploadDisputeEvidence } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { DISPUTE_TYPES, evidenceError } from "../../lib/disputePresentation";
import config from "../../lib/customerServiceConfig";

export default function OrderDisputeForm({ order, onSubmitted }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [disputeType, setDisputeType] = useState("");
  const [files, setFiles] = useState([]);
  const [created, setCreated] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const invalid = evidenceError(files);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = getAccessToken();
      const dispute =
        created ||
        (await apiFetch(`/api/orders/${order.id}/disputes`, {
          method: "POST",
          token,
          body: { reason: reason.trim(), disputeType },
        }));
      setCreated(dispute);
      // Preserve the created case and remove only successful files on partial failure.
      for (const file of files) {
        await uploadDisputeEvidence(dispute.id, file, token);
        setFiles((pending) => pending.filter((item) => item !== file));
      }
      onSubmitted?.(dispute);
      router.push(`/support/cases/${order.id}`);
    } catch (err) {
      setError(err.message || "ส่งคำร้องไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-line bg-white p-4"
    >
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          แจ้งปัญหาหลังรับสินค้า
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          บอกปัญหาและแนบหลักฐาน CS
          จะรวบรวมข้อมูลจากทั้งสองฝ่ายก่อนส่งผู้ดูแลพิจารณา
        </p>
      </div>
      <label className="block text-sm font-medium text-gray-800">
        ประเภทปัญหา
        <select
          required
          aria-label="ประเภทปัญหา"
          value={disputeType}
          disabled={submitting || Boolean(created)}
          onChange={(event) => setDisputeType(event.target.value)}
          className="focus-ring mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
        >
          <option value="">เลือกประเภทปัญหา</option>
          {DISPUTE_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-gray-800">
        รายละเอียดปัญหา
        <textarea
          required
          aria-label="รายละเอียดปัญหา"
          value={reason}
          disabled={submitting || Boolean(created)}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          placeholder="ได้รับสินค้าเมื่อไร พบปัญหาตรงไหน และต่างจากรายละเอียดอย่างไร"
          className="focus-ring mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-medium text-gray-800">
        รูปภาพหรือวิดีโอประกอบ{" "}
        <span className="font-normal text-ink-muted">(เพิ่มภายหลังได้)</span>
        <input
          aria-label="แนบหลักฐานคำร้อง"
          type="file"
          multiple
          accept={config.evidence.mimeTypes.join(",")}
          disabled={submitting}
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            setFiles(selected);
            setError(evidenceError(selected));
          }}
          className="focus-ring mt-2 block w-full rounded-lg border border-dashed border-gray-300 p-3 text-xs"
        />
        <span className="mt-1 block text-xs font-normal text-ink-muted">
          ไม่เกิน {config.evidence.maxFiles} ไฟล์ ไฟล์ละ{" "}
          {config.evidence.maxFileBytes / 1024 / 1024} MB
        </span>
      </label>
      {files.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-600">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>{file.name}</li>
          ))}
        </ul>
      )}
      {error && (
        <Alert tone="error">
          {error}
          {created && (
            <p className="mt-2">
              เปิดคำร้องแล้ว แต่บางไฟล์ยังส่งไม่สำเร็จ
              ลองส่งไฟล์ที่เหลืออีกครั้ง หรือ{" "}
              <Link className="underline" href={`/support/cases/${order.id}`}>
                ไปหน้าคำร้องเพื่อเพิ่มหลักฐาน
              </Link>
            </p>
          )}
        </Alert>
      )}
      <Button
        type="submit"
        loading={submitting}
        disabled={!created && (!reason.trim() || !disputeType)}
        icon="send"
      >
        {created ? "ส่งหลักฐานที่เหลือ" : "เปิดคำร้องและส่งข้อมูล"}
      </Button>
    </form>
  );
}
