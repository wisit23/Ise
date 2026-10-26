"use client";
import Icon from "../../../components/ui/Icon";

import ReferenceCode from "../../../components/ui/ReferenceCode";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import MediaGallery from "../../../components/MediaGallery";
import ReviewMediaGallery from "../../../components/ReviewMediaGallery";
import WishlistButton from "../../../components/WishlistButton";
import { StarDisplay } from "../../../components/StarRating";
import Pagination from "../../../components/Pagination";
import ReportModal from "../../../components/ReportModal";
import ContactSellerButton from "../../../components/chat/ContactSellerButton";
import Alert from "../../../components/ui/Alert";
import Modal from "../../../components/ui/Modal";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import OrderShippingModal from "../../../components/orders/OrderShippingModal";
import OrderConfirmationModal from "../../../components/orders/OrderConfirmationModal";
import { apiFetch } from "../../../lib/api";
import {
  getAccessToken,
  getAccessTokenClaims,
  getStoredUser,
  getCurrentRoles,
  isCustomerAccountRoles,
  canPurchaseProduct,
} from "../../../lib/auth";
import { fetchConditions } from "../../../lib/catalog";
import { useChatSocketEvent } from "../../../components/chat/ChatSocketProvider";

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

function getVisitorId() {
  if (typeof window === "undefined") return null;
  try {
    let vid = localStorage.getItem("reloop_visitor_id");
    if (!vid) {
      vid = `guest-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem("reloop_visitor_id", vid);
    }
    return vid;
  } catch {
    return null;
  }
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
  const [reportReviewTarget, setReportReviewTarget] = useState(null);
  const [reportedReviewIds, setReportedReviewIds] = useState([]);
  const [myPendingOrder, setMyPendingOrder] = useState(null);

  const [reviews, setReviews] = useState([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotalPages, setReviewTotalPages] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [applicableVouchers, setApplicableVouchers] = useState([]);
  const [unavailableVouchers, setUnavailableVouchers] = useState([]);
  const [availableCampaigns, setAvailableCampaigns] = useState([]);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [sellerActiveOrder, setSellerActiveOrder] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [shippingModalOpen, setShippingModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [viewer, setViewer] = useState({
    ready: false,
    isAuthenticated: false,
    userId: null,
    roles: [],
  });

  const campaignRequestIdRef = useRef(0);
  const lastIdentityRef = useRef({
    initialized: false,
    userId: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    function syncViewer() {
      const token = getAccessToken();
      const user = getStoredUser();
      const claims = getAccessTokenClaims();
      const roles = getCurrentRoles();
      const nextUserId = claims?.sub || user?.id || null;
      const nextIsAuth = Boolean(token);

      const isInitialized = lastIdentityRef.current.initialized;
      const identityChanged =
        isInitialized &&
        (lastIdentityRef.current.userId !== nextUserId ||
          lastIdentityRef.current.isAuthenticated !== nextIsAuth);

      lastIdentityRef.current = {
        initialized: true,
        userId: nextUserId,
        isAuthenticated: nextIsAuth,
      };

      if (identityChanged) {
        campaignRequestIdRef.current += 1;
        setSelectedVoucher(null);
        setApplicableVouchers([]);
        setUnavailableVouchers([]);
        setAvailableCampaigns([]);
        setVoucherModalOpen(false);
        setMyPendingOrder(null);
      }

      setViewer({
        ready: true,
        isAuthenticated: nextIsAuth,
        userId: nextUserId,
        roles,
      });
    }

    syncViewer();
    if (typeof window !== "undefined") {
      window.addEventListener("reloop:auth", syncViewer);
      return () => {
        window.removeEventListener("reloop:auth", syncViewer);
      };
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    const roles = getCurrentRoles();
    if (token && id && isCustomerAccountRoles(roles)) {
      apiFetch("/api/orders/cart", { token })
        .then((data) => {
          const match = data.items?.find((o) => o.productId === id);
          if (match) setMyPendingOrder(match);
          else setMyPendingOrder(null);
        })
        .catch(() => setMyPendingOrder(null));
    } else {
      setMyPendingOrder(null);
    }
  }, [id, viewer.isAuthenticated, viewer.userId]);

  useEffect(() => {
    campaignRequestIdRef.current += 1;
    setProduct(null);
    setSeller(null);
    setReviewSummary(null);
    setSelectedVoucher(null);
    setApplicableVouchers([]);
    setUnavailableVouchers([]);
    setAvailableCampaigns([]);
    setVoucherModalOpen(false);
    setError("");
    setNotice("");
    setAdded(false);


    const token = getAccessToken();
    const visitorId = getVisitorId();
    const headers = {};
    if (visitorId) headers["x-visitor-id"] = visitorId;

    apiFetch(`/api/products/${id}`, {
      ...(token ? { token } : {}),
      headers,
    })
      .then(setupProduct)
      .catch((err) => {
        // Fallback for owners if gateway stripped the token
        apiFetch(`/api/products/mine?limit=100`, token ? { token } : {})
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

  // ── Real-time WebSocket Listeners ──────────────────────────────────────────
  useChatSocketEvent("product:updated", (payload) => {
    if (!payload?.product?.id || String(payload.product.id) !== String(id)) return;
    setProduct((prev) => (prev ? { ...prev, ...payload.product } : prev));
  });

  useChatSocketEvent("order:updated", (payload) => {
    const order = payload?.order;
    if (!order) return;
    if (order.productId && String(order.productId) === String(id)) {
      if (
        payload.action === "paid" ||
        payload.action === "confirmed" ||
        payload.action === "ready_to_ship" ||
        payload.action === "pickup_in_progress"
      ) {
        setProduct((prev) => (prev ? { ...prev, status: "reserved" } : prev));
      } else if (
        payload.action === "in_transit" ||
        payload.action === "delivered" ||
        payload.action === "completed"
      ) {
        setProduct((prev) => (prev ? { ...prev, status: "sold" } : prev));
      } else if (["cancelled", "rejected", "payment_expired", "seller_confirmation_expired"].includes(payload.action)) {
        setProduct((prev) => (prev ? { ...prev, status: "available" } : prev));
      }
    }
  });

  useEffect(() => {
    if (!viewer.ready || !product) {
      return;
    }

    const isOwn = Boolean(
      viewer.userId &&
      product.sellerId &&
      viewer.userId === product.sellerId
    );

    // If visitor is product owner: clear voucher states, close modal, and do not make coupon requests
    if (isOwn) {
      setSelectedVoucher(null);
      setApplicableVouchers([]);
      setUnavailableVouchers([]);
      setAvailableCampaigns([]);
      setVoucherModalOpen(false);
      return;
    }

    let cancelled = false;
    const requestId = ++campaignRequestIdRef.current;
    const token = getAccessToken();

    if (token && product.price) {
      apiFetch("/api/products/campaigns/applicable", {
        method: "POST",
        token,
        body: {
          price: product.price,
          category: product.category,
          includeUnavailable: true,
        },
      })
        .then((data) => {
          if (cancelled || campaignRequestIdRef.current !== requestId) return;
          const list = Array.isArray(data) ? data : data?.applicable || [];
          const unavailableList = Array.isArray(data)
            ? []
            : data?.unavailable || [];
          setApplicableVouchers(list);
          setUnavailableVouchers(unavailableList);
          if (list.length > 0) {
            setSelectedVoucher(list[0]);
          } else {
            setSelectedVoucher(null);
          }
        })
        .catch(() => {
          if (cancelled || campaignRequestIdRef.current !== requestId) return;
          setApplicableVouchers([]);
          setUnavailableVouchers([]);
          setSelectedVoucher(null);
        });
    } else {
      setApplicableVouchers([]);
      setUnavailableVouchers([]);
      setSelectedVoucher(null);
    }

    apiFetch("/api/products/campaigns/available")
      .then((data) => {
        if (cancelled || campaignRequestIdRef.current !== requestId) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        const matched = items.filter((c) => {
          if (c.minOrderPrice && product.price < c.minOrderPrice) return false;
          if (
            c.applicableCategory &&
            c.applicableCategory.trim().toLowerCase() !==
              (product.category || "").trim().toLowerCase()
          )
            return false;
          return true;
        });
        setAvailableCampaigns(matched);
      })
      .catch(() => {
        if (cancelled || campaignRequestIdRef.current !== requestId) return;
        setAvailableCampaigns([]);
      });

    return () => {
      cancelled = true;
    };
  }, [
    viewer.ready,
    viewer.userId,
    viewer.isAuthenticated,
    product?.id,
    product?.sellerId,
    product?.price,
    product?.category,
  ]);

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

  useEffect(() => {
    if (!product?.id || !viewer.isAuthenticated) return;
    const token = getAccessToken();
    if (!token) return;
    apiFetch(`/api/auth/reports/my-reported-reviews?productId=${product.id}`, { token })
      .then((res) => {
        if (res?.reportedReviewIds) {
          setReportedReviewIds(res.reportedReviewIds);
        }
      })
      .catch((err) => console.error("โหลดสถานะรีวิวที่รายงานแล้วไม่สำเร็จ:", err));
  }, [product?.id, viewer.isAuthenticated]);

  useEffect(() => {

    if (!viewer.isAuthenticated || !product || viewer.userId !== product.sellerId) {
      setSellerActiveOrder(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    apiFetch("/api/orders/selling?limit=50", { token })
      .then((data) => {
        const orderForThisProduct = (data.items || []).find(
          (o) =>
            o.productId === product.id &&
            ["paid", "confirmed", "ready_to_ship", "pickup_in_progress", "in_transit", "delivered", "completed"].includes(
              o.status,
            ),
        );
        setSellerActiveOrder(orderForThisProduct || null);
        if (
          orderForThisProduct &&
          ["in_transit", "delivered", "completed"].includes(orderForThisProduct.status)
        ) {
          setProduct((prev) => (prev ? { ...prev, status: "sold" } : prev));
        }
        const shouldOpenShip =
          typeof window !== "undefined" &&
          (new URLSearchParams(window.location.search).get("ship") === "1" ||
            Boolean(new URLSearchParams(window.location.search).get("orderId")));
        if (orderForThisProduct && shouldOpenShip) {
          setShippingModalOpen(true);
        }
      })
      .catch(() => {});
  }, [viewer, product]);

  async function handleConfirmDeleteProduct() {
    const token = getAccessToken();
    if (!token || !product?.id) return;
    setDeletingProduct(true);
    try {
      await apiFetch(`/api/products/${product.id}`, {
        method: "DELETE",
        token,
      });
      setShowDeleteModal(false);
      const currentUser = getStoredUser();
      const sellerId = currentUser?.id || product?.sellerId;
      router.push(sellerId ? `/store/${sellerId}` : "/seller/dashboard");
    } catch (err) {
      alert(err.message || "เกิดข้อผิดพลาดในการลบสินค้า");
      setShowDeleteModal(false);
    } finally {
      setDeletingProduct(false);
    }
  }

  const isOwnProduct = Boolean(
    viewer.userId &&
    product?.sellerId &&
    viewer.userId === product.sellerId
  );
  const showCouponUI = viewer.ready && !isOwnProduct;
  const activeVoucher = showCouponUI ? selectedVoucher : null;
  const ownedCampaignIds = new Set(
    [...applicableVouchers, ...unavailableVouchers]
      .map((voucher) => voucher.campaignId || voucher.campaign?.id)
      .filter(Boolean),
  );
  const claimableCampaigns = availableCampaigns.filter(
    (campaign) => !ownedCampaignIds.has(campaign.id),
  );

  async function addToCart() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return null;
    }
    if (isOwnProduct) {
      setNotice("คุณไม่สามารถซื้อสินค้าของตัวเองได้");
      return null;
    }

    setBusy(true);
    setNotice("");
    try {
      await apiFetch("/api/orders/cart", {
        method: "POST",
        token,
        body: {
          productId: product.id,
          campaignId: activeVoucher ? activeVoucher.campaignId : null,
        },
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
  // Guests keep the existing login CTA. Logged-in staff are read-only.
  const canPurchase =
    viewer.ready &&
    canPurchaseProduct({
      isAuthenticated: viewer.isAuthenticated,
      userId: viewer.userId,
      roles: viewer.roles,
      sellerId: product.sellerId,
    });
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
          {product.referenceCode && <ReferenceCode value={product} className="mt-2 text-xs text-ink-muted" />}
          <WishlistButton productId={product.id} title={product.title} className="mt-3" />
          {/* Price display with interactive voucher */}
          <div className="mt-3">
            {activeVoucher ? (
              <div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl font-bold text-emerald-600">
                    ฿{activeVoucher.finalPrice.toLocaleString("th-TH")}
                  </span>
                  <span className="text-base text-gray-400 line-through">
                    ฿{product.price.toLocaleString("th-TH")}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    ลดไป ฿
                    {activeVoucher.estimatedDiscount.toLocaleString("th-TH")}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                      confirmation_number
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                          {activeVoucher.campaign?.code}
                        </span>
                        <span className="text-xs font-bold text-emerald-800">
                          {activeVoucher.campaign?.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        ลดทันที ฿
                        {activeVoucher.estimatedDiscount.toLocaleString(
                          "th-TH",
                        )}{" "}
                        จากราคาปกติ
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (showCouponUI) setVoucherModalOpen(true);
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                    >
                      เปลี่ยนโค้ด
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedVoucher(null)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                    >
                      ไม่ใช้โค้ด
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-3xl font-bold text-emerald-600">
                  ฿{product.price.toLocaleString("th-TH")}
                </p>

                {showCouponUI && applicableVouchers.length > 0 ? (
                  <div className="mt-2.5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                        sell
                      </span>
                      <div>
                        <p className="text-xs font-bold text-emerald-900">
                          คุณมีโค้ดส่วนลดที่ใช้ได้กับสินค้านี้ (
                          {applicableVouchers.length} ใบ)
                        </p>
                        <p className="text-[11px] text-emerald-700">
                          กดเลือกโค้ดเพื่อรับส่วนลดสูงสุด ฿
                          {applicableVouchers[0].estimatedDiscount.toLocaleString(
                            "th-TH",
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (showCouponUI) setVoucherModalOpen(true);
                      }}
                      className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      เลือกโค้ดส่วนลด
                    </button>
                  </div>
                ) : showCouponUI && unavailableVouchers.length > 0 ? (
                  <div className="mt-2.5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                        sell
                      </span>
                      <div>
                        <p className="text-xs font-bold text-emerald-900">
                          คุณมีโค้ดส่วนลดในกระเป๋า ({unavailableVouchers.length} ใบ)
                        </p>
                        <p className="text-[11px] text-emerald-700">
                          กดเพื่อดูโค้ดและเงื่อนไขการใช้
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVoucherModalOpen(true)}
                      className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      เลือกโค้ดส่วนลด
                    </button>
                  </div>
                ) : showCouponUI && claimableCampaigns.length > 0 ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-[20px]">
                        sell
                      </span>
                      <div>
                        <p className="text-xs font-bold text-amber-900">
                          มีแคมเปญส่วนลดสำหรับสินค้านี้
                        </p>
                        <p className="text-xs text-amber-700">
                          {claimableCampaigns[0].discountType === "PERCENT"
                            ? `ลด ${claimableCampaigns[0].discountValue}%${claimableCampaigns[0].maxDiscount ? ` สูงสุด ฿${claimableCampaigns[0].maxDiscount.toLocaleString("th-TH")}` : ""}`
                            : `ลด ฿${claimableCampaigns[0].discountValue.toLocaleString("th-TH")}`}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/campaigns"
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
                    >
                      เก็บโค้ด
                    </Link>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {product.brand && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                แบรนด์: {product.brand}
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              สภาพ: {conditionLabels[product.condition] || product.condition}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              ไซส์: {product.size}
            </span>
            {product.location && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                <Icon name="location_on" /> {product.location}
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
            {product.status === "sold" && (
              <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                หมด
              </span>
            )}
            <span
              data-testid="product-view-count"
              className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">visibility</span>
              เข้าชม {product.viewCount ?? 0} ครั้ง
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

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
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
              {product.status !== "sold" &&
                getStoredUser()?.id !== product.sellerId && (
                  <ContactSellerButton
                    productId={product.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-3.5 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                )}
              <Link
                href={`/store/${product.sellerId}`}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 text-center"
              >
                ดูร้านค้า
              </Link>
            </div>
          </div>

          {isOwnProduct ? (
            product.status === "sold" || product.preRemovalStatus === "sold" ||
            ["in_transit", "delivered", "completed"].includes(sellerActiveOrder?.status) ? (
              <p className="mt-3 text-xs text-gray-500">สินค้านี้ขายแล้ว ไม่สามารถแก้ไขหรือลบได้</p>
            ) : (
            <div className="flex items-center gap-2.5 mt-3">
              <Link
                href={`/products/${product.id}/edit`}
                className="inline-block text-xs font-medium text-gray-500 hover:text-emerald-600 hover:underline"
              >
                แก้ไขสินค้านี้
              </Link>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                disabled={product.status === "reserved" || busy || deletingProduct}
                onClick={() => setShowDeleteModal(true)}
                className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline disabled:opacity-40 disabled:hover:text-red-500 disabled:no-underline"
                title={product.status === "reserved" ? "ไม่สามารถลบสินค้าที่อยู่ระหว่างการสั่งซื้อได้" : "ลบสินค้านี้"}
              >
                ลบสินค้านี้
              </button>
            </div>
            )
          ) : (
            <button
              onClick={() => setShowReport(true)}
              className="mt-3 text-xs font-medium text-gray-500 hover:text-red-600 hover:underline"
            >
              รายงานผู้ขายรายนี้
            </button>
          )}

          {isOwnProduct && sellerActiveOrder && (
            <div className="mt-4 animate-slide-up rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-600 text-[24px] shrink-0">
                  {sellerActiveOrder.status === "paid"
                    ? "receipt_long"
                    : "local_shipping"}
                </span>
                <div>
                  <p className="font-bold">
                    {sellerActiveOrder.status === "paid"
                      ? <><Icon name="shopping_cart" /> สินค้านี้มีคำสั่งซื้อใหม่ รอคุณยืนยันภายใน 1 วัน</>
                      : sellerActiveOrder.status === "confirmed"
                        ? <><Icon name="package_2" /> กรุณาเตรียมสินค้าสำหรับคำสั่งซื้อนี้</>
                        : sellerActiveOrder.status === "ready_to_ship"
                          ? <><Icon name="package_2" /> สินค้าพร้อมเรียกขนส่ง</>
                          : sellerActiveOrder.status === "pickup_in_progress"
                            ? <><Icon name="package_2" /> ขนส่งกำลังเข้ารับสินค้า</>
                            : ["delivered", "completed"].includes(sellerActiveOrder.status)
                              ? <><Icon name="check_circle" /> จัดส่งสินค้าเสร็จเรียบร้อยแล้ว (สินค้าหมด)</>
                              : <><Icon name="local_shipping" /> สินค้านี้อยู่ระหว่างการขนส่ง</>}
                  </p>
                  <p className="text-xs text-emerald-700 font-mono mt-0.5">
                    Order ID: #{sellerActiveOrder.id}
                  </p>
                </div>
              </div>
              {sellerActiveOrder.status === "paid" ? (
                <button
                  type="button"
                  onClick={() => setConfirmModalOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 font-bold text-xs shadow-sm transition active:scale-95"
                  title="เปิดดูรายละเอียดผู้ซื้อเพื่อยืนยันหรือปฏิเสธออเดอร์"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    check_circle
                  </span>
                  <span>ยืนยันรับออเดอร์</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShippingModalOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 font-bold text-xs shadow-sm transition active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    local_shipping
                  </span>
                  <span>
                    {["confirmed", "ready_to_ship"].includes(sellerActiveOrder.status)
                      ? "เรียกขนส่ง"
                        : sellerActiveOrder.status === "pickup_in_progress"
                          ? "ส่งมอบให้ขนส่งแล้ว"
                          : "ดูรายละเอียดการจัดส่ง"}
                  </span>
                </button>
              )}
            </div>
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
                      ? <><Icon name="celebration" /> คุณเป็นผู้ชนะการประมูลสินค้านี้!</>
                      : "สินค้านี้อยู่ในตะกร้าของคุณแล้ว"}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    รายการนี้ถูกล็อกไว้รอให้คุณชำระเงิน
                    กรุณากดไปที่ตะกร้าเพื่อดำเนินการ
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

          {canPurchase && !added && (
            <div className="mt-6 flex gap-3">
              {myPendingOrder ? (
                <Link
                  href="/cart"
                  className="flex-1 rounded-md bg-emerald-600 py-3 text-center font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  <Icon name="payments" /> ไปชำระเงินที่ตะกร้าสินค้า ({baht(myPendingOrder.price)})
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
                    className="flex-1 rounded-md bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 transition"
                  >
                    {available
                      ? activeVoucher
                        ? `ซื้อเลย (฿${activeVoucher.finalPrice.toLocaleString("th-TH")})`
                        : `ซื้อเลย (฿${product.price.toLocaleString("th-TH")})`
                      : product.status === "auction"
                        ? "อยู่ในระบบประมูล"
                        : product.status === "sold"
                          ? "หมด"
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
          <p className="text-sm text-gray-500">
            ร้านค้านี้ยังไม่มีรีวิวจากผู้ซื้อ
          </p>
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
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString("th-TH")}
                    </span>
                    {viewer.isAuthenticated && viewer.userId !== r.buyerId && (
                      (() => {
                        const isReported = reportedReviewIds.includes(r.id);
                        return (
                          <button
                            type="button"
                            onClick={() => setReportReviewTarget(r)}
                            className={`inline-flex items-center gap-1 text-[11px] transition ${
                              isReported
                                ? "text-red-600 font-medium"
                                : "text-gray-400 hover:text-red-600"
                            }`}
                            title={
                              isReported
                                ? "คุณได้รายงานความคิดเห็นนี้แล้ว (อยู่ระหว่างรอผลการตัดสิน)"
                                : "รายงานรีวิวนี้ (เช่น รีวิวปั่น, ข้อมูลเท็จ)"
                            }
                          >
                            <span
                              className={`material-symbols-outlined text-[14px] ${
                                isReported
                                  ? "text-red-600 [font-variation-settings:'FILL'_1]"
                                  : ""
                              }`}
                              style={
                                isReported
                                  ? { fontVariationSettings: "'FILL' 1" }
                                  : undefined
                              }
                            >
                              flag
                            </span>
                            <span>{isReported ? "รายงานแล้ว" : "รายงาน"}</span>
                          </button>
                        );
                      })()
                    )}

                  </div>
                </div>
                {r.comment && (
                  <p className="mt-2.5 pl-10.5 text-sm text-gray-700">
                    {r.comment}
                  </p>
                )}
                {r.media && r.media.length > 0 && (
                  <div className="pl-10.5">
                    <ReviewMediaGallery media={r.media} />
                  </div>
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

      {/* Voucher Selector Modal */}
      <Modal
        open={showCouponUI && voucherModalOpen}
        onClose={() => setVoucherModalOpen(false)}
        title="เลือกโค้ดส่วนลด"
        size="md"
      >
        <div className="space-y-3 p-1">
          {/* Option: Do not use voucher */}
          <div
            onClick={() => {
              setSelectedVoucher(null);
              setVoucherModalOpen(false);
            }}
            className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${
              selectedVoucher === null
                ? "border-emerald-500 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`material-symbols-outlined text-[20px] ${
                  selectedVoucher === null
                    ? "text-emerald-600"
                    : "text-slate-400"
                }`}
              >
                {selectedVoucher === null
                  ? "radio_button_checked"
                  : "radio_button_unchecked"}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  ไม่เลือกใช้โค้ดส่วนลด
                </p>
                <p className="text-[11px] text-slate-500">
                  ซื้อสินค้าในราคาปกติ ฿{product.price.toLocaleString("th-TH")}
                </p>
              </div>
            </div>
            {selectedVoucher === null && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                กำลังใช้อยู่
              </span>
            )}
          </div>

          <div className="border-t border-slate-100 my-2" />
          <p className="text-xs font-semibold text-slate-600 mb-1">
            คูปองในกระเป๋าของคุณที่ใช้ได้ ({applicableVouchers.length} ใบ):
          </p>

          {applicableVouchers.map((v) => {
            const isSelected = selectedVoucher?.id === v.id;
            return (
              <div
                key={v.id}
                onClick={() => {
                  setSelectedVoucher(v);
                  setVoucherModalOpen(false);
                }}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500"
                    : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50/50 bg-white"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`material-symbols-outlined text-[20px] mt-0.5 ${
                      isSelected ? "text-emerald-600" : "text-slate-400"
                    }`}
                  >
                    {isSelected
                      ? "radio_button_checked"
                      : "radio_button_unchecked"}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-900">
                        {v.campaign?.code}
                      </span>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        ลด ฿{v.estimatedDiscount.toLocaleString("th-TH")}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 mt-1">
                      {v.campaign?.name}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      จ่ายสุทธิเพียง{" "}
                      <strong className="text-emerald-700 font-bold">
                        ฿{v.finalPrice.toLocaleString("th-TH")}
                      </strong>{" "}
                      (จากปกติ ฿{product.price.toLocaleString("th-TH")})
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isSelected ? "เลือกอยู่" : "ใช้โค้ดนี้"}
                </button>
              </div>
            );
          })}

          {unavailableVouchers.length > 0 && (
            <>
              <div className="border-t border-slate-100 my-2" />
              <p className="text-xs font-semibold text-slate-600 mb-1">
                โค้ดที่ใช้กับสินค้านี้ไม่ได้ ({unavailableVouchers.length} ใบ):
              </p>
              {unavailableVouchers.map((voucher) => (
                <div
                  key={voucher.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-slate-500"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {voucher.campaign?.code}
                    </span>
                    <p className="mt-1 text-[11px] text-amber-700">
                      {voucher.reasonMessage}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="shrink-0 cursor-not-allowed rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500"
                  >
                    ใช้ไม่ได้
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </Modal>

      <OrderShippingModal
        orderId={sellerActiveOrder?.id}
        initialOrder={sellerActiveOrder}
        isOpen={shippingModalOpen}
        onClose={() => setShippingModalOpen(false)}
        onShipped={(updated) => {
          setSellerActiveOrder(updated);
          setProduct((prev) => (prev ? { ...prev, status: "sold" } : prev));
        }}
        onRejected={(updated) => {
          setSellerActiveOrder(updated);
          setNotice("ปฏิเสธคำสั่งซื้อเรียบร้อยแล้ว สินค้านี้กลับมาพร้อมขายอีกครั้ง");
          setProduct((prev) => (prev ? { ...prev, status: "available" } : prev));
        }}
        onOrderUpdated={(updated) => {
          setSellerActiveOrder(updated);
        }}
      />

      <OrderConfirmationModal
        orderId={sellerActiveOrder?.id}
        initialOrder={sellerActiveOrder}
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirmed={(updated) => {
          setSellerActiveOrder(updated);
        }}
        onRejected={(updated) => {
          setSellerActiveOrder(updated);
          setNotice("ปฏิเสธคำสั่งซื้อเรียบร้อยแล้ว สินค้านี้กลับมาพร้อมขายอีกครั้ง");
          setProduct((prev) => (prev ? { ...prev, status: "available" } : prev));
        }}
        onOrderUpdated={(updated) => {
          setSellerActiveOrder(updated);
        }}
      />

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        targetId={product.sellerId}
        targetLabel={sellerName}
      />

      <ReportModal
        open={Boolean(reportReviewTarget)}
        onClose={() => setReportReviewTarget(null)}
        onSuccess={({ reviewId }) => {
          if (reviewId) {
            setReportedReviewIds((prev) =>
              Array.from(new Set([...prev, reviewId])),
            );
          }
        }}
        title="รายงานรีวิวที่ไม่เหมาะสม"

        targetId={reportReviewTarget?.buyerId}
        targetLabel={
          reportReviewTarget?.reviewerName ||
          (reportReviewTarget?.buyerId
            ? `ผู้ใช้ #${reportReviewTarget.buyerId.slice(0, 8)}`
            : null)
        }
        productId={product?.id}
        productLabel={product?.title}
        reviewId={reportReviewTarget?.id}
        reviewComment={reportReviewTarget?.comment}
      />

      {/* ── Product Deletion Confirmation Modal ── */}
      <ConfirmDialog
        open={showDeleteModal}
        title="ยืนยันการลบสินค้า"
        description={`คุณแน่ใจว่าต้องการลบสินค้า "${product?.title || ""}" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`}
        confirmLabel="ยืนยันการลบ"
        cancelLabel="ยกเลิก"
        tone="danger"
        busy={deletingProduct}
        onConfirm={handleConfirmDeleteProduct}
        onCancel={() => !deletingProduct && setShowDeleteModal(false)}
      />

      <Footer />
    </main>
  );
}
