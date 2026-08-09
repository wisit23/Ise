"use client";

import { useRef, useState } from "react";
import SwipeVideoCard from "./SwipeVideoCard";

export default function SwipeFeedViewer({ videos }) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function updateActiveVideo() {
    const container = containerRef.current;
    if (!container || container.clientHeight === 0) return;

    const nextIndex = Math.round(container.scrollTop / container.clientHeight);
    setActiveIndex(Math.min(videos.length - 1, Math.max(0, nextIndex)));
  }

  function moveTo(index) {
    const container = containerRef.current;
    const nextIndex = Math.min(videos.length - 1, Math.max(0, index));
    if (!container) return;

    setActiveIndex(nextIndex);
    container.scrollTo({
      top: nextIndex * container.clientHeight,
      behavior: "smooth",
    });
  }

  return (
    <>
      <div
        ref={containerRef}
        onScroll={updateActiveVideo}
        className="scrollbar-none relative h-[80vh] max-h-[750px] w-full max-w-[500px] snap-y snap-mandatory scroll-smooth overflow-y-scroll rounded-2xl border border-zinc-800 bg-black shadow-2xl"
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
