"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "../lib/api";
import { fetchConditions } from "../lib/catalog";
import { fetchSellerRating, fetchSellerSummary } from "../lib/sellers";

const CONDITION_STYLE = {
  New: "bg-brand-50 text-brand-700",
  "Like New": "bg-brand-50 text-brand-700",
  Good: "bg-sky-50 text-sky-700",
  Fair: "bg-amber-50 text-amber-700",
};

const DAY_MS = 86_400_000;

/** "ลงขายวันนี้" / "เมื่อวานนี้" / "N วันที่แล้ว" — freshness is a real decision
 * signal on a resale marketplace (a listing sitting for months is more likely
 * already gone or the price untested), and `createdAt` is real data, not a
 * guess. */
function freshnessLabel(createdAt) {
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / DAY_MS,
  );
  if (days <= 0) return "ลงขายวันนี้";
  if (days === 1) return "เมื่อวานนี้";
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  return `${months} เดือนที่แล้ว`;
}

/** Five Material Symbols stars, honouring a fractional rating (4.3 -> 4
 * filled + a clipped 5th). Uses the icon font's own FILL axis rather than
 * swapping two different icons, so a half-filled star doesn't shift
 * baseline. */
function RatingStars({ value }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block h-[13px] w-[13px]">
            <span
              className="material-symbols-outlined absolute inset-0 text-[13px] leading-none text-gray-300"
              style={{ fontVariationSettings: "'FILL' 0" }}
            >
              star
            </span>
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden text-[13px] leading-none text-amber-500"
                style={{ width: `${fill * 100}%` }}
              >
                <span
                  className="material-symbols-outlined text-[13px] leading-none"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  star
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * `showSeller` is off on the seller's own store page — that page already has
 * a full header naming the shop, so repeating it on every card is noise.
 */
export default function ProductCard({ product, showSeller = true }) {
  const cover = product.media?.[0];
  const altCover = product.media?.[1];
  const [conditionLabels, setConditionLabels] = useState({});
  const [seller, setSeller] = useState(null);
  const [rating, setRating] = useState(null);

  useEffect(() => {
    fetchConditions()
      .then((items) =>
        setConditionLabels(
          Object.fromEntries(items.map((c) => [c.value, c.label])),
        ),
      )
      .catch((err) => console.error("โหลดรายการสภาพสินค้าไม่สำเร็จ:", err));
  }, []);

  useEffect(() => {
    if (!showSeller || !product.sellerId) return;
    fetchSellerSummary(product.sellerId)
      .then(setSeller)
      .catch((err) => console.error("โหลดข้อมูลผู้ขายไม่สำเร็จ:", err));
    fetchSellerRating(product.sellerId)
      .then(setRating)
      .catch((err) => console.error("โหลดคะแนนผู้ขายไม่สำเร็จ:", err));
  }, [showSeller, product.sellerId]);

  const sellerName = seller?.shopName || seller?.firstName || null;
  const isVerifiedSeller = seller?.kycStatus === "VERIFIED";

  return (
    <Link
      href={`/products/${product.id}`}
      className="focus-ring group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-2">
        {cover ? (
          <>
            <img
              src={mediaUrl(cover.url)}
              alt={product.title}
              className="h-full w-full object-cover transition-opacity duration-500 group-hover:opacity-0"
            />
            {/* Swaps to the listing's second real photo on hover — a cheap
                way to show more of an actual item without adding a
                carousel, and only appears when that photo really exists. */}
            {altCover && (
              <img
                src={mediaUrl(altCover.url)}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-subtle">
            <span
              className="material-symbols-outlined text-[28px] leading-none"
              aria-hidden="true"
            >
              image_not_supported
            </span>
            <span className="text-xs">ไม่มีรูปภาพ</span>
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {product.condition && (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                CONDITION_STYLE[product.condition] ||
                "bg-gray-100 text-gray-600"
              }`}
            >
              {conditionLabels[product.condition] || product.condition}
            </span>
          )}
        </div>

        {/* A caption for the link the whole card already is — not a second
            action, just the affordance a static photo lacks. */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/55 to-transparent px-3 py-2.5 text-xs font-medium text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          ดูรายละเอียดสินค้า
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 min-h-[2.6em] text-sm leading-tight text-gray-800">
          {product.title}
        </p>

        <p className="text-lg font-semibold text-brand-600">
          ฿{product.price.toLocaleString("th-TH")}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
          {product.size && product.size !== "-" && (
            <span className="inline-flex items-center gap-0.5">
              <span
                className="material-symbols-outlined text-[13px] leading-none"
                aria-hidden="true"
              >
                straighten
              </span>
              {product.size}
            </span>
          )}
          {product.location && (
            <span className="inline-flex items-center gap-0.5 truncate">
              <span
                className="material-symbols-outlined text-[13px] leading-none"
                aria-hidden="true"
              >
                location_on
              </span>
              <span className="truncate">{product.location}</span>
            </span>
          )}
          <span className="ml-auto shrink-0">
            {freshnessLabel(product.createdAt)}
          </span>
        </div>

        {showSeller && (
          <div className="mt-1 flex items-center gap-1.5 border-t border-line pt-2 text-xs text-ink-muted">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">
              {sellerName?.[0]?.toUpperCase() || "?"}
            </span>
            <span className="truncate">{sellerName || "ผู้ขาย"}</span>
            {isVerifiedSeller && (
              <span
                className="material-symbols-outlined shrink-0 text-[14px] leading-none text-brand-500"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-label="ผู้ขายยืนยันตัวตนแล้ว"
                title="ผู้ขายยืนยันตัวตนแล้ว"
              >
                verified
              </span>
            )}
            {rating?.total > 0 ? (
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <RatingStars value={rating.averageRating} />
                <span className="font-medium text-gray-600">
                  {rating.averageRating.toFixed(1)}
                </span>
                <span>({rating.total})</span>
              </span>
            ) : (
              <span className="ml-auto shrink-0 text-ink-subtle">
                ยังไม่มีรีวิว
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
