"use client";

import { useState, useEffect, useCallback } from "react";
import { mediaUrl } from "../lib/api";

export default function ReviewMediaGallery({ media = [] }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const items = Array.isArray(media) ? media : [];
  const isOpen = activeIndex !== null && items[activeIndex] !== undefined;
  const current = isOpen ? items[activeIndex] : null;

  const handleClose = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const handlePrev = useCallback(
    (e) => {
      e?.stopPropagation();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    },
    [items.length],
  );

  const handleNext = useCallback(
    (e) => {
      e?.stopPropagation();
      setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    },
    [items.length],
  );

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
    }

    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose, handlePrev, handleNext]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <button
            key={item.url + idx}
            type="button"
            onClick={() => setActiveIndex(idx)}
            className="group relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 transition hover:opacity-90 hover:ring-2 hover:ring-emerald-500 focus:outline-none sm:h-20 sm:w-20"
            aria-label={`เปิดดู${item.type === "video" ? "วิดีโอ" : "รูปภาพ"}ที่ ${idx + 1}`}
          >
            {item.type === "video" ? (
              <div className="relative h-full w-full bg-black">
                <video
                  src={mediaUrl(item.url)}
                  className="h-full w-full object-cover"
                  muted
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white group-hover:scale-110 transition-transform">
                  ▶
                </span>
              </div>
            ) : (
              <img
                src={mediaUrl(item.url)}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            )}
          </button>
        ))}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={handleClose}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
            <span className="text-xs font-medium text-white/80">
              {activeIndex + 1} / {items.length}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white transition hover:bg-white/25 focus:outline-none"
              aria-label="ปิดหน้าต่างรูปภาพ"
            >
              ×
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[80vh] max-w-4xl flex-col items-center justify-center"
          >
            {current.type === "video" ? (
              <video
                key={current.url}
                src={mediaUrl(current.url)}
                controls
                autoPlay
                className="max-h-[75vh] w-auto max-w-full rounded-lg shadow-2xl bg-black"
              />
            ) : (
              <img
                key={current.url}
                src={mediaUrl(current.url)}
                alt="รีวิวรูปภาพขยาย"
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
              />
            )}

            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute -left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/90 sm:-left-12"
                  aria-label="ก่อนหน้า"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    chevron_left
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute -right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/90 sm:-right-12"
                  aria-label="ถัดไป"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    chevron_right
                  </span>
                </button>
              </>
            )}
          </div>

          {items.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex gap-2 overflow-x-auto max-w-full px-2"
            >
              {items.map((item, idx) => (
                <button
                  key={item.url + idx}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition ${
                    idx === activeIndex
                      ? "border-emerald-500 ring-2 ring-emerald-500/50"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  {item.type === "video" ? (
                    <div className="relative h-full w-full bg-black">
                      <video
                        src={mediaUrl(item.url)}
                        className="h-full w-full object-cover"
                        muted
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white">
                        ▶
                      </span>
                    </div>
                  ) : (
                    <img
                      src={mediaUrl(item.url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
