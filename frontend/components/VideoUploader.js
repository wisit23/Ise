"use client";

import { useRef, useState } from "react";
import { uploadFiles, mediaUrl } from "../lib/api";

/** Single-video dropzone — same upload mechanics as MediaUploader (drag/drop
 * or click, POSTs straight to /uploads), simplified to exactly one file since
 * a review clip only ever attaches one video. */
export default function VideoUploader({ value, onChange, token }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;

    setError("");
    setUploading(true);
    try {
      const [uploaded] = await uploadFiles([file], token);
      onChange(uploaded.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (value) {
    return (
      <div>
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-black">
          <video
            src={mediaUrl(value)}
            controls
            className="max-h-80 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
            aria-label="ลบวิดีโอนี้"
          >
            ×
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center text-sm transition ${
          dragOver
            ? "border-emerald-500 bg-emerald-50"
            : "border-gray-300 bg-gray-50 hover:border-emerald-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="font-medium text-gray-700">
          {uploading
            ? "กำลังอัปโหลด..."
            : "ลากไฟล์วิดีโอมาวาง หรือคลิกเพื่อเลือกจากเครื่อง"}
        </p>
        <p className="mt-1 text-xs text-gray-400">MP4, MOV — สูงสุด 20MB</p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
