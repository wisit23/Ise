"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Pagination from "../Pagination";
import { StarInput, StarDisplay } from "../StarRating";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";
import OrderLine from "../OrderLine";
import OrderDisputeForm from "./OrderDisputeForm";
import BuyerOrderDetailModal from "./BuyerOrderDetailModal";
import ContactSellerButton from "../chat/ContactSellerButton";
import ReviewMediaUploader from "../ReviewMediaUploader";
import ReviewMediaGallery from "../ReviewMediaGallery";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { useChatSocketEvent } from "../chat/ChatSocketProvider";
import {
  autoCompleteAt,
  canOpenDispute,
  canBuyerCancel,
  disputeDeadline,
} from "../../lib/orderLifecycle";

export const STATUS_LABEL = {
  pending_payment: "รอชำระเงิน",
  paid: "ชำระแล้ว รอผู้ขายยืนยัน",
  confirmed: "ผู้ขายกำลังเตรียมสินค้า",
  ready_to_ship: "ผู้ขายกำลังเตรียมสินค้า",
  pickup_in_progress: "ขนส่งกำลังเข้ารับสินค้า",
  in_transit: "กำลังจัดส่ง",
  delivered: "สินค้าถึงแล้ว รอยืนยันรับ",
  completed: "สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
  payment_expired: "หมดเวลาชำระเงิน",
  seller_confirmation_expired: "หมดเวลายืนยันคำสั่งซื้อ (คืนเงินแล้ว)",
  disputed: "อยู่ระหว่างข้อพิพาท",
  refunded: "คืนเงินแล้ว",
};

const STATUS_STYLE = {
  pending_payment: "bg-amber-50 text-amber-700",
  paid: "bg-sky-50 text-sky-700",
  confirmed: "bg-sky-50 text-sky-700",
  ready_to_ship: "bg-sky-50 text-sky-700",
  pickup_in_progress: "bg-sky-50 text-sky-700",
  in_transit: "bg-sky-50 text-sky-700",
  delivered: "bg-violet-50 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
  payment_expired: "bg-gray-100 text-gray-500",
  seller_confirmation_expired: "bg-gray-100 text-gray-500",
  disputed: "bg-red-50 text-red-700",
  refunded: "bg-emerald-50 text-emerald-700",
};

const TABS = [
  { key: "all", label: "ทั้งหมด", status: undefined },
  {
    key: "pending_payment",
    label: "รอชำระเงิน",
    status: "pending_payment",
  },
  { key: "paid", label: "รอผู้ขายยืนยัน", status: "paid" },
  { key: "pickup_in_progress", label: "ขนส่งกำลังเข้ารับสินค้า", status: "pickup_in_progress" },
  { key: "in_transit", label: "กำลังจัดส่ง", status: "in_transit" },
  { key: "delivered", label: "รอยืนยันรับ", status: "delivered" },
  { key: "completed", label: "สำเร็จ", status: "completed" },
  { key: "cancelled", label: "ยกเลิก", status: "cancelled" },
  { key: "payment_expired", label: "หมดเวลาชำระเงิน", status: "payment_expired" },
  { key: "seller_confirmation_expired", label: "หมดเวลาผู้ขายยืนยัน", status: "seller_confirmation_expired" },
];

const PAGE_SIZE = 8;

function ReviewForm({ order, initialReview, onSubmitted, onCancel }) {
  const [rating, setRating] = useState(initialReview?.rating ?? 5);
  const [comment, setComment] = useState(initialReview?.comment ?? "");
  const [media, setMedia] = useState(initialReview?.media ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    setSubmitting(true);
    setError("");
    try {
      const path = initialReview ? `/api/reviews/${initialReview.id}` : "/api/reviews";
      const review = await apiFetch(path, {
        method: initialReview ? "PATCH" : "POST",
        token,
        body: initialReview
          ? { rating, comment, media }
          : { orderId: order.id, rating, comment, media },
      });
      onSubmitted(review);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-2.5 rounded-md border border-gray-200 bg-gray-50 p-3"
    >
      <p className="text-xs text-gray-500">
        ให้คะแนนร้านค้าสำหรับคำสั่งซื้อนี้
      </p>
      <StarInput value={rating} onChange={setRating} size={22} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="เล่าประสบการณ์การซื้อของคุณ (ไม่บังคับ)"
        rows={2}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <ReviewMediaUploader
        value={media}
        onChange={setMedia}
        disabled={submitting}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "กำลังบันทึก..." : initialReview ? "บันทึกการแก้ไข" : "ส่งรีวิว"}
      </button>
      {onCancel && (
        <button
          type="button"
          disabled={submitting}
          onClick={onCancel}
          className="self-start text-sm text-ink-muted hover:underline disabled:opacity-50"
        >
          ยกเลิก
        </button>
      )}
    </form>
  );
}

