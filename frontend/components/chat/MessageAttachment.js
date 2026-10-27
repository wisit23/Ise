"use client";

import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl } from "../../lib/api";
import { attachmentUrl } from "../../lib/chat";
import { getFileTypeConfig } from "../../lib/fileIcons";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

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
  const [expanded, setExpanded] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isImage = type === "IMAGE";

  useEffect(() => {
    // Only images are fetched eagerly — a pdf or video is downloaded on
    // demand, so pulling every one of them into memory just to render a
    // row would waste bandwidth on files the user may never open.
    if (!isImage) return undefined;

    let cancelled = false;
    let created = null;
    setBlobUrl(null);
    setFailed(false);
    setExpanded(false);
    setImageLoaded(false);
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
  }, [conversationId, id, isImage, retry]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const url =
        blobUrl ||
        (await fetchAuthedBlobUrl(attachmentUrl(conversationId, id)));
      const a = document.createElement("a");
      a.href = url;
      a.download = payload?.filename || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!blobUrl) setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }

  if (isImage) {
    // MessageList gives an image bubble only a hairline of padding, so each
    // state below fills that frame (or pads itself).
    if (failed) {
      return (
        <div className="flex w-60 max-w-full flex-col items-center gap-1 px-4 pb-8 pt-6 text-center">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[28px] opacity-70"
          >
            broken_image
          </span>
          <p className="text-xs opacity-80">โหลดรูปภาพไม่สำเร็จ</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="min-h-11 text-xs font-medium underline underline-offset-2"
          >
            ลองโหลดรูปอีกครั้ง
          </button>
        </div>
      );
    }
    if (!blobUrl) {
      return (
        <div
          className={`h-48 w-72 max-w-full animate-pulse rounded-[14px] ${own ? "bg-white/15" : "bg-slate-100"}`}
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
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`ขยายรูป ${payload?.filename || "รูปภาพ"}`}
          className={`group relative block w-72 max-w-full overflow-hidden rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 ${
            own ? "bg-white/10" : "bg-slate-100"
          }`}
        >
          <img
            src={blobUrl}
            alt={payload?.filename || "รูปภาพที่แนบมา"}
            onLoad={() => setImageLoaded(true)}
            className={`block max-h-80 w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.02] ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-colors duration-200 group-hover:bg-black/10"
          />
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <span className="material-symbols-outlined text-[18px]">
              open_in_full
            </span>
          </span>
        </button>
        <Modal
          open={expanded}
          onClose={() => setExpanded(false)}
          title={
            [payload?.filename || "รูปภาพที่แนบมา", formatSize(payload?.size)]
              .filter(Boolean)
              .join(" · ")
          }
          size="xl"
          footer={
            <Button
              onClick={handleDownload}
              loading={downloading}
              icon="download"
            >
              ดาวน์โหลดรูป
            </Button>
          }
        >
          <img
            src={blobUrl}
            alt={`ภาพขยาย ${payload?.filename || "รูปภาพ"}`}
            className="mx-auto max-h-[65vh] max-w-full object-contain"
          />
          {downloadError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง
            </p>
          )}
        </Modal>
      </>
    );
  }

  const fileConfig = getFileTypeConfig(payload?.filename, payload?.mimeType);

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
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
          {downloadError ? "error" : fileConfig.icon}
        </span>
      </div>

      {/* File details */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-gray-900 transition-colors group-hover:text-emerald-700">
          {payload?.filename || "ไฟล์แนบ"}
        </span>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-500">
            {downloadError
              ? "ดาวน์โหลดไม่สำเร็จ · กดเพื่อลองใหม่"
              : formatSize(payload?.size)}
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
