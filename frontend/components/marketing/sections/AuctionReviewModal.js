"use client";

import { useEffect, useState } from "react";
import Modal from "../../ui/Modal";
import Badge from "../../panel/ui/Badge";
import { mediaUrl } from "../../../lib/api";
import { STATUS_LABEL, STATUS_STYLE, baht } from "./auctionPresentation";

export default function AuctionReviewModal({
  isOpen,
  auction,
  onClose,
  onApprove,
  onReject,
  actionLoading,
  errorMessage,
}) {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  useEffect(() => {
    setSelectedPhotoIndex(0);
  }, [auction?.id]);

  if (!isOpen || !auction) return null;

  const product = auction.product || {};
  const rawPhotos = Array.isArray(product.photos) ? product.photos : [];
  const photos = rawPhotos
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const currentPhoto = photos[selectedPhotoIndex] || photos[0];
  const isRoundCancelled = Boolean(
    auction.round?.cancelledAt || auction.round?.phase === "cancelled",
  );
  const isSubmitting =
    Boolean(actionLoading?.id) && actionLoading.id === auction.id;
  const actionType = actionLoading?.type;

  function handleSafeClose() {
    if (isSubmitting) return;
    onClose?.();
  }

  const title = product.title || auction.productId || "ไม่ระบุ";
  const description =
    product.description && product.description.trim()
      ? product.description
      : "ไม่ระบุ";
  const category =
    product.category && product.category.trim() ? product.category : "ไม่ระบุ";
  const brand =
    product.brand && product.brand.trim() ? product.brand : "ไม่ระบุ";
  const condition =
    product.condition && product.condition.trim()
      ? product.condition
      : "ไม่ระบุ";
  const size = product.size && product.size.trim() ? product.size : "ไม่ระบุ";
  const roundTitle = auction.round?.title || "ไม่ระบุ";
  const startingPriceText = baht(auction.startingPrice, "ไม่ระบุ");
  const bidIncrementText = baht(auction.bidIncrement, "ไม่ระบุ");
  const statusText =
    STATUS_LABEL[auction.status] || auction.status || "ไม่ระบุ";
  const statusStyle =
    STATUS_STYLE[auction.status] || "bg-slate-100 text-slate-600";

  return (
    <Modal
      open={isOpen}
      onClose={handleSafeClose}
      title="ตรวจสอบสินค้าก่อนอนุมัติเข้าประมูล"
      description="ตรวจสอบรูปภาพ รายละเอียด และเงื่อนไขการประมูลก่อนตัดสินใจอนุมัติ"
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSafeClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            กลับไปหน้ารายการประมูล
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={isSubmitting}
              className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-red-700 hover:bg-red-100 transition disabled:opacity-50"
            >
              {isSubmitting && actionType === "reject"
                ? "กำลังปฏิเสธ..."
                : "ปฏิเสธสินค้า"}
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={isSubmitting || isRoundCancelled}
              title={
                isRoundCancelled
                  ? "ไม่สามารถอนุมัติได้เนื่องจากรอบประมูลถูกยกเลิกแล้ว"
                  : ""
              }
              className="rounded-md bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting && actionType === "approve"
                ? "กำลังอนุมัติ..."
                : "อนุมัติสินค้าเข้าประมูล"}
            </button>
          </div>
        </div>
      }
    >
      {isRoundCancelled && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 font-medium">
          ⚠️ รอบประมูลนี้ถูกยกเลิกแล้ว (
          {auction.round?.cancellationReason || "ฝ่ายการตลาดยกเลิกรอบ"})
          ไม่สามารถอนุมัติสินค้าเข้ารอบนี้ได้
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* คอลัมน์ซ้าย: Gallery รูปสินค้า */}
        <div className="flex flex-col">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {currentPhoto?.url ? (
              <img
                src={mediaUrl(currentPhoto.url)}
                alt={title}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-1 text-slate-300">
                  image_not_supported
                </span>
                <span className="text-sm font-medium">ไม่มีรูปสินค้า</span>
              </div>
            )}
          </div>

          {photos.length > 1 && (
            <div
              className="mt-3 flex flex-wrap gap-2 max-w-full overflow-x-auto pb-1"
              role="region"
              aria-label="รูปขนาดย่อของสินค้า"
            >
              {photos.map((p, idx) => (
                <button
                  key={p.id || p.url || idx}
                  type="button"
                  onClick={() => setSelectedPhotoIndex(idx)}
                  aria-label={`เลือกดูรูปสินค้าที่ ${idx + 1}`}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    idx === selectedPhotoIndex
                      ? "border-emerald-600 ring-2 ring-emerald-500/30"
                      : "border-slate-200 hover:border-slate-400 opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={mediaUrl(p.url)}
                    alt={`รูปขนาดย่อที่ ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* คอลัมน์ขวา: รายละเอียดสินค้าและเงื่อนไขการประมูล */}
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 break-words flex-1">
              {title}
            </h3>
            <div className="shrink-0">
              <Badge text={statusText} style={statusStyle} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-xs sm:text-sm">
            <div>
              <span className="block text-[11px] text-slate-500 mb-0.5">
                หมวดหมู่
              </span>
              <span className="font-semibold text-slate-800">{category}</span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 mb-0.5">
                แบรนด์
              </span>
              <span className="font-semibold text-slate-800">{brand}</span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 mb-0.5">
                สภาพสินค้า
              </span>
              <span className="font-semibold text-slate-800">{condition}</span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 mb-0.5">
                ขนาด
              </span>
              <span className="font-semibold text-slate-800">{size}</span>
            </div>
            <div className="col-span-2 pt-2 border-t border-slate-200/60">
              <span className="block text-[11px] text-slate-500 mb-0.5">
                ชื่อรอบประมูล
              </span>
              <span className="font-semibold text-emerald-700">
                {roundTitle}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">ราคาเริ่มต้น</span>
              <span className="font-bold text-slate-900 text-sm sm:text-base">
                {startingPriceText}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-emerald-200/40 pt-1.5">
              <span className="text-slate-600">ราคาเสนอเพิ่มขั้นต่ำ</span>
              <span className="font-semibold text-emerald-800">
                {bidIncrementText}
              </span>
            </div>
          </div>

          <div className="mt-3">
            <h4 className="text-xs font-semibold text-slate-700 mb-1">
              รายละเอียดสินค้า
            </h4>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto">
              {description}
            </div>
          </div>

          {errorMessage && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-700 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] text-red-600 shrink-0">
                error
              </span>
              <span className="flex-1 font-medium">{errorMessage}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