export default function MyOrders({
  initialTab = "all",
  headingAs: Heading = "h2",
}) {
  const router = useRouter();
  let searchParams = null;
  try {
    searchParams = typeof useSearchParams === "function" ? useSearchParams() : null;
  } catch {
    searchParams = null;
  }
  const urlOrderId = searchParams?.get("orderId");
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewedByOrderId, setReviewedByOrderId] = useState({});
  const [openReviewFor, setOpenReviewFor] = useState(null);
  const [openDisputeFor, setOpenDisputeFor] = useState(null);
  const [justDisputedIds, setJustDisputedIds] = useState(new Set());
  const [confirmingOrderId, setConfirmingOrderId] = useState(null);
  const [detailOrderId, setDetailOrderId] = useState(() => urlOrderId || null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const detailOrder =
    items.find((o) => o.id === detailOrderId) ||
    (detailOrderId ? { id: detailOrderId } : null);

  useEffect(() => {
    if (urlOrderId) {
      setDetailOrderId(urlOrderId);
    }
  }, [urlOrderId]);

  useEffect(() => {
    function handleOpenDetail(e) {
      if (e.detail?.orderId) {
        setDetailOrderId(e.detail.orderId);
      }
    }
    window.addEventListener("reloop:open-order-detail", handleOpenDetail);
    return () => {
      window.removeEventListener("reloop:open-order-detail", handleOpenDetail);
    };
  }, []);

  function handleCloseDetail() {
    setDetailOrderId(null);
    if (searchParams?.get("orderId")) {
      // Stay on whichever page hosts the list (/profile?tab=orders).
      const params = new URLSearchParams(searchParams.toString());
      params.delete("orderId");
      const qs = params.toString();
      const path = typeof window !== "undefined" ? window.location.pathname : "/profile";
      router.replace(qs ? `${path}?${qs}` : path);
    }
  }

  async function handleCancelOrder() {
    if (!cancelOrder || cancelling) return;
    setCancelling(true);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/${cancelOrder.id}/status`, {
        method: "PATCH",
        token: getAccessToken(),
        body: { status: "cancelled" },
      });
      setItems((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
      setCancelOrder(null);
    } catch (err) {
      setError(err.message || "ยกเลิกคำสั่งซื้อไม่สำเร็จ");
      setCancelOrder(null);
      // The seller may have confirmed the order while the dialog was open.
      try {
        const fresh = await apiFetch(`/api/orders/${cancelOrder.id}`, { token: getAccessToken() });
        setItems((prev) => prev.map((o) => o.id === fresh.id ? { ...o, ...fresh } : o));
      } catch { /* Keep the original cancellation error visible. */ }
    } finally {
      setCancelling(false);
    }
  }

  async function handleConfirmReceived(orderId) {
    const token = getAccessToken();
    if (!token || !orderId) return;
    setConfirmingOrderId(orderId);
    try {
      const updated = await apiFetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        token,
        body: { status: "completed" },
      });
      setItems((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)),
      );
    } catch (err) {
      alert(err.message || "ยืนยันการรับสินค้าไม่สำเร็จ");
    } finally {
      setConfirmingOrderId(null);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    apiFetch("/api/reviews/mine?limit=100", { token: getAccessToken() })
      .then((data) =>
        setReviewedByOrderId(
          Object.fromEntries(data.items.map((r) => [r.orderId, r])),
        ),
      )
      .catch((err) => console.error("โหลดรีวิวของฉันไม่สำเร็จ:", err));
  }, [router]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const tabDef = TABS.find((t) => t.key === tab);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (tabDef?.status) params.set("status", tabDef.status);

    setLoading(true);
    apiFetch(`/api/orders/mine?${params}`, { token })
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab, page]);

  // Order status pushed by order-service (seller accepts, ships, etc.).
  useChatSocketEvent("order:updated", (payload) => {
    if (!payload?.order?.id) return;
    const updated = payload.order;
    setItems((prev) => {
      const idx = prev.findIndex((o) => o.id === updated.id);
      if (idx !== -1) {
        return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
      }
      const tabDef = TABS.find((t) => t.key === tab);
      if (!tabDef?.status || tabDef.status === updated.status) {
        return [updated, ...prev];
      }
      return prev;
    });
  });

  function handleTab(key) {
    setTab(key);
    setPage(1);
  }

  const hasPending =
    tab === "all" &&
    items.some((o) => o.status === "pending_payment");

  return (
    <section aria-label="คำสั่งซื้อของฉัน">
      <Heading className="mb-2 text-xl font-bold text-gray-900">
        คำสั่งซื้อของฉัน
      </Heading>
      {hasPending && (
        <p className="mb-4 text-sm text-gray-500">
          มีสินค้าที่ล็อกไว้รอชำระเงิน ไปที่{" "}
          <Link href="/cart" className="text-emerald-600 hover:underline">
            ตะกร้า
          </Link>{" "}
          เพื่อชำระเงิน
        </p>
      )}

      <div
        role="group"
        aria-label="กรองคำสั่งซื้อ"
        className="mb-6 flex flex-wrap gap-1 border-b border-gray-200"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => handleTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}
      {!loading && items.length === 0 && (
        <EmptyState
          icon="receipt_long"
          title="ไม่มีคำสั่งซื้อในหมวดนี้"
          description="ลองเลือกแท็บอื่น หรือเริ่มเลือกซื้อสินค้าชิ้นแรกของคุณ"
          action={
            <Button href="/products" icon="storefront">
              เลือกซื้อสินค้า
            </Button>
          }
        />
      )}

      <ul className="flex flex-col gap-3">
        {items.map((o) => {
          const review = reviewedByOrderId[o.id];
          const disputed = Boolean(o.dispute) || justDisputedIds.has(o.id);
          const safetyHold = o.status === "disputed" && !disputed;
          return (
            <li
              key={o.id}
              className="overflow-hidden rounded-md border border-line bg-white shadow-1"
            >
              <OrderLine
                order={o}
                linkThumbnail={false}
                actions={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <ContactSellerButton
                      productId={o.productId}
                      orderId={o.id}
                      className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-panel disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setDetailOrderId(o.id)}
                      className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-panel"
                    >
                      ดูรายละเอียด
                    </button>
                    {o.status === "pending_payment" && (
                      <Link
                        href={
                          o.checkoutSessionId
                            ? `/payment/${o.checkoutSessionId}`
                            : `/checkout?orders=${o.id}`
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          qr_code_2
                        </span>
                        ไปชำระเงิน
                      </Link>
                    )}
                    {canBuyerCancel(o) && (
                      <Button variant="secondary" size="sm" onClick={() => setCancelOrder(o)}>
                        ยกเลิกคำสั่งซื้อ
                      </Button>
                    )}
                    {o.status === "delivered" && (
                      <button
                        type="button"
                        onClick={() => handleConfirmReceived(o.id)}
                        disabled={confirmingOrderId === o.id}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-95 shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          check_circle
                        </span>
                        {confirmingOrderId === o.id
                          ? "กำลังยืนยัน..."
                          : "ได้รับสินค้าแล้ว"}
                      </button>
                    )}
                  </div>
                }
                status={
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      o.auctionId &&
                      o.status === "pending_payment"
                        ? "bg-amber-100 text-amber-800"
                        : STATUS_STYLE[o.status] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {o.auctionId &&
                    o.status === "pending_payment"
                      ? "ชนะประมูล · รอชำระเงิน"
                      : safetyHold
                        ? "พักเงินเพื่อตรวจสอบ"
                        : STATUS_LABEL[o.status] || o.status}
                  </span>
                }
                note={
                  <span className="text-xs text-ink-subtle">
                    {o.auctionId ? "ชนะการประมูลเมื่อ " : "สั่งซื้อเมื่อ "}
                    {new Date(o.createdAt).toLocaleDateString("th-TH")}
                  </span>
                }
              />

              {/* Everything a buyer can still *do* with a finished order
                    lives in one strip under the row, so the row itself stays
                    the same shape in every status. */}
              {(["delivered", "completed"].includes(o.status) || disputed) && (
                <div className="flex flex-wrap items-start gap-2 border-t border-line bg-surface-subtle px-4 py-3 [&>form]:w-full">
                  {o.status === "completed" &&
                    (openReviewFor === o.id ? (
                      <ReviewForm
                        key={o.id}
                        order={o}
                        initialReview={review}
                        onCancel={() => setOpenReviewFor(null)}
                        onSubmitted={(savedReview) => {
                          setReviewedByOrderId((prev) => ({
                            ...prev,
                            [o.id]: savedReview,
                          }));
                          setOpenReviewFor(null);
                        }}
                      />
                    ) : review ? (
                      <div className="flex w-full flex-col gap-1 text-sm text-ink-muted">
                        <div className="flex items-center gap-2">
                          <StarDisplay value={review.rating} />
                          {review.comment && (
                            <span className="text-ink-subtle">
                              &quot;{review.comment}&quot;
                            </span>
                          )}
                        </div>
                        {review.media && review.media.length > 0 && (
                          <ReviewMediaGallery media={review.media} />
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="edit"
                          className="self-start"
                          onClick={() => setOpenReviewFor(o.id)}
                        >
                          แก้ไขรีวิว
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="star"
                        onClick={() => setOpenReviewFor(o.id)}
                        className="self-start !border-emerald-200 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100"
                      >
                        ให้คะแนนร้านค้า
                      </Button>
                    ))}

                  {o.status === "delivered" && autoCompleteAt(o) && (
                    <p className="w-full text-xs text-ink-subtle">
                      หากไม่กดยืนยัน ระบบจะยืนยันรับสินค้าให้อัตโนมัติวันที่{" "}
                      {autoCompleteAt(o).toLocaleDateString("th-TH")}
                    </p>
                  )}

                  {!disputed &&
                    canOpenDispute(o) &&
                    (openDisputeFor === o.id ? (
                      <OrderDisputeForm
                        order={o}
                        onSubmitted={(dispute) => {
                          setItems((items) =>
                            items.map((item) =>
                              item.id === o.id
                                ? { ...item, status: "disputed", dispute }
                                : item,
                            ),
                          );
                          setJustDisputedIds((prev) => new Set(prev).add(o.id));
                          setOpenDisputeFor(null);
                        }}
                      />
                    ) : (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="flag"
                          onClick={() => setOpenDisputeFor(o.id)}
                          aria-describedby={`dispute-deadline-${o.id}`}
                          className="!border-rose-200 !bg-rose-50 !text-rose-800 hover:!bg-rose-100"
                        >
                          ขอคืนเงิน/คืนสินค้า
                        </Button>
                        <p
                          id={`dispute-deadline-${o.id}`}
                          className="ml-auto text-right text-xs text-rose-700"
                        >
                          แจ้งปัญหาได้ภายในวันที่{" "}
                          {disputeDeadline(o).toLocaleDateString("th-TH")}
                        </p>
                      </div>
                    ))}

                  {disputed && (
                    <Link
                      href={`/support/cases/${o.id}`}
                      className="focus-ring self-start rounded text-sm font-medium text-brand-700 hover:underline"
                    >
                      ดูสถานะข้อพิพาท →
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(cancelOrder)}
        title="ยกเลิกคำสั่งซื้อนี้?"
        description={cancelOrder?.status === "paid"
          ? "ยกเลิกได้ก่อนผู้ขายยืนยันคำสั่งซื้อ ระบบจะบันทึกคืนเงินเต็มจำนวนตามระบบชำระเงินจำลอง"
          : "ยืนยันยกเลิกคำสั่งซื้อก่อนผู้ขายยืนยันคำสั่งซื้อ"}
        confirmLabel="ยืนยันยกเลิกคำสั่งซื้อ"
        cancelLabel="กลับ"
        busy={cancelling}
        onConfirm={handleCancelOrder}
        onCancel={() => setCancelOrder(null)}
      />
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      {detailOrder && (
        <BuyerOrderDetailModal
          order={detailOrder}
          statusLabel={
            detailOrder.status
              ? STATUS_LABEL[detailOrder.status] || detailOrder.status
              : ""
          }
          onClose={handleCloseDetail}
          onOrderChange={(fresh) =>
            setItems((prev) => {
              const exists = prev.some((o) => o.id === fresh.id);
              if (exists) {
                return prev.map((o) => (o.id === fresh.id ? { ...o, ...fresh } : o));
              }
              return [fresh, ...prev];
            })
          }
        />
      )}
    </section>
  );
}
