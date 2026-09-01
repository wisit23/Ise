"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const ToastContext = createContext(null);

const TONES = {
  success: {
    cls: "border-success/30 bg-success-soft text-brand-800",
    icon: "check_circle",
  },
  error: { cls: "border-danger/30 bg-danger-soft text-red-800", icon: "error" },
  info: { cls: "border-info/30 bg-info-soft text-sky-800", icon: "info" },
  warning: {
    cls: "border-warning/30 bg-warning-soft text-amber-900",
    icon: "warning",
  },
};

const DEFAULT_DURATION = 4000;

/* Replaces native alert(), which froze the whole tab and looked nothing like
   the rest of the app. Mount once near the root of a screen; call useToast()
   anywhere beneath it. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone, message, duration = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list, { id, tone, message }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (m, d) => push("success", m, d),
      error: (m, d) => push("error", m, d),
      info: (m, d) => push("info", m, d),
      warning: (m, d) => push("warning", m, d),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live so the message is announced without stealing focus. */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const tone = TONES[t.tone] ?? TONES.info;
          return (
            <div
              key={t.id}
              className={`animate-slide-in-right pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${tone.cls}`}
            >
              <span
                className="material-symbols-outlined text-[20px] leading-none"
                aria-hidden="true"
              >
                {tone.icon}
              </span>
              <p className="flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="ปิดข้อความแจ้งเตือน"
                className="focus-ring -mr-1 rounded p-0.5 opacity-60 transition hover:opacity-100"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">
                  close
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside a <ToastProvider>");
  }
  return ctx;
}
