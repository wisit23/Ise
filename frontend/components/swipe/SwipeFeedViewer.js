"use client";

import { useEffect, useRef, useState } from "react";
import SwipeVideoCard from "./SwipeVideoCard";

const SWIPE_THRESHOLD_PX = 50;

export default function SwipeFeedViewer({ videos, initialVideoId }) {
  const containerRef = useRef(null);
  const touchStartRef = useRef(null);
  const initialSyncRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  function clampIndex(index) {
    return Math.min(videos.length - 1, Math.max(0, index));
  }

  function updateActiveVideo() {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0) return;

    setActiveIndex(
      clampIndex(Math.round(container.scrollTop / container.clientHeight)),
    );
  }

  function moveTo(index) {
    const container = containerRef.current;
    if (!container) return;

    const nextIndex = clampIndex(index);
    setActiveIndex(nextIndex);
    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: nextIndex * container.clientHeight,
        behavior: "smooth",
      });
    }
  }

  // Restore target clip from deep link (initialVideoId) on initial load
  useEffect(() => {
    if (!videos || videos.length === 0 || initialSyncRef.current) return;
    initialSyncRef.current = true;

    if (initialVideoId) {
      const matchIndex = videos.findIndex(
        (v) => String(v.id) === String(initialVideoId),
      );
      if (matchIndex > 0) {
        setActiveIndex(matchIndex);
        const container = containerRef.current;
        if (container && typeof container.scrollTo === "function") {
          container.scrollTo({
            top: matchIndex * container.clientHeight,
            behavior: "instant",
          });
        }
      }
      // If matchIndex <= 0 or not found (-1), activeIndex remains 0 (fallback)
    }
  }, [videos, initialVideoId]);

  // Keep browser URL query param in sync with the active clip without polluting history stack
  useEffect(() => {
    if (!videos || videos.length === 0 || typeof window === "undefined") return;
    const currentVideo = videos[activeIndex];
    if (!currentVideo) return;

    try {
      if (window.location.pathname.includes("/swipe")) {
        const url = new URL(window.location.href);
        if (url.searchParams.get("video") !== String(currentVideo.id)) {
          url.searchParams.set("video", currentVideo.id);
          window.history.replaceState(
            null,
            "",
            `${url.pathname}?${url.searchParams.toString()}`,
          );
        }
      }
    } catch {
      // Safe fallback for environments with non-standard window.location
    }
  }, [activeIndex, videos]);

  function handleTouchStart(event) {
    touchStartRef.current = {
      y: event.touches[0].clientY,
      index: activeIndex,
    };
  }

  function handleTouchEnd(event) {
    const touchStart = touchStartRef.current;
    touchStartRef.current = null;
    if (!touchStart || event.changedTouches.length === 0) return;

    const distance = touchStart.y - event.changedTouches[0].clientY;
    if (Math.abs(distance) < SWIPE_THRESHOLD_PX) return;

    moveTo(touchStart.index + (distance > 0 ? 1 : -1));
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      moveTo(activeIndex + 1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      moveTo(activeIndex - 1);
    }
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Scroll feed container */}
      <div
        ref={containerRef}
        onScroll={updateActiveVideo}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartRef.current = null;
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="ฟีดวิดีโอสินค้า ปัดขึ้นหรือลงเพื่อเปลี่ยนคลิป"
        className="scrollbar-none relative h-full w-full snap-y snap-mandatory scroll-smooth overflow-y-auto overscroll-contain bg-black shadow-2xl outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 sm:w-auto"
      >
        {videos.map((video, index) => (
          <SwipeVideoCard
            key={video.id}
            video={video}
            isActive={index === activeIndex}
          />
        ))}
      </div>

      {/* Desktop Floating Navigation Arrows (Right edge of stage, safe distance from action rail) */}
      <div className="hidden lg:flex fixed right-6 xl:right-10 top-1/2 z-40 -translate-y-1/2 flex-col items-center gap-3 select-none">
        <button
          type="button"
          onClick={() => moveTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          aria-label="คลิปก่อนหน้า"
          className="focus-ring flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-zinc-900/90 text-white backdrop-blur-md border border-zinc-700/60 shadow-xl transition hover:bg-brand-600 hover:border-brand-500 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-zinc-900 disabled:hover:scale-100"
        >
          <svg
            className="h-6 w-6 stroke-current stroke-2 fill-none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 15l7-7 7 7"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => moveTo(activeIndex + 1)}
          disabled={activeIndex === videos.length - 1}
          aria-label="คลิปถัดไป"
          className="focus-ring flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-zinc-900/90 text-white backdrop-blur-md border border-zinc-700/60 shadow-xl transition hover:bg-brand-600 hover:border-brand-500 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-zinc-900 disabled:hover:scale-100"
        >
          <svg
            className="h-6 w-6 stroke-current stroke-2 fill-none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
