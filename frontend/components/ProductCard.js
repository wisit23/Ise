"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "../lib/api";
import { fetchConditions } from "../lib/catalog";

const CONDITION_STYLE = {
  New: "bg-emerald-50 text-emerald-700",
  "Like New": "bg-emerald-50 text-emerald-700",
  Good: "bg-sky-50 text-sky-700",
  Fair: "bg-amber-50 text-amber-700",
};

export default function ProductCard({ product }) {
  const cover = product.media?.[0];
  const [conditionLabels, setConditionLabels] = useState({});

  useEffect(() => {
    fetchConditions()
      .then((items) =>
        setConditionLabels(
          Object.fromEntries(items.map((c) => [c.value, c.label])),
        ),
      )
      .catch(() => {});
  }, []);

  return (
    <Link
      href={`/products/${product.id}`}
      className="focus-ring group flex flex-col overflow-hidden rounded-lg border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
        {cover ? (
          cover.type === "video" ? (
            <video
              src={mediaUrl(cover.url)}
              className="h-full w-full object-cover transition group-hover:scale-105"
              muted
            />
          ) : (
            <img
              src={mediaUrl(cover.url)}
              alt={product.title}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          )
        ) : (
          <div className="text-ink-subtle flex h-full w-full flex-col items-center justify-center gap-1">
            <span
              className="material-symbols-outlined text-[28px] leading-none"
              aria-hidden="true"
            >
              image_not_supported
            </span>
            <span className="text-xs">ไม่มีรูปภาพ</span>
          </div>
        )}
        {product.condition && (
          <span
            className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              CONDITION_STYLE[product.condition] || "bg-gray-100 text-gray-600"
            }`}
          >
            {conditionLabels[product.condition] || product.condition}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm text-gray-800">{product.title}</p>
        <p className="mt-auto text-base font-semibold text-brand-600">
          ฿{product.price.toLocaleString("th-TH")}
        </p>
        <div className="text-ink-subtle flex items-center justify-between text-xs">
          <span>{product.category}</span>
          {product.location && (
            <span className="truncate">{product.location}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
