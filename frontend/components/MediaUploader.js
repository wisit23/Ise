"use client";

import { useRef, useState } from "react";
import { uploadFiles, mediaUrl } from "../lib/api";

export default function MediaUploader({ value, onChange, token }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setError("");
    setUploading(true);
    try {
      const uploaded = await uploadFiles(files, token);
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  function setCover(index) {
    if (index === 0) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition ${
          dragOver
            ? "border-emerald-500 bg-emerald-50"
            : "border-gray-300 bg-gray-50 hover:border-emerald-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="font-medium text-gray-700">
          {uploading
            ? "กำลังอัปโหลด..."
            : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือกรูป/วิดีโอ"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          JPG, PNG, WEBP, MP4, MOV — สูงสุด 8 ไฟล์
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {value.map((item, index) => (
            <div
              key={item.url + index}
              className="group relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100"
            >
              {item.type === "video" ? (
                <video
                  src={mediaUrl(item.url)}
                  className="h-full w-full object-cover"
                  muted
                />
              ) : (
                <img
                  src={mediaUrl(item.url)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  ภาพหลัก
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label="ลบไฟล์นี้"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
              >
                ×
              </button>
              {index !== 0 && (
                <button
                  type="button"
                  onClick={() => setCover(index)}
                  className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                >
                  ตั้งเป็นภาพหลัก
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
