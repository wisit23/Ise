"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { mediaUrl } from "../../lib/api";

export default function SwipeVideoCard({ video, isActive }) {
  const videoRef = useRef(null);

  // Only the visible clip plays. Pausing off-screen clips avoids decoding many
  // videos at once when the feed contains a full page of results.
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    if (isActive) {
      element.play().catch(() => {
        // Browsers may block autoplay; the native controls still let users play.
      });
    } else {
      element.pause();
    }
  }, [isActive]);

  const sellerName = video.sellerName || "Reloop Store";

  return (
    <article className="relative flex h-full w-full shrink-0 snap-start items-center justify-center">
      <video
        ref={videoRef}
        src={mediaUrl(video.videoUrl)}
        className="h-full w-full object-contain"
        preload={isActive ? "auto" : "metadata"}
        loop
        muted
        playsInline
        controls
      />

      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 font-bold text-white">
            {sellerName.charAt(0)}
          </div>
          <h2 className="text-lg font-bold text-white">@{sellerName}</h2>
        </div>

        {video.description && (
          <p className="mb-4 line-clamp-2 text-sm text-gray-200">
            {video.description}
          </p>
        )}

        {video.product && (
          <Link
            href={`/products/${video.productId}`}
            className="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 font-bold text-white shadow-md transition hover:bg-emerald-700"
          >
            ดูรายละเอียดสินค้า
            {video.product.price
              ? ` (฿${video.product.price.toLocaleString("th-TH")})`
              : ""}
          </Link>
        )}
      </div>
    </article>
  );
}
