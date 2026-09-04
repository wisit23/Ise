"use client";

import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl } from "../../lib/api";
import { attachmentUrl } from "../../lib/chat";

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

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
        own ? "hover:bg-white/15" : "hover:bg-black/5"
      }`}
    >
      <span
        className="material-symbols-outlined text-[22px]"
        aria-hidden="true"
      >
        {failed ? "error" : "description"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {payload?.filename || "ไฟล์แนบ"}
        </span>
        <span className="block text-[11px] opacity-70">
          {failed ? "ดาวน์โหลดไม่สำเร็จ" : formatSize(payload?.size)}
        </span>
      </span>
    </button>
  );
}
