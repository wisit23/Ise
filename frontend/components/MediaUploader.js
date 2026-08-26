"use client";

import { useRef, useState } from "react";
import { uploadFiles, mediaUrl } from "../lib/api";

/** Crops an image file to a 1:1 square (center-crop) using HTML5 Canvas. */
function cropImageToSquare(file, maxSize = 1600) {
  if (!file.type.startsWith("image/")) {
    return Promise.resolve(file);
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const targetSide = Math.min(side, maxSize);

      const canvas = document.createElement("canvas");
      canvas.width = targetSide;
      canvas.height = targetSide;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const sourceWidth = img.naturalWidth || img.width;
      const sourceHeight = img.naturalHeight || img.height;
      const sx = (sourceWidth - side) / 2;
      const sy = (sourceHeight - side) / 2;

      ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSide, targetSide);

      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const croppedFile = new File([blob], file.name, {
            type: mimeType,
            lastModified: Date.now(),
          });
          resolve(croppedFile);
        },
        mimeType,
        0.92,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export default function MediaUploader({ value = [], onChange, token }) {
  const safeValue = Array.isArray(value) ? value : [];
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
      const processedFiles = await Promise.all(
        files.map((file) => cropImageToSquare(file)),
      );
      const uploaded = await uploadFiles(processedFiles, token);
      onChange([...safeValue, ...uploaded]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index) {
    onChange(safeValue.filter((_, i) => i !== index));
  }

  function setCover(index) {
    if (index === 0) return;
    const next = [...safeValue];
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
        <div className="mb-2 flex items-center justify-center text-2xl">📸</div>
        <p className="font-medium text-gray-700">
          {uploading
            ? "กำลังประมวลผลและอัปโหลดรูปภาพ..."
            : "ไฟล์รูปภาพ หรือคลิกเพื่อเลือกรูปภาพ/วิดีโอ"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          JPG, PNG, WEBP, MP4, MOV — สูงสุด 8 ไฟล์
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {safeValue.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {safeValue.map((item, index) => (
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
