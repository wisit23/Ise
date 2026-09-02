"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "../lib/api";
import { fetchConditions } from "../lib/catalog";
import { fetchSellerRating, fetchSellerSummary } from "../lib/sellers";

const CONDITION_STYLE = {
  New: "bg-brand-600 text-white",
  "Like New": "bg-brand-600 text-white",
  Good: "bg-sky-600 text-white",
  Fair: "bg-amber-600 text-white",
};

const DAY_MS = 86_400_000;

/** "วันนี้" / "เมื่อวาน" / "N วันก่อน" — freshness is a real decision signal on
 * a resale marketplace (a listing sitting for months is more likely already
 * gone or priced wrong), and `createdAt` is real data, not a guess. */
function freshnessLabel(createdAt) {
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / DAY_MS,
  );
  if (days <= 0) return "ลงวันนี้";
  if (days === 1) return "เมื่อวาน";
  if (days < 30) return `${days} วันก่อน`;
  const months = Math.floor(days / 30);
  return `${months} เดือนก่อน`;
}

/** Five stars honouring a fractional rating (4.3 -> 4 filled + a clipped
 * 5th). Uses the icon font's own FILL axis rather than two different icons,
 * so a half-filled star can't shift the baseline. */
function RatingStars({ value, size = 13 }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span
            key={n}
            className="relative inline-block"
            style={{ width: size, height: size }}
          >
            <span
              className="material-symbols-outlined absolute inset-0 leading-none text-gray-300"
              style={{ fontSize: size, fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden leading-none text-amber-400"
                style={{ width: `${fill * 100}%` }}
              >
                <span
                  className="material-symbols-outlined leading-none"
                  style={{ fontSize: size, fontVariationSettings: "'FILL' 1" }}
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

  // "ไซซ์ M · รองเท้า · กรุงเทพฯ" — one quiet line instead of three competing
  // icon chips. Only the parts this listing actually filled in, and each
  // value only once: sellers do put the same word in size, category and
  // location, which otherwise renders as "สินค้า · สินค้า · สินค้า".
  const meta = [
    ...new Set(
      [
        product.size === "-" ? null : product.size,
        product.category,
        product.location,
      ].filter(Boolean),
    ),
  ].map((part, i, all) =>
    // Label the size only when it is distinguishable from the other parts.
    part === product.size && all.length > 1 ? `ไซซ์ ${part}` : part,
  );

  // The catalog labels conditions bilingually ("ใหม่มาก (Like New)"), which
  // is right on a detail page but too long for a badge — on a 2-up phone
  // grid it either collided with the freshness pill or truncated to
  // "ใหม่มาก (Like…". At a glance the Thai alone carries it.
  const conditionLabel = product.condition
    ? (conditionLabels[product.condition] || product.condition)
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim()
    : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-xl">
      <div className="relative aspect-[4/5] overflow-hidden bg-gray-100">
        {cover ? (
          <>
            <img
              src={mediaUrl(cover.url)}
              alt={product.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
            {/* Swaps to the listing's own second photo on hover — more of the
                real item without building a carousel, and only when that
                photo actually exists. */}
            {altCover && (
              <img
                src={mediaUrl(altCover.url)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="absolute inset-0 h-full w-full scale-[1.06] object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-subtle">
            <span
              className="material-symbols-outlined text-[32px] leading-none"
              aria-hidden="true"
            >
              imagesmode
            </span>
            <span className="text-xs">ไม่มีรูปสินค้า</span>
          </div>
        )}

        {conditionLabel && (
          <span
            className={`absolute left-2.5 top-2.5 max-w-[calc(100%-6rem)] truncate rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${
              CONDITION_STYLE[product.condition] || "bg-gray-700 text-white"
            }`}
          >
            {conditionLabel}
          </span>
        )}

        <span className="absolute right-2.5 top-2.5 rounded-full bg-gray-900/75 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur">
          {freshnessLabel(product.createdAt)}
        </span>

        {/* A caption for the link the whole card already is — not a second
            action, just the affordance a still photo lacks. */}
        <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="flex items-center justify-center gap-1.5 rounded-full bg-white/95 py-2.5 text-sm font-semibold text-gray-900 shadow-lg backdrop-blur">
            ดูรายละเอียด
            <span
              className="material-symbols-outlined text-[16px] leading-none"
              aria-hidden="true"
            >
              arrow_forward
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900">
          {/* Stretched link: the whole card is clickable, but only the title
              is in the tab order — a keyboard user gets one stop per card,
              not one per decorative element. */}
          <Link
            href={`/products/${product.id}`}
            className="focus-ring rounded before:absolute before:inset-0 before:content-['']"
          >
            {product.title}
          </Link>
        </h3>

        {meta.length > 0 && (
          <p className="mt-1.5 truncate text-[13px] text-ink-muted">
            {meta.join(" · ")}
          </p>
        )}

        <p className="mt-2.5 text-[22px] font-bold tracking-tight text-gray-900">
          ฿{product.price.toLocaleString("th-TH")}
        </p>

        {showSeller && (
          <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-3 text-[13px]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
              {sellerName?.[0]?.toUpperCase() || "?"}
            </span>
            <span className="truncate text-ink-muted">
              {sellerName || "ผู้ขาย"}
            </span>
            {isVerifiedSeller && (
              <span
                className="material-symbols-outlined shrink-0 leading-none text-brand-500"
                style={{ fontSize: 15, fontVariationSettings: "'FILL' 1" }}
                aria-label="ผู้ขายยืนยันตัวตนแล้ว"
                title="ผู้ขายยืนยันตัวตนแล้ว"
              >
                verified
              </span>
            )}

            {rating?.total > 0 ? (
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <RatingStars value={rating.averageRating} />
                <span className="font-semibold text-gray-700">
                  {rating.averageRating.toFixed(1)}
                </span>
              </span>
            ) : (
              <span className="ml-auto shrink-0 text-ink-subtle">ร้านใหม่</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
