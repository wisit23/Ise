"use client";

import { useRef, useState } from "react";
import SwipeVideoCard from "./SwipeVideoCard";

const SWIPE_THRESHOLD_PX = 50;

export default function SwipeFeedViewer({ videos }) {
  const containerRef = useRef(null);
  const touchStartRef = useRef(null);
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
    container.scrollTo({
      top: nextIndex * container.clientHeight,
      behavior: "smooth",
    });
  }

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
    <>
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
        className="scrollbar-none relative h-full min-h-0 w-full max-w-[500px] snap-y snap-mandatory scroll-smooth overflow-y-auto overscroll-contain bg-black shadow-2xl focus:outline-none sm:my-4 sm:h-[min(750px,calc(100%_-_2rem))] sm:rounded-2xl sm:border sm:border-zinc-800"
      >
        {videos.map((video, index) => (
          <SwipeVideoCard
            key={video.id}
            video={video}
            isActive={index === activeIndex}
          />
        ))}
      </div>

      <div className="absolute right-4 top-1/2 z-40 flex -translate-y-1/2 transform flex-col gap-4 sm:right-8">
        <button
          type="button"
          onClick={() => moveTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          aria-label="คลิปก่อนหน้า"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white shadow-lg transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-2xl">
            ↑
          </span>
        </button>

        <button
          type="button"
          onClick={() => moveTo(activeIndex + 1)}
          disabled={activeIndex === videos.length - 1}
          aria-label="คลิปถัดไป"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white shadow-lg transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-2xl">
            ↓
          </span>
        </button>
      </div>
    </>
  );
}
