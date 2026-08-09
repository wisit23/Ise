"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import { apiFetch, mediaUrl } from "../../lib/api";

export default function SwipeFeed() {
  const containerRef = useRef(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/products/videos/feed?limit=20")
      .then((data) => setVideos(data.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleScroll(direction) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({
      top: direction === "up" ? -el.clientHeight : el.clientHeight,
      behavior: "smooth",
    });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <div className="z-50 w-full shrink-0 bg-white shadow-sm">
        <NavBar />
      </div>

      <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden bg-black">
        {loading ? (
          <div className="animate-pulse text-lg text-gray-300">
            กำลังโหลดวิดีโอรีวิว...
          </div>
        ) : error ? (
          <div className="text-lg text-red-400">
            เกิดข้อผิดพลาดในการโหลดข้อมูล: {error}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center text-gray-400">
            <p className="mb-2 text-xl font-semibold">
              ยังไม่มีวิดีโอรีวิวในระบบ
            </p>
            <p className="text-sm">
              ผู้ขายสามารถลงคลิปรีวิวสินค้าได้จากระบบจัดการร้านค้า
            </p>
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              className="scrollbar-none relative h-[80vh] max-h-[750px] w-full max-w-[500px] snap-y snap-mandatory scroll-smooth overflow-y-scroll rounded-2xl border border-zinc-800 bg-black shadow-2xl"
            >
              {videos.map((vid) => (
                <div
                  key={vid.id}
                  className="relative flex h-full w-full shrink-0 snap-start items-center justify-center"
                >
                  <video
                    src={mediaUrl(vid.videoUrl)}
                    className="h-full w-full object-contain"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />

                  <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 font-bold text-white">
                        {vid.sellerName ? vid.sellerName.charAt(0) : "R"}
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        @{vid.sellerName || "Reloop Store"}
                      </h3>
                    </div>
                    {vid.description && (
                      <p className="mb-4 line-clamp-2 text-sm text-gray-200">
                        {vid.description}
                      </p>
                    )}

                    {vid.product && (
                      <Link href={`/products/${vid.productId}`}>
                        <button className="rounded-lg bg-emerald-600 px-6 py-2.5 font-bold text-white shadow-md transition hover:bg-emerald-700">
                          🛒 ดูรายละเอียดสินค้า
                          {vid.product.price
                            ? ` (฿${vid.product.price.toLocaleString("th-TH")})`
                            : ""}
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="absolute right-4 top-1/2 z-40 flex -translate-y-1/2 transform flex-col gap-4 sm:right-8">
              <button
                onClick={() => handleScroll("up")}
                aria-label="คลิปก่อนหน้า"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white shadow-lg transition hover:bg-zinc-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="h-7 w-7"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 15.75l7.5-7.5 7.5 7.5"
                  />
                </svg>
              </button>

              <button
                onClick={() => handleScroll("down")}
                aria-label="คลิปถัดไป"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white shadow-lg transition hover:bg-zinc-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="h-7 w-7"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
