"use client";

import { useRef } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp";

/* The ID-card photo picker. The drop zone used to be a bare <div onClick>,
   which meant a keyboard user could not reach it at all — it is a real button
   now, so Tab and Enter work. */
export default function KycDocumentUpload({ preview, onSelect }) {
  const inputRef = useRef(null);

  return (
    <div className="border-t border-line pt-5">
      <h2 className="mb-2 text-base font-semibold text-gray-900">
        3. รูปถ่ายบัตรประชาชน{" "}
        <span className="text-danger" aria-hidden="true">
          *
        </span>
      </h2>
      <p className="mb-3 text-xs text-ink-muted">
        กรุณาถ่ายรูปด้านหน้าบัตรประชาชนให้ชัดเจน เห็นชื่อ นามสกุล
        และเลขประจำตัวชัดเจน
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="เลือกรูปถ่ายบัตรประชาชน"
        onChange={onSelect}
      />

      {preview ? (
        <div className="overflow-hidden rounded-lg border border-line-strong bg-surface-subtle p-4">
          <div className="flex items-center gap-4">
            <img
              src={preview}
              alt="ตัวอย่างรูปถ่ายบัตรประชาชนที่เลือกไว้"
              className="h-28 w-44 rounded-md border border-line object-cover shadow-sm"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">
                เลือกรูปถ่ายแล้ว
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="focus-ring mt-2 rounded text-xs font-medium text-brand-600 underline hover:text-brand-700"
              >
                เปลี่ยนรูปถ่าย
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="focus-ring flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line-strong bg-surface-subtle px-4 py-8 text-center transition hover:border-brand-500 hover:bg-brand-50/30"
        >
          <span
            className="material-symbols-outlined mb-2 text-[32px] text-ink-subtle"
            aria-hidden="true"
          >
            add_a_photo
          </span>
          <span className="text-sm font-medium text-gray-700">
            คลิกเพื่อเลือกรูปถ่ายบัตรประชาชน
          </span>
          <span className="mt-1 text-xs text-ink-subtle">
            รองรับไฟล์ JPG, PNG, WEBP (ขนาดไม่เกิน 10MB)
          </span>
        </button>
      )}
    </div>
  );
}
