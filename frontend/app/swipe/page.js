"use client";

import { useEffect, useState } from "react";
import NavBar from "../../components/NavBar";
import SwipeFeedViewer from "../../components/swipe/SwipeFeedViewer";
import { apiFetch } from "../../lib/api";

export default function SwipeFeed() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    apiFetch("/api/products/videos/feed?limit=20")
      .then((data) => {
        if (isMounted) setVideos(data.items || []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
          <SwipeFeedViewer videos={videos} />
        )}
      </div>
    </div>
  );
}
