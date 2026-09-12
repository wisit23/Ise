"use client";

import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl } from "../../lib/api";
import { attachmentUrl } from "../../lib/chat";
import { getFileTypeConfig } from "../../lib/fileIcons";

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Chat attachments are private (participant-only), so they can NOT be
 * rendered with a plain `<img src>` or offered as a plain `<a href>` — a
 * bare browser navigation never carries the Authorization header and would
 * come back 401. Same constraint the dispute-evidence viewer hit, and the
 * same solution: fetch the bytes with the token, wrap them in an object URL,
 * and revoke it on unmount so the blob isn't leaked.
 */
export default function MessageAttachment({ message, own }) {
  const { conversationId, id, type, payload } = message;
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isImage = type === "IMAGE";

  useEffect(() => {
    // Only images are fetched eagerly — a pdf or video is downloaded on
    // demand, so pulling every one of them into memory just to render a
    // row would waste bandwidth on files the user may never open.
    if (!isImage) return undefined;

    let cancelled = false;
    let created = null;
    fetchAuthedBlobUrl(attachmentUrl(conversationId, id))
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [conversationId, id, isImage]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const url = await fetchAuthedBlobUrl(attachmentUrl(conversationId, id));
      const a = document.createElement("a");
      a.href = url;
      a.download = payload?.filename || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  }

  if (isImage) {
    if (failed) {
      return <p className="text-xs italic opacity-70">โหลดรูปภาพไม่สำเร็จ</p>;
    }
    if (!blobUrl) {
      return (
        <div
          className="h-40 w-40 animate-pulse rounded-lg bg-black/10"
          role="status"
          aria-label="กำลังโหลดรูปภาพ"
        />
      );
    }
    return (
      // A plain <img> (as everywhere else in this codebase, e.g.
      // MediaGallery) rather than next/image — next/image can't load a
      // blob: URL, and these bytes only exist client-side after an
      // authenticated fetch (see this file's header comment).
      <img
        src={blobUrl}
        alt={payload?.filename || "รูปภาพที่แนบมา"}
        className="max-h-64 max-w-full rounded-lg object-contain"
      />
    );
  }

  const fileConfig = getFileTypeConfig(payload?.filename, payload?.mimeType);

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={`group flex w-full min-w-[220px] max-w-xs items-center gap-3 rounded-2xl p-2.5 text-left transition-all duration-200 ${
        own
          ? "border border-emerald-100/80 bg-white text-gray-900 shadow-sm hover:bg-slate-50 hover:shadow-md"
          : "border border-gray-200 bg-slate-50 text-gray-900 shadow-2xs hover:bg-white hover:shadow-sm"
      }`}
    >
      {/* File type icon badge */}
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${fileConfig.gradient} text-white shadow-2xs transition-transform group-hover:scale-105`}
      >
        <span className="material-symbols-outlined text-[24px]">
          {failed ? "error" : fileConfig.icon}
        </span>
      </div>

      {/* File details */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-gray-900 transition-colors group-hover:text-emerald-700">
          {payload?.filename || "ไฟล์แนบ"}
        </span>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-500">
            {failed ? "ดาวน์โหลดไม่สำเร็จ" : formatSize(payload?.size)}
          </span>
          {!failed && (
            <>
              <span className="text-[10px] text-gray-300">•</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${fileConfig.pillBg} ${fileConfig.pillText}`}
              >
                {fileConfig.ext}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Download action button */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-700">
        {downloading ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        ) : (
          <span className="material-symbols-outlined text-[18px]">
            download
          </span>
        )}
      </div>
    </button>
  );
}
