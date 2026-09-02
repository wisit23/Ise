"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import MediaGallery from "../../../components/MediaGallery";
import { StarDisplay } from "../../../components/StarRating";
import ReportModal from "../../../components/ReportModal";
import Alert from "../../../components/ui/Alert";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { fetchConditions } from "../../../lib/catalog";

const STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "ถูกล็อกไว้ในตะกร้าแล้ว",
  sold: "ขายแล้ว",
};

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

  useEffect(() => {
    apiFetch(`/api/products/${id}`)
      .then((p) => {
        setProduct(p);
        apiFetch(`/api/auth/users/${p.sellerId}/public`)
          .then(setSeller)
          .catch((err) => console.error("โหลดข้อมูลผู้ขายไม่สำเร็จ:", err));
        apiFetch(`/api/reviews/by-seller/${p.sellerId}/summary`)
          .then(setReviewSummary)
          .catch((err) => console.error("โหลดคะแนนรีวิวผู้ขายไม่สำเร็จ:", err));
      })
      .catch((err) => setError(err.message));
    fetchConditions()
      .then((items) =>
        setConditionLabels(
          Object.fromEntries(items.map((c) => [c.value, c.label])),
        ),
      )
      .catch((err) => console.error("โหลดรายการสภาพสินค้าไม่สำเร็จ:", err));
  }, [id]);

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
            <Link
              href={`/store/${product.sellerId}`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              ดูร้านค้า
            </Link>
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

          {!added && (
            <div className="mt-6 flex gap-3">
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
                {available ? "ซื้อเลย" : "สินค้าไม่พร้อมขาย"}
              </button>
            </div>
          )}
        </div>
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
