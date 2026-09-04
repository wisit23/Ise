"use client";

import { useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "../../lib/chat";

const TYPING_STOP_DELAY_MS = 2000;

// Only worth showing a counter once the limit is actually in sight —
// a permanent "0 / 4,000" on an empty box is noise.
const COUNTER_VISIBLE_FROM = MAX_MESSAGE_LENGTH - 200;

/** Enter sends, Shift+Enter inserts a newline — the same convention every
 * chat app uses, so no on-screen hint is needed for it.
 *
 * `onTyping` is optional (the inbox never passes it, only the live room
 * page does) and fires at most once per typing burst plus once when it
 * stops — not on every keystroke — so a socket-connected caller isn't
 * spamming a "typing:start" event per character.
 *
 * `onAttach` is optional too: pass it and the paperclip appears, omit it and
 * the composer is text-only. Anything already typed is handed over as the
 * attachment's caption rather than being discarded. */
export default function MessageComposer({
  onSend,
  onAttach,
  onTyping,
  disabled,
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const remaining = MAX_MESSAGE_LENGTH - value.length;

  function handleChange(e) {
    // Hard stop rather than letting the box overflow and failing at send
    // time: `maxLength` on the textarea already blocks typing past the
    // limit, but a paste in some browsers can exceed it.
    setValue(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
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

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    stopTypingNow();
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } catch {
      // Swallowed deliberately — the draft text stays in the box so nothing
      // typed is lost, and any user-facing error message is the caller's
      // responsibility (the chat room page shows one via its own error
      // state). The composer's only job on failure is to not crash and to
      // let the user try sending again.
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Whatever is already typed rides along as the attachment's caption, so a
  // user who typed a note and then picked a photo doesn't lose the note or
  // have to send it as a separate message.
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the SAME file again still fires a change
    // event (browsers suppress it when the value is unchanged).
    e.target.value = "";
    if (!file || !onAttach || sending || disabled) return;

    stopTypingNow();
    setSending(true);
    try {
      await onAttach(file, value.trim());
      setValue("");
    } catch {
      // Same reasoning as submit(): the caller surfaces the error, the
      // composer's job is only to stay usable.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white">
      {value.length >= COUNTER_VISIBLE_FROM && (
        <p
          className={`px-3 pt-2 text-right text-xs ${remaining === 0 ? "font-medium text-red-600" : "text-gray-500"}`}
          role="status"
        >
          เหลือ {remaining.toLocaleString("th-TH")} ตัวอักษร
        </p>
      )}
      <div className="flex items-end gap-2 p-3">
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
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className="material-symbols-outlined text-[20px]"
                aria-hidden="true"
              >
                attach_file
              </span>
            </button>
          </>
        )}
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          rows={1}
          placeholder="พิมพ์ข้อความ..."
          aria-label="พิมพ์ข้อความ"
          maxLength={MAX_MESSAGE_LENGTH}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || sending || !value.trim()}
          className="flex h-[42px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <span
            className="material-symbols-outlined text-[18px]"
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
