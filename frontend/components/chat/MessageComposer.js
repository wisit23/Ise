"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "../../lib/chat";
import { getFileTypeConfig } from "../../lib/fileIcons";
import UploadProgressPill from "./UploadProgressPill";

const TYPING_STOP_DELAY_MS = 2000;
const COUNTER_VISIBLE_FROM = MAX_MESSAGE_LENGTH - 200;

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Enter sends, Shift+Enter inserts a newline.
 *
 * `onTyping` is optional and fires once per typing burst plus once when it
 * stops — not on every keystroke.
 *
 * `onAttach` shows the paperclip button. When a file is picked:
 * - A preview thumbnail card appears with file name, size, and a remove button.
 * - The user can type a caption.
 * - Pressing Send (or Enter) uploads the file with an animated progress pill.
 */
export default function MessageComposer({
  onSend,
  onAttach,
  onTyping,
  onFocus,
  disabled,
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Upload Progress State (shown during file upload)
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const remaining = MAX_MESSAGE_LENGTH - value.length;

  // Clean up object URL when component unmounts or pending file changes
  useEffect(() => {
    return () => {
      if (previewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewUrl);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [previewUrl]);

  function autoResizeTextarea() {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
      const scrollHeight = textareaRef.current.scrollHeight;
      const targetHeight = Math.max(44, Math.min(scrollHeight, 120));
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }

  useEffect(() => {
    autoResizeTextarea();
  }, []);

  function handleChange(e) {
    setValue(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
    autoResizeTextarea();

    if (!onTyping) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTyping(true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      onTyping(false);
    }, TYPING_STOP_DELAY_MS);
  }

  function stopTypingNow() {
    if (!onTyping || !typingActiveRef.current) return;
    clearTimeout(typingTimeoutRef.current);
    typingActiveRef.current = false;
    onTyping(false);
  }

  function clearPendingFile() {
    if (previewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingFile(null);
    setPreviewUrl(null);
  }

  async function submit() {
    const trimmed = value.trim();
    if ((!trimmed && !pendingFile) || sending || disabled) return;

    stopTypingNow();
    setSending(true);

    if (pendingFile && onAttach) {
      // Simulate/animate progress bar smoothly
      setUploadProgress(15);
      progressIntervalRef.current = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.floor(Math.random() * 15 + 10);
        });
      }, 150);

      try {
        await onAttach(pendingFile, trimmed);
        setUploadProgress(100);
        clearPendingFile();
        setValue("");
        if (textareaRef.current) textareaRef.current.style.height = "44px";
      } catch {
        // Keep file and caption on failure so user can retry
      } finally {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        setSending(false);
        setUploadProgress(0);
      }
    } else {
      // Regular text send
      try {
        await onSend(trimmed);
        setValue("");
        if (textareaRef.current) textareaRef.current.style.height = "44px";
      } catch {
        // Keep draft text on failure
      } finally {
        setSending(false);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAttach || sending || disabled) return;

    clearPendingFile();
    setPendingFile(file);

    if (
      file.type.startsWith("image/") &&
      typeof URL.createObjectURL === "function"
    ) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  function handleCancelUpload() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setSending(false);
    setUploadProgress(0);
    clearPendingFile();
  }

  const canSend =
    !disabled && !sending && (value.trim().length > 0 || Boolean(pendingFile));

  const pendingFileConfig = pendingFile
    ? getFileTypeConfig(pendingFile.name, pendingFile.type)
    : null;

  return (
    <div className="relative bg-white/95 backdrop-blur-sm p-3 transition-all duration-200">
      {/* Upload Progress Bar (when uploading an attachment) */}
      {sending && pendingFile && (
        <div className="mb-2 animate-fade-in">
          <UploadProgressPill
            progress={uploadProgress}
            isPaused={isPaused}
            fileName={pendingFile.name}
            onPauseToggle={() => setIsPaused((p) => !p)}
            onCancel={handleCancelUpload}
          />
        </div>
      )}

      {/* Attachment Thumbnail Preview (before sending) */}
      {pendingFile && !sending && (
        <div className="mb-2 flex items-center justify-between rounded-2xl border border-gray-200 bg-slate-50/80 p-2.5 shadow-2xs animate-slide-up">
          <div className="flex items-center gap-3 overflow-hidden">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="พรีวิวรูปภาพ"
                className="h-12 w-12 shrink-0 rounded-xl object-cover border border-gray-200 shadow-2xs"
              />
            ) : (
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${pendingFileConfig?.gradient} text-white shadow-2xs`}
              >
                <span className="material-symbols-outlined text-[26px]">
                  {pendingFileConfig?.icon}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-800">
                {pendingFile.name}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="text-[11px] text-gray-500">
                  {formatFileSize(pendingFile.size)}
                </p>
                {!previewUrl && pendingFileConfig && (
                  <>
                    <span className="text-[10px] text-gray-300">•</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${pendingFileConfig.pillBg} ${pendingFileConfig.pillText}`}
                    >
                      {pendingFileConfig.ext}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={clearPendingFile}
            aria-label="ลบไฟล์ที่แนบ"
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
          >
            <span
              className="material-symbols-outlined text-[18px]"
              aria-hidden="true"
            >
              close
            </span>
          </button>
        </div>
      )}

      {/* Remaining character counter */}
      {value.length >= COUNTER_VISIBLE_FROM && (
        <p
          className={`pb-1 text-right text-[11px] ${
            remaining === 0 ? "font-semibold text-red-600" : "text-gray-400"
          }`}
          role="status"
        >
          เหลือ {remaining.toLocaleString("th-TH")} ตัวอักษร
        </p>
      )}

      {/* Composer Input Bar */}
      <div className="flex items-end gap-2">
        {onAttach && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              aria-label="แนบรูปภาพหรือไฟล์"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-emerald-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span
                className="material-symbols-outlined text-[22px]"
                aria-hidden="true"
              >
                attach_file
              </span>
            </button>
          </>
        )}

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            disabled={disabled || sending}
            rows={1}
            placeholder={
              pendingFile ? "เพิ่มคำบรรยายรูปภาพ..." : "พิมพ์ข้อความ..."
            }
            aria-label="พิมพ์ข้อความ"
            maxLength={MAX_MESSAGE_LENGTH}
            className="block w-full resize-none rounded-2xl border border-gray-250 bg-gray-50/70 px-4 py-[10px] text-sm leading-[22px] text-gray-900 transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-100 disabled:text-gray-400"
            style={{ height: "44px", minHeight: "44px", maxHeight: "120px" }}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-xs transition-all active:scale-95 focus:outline-none disabled:cursor-not-allowed disabled:shadow-none ${
            canSend
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-slate-200 text-slate-400"
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] translate-x-[1px]"
            aria-hidden="true"
          >
            send
          </span>
          <span className="sr-only">ส่งข้อความ</span>
        </button>
      </div>
    </div>
  );
}
