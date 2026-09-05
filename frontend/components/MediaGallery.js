"use client";

import { useState } from "react";
import { mediaUrl } from "../lib/api";

export default function MediaGallery({ media, alt }) {
  const [active, setActive] = useState(0);
  const items = media && media.length > 0 ? media : [];
  const current = items[active];

  return (
    <div>
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {current ? (
          current.type === "video" ? (
            <video
              key={current.url}
              src={mediaUrl(current.url)}
              controls
              className="h-full w-full object-contain bg-black"
            />
          ) : (
            <img
              src={mediaUrl(current.url)}
              alt={alt}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <span className="text-gray-500">ไม่มีรูปภาพ</span>
        )}
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {items.map((item, index) => (
            <button
              key={item.url + index}
              onClick={() => setActive(index)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
                index === active ? "border-emerald-600" : "border-transparent"
              }`}
            >
              {item.type === "video" ? (
                <>
                  <video
                    src={mediaUrl(item.url)}
                    className="h-full w-full object-cover"
                    muted
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs">
                    ▶
                  </span>
                </>
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
  );
}
