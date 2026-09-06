"use client";

import { useRef, useState } from "react";
import { uploadFiles, mediaUrl } from "../lib/api";

const MAX_FILES = 5;

export default function ReviewMediaUploader({
  value = [],
  onChange,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setError("");

    const remaining = MAX_FILES - value.length;
    if (remaining <= 0) {
      setError(`แนบรูปภาพหรือวิดีโอได้สูงสุด ${MAX_FILES} ไฟล์`);
      return;
    }

    const filesToUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(
        `เลือกไฟล์ได้อีกเพียง ${remaining} ไฟล์ (สูงสุด ${MAX_FILES} ไฟล์)`,
      );
    }

    setUploading(true);
    try {
      const uploaded = await uploadFiles(filesToUpload);
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err.message || "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov"
          className="hidden"
          disabled={disabled || uploading || value.length >= MAX_FILES}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled || uploading || value.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">
            add_photo_alternate
          </span>
          <span>{uploading ? "กำลังอัปโหลด..." : "แนบรูปภาพหรือวิดีโอ"}</span>
        </button>
        <span className="text-[11px] text-gray-500">
          (สูงสุด {MAX_FILES} ไฟล์, ขนาดไม่เกิน 20MB ต่อไฟล์)
        </span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((item, index) => (
            <div
              key={item.url + index}
              className="group relative h-16 w-16 overflow-hidden rounded-md border border-gray-200 bg-gray-100"
            >
              {item.type === "video" ? (
                <div className="relative h-full w-full bg-black">
                  <video
                    src={mediaUrl(item.url)}
                    className="h-full w-full object-cover"
                    muted
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white">
                    ▶
                  </span>
                </div>
              ) : (
                <img
                  src={mediaUrl(item.url)}
                  alt="review media"
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[11px] text-white hover:bg-black/80"
                aria-label="ลบไฟล์นี้"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
