"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "../lib/api";
import { fetchProduct } from "../lib/products";
import { fetchConditions } from "../lib/catalog";

const CONDITION_TONE = {
  New: "bg-brand-50 text-brand-700",
  "Like New": "bg-brand-50 text-brand-700",
  Good: "bg-sky-50 text-sky-700",
  Fair: "bg-amber-50 text-amber-700",
};

/** Small square photo for a product the caller only knows by id. */
export function ProductThumb({ product, size = 88, title }) {
  const cover = product?.media?.[0];
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface-panel"
      style={{ width: size, height: size }}
    >
      {cover ? (
        <img
          src={mediaUrl(cover.url)}
          alt={title || ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="material-symbols-outlined text-[22px] leading-none text-ink-subtle"
          aria-hidden="true"
        >
          imagesmode
        </span>
      )}
    </span>
  );
}

/**
 * One row of an order list — the cart and the orders page were each drawing
 * their own, and both showed nothing but a title and a price. A buyer
 * deciding whether to pay for a reservation, or recognising which of four
 * similar orders is which, needs the photo and the specifics.
 *
 * The layout is a three-column grid rather than `justify-between`, so the
 * price and the actions line up down the list instead of landing wherever
 * each title happens to end.
 *
 * `lead` (a checkbox, say), `status` and `actions` are slots so the cart and
 * the order list can differ where they genuinely differ.
 */
export default function OrderLine({
  order,
  lead,
  status,
  actions,
  note,
  highlight = false,
}) {
  const [product, setProduct] = useState(undefined);
  const [conditionLabels, setConditionLabels] = useState({});

  useEffect(() => {
    fetchProduct(order.productId).then(setProduct);
  }, [order.productId]);

  useEffect(() => {
    fetchConditions()
      .then((items) =>
        setConditionLabels(
          Object.fromEntries(items.map((c) => [c.value, c.label])),
        ),
      )
      .catch((err) => console.error("โหลดรายการสภาพสินค้าไม่สำเร็จ:", err));
  }, []);

  // Only what helps someone tell this line apart from the next one.
  const facts = product
    ? [
        product.size && product.size !== "-" ? `ไซซ์ ${product.size}` : null,
        product.category,
        product.location,
      ].filter(Boolean)
    : [];
  const uniqueFacts = [...new Set(facts)];

  const conditionLabel = product?.condition
    ? (conditionLabels[product.condition] || product.condition)
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim()
    : null;

  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-3 p-4 transition-colors sm:gap-x-5 ${
        highlight ? "bg-amber-50/40" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {lead}
        <Link
          href={`/products/${order.productId}`}
          className="focus-ring rounded-md"
          aria-label={`ดูสินค้า ${order.productTitle}`}
        >
          <ProductThumb product={product} title={order.productTitle} />
        </Link>
      </div>

      <div className="min-w-0">
        <Link
          href={`/products/${order.productId}`}
          className="focus-ring line-clamp-2 rounded font-medium text-ink hover:text-brand-700"
        >
          {order.productTitle}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {conditionLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                CONDITION_TONE[product.condition] || "bg-gray-100 text-gray-600"
              }`}
            >
              {conditionLabel}
            </span>
          )}
          {uniqueFacts.length > 0 && (
            <span className="truncate text-xs text-ink-subtle">
              {uniqueFacts.join(" · ")}
            </span>
          )}
          {/* An order can outlive its listing; say so rather than showing an
              empty row of facts and letting the reader wonder. */}
          {product === null && (
            <span className="text-xs text-ink-subtle">
              ผู้ขายนำสินค้านี้ออกจากระบบแล้ว
            </span>
          )}
        </div>

        {note && <div className="mt-2 text-sm">{note}</div>}
      </div>

      <div className="flex flex-col items-end gap-2 text-right">
        <span className="whitespace-nowrap font-display text-lg font-bold text-ink">
          ฿{order.price.toLocaleString("th-TH")}
        </span>
        {status}
        {actions}
      </div>
    </div>
  );
}
