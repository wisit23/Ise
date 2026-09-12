"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchProduct } from "../../lib/products";
import { mediaUrl } from "../../lib/api";

const STATUS_CONFIG = {
  available: {
    label: "พร้อมขาย",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  reserved: {
    label: "ถูกจองแล้ว",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  sold: {
    label: "ขายแล้ว",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
};

export default function ChatProductHeader({ productId }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(Boolean(productId));

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchProduct(productId)
      .then((p) => {
        if (!cancelled) {
          setProduct(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!productId || (!loading && !product)) return null;

  if (loading && !product) {
    return (
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-xs text-gray-400">
        <span className="h-9 w-9 animate-pulse rounded-lg bg-gray-200" />
        <div className="flex-1 space-y-1">
          <div className="h-3.5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  const thumbUrl = product.media?.[0]?.url
    ? mediaUrl(product.media[0].url)
    : null;
  const statusInfo = STATUS_CONFIG[product.status] || STATUS_CONFIG.available;

  return (
    <div className="shrink-0 sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-100 bg-white/95 px-4 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        {/* Product Image / Thumbnail */}
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">
              <span className="material-symbols-outlined text-[20px]">
                checkroom
              </span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-gray-900">
              {product.title}
            </h2>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusInfo.className}`}
            >
              {statusInfo.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-bold text-emerald-600">
            ฿{Number(product.price || 0).toLocaleString("th-TH")}
          </p>
        </div>
      </div>

      {/* View Listing CTA */}
      <Link
        href={`/products/${product.id}`}
        className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs transition hover:border-emerald-500 hover:bg-emerald-50"
      >
        <span>ดูสินค้า</span>
        <span
          className="material-symbols-outlined text-[15px]"
          aria-hidden="true"
        >
          open_in_new
        </span>
      </Link>
    </div>
  );
}
