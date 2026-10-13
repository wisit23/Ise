"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Select from "../ui/Select";
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
  const fileInput = useRef(null);
  const uploadHintId = useId();
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!created && !disputeType) {
      setError("กรุณาเลือกประเภทปัญหา");
      return;
    }
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
      <Select
        required
        label="ประเภทปัญหา"
        name="disputeType"
        placeholder="เลือกประเภทปัญหา"
        value={disputeType}
        disabled={submitting || Boolean(created)}
        onChange={(event) => setDisputeType(event.target.value)}
        options={[
          { value: "", label: "เลือกประเภทปัญหา" },
          ...DISPUTE_TYPES.map(([value, label]) => ({ value, label })),
        ]}
      />
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
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">
          รูปภาพหรือวิดีโอประกอบ{" "}
          <span className="font-normal text-ink-muted">(เพิ่มภายหลังได้)</span>
        </p>
        <div
          className={`flex flex-col items-start gap-4 rounded-xl border border-dashed border-brand-200 bg-brand-50/30 p-4 sm:flex-row sm:items-center sm:justify-between ${submitting ? "opacity-60" : ""}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-brand-600"
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-[24px]">
                add_photo_alternate
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">แนบหลักฐานของปัญหา</p>
              <p
                id={uploadHintId}
                className="mt-1 text-xs leading-relaxed text-ink-muted"
              >
                รูปภาพหรือวิดีโอ · สูงสุด {config.evidence.maxFiles} ไฟล์ ·
                ไฟล์ละ {config.evidence.maxFileBytes / 1024 / 1024} MB
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            icon="attach_file"
            disabled={submitting}
            onClick={() => fileInput.current?.click()}
            className="shrink-0 bg-white"
          >
            {files.length ? "เลือกไฟล์ใหม่" : "เลือกไฟล์จากอุปกรณ์"}
          </Button>
        </div>
        <input
          ref={fileInput}
          aria-label="แนบหลักฐานคำร้อง"
          aria-describedby={uploadHintId}
          type="file"
          tabIndex={-1}
          multiple
          accept={config.evidence.mimeTypes.join(",")}
          disabled={submitting}
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            setFiles(selected);
            setError(evidenceError(selected));
          }}
          className="sr-only"
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-2" aria-label="ไฟล์หลักฐานที่เลือก">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle px-3 py-2"
            >
              <span
                className="material-symbols-outlined text-[20px] text-brand-600"
                aria-hidden="true"
              >
                {file.type.startsWith("video/") ? "videocam" : "image"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-ink-subtle">
                  {file.size < 1024 * 1024
                    ? `${Math.ceil(file.size / 1024)} KB`
                    : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                aria-label={`ลบไฟล์ ${file.name}`}
                className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-white hover:text-danger disabled:opacity-50"
                onClick={() => {
                  const remaining = files.filter(
                    (_, itemIndex) => itemIndex !== index,
                  );
                  setFiles(remaining);
                  setError(evidenceError(remaining));
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </li>
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
