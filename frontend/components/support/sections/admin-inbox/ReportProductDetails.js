"use client";
import Icon from "../../../ui/Icon";


import { useState } from "react";
import { mediaUrl } from "../../../../lib/api";
import Modal from "../../../ui/Modal";

const STATUS = {
  available: "พร้อมขาย",
  reserved: "ถูกจอง",
  sold: "ขายแล้ว",
  removed: "ถูกระงับ",
  auction: "อยู่ระหว่างประมูล",
};

export default function ReportProductDetails({ productId, detail, onRetry }) {
  const [selectedImage, setSelectedImage] = useState(null);
  if (!productId && !detail?.product) return null;
  const product = detail?.product;
  const id = product?.id || productId;
  const fields = product
    ? [
        ["ชื่อสินค้า", product.title],
        [
          "ราคา",
          product.price != null
            ? `${Number(product.price).toLocaleString("th-TH")} บาท`
            : null,
        ],
        ["สถานะ", STATUS[product.status] || product.status],
        ["หมวดหมู่", product.category],
        ["แบรนด์", product.brand],
        ["สภาพ", product.condition],
        ["ขนาด", product.size],
        ["พื้นที่", product.location],
      ]
    : [];
  return (
    <section
      className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label="รายละเอียดสินค้า"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-bold text-slate-900">รายละเอียดสินค้า</h4>
        <a
          href={`/products/${encodeURIComponent(id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-emerald-700 underline"
        >
          View Product <Icon name="open_in_new" />
        </a>
      </div>
      {product ? (
        <>
          <p className="mt-1 text-xs text-slate-500">
            ข้อมูลสินค้าปัจจุบันสำหรับประกอบการตรวจสอบเคส
          </p>
          {product.media?.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {product.media.map((item, index) =>
                item.type === "video" ? (
                  <video
                    key={`${item.url}:${index}`}
                    src={mediaUrl(item.url)}
                    controls
                    preload="metadata"
                    aria-label={`วิดีโอสินค้า ${index + 1}`}
                    className="max-h-64 w-full rounded-lg bg-slate-50"
                  />
                ) : (
                  <button
                    key={`${item.url}:${index}`}
                    type="button"
                    onClick={() => setSelectedImage(item.url)}
                    aria-label={`ขยายรูปสินค้า ${index + 1}`}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:border-emerald-400"
                  >
                    <img
                      src={mediaUrl(item.url)}
                      alt={`${product.title || "สินค้า"} รูปที่ ${index + 1}`}
                      loading="lazy"
                      className="h-44 w-full object-contain"
                    />
                  </button>
                ),
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              สินค้านี้ไม่มีรูปภาพหรือวิดีโอ
            </p>
          )}
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {fields
              .filter(
                ([, value]) =>
                  value !== null && value !== undefined && value !== "",
              )
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-medium text-slate-900">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h5 className="text-sm font-semibold text-slate-700">
              คำอธิบายจากผู้ขาย
            </h5>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
              {product.description || "ไม่ได้ระบุคำอธิบาย"}
            </p>
          </div>
          {product.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 text-sm text-slate-500">
          <p>
            ไม่สามารถโหลดรายละเอียดสินค้าได้
            สินค้าอาจถูกลบหรือบริการไม่พร้อมใช้งาน
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 font-semibold text-emerald-700 underline"
            >
              ลองโหลดรายละเอียดอีกครั้ง
            </button>
          )}
        </div>
      )}
      <Modal
        open={Boolean(selectedImage)}
        onClose={() => setSelectedImage(null)}
        title="รูปสินค้า"
        size="xl"
      >
        {selectedImage && (
          <img
            src={mediaUrl(selectedImage)}
            alt={product?.title || "รูปสินค้า"}
            className="max-h-[75vh] w-full object-contain"
          />
        )}
      </Modal>
    </section>
  );
}
