"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// Concentric rings of dots around the drop target, densest and boldest
// nearest the centre. Alternate rings sit half a step round so the dots
// interleave instead of lining up in spokes.
const HALO_RINGS = Array.from({ length: 5 }, (_, i) => {
  const r = 72 + i * 20;
  const count = Math.round((2 * Math.PI * r) / (21 + i * 4));
  const offset = i % 2 ? Math.PI / count : 0;
  return {
    dotR: 4.4 - i * 0.6,
    opacity: 0.95 - i * 0.16,
    dots: Array.from({ length: count }, (_, j) => {
      const a = (j / count) * 2 * Math.PI + offset;
      return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
    }),
  };
});

function DropHalo({ valid, size }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="-170 -170 340 340"
      width={size}
      height={size}
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-colors duration-300 ${
        valid ? "fill-emerald-500" : "fill-red-400"
      }`}
    >
      <circle r="64" className="opacity-[0.14]" />
      {HALO_RINGS.map((ring, i) => (
        <g
          key={i}
          opacity={ring.opacity}
          className="animate-halo-ripple motion-reduce:animate-none"
          style={{
            animationDelay: `${i * 0.14}s`,
            transformBox: "fill-box",
            transformOrigin: "center",
          }}
        >
          {ring.dots.map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={ring.dotR} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.88c.53 0 1.04.21 1.41.59L12.21 6h6.29A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
      <path
        d="M12 16.5v-6m0 0-2.5 2.5M12 10.5l2.5 2.5"
        fill="none"
        className="stroke-emerald-600"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BlockedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-10 w-10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="m6.5 6.5 11 11" />
    </svg>
  );
}

/** What the drop zone shows while a file is dragged over it: a dot halo
 * rippling out from a round upload button, then a title and hint. Red when
 * the dragged file's type can't be attached. Pointer events pass through so
 * it never steals the drag from the zone underneath. `compact` is the
 * smaller version for when the composer alone is the zone. */
function DropPanel({ valid, maxMb, compact = false }) {
  const halo = compact ? 150 : 300;
  return (
    <div
      role="status"
      className="pointer-events-none flex animate-drop-zone-in flex-col items-center text-center motion-reduce:animate-none"
    >
      <div className="relative" style={{ width: halo, height: halo * 0.94 }}>
        <DropHalo valid={valid} size={halo} />
        <div
          className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors duration-300 ${
            compact ? "h-12 w-12 [&_svg]:h-6 [&_svg]:w-6" : "h-24 w-24"
          } ${
            valid
              ? "bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_12px_28px_-8px_rgba(5,150,105,0.55)]"
              : "bg-gradient-to-b from-red-400 to-red-600 shadow-[0_12px_28px_-8px_rgba(220,38,38,0.5)]"
          }`}
        >
          <div className="animate-float-soft motion-reduce:animate-none">
            {valid ? <UploadIcon /> : <BlockedIcon />}
          </div>
        </div>
      </div>
      <p
        className={`font-display font-semibold tracking-tight text-slate-900 ${
          compact ? "mt-1 text-base" : "mt-2 text-[1.75rem] leading-tight"
        }`}
      >
        {valid ? "วางไฟล์เพื่อแนบ" : "ไฟล์ชนิดนี้แนบไม่ได้"}
      </p>
      <p className={`text-slate-500 ${compact ? "mt-0.5 text-xs" : "mt-2 text-sm"}`}>
        {valid ? (
          <>
            ส่งใน<span className="font-medium text-emerald-600">แชทนี้</span>{" "}
            · รูปภาพหรือไฟล์ ไม่เกิน {maxMb} MB
          </>
        ) : (
          "ลองเลือกรูปภาพหรือไฟล์ชนิดที่รองรับ"
        )}
      </p>
    </div>
  );
}

/** Frosts the whole chat panel (`rect`, measured when the drag entered) and
 * holds the DropPanel in its centre. Sits above the support drawer
 * (z-drawer 100) but below modals (z-modal 200). */
