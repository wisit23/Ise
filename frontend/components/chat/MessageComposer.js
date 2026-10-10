"use client";

import { useEffect, useRef, useState } from "react";
import useCustomerServiceConfig from "../support/hooks/useCustomerServiceConfig";
import { getFileTypeConfig } from "../../lib/fileIcons";
import {
  readCaseDraft,
  saveCaseDraft,
  readDraftFile,
  saveDraftFile,
} from "../../lib/caseDrafts";

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Enter sends, Shift+Enter inserts a newline.
 *
 * `onTyping` starts each burst, refreshes it at most once per 1.5 seconds,
 * and stops on idle, send or unmount.
 *
 * `onAttach` shows the paperclip button. When a file is picked:
 * - A preview thumbnail card appears with file name, size, and a remove button.
 * - The user can type a caption.
 * - Pressing Send (or Enter) uploads the file with an indeterminate sending status.
 */
export default function MessageComposer({
  onSend,
  onAttach,
  onTyping,
  onFocus,
  disabled,
  draftKey,
  onBusyChange,
}) {
  const config = useCustomerServiceConfig();
  const MAX_MESSAGE_LENGTH = config.chat.maxMessageLength;
  const COUNTER_VISIBLE_FROM = Math.max(0, MAX_MESSAGE_LENGTH - 200);
  const TYPING_STOP_DELAY_MS = config.timing.typingStopMs;
  const [attachmentError, setAttachmentError] = useState("");
  const [value, setValue] = useState(() => readCaseDraft(draftKey));
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState(() => readDraftFile(draftKey));
  const [previewUrl, setPreviewUrl] = useState(null);

  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const typingHeartbeatRef = useRef(0);
  const typingCallbackRef = useRef(onTyping);
  typingCallbackRef.current = onTyping;
  const restoreFocusRef = useRef(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const sendButtonRef = useRef(null);

  useEffect(() => {
    if (!sending && !disabled && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      if (
        [document.body, textareaRef.current, sendButtonRef.current].includes(
          document.activeElement,
        )
      ) {
        textareaRef.current?.focus({ preventScroll: true });
      }
    }
  }, [sending, disabled]);
  useEffect(
    () => () => {
      clearTimeout(typingTimeoutRef.current);
      if (typingActiveRef.current) typingCallbackRef.current?.(false);
    },
    [],
  );
  const remaining = MAX_MESSAGE_LENGTH - value.length;
  useEffect(() => {
    saveCaseDraft(draftKey, value);
  }, [draftKey, value]);
  useEffect(() => {
    saveDraftFile(draftKey, pendingFile);
  }, [draftKey, pendingFile]);
  useEffect(() => {
    onBusyChange?.(sending);
  }, [sending, onBusyChange]);

  // Clean up object URL when component unmounts or pending file changes
  useEffect(() => {
    return () => {
      if (previewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewUrl);
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
    if (
      !typingActiveRef.current ||
      Date.now() - typingHeartbeatRef.current > config.timing.typingHeartbeatMs
    ) {
      typingActiveRef.current = true;
      typingHeartbeatRef.current = Date.now();
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
    restoreFocusRef.current = true;
    setSending(true);

    if (pendingFile && onAttach) {
      try {
        await onAttach(pendingFile, trimmed);
        saveCaseDraft(draftKey, "");
        saveDraftFile(draftKey, null);
        clearPendingFile();
        setValue("");
        if (textareaRef.current) textareaRef.current.style.height = "44px";
      } catch {
        // Keep file and caption on failure so user can retry
      } finally {
        setSending(false);
      }
    } else {
      // Regular text send
      if (!draftKey) setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "44px";
        textareaRef.current.focus();
      }
      try {
        await onSend(trimmed);
        if (draftKey) {
          saveCaseDraft(draftKey, "");
          setValue("");
        }
      } catch {
        if (!draftKey)
          setValue((draft) => (draft ? `${value}\n${draft}` : value));
      } finally {
        setSending(false);
      }
    }
  }

  function handleKeyDown(e) {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      submit();
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onAttach || sending || disabled) return;

    if (
      !config.chat.mimeTypes.includes(file.type) ||
      file.size > config.chat.maxFileBytes
    ) {
      setAttachmentError(
        `เลือกไฟล์ชนิดที่รองรับ ขนาดไม่เกิน ${Math.round(config.chat.maxFileBytes / (1024 * 1024))} MB`,
      );
      return;
    }
    setAttachmentError("");
    clearPendingFile();
    setPendingFile(file);

    if (
      file.type.startsWith("image/") &&
      typeof URL.createObjectURL === "function"
    ) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  const canSend =
    !disabled && !sending && (value.trim().length > 0 || Boolean(pendingFile));

  const pendingFileConfig = pendingFile
    ? getFileTypeConfig(pendingFile.name, pendingFile.type)
    : null;

  return (
    <div className="relative bg-white/95 backdrop-blur-sm p-3 transition-all duration-200">
      {attachmentError && (
        <p role="alert" className="px-3 text-xs text-red-700">
          {attachmentError}
        </p>
      )}
      {/* Upload Progress Bar (when uploading an attachment) */}
      {sending && pendingFile && (
        <div className="mb-2 animate-fade-in">
          <p
            role="status"
            className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"
          >
            กำลังส่งไฟล์ {pendingFile.name}… กรุณารอผลการส่ง
          </p>
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
              accept={config.chat.mimeTypes.join(",")}
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
            disabled={
              disabled ||
              (sending && (Boolean(pendingFile) || Boolean(draftKey)))
            }
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
          ref={sendButtonRef}
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
