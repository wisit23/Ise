"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import ProductCard from "../../../components/ProductCard";
import Reveal from "../../../components/ui/Reveal";
import Pagination from "../../../components/Pagination";
import { StarDisplay } from "../../../components/StarRating";
import ReportModal from "../../../components/ReportModal";
import { apiFetch } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";

const PRODUCT_PAGE_SIZE = 12;
const REVIEW_PAGE_SIZE = 5;

export default function StorePage() {
  const { sellerId } = useParams();
  const [seller, setSeller] = useState(undefined);
  const [items, setItems] = useState([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({
    total: 0,
    averageRating: 0,
  });
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotalPages, setReviewTotalPages] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    apiFetch(`/api/auth/users/${sellerId}/public`)
      .then(setSeller)
      .catch(() => setSeller(null));
  }, [sellerId]);

  useEffect(() => {
    setLoading(true);
    apiFetch(
      `/api/products/by-seller/${sellerId}?page=${productPage}&limit=${PRODUCT_PAGE_SIZE}`,
    )
      .then((data) => {
        setItems(data.items);
        setProductTotal(data.total);
        setProductTotalPages(data.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sellerId, productPage]);

  useEffect(() => {
    setReviewsLoading(true);
    apiFetch(
      `/api/reviews/by-seller/${sellerId}?page=${reviewPage}&limit=${REVIEW_PAGE_SIZE}`,
    )
      .then((data) => {
        setReviews(data.items);
        setReviewSummary({
          total: data.total,
          averageRating: data.averageRating,
        });
        setReviewTotalPages(data.totalPages);
      })
      .catch((err) => console.error("โหลดรีวิวของร้านไม่สำเร็จ:", err))
      .finally(() => setReviewsLoading(false));
  }, [sellerId, reviewPage]);

  const sellerName = seller
    ? seller.shopName || `${seller.firstName} ${seller.lastName}`
    : "ร้านค้า";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-8">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-700">
              {sellerName?.[0] || "?"}
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{sellerName}</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                {reviewSummary.total > 0 ? (
                  <>
                    <StarDisplay value={reviewSummary.averageRating} />
                    <span className="font-medium text-gray-700">
                      {reviewSummary.averageRating.toFixed(1)}
                    </span>
                    <span>({reviewSummary.total} รีวิว)</span>
                  </>
                ) : (
                  <span>ยังไม่มีรีวิว</span>
                )}
                <span>· สินค้าทั้งหมด {productTotal} รายการ</span>
              </div>
            </div>
          </div>
          {getStoredUser()?.id !== sellerId && (
            <button
              onClick={() => setShowReport(true)}
              className="shrink-0 text-xs font-medium text-gray-500 hover:text-red-600 hover:underline"
            >
              รายงานร้านค้านี้
            </button>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && items.length === 0 && (
          <p className="text-gray-500">ร้านนี้ยังไม่มีสินค้าวางขาย</p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 7) * 45}>
              <ProductCard product={p} showSeller={false} />
            </Reveal>
          ))}
        </div>
        <Pagination
          page={productPage}
          totalPages={productTotalPages}
          onChange={setProductPage}
        />

        <div className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            รีวิวจากผู้ซื้อ
          </h2>
          {reviewsLoading && (
            <p className="text-sm text-gray-500">กำลังโหลด...</p>
          )}
          {!reviewsLoading && reviews.length === 0 && (
            <p className="text-sm text-gray-500">ร้านนี้ยังไม่มีรีวิว</p>
          )}
          <ul className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <StarDisplay value={r.rating} />
                  <span className="text-xs text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString("th-TH")}
                  </span>
                </div>
                {r.comment && (
                  <p className="mt-1.5 text-sm text-gray-700">{r.comment}</p>
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={reviewPage}
            totalPages={reviewTotalPages}
            onChange={setReviewPage}
          />
        </div>
      </div>

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        targetId={sellerId}
        targetLabel={sellerName}
      />

      <Footer />
    </main>
  );
}