function DropOverlay({ rect, children }) {
  return (
    <div
      className="pointer-events-none fixed z-[150] flex animate-fade-in items-center justify-center overflow-hidden rounded-2xl bg-white/80 p-6 backdrop-blur-md motion-reduce:animate-none"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      {children}
    </div>
  );
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
 * Pasting an image into the textarea, or dropping a file anywhere on the
 * chat panel, attaches it the same way.
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
  // null, or { valid, rect } while a file is dragged over the chat panel;
  // rect is null when the composer alone is the drop zone.
  const [drag, setDrag] = useState(null);
  const rootRef = useRef(null);
  const dragDepthRef = useRef(0);
  const dragZoneRef = useRef(null);
  const dragValidRef = useRef(true);
  const pageDragRef = useRef(false);

  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const typingHeartbeatRef = useRef(0);
  const typingCallbackRef = useRef(onTyping);
  typingCallbackRef.current = onTyping;
  const restoreFocusRef = useRef(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const sendButtonRef = useRef(null);
  const sendingRef = useRef(false);

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
    if ((!trimmed && !pendingFile) || sendingRef.current || disabled) return;

    sendingRef.current = true;
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
        sendingRef.current = false;
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
        sendingRef.current = false;
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
    acceptFile(file);
  }

  /** A pasted image (e.g. a screenshot) becomes the pending attachment, the
   * same as picking it with the paperclip. Plain-text pastes fall through. */
  function handlePaste(e) {
    if (!onAttach) return;
    const item = Array.from(e.clipboardData?.items ?? []).find(
      (i) => i.kind === "file" && i.type.startsWith("image/"),
    );
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    acceptFile(file);
  }

  /** Dragging a file over the chat panel shows the drop overlay; dropping it
   * attaches it. The panel is the nearest ancestor that also holds the
   * MessageList (marked `data-chat-messages`), so every page that pairs the
   * two gets a panel-wide drop zone without wiring anything up. Without a
   * list nearby, the composer itself is the zone.
   *
   * Listening on `document` (filtered to the zone) means the zone is found
   * at drag time, after the page has rendered its list. A depth counter keeps
   * the overlay steady while the pointer crosses child elements, which fire
   * their own enter/leave pairs. Refs, not state, drive the logic because
   * several drag events can land before React re-renders. */
  function findDropZone() {
    const root = rootRef.current;
    for (let el = root?.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.querySelector("[data-chat-messages]")) return el;
    }
    return root;
  }

  function isFileDrag(e) {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  // Dragging a photo that is already on the page (a chat image, a product
  // shot) also reports "Files" in Chrome, so a slight accidental drag would
  // attach it. Only drags from outside the page count: those never fire
  // dragstart in this document.
  function handleDragStart() {
    pageDragRef.current = true;
  }

  function handleDragEnd() {
    pageDragRef.current = false;
  }

  function endDrag() {
    dragDepthRef.current = 0;
    dragZoneRef.current = null;
    setDrag(null);
  }

  function handleDragEnter(e) {
    if (dragDepthRef.current > 0) {
      if (dragZoneRef.current.contains(e.target)) dragDepthRef.current += 1;
      return;
    }
    if (!onAttach || sending || disabled || pageDragRef.current) return;
    if (!isFileDrag(e)) return;
    const zone = findDropZone();
    if (!zone?.contains(e.target)) return;

    e.preventDefault();
    dragDepthRef.current = 1;
    dragZoneRef.current = zone;
    // Some browsers hide the type until drop; only an explicitly
    // unsupported type turns the overlay red.
    const type = Array.from(e.dataTransfer.items ?? []).find(
      (i) => i.kind === "file",
    )?.type;
    dragValidRef.current = !type || config.chat.mimeTypes.includes(type);
    setDrag({
      valid: dragValidRef.current,
      rect: zone === rootRef.current ? null : zone.getBoundingClientRect(),
    });
  }

  function handleDragOver(e) {
    if (dragDepthRef.current === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragValidRef.current ? "copy" : "none";
  }

  function handleDragLeave(e) {
    if (dragDepthRef.current === 0 || !dragZoneRef.current.contains(e.target))
      return;
    dragDepthRef.current -= 1;
    if (dragDepthRef.current === 0) endDrag();
  }

  function handleDrop(e) {
    if (dragDepthRef.current === 0) return;
    const inZone = dragZoneRef.current.contains(e.target);
    endDrag();
    if (!inZone) return;
    e.preventDefault();
    acceptFile(e.dataTransfer.files?.[0]);
  }

  const dropHandlersRef = useRef(null);
  dropHandlersRef.current = {
    dragstart: handleDragStart,
    dragend: handleDragEnd,
    dragenter: handleDragEnter,
    dragover: handleDragOver,
    dragleave: handleDragLeave,
    drop: handleDrop,
  };
  useEffect(() => {
    const types = Object.keys(dropHandlersRef.current);
    const listener = (e) => dropHandlersRef.current[e.type](e);
    types.forEach((t) => document.addEventListener(t, listener));
    return () => types.forEach((t) => document.removeEventListener(t, listener));
  }, []);

  function acceptFile(file) {
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

  const maxFileMb = Math.round(config.chat.maxFileBytes / (1024 * 1024));
  const canSend =
    !disabled && !sending && (value.trim().length > 0 || Boolean(pendingFile));

  const pendingFileConfig = pendingFile
    ? getFileTypeConfig(pendingFile.name, pendingFile.type)
    : null;

  return (
    <div
      ref={rootRef}
      className={`relative bg-white/95 backdrop-blur-sm p-3 transition-all duration-200 ${
        !drag
          ? ""
          : drag.valid
            ? "shadow-[0_-12px_40px_-12px_rgba(16,185,129,0.45)]"
            : "shadow-[0_-12px_40px_-12px_rgba(239,68,68,0.4)]"
      }`}
    >
      {drag &&
        (drag.rect ? (
          // Portalled: this root's backdrop-blur would otherwise become the
          // containing block for `fixed` and pin the overlay to the composer.
          createPortal(
            <DropOverlay rect={drag.rect}>
              <DropPanel valid={drag.valid} maxMb={maxFileMb} />
            </DropOverlay>,
            document.body,
          )
        ) : (
          <div className="mb-2 flex justify-center">
            <DropPanel valid={drag.valid} maxMb={maxFileMb} compact />
          </div>
        ))}
      {attachmentError && (
        <p role="alert" className="px-3 text-xs text-red-700">
          {attachmentError}
        </p>
      )}
      {/* Upload Progress Bar (when uploading an attachment) */}
      {sending && !pendingFile && (
        <p role="status" className="px-3 pb-2 text-xs text-slate-600">
          กำลังส่งข้อความ… หากส่งถี่ ระบบจะรอแล้วส่งให้อัตโนมัติ
        </p>
      )}
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
            onPaste={handlePaste}
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
