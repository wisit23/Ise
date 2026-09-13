"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import MediaGallery from "../../../components/MediaGallery";
import { StarDisplay } from "../../../components/StarRating";
import Pagination from "../../../components/Pagination";
import ReportModal from "../../../components/ReportModal";
import ContactSellerButton from "../../../components/chat/ContactSellerButton";
import Alert from "../../../components/ui/Alert";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { fetchConditions } from "../../../lib/catalog";

const STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "ถูกล็อกไว้ในตะกร้าแล้ว",
  sold: "ขายแล้ว",
  auction: "อยู่ในระบบประมูล",
  hidden: "ซ่อนอยู่",
};

const REVIEW_PAGE_SIZE = 5;

function getReviewerLabel(review) {
  const directFullName = [
    review.buyerFirstName || review.buyer?.firstName,
    review.buyerLastName || review.buyer?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (directFullName) return directFullName;

  if (review.reviewerName) return review.reviewerName;
  if (review.buyerName) return review.buyerName;
  if (!review.buyerId) return "ผู้ซื้อทั่วไป";
  if (review.buyerId.length > 10) {
    return `ผู้ซื้อ (${review.buyerId.slice(0, 4)}***${review.buyerId.slice(-4)})`;
  }
  return `ผู้ซื้อ (${review.buyerId})`;
}

function baht(v) {
  return `฿${Number(v || 0).toLocaleString("th-TH")}`;
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState(false);
  const [conditionLabels, setConditionLabels] = useState({});
  const [reviewSummary, setReviewSummary] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [myPendingOrder, setMyPendingOrder] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotalPages, setReviewTotalPages] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (token && id) {
      apiFetch("/api/orders/mine?status=pending_payment&limit=100", { token })
        .then((data) => {
          const match = data.items?.find((o) => o.productId === id);
          if (match) setMyPendingOrder(match);
        })
        .catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    apiFetch(`/api/products/${id}`)
      .then(setupProduct)
      .catch((err) => {
        // Fallback for owners if gateway stripped the token
        apiFetch(`/api/products/mine?limit=100`)
          .then((data) => {
            const p = data.items.find((item) => item.id === id);
            if (p) setupProduct(p);
            else setError(err.message);
          })
          .catch(() => setError(err.message));
      });

    function setupProduct(p) {
      setProduct(p);
      apiFetch(`/api/auth/users/${p.sellerId}/public`)
        .then(setSeller)
        .catch((err) => console.error("โหลดข้อมูลผู้ขายไม่สำเร็จ:", err));
      apiFetch(`/api/reviews/by-seller/${p.sellerId}/summary`)
        .then(setReviewSummary)
        .catch((err) => console.error("โหลดคะแนนรีวิวผู้ขายไม่สำเร็จ:", err));
    }
    fetchConditions()
      .then((items) =>
        setConditionLabels(
          Object.fromEntries(items.map((c) => [c.value, c.label])),
        ),
      )
      .catch((err) => console.error("โหลดรายการสภาพสินค้าไม่สำเร็จ:", err));
  }, [id]);

  useEffect(() => {
    if (!product?.sellerId) return;
    setReviewsLoading(true);
    apiFetch(
      `/api/reviews/by-seller/${product.sellerId}?page=${reviewPage}&limit=${REVIEW_PAGE_SIZE}`,
    )
      .then(async (data) => {
        const items = data.items || [];
        setReviewTotalPages(data.totalPages || 1);

        const uniqueBuyerIds = [
          ...new Set(items.map((r) => r.buyerId).filter(Boolean)),
        ];
        const buyerMap = {};
        await Promise.all(
          uniqueBuyerIds.map((bId) =>
            apiFetch(`/api/auth/users/${bId}/public`)
              .then((u) => {
                const fullName = [u?.firstName, u?.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                buyerMap[bId] = fullName || u?.shopName || null;
              })
              .catch(() => {}),
          ),
        );

        const enriched = items.map((r) => ({
          ...r,
          reviewerName: buyerMap[r.buyerId] || null,
        }));
        setReviews(enriched);
      })
      .catch((err) => console.error("โหลดรีวิวของร้านไม่สำเร็จ:", err))
      .finally(() => setReviewsLoading(false));
  }, [product?.sellerId, reviewPage]);

  async function addToCart() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return null;
    }
    const user = getStoredUser();
    if (user?.id === product.sellerId) {
      setNotice("คุณไม่สามารถซื้อสินค้าของตัวเองได้");
      return null;
    }

    setBusy(true);
    setNotice("");
    try {
      await apiFetch("/api/orders", {
        method: "POST",
        token,
        body: { productId: product.id },
      });
      setAdded(true);
      setProduct({ ...product, status: "reserved" });
      return true;
    } catch (err) {
      setNotice(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToCart() {
    await addToCart();
  }

  async function handleBuyNow() {
    const ok = await addToCart();
    if (ok) router.push("/cart");
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-5xl px-4 py-10 text-red-600">{error}</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-5xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  const available = product.status === "available";
  const sellerName = seller
    ? seller.shopName || `${seller.firstName} ${seller.lastName}`
    : "ผู้ขาย";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />

      <nav className="mx-auto w-full max-w-5xl px-4 pt-4 text-xs text-gray-500">
        <Link href="/products" className="hover:text-emerald-600">
          สินค้า
        </Link>
        {" / "}
        <Link
          href={`/products?category=${encodeURIComponent(product.category)}`}
          className="hover:text-emerald-600"
        >
          {product.category}
        </Link>
        {" / "}
        <span className="text-gray-500">{product.title}</span>
      </nav>

      <section className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-4 py-6 sm:grid-cols-2">
        <div>
          <MediaGallery media={product.media} alt={product.title} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.title}</h1>
          <p className="mt-3 text-3xl font-bold text-emerald-600">
            ฿{product.price.toLocaleString("th-TH")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              สภาพ: {conditionLabels[product.condition] || product.condition}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              ไซส์: {product.size}
            </span>
            {product.location && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                📍 {product.location}
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 ${
                available
                  ? "bg-emerald-50 text-emerald-700"
                  : product.status === "hidden"
                    ? "bg-yellow-50 text-yellow-800"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              {STATUS_LABEL[product.status] || product.status}
            </span>
          </div>

          <p className="mt-5 whitespace-pre-line text-sm text-gray-700">
            {product.description}
          </p>

          {product.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
                {sellerName?.[0] || "?"}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {sellerName}
                </p>
                {reviewSummary?.total > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <StarDisplay
                      value={reviewSummary.averageRating}
                      size={13}
                    />
                    <span>
                      {reviewSummary.averageRating.toFixed(1)} (
                      {reviewSummary.total} รีวิว)
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">ยังไม่มีรีวิว</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {getStoredUser()?.id !== product.sellerId && (
                <ContactSellerButton
                  productId={product.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-3.5 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                />
              )}
              <Link
                href={`/store/${product.sellerId}`}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                ดูร้านค้า
              </Link>
            </div>
          </div>

          {getStoredUser()?.id === product.sellerId ? (
            <Link
              href={`/products/${product.id}/edit`}
              className="mt-3 inline-block text-xs font-medium text-gray-500 hover:text-emerald-600 hover:underline"
            >
              แก้ไขสินค้านี้
            </Link>
          ) : (
            <button
              onClick={() => setShowReport(true)}
              className="mt-3 text-xs font-medium text-gray-500 hover:text-red-600 hover:underline"
            >
              รายงานสินค้า/ผู้ขายรายนี้
            </button>
          )}

          {notice && (
            <div className="mt-4 animate-slide-up">
              <Alert tone="error">{notice}</Alert>
            </div>
          )}
          {added && (
            <div className="mt-4 animate-slide-up flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-600 text-[22px] shrink-0">
                  check_circle
                </span>
                <span className="font-medium">
                  เพิ่มลงตะกร้าแล้ว! สินค้าถูกล็อกไว้ให้คุณ 10 นาที
                </span>
              </div>
              <Link
                href="/cart"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
              >
                ไปที่ตะกร้า
                <span className="material-symbols-outlined text-[15px]">
                  arrow_forward
                </span>
              </Link>
            </div>
          )}

          {product.status === "auction" && (
            <div className="mt-4 animate-slide-up flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-sky-600 text-[22px] shrink-0">
                  gavel
                </span>
                <span className="font-medium">
                  สินค้านี้อยู่ในระบบประมูล ไม่สามารถสั่งซื้อแบบปกติได้
                </span>
              </div>
              <Link
                href="/auctions"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-sky-700 active:scale-95"
              >
                ไปที่ลานประมูล
                <span className="material-symbols-outlined text-[15px]">
                  arrow_forward
                </span>
              </Link>
            </div>
          )}

          {myPendingOrder && (
            <div className="mt-4 animate-slide-up flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-600 text-[24px] shrink-0">
                  shopping_cart_checkout
                </span>
                <div>
                  <p className="font-bold text-emerald-900">
                    {myPendingOrder.auctionId
                      ? "🎉 คุณเป็นผู้ชนะการประมูลสินค้านี้!"
                      : "สินค้านี้อยู่ในตะกร้าของคุณแล้ว"}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    รายการนี้ถูกล็อกไว้รอให้คุณชำระเงิน กรุณากดไปที่ตะกร้าเพื่อดำเนินการ
                  </p>
                </div>
              </div>
              <Link
                href="/cart"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
              >
                ไปชำระเงิน
                <span className="material-symbols-outlined text-[15px]">
                  arrow_forward
                </span>
              </Link>
            </div>
          )}

          {!added && (
            <div className="mt-6 flex gap-3">
              {myPendingOrder ? (
                <Link
                  href="/cart"
                  className="flex-1 rounded-md bg-emerald-600 py-3 text-center font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  💳 ไปชำระเงินที่ตะกร้าสินค้า ({baht(myPendingOrder.price)})
                </Link>
              ) : (
                <>
                  <button
                    onClick={handleAddToCart}
                    disabled={!available || busy}
                    className="flex-1 rounded-md border border-emerald-600 py-3 font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-500"
                  >
                    {busy ? "กำลังเพิ่ม..." : "เพิ่มลงตะกร้า"}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={!available || busy}
                    className="flex-1 rounded-md bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {available
                      ? "ซื้อเลย"
                      : product.status === "auction"
                        ? "อยู่ในระบบประมูล"
                        : "สินค้าไม่พร้อมขาย"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-8 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            รีวิวของร้านค้านี้ ({reviewSummary?.total || 0})
          </h2>
          {reviewSummary?.total > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <StarDisplay value={reviewSummary.averageRating} size={16} />
              <span className="font-semibold text-gray-900">
                {reviewSummary.averageRating.toFixed(1)}
              </span>
              <span>/ 5.0</span>
            </div>
          )}
        </div>

        {reviewsLoading && (
          <p className="text-sm text-gray-500">กำลังโหลดรีวิว...</p>
        )}
        {!reviewsLoading && reviews.length === 0 && (
          <p className="text-sm text-gray-500">ร้านค้านี้ยังไม่มีรีวิวจากผู้ซื้อ</p>
        )}

        <ul className="flex flex-col gap-3">
          {reviews.map((r) => {
            const reviewerLabel = getReviewerLabel(r);
            const initial =
              reviewerLabel.replace(/^ผู้ซื้อ[ (]*/, "")[0] || "U";
            return (
              <li
                key={r.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                      {initial.toUpperCase()}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">
                        {reviewerLabel}
                      </p>
                      <div className="mt-0.5">
                        <StarDisplay value={r.rating} size={12} />
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString("th-TH")}
                  </span>
                </div>
                {r.comment && (
                  <p className="mt-2.5 pl-10.5 text-sm text-gray-700">
                    {r.comment}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <Pagination
          page={reviewPage}
          totalPages={reviewTotalPages}
          onChange={setReviewPage}
        />
      </section>

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        targetId={product.sellerId}
        targetLabel={sellerName}
        productId={product.id}
        productLabel={product.title}
      />

      <Footer />
    </main>
  );
}
