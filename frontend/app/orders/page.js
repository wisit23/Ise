"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Pagination from "../../components/Pagination";
import { StarInput, StarDisplay } from "../../components/StarRating";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch, uploadDisputeEvidence } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

const STATUS_LABEL = {
  pending: "อยู่ในตะกร้า",
  pending_payment: "อยู่ในตะกร้า",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
  disputed: "อยู่ระหว่างข้อพิพาท",
  refunded: "คืนเงินแล้ว",
};

const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  pending_payment: "bg-amber-50 text-amber-700",
  confirmed: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
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
  { key: "completed", label: "สำเร็จ", status: "completed" },
  { key: "cancelled", label: "ยกเลิก", status: "cancelled" },
];

const PAGE_SIZE = 8;

function ReviewForm({ order, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    setSubmitting(true);
    setError("");
    try {
      const review = await apiFetch("/api/reviews", {
        method: "POST",
        token,
        body: { orderId: order.id, rating, comment },
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
      className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
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
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "กำลังส่ง..." : "ส่งรีวิว"}
      </button>
    </form>
  );
}

/** WF-08: buyer opens a dispute + attaches evidence in one step. Files
 * upload one at a time to /disputes/:id/evidence after the dispute exists —
 * that endpoint needs a disputeId, which only exists once open() succeeds. */
function DisputeForm({ order, onOpened }) {
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    setSubmitting(true);
    setError("");
    try {
      const dispute = await apiFetch(`/api/orders/${order.id}/disputes`, {
        method: "POST",
        token,
        body: { reason },
      });
      for (const file of files) {
        await uploadDisputeEvidence(dispute.id, file, token);
      }
      onOpened(dispute);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3"
    >
      <p className="text-xs text-gray-600">
        อธิบายปัญหาให้ละเอียด (เช่น สินค้าชำรุด ไม่ตรงตามที่ตกลง)
        แนบรูปภาพ/วิดีโอประกอบเพื่อให้เจ้าหน้าที่พิจารณาได้เร็วขึ้น
      </p>
      <textarea
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="เหตุผลที่ขอคืนเงิน/คืนสินค้า"
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        className="text-xs text-gray-600"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {submitting ? "กำลังส่ง..." : "ส่งคำร้องขอคืนเงิน/คืนสินค้า"}
      </button>
    </form>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewedByOrderId, setReviewedByOrderId] = useState({});
  const [openReviewFor, setOpenReviewFor] = useState(null);
  const [openDisputeFor, setOpenDisputeFor] = useState(null);
  const [justDisputedIds, setJustDisputedIds] = useState(new Set());

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

  function handleTab(key) {
    setTab(key);
    setPage(1);
  }

  const hasPending =
    tab === "all" &&
    items.some((o) => ["pending", "pending_payment"].includes(o.status));

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          คำสั่งซื้อของฉัน
        </h1>
        {hasPending && (
          <p className="mb-4 text-sm text-gray-500">
            มีสินค้าที่ล็อกไว้รอชำระเงิน ไปที่{" "}
            <Link href="/cart" className="text-emerald-600 hover:underline">
              ตะกร้า
            </Link>{" "}
            เพื่อชำระเงิน
          </p>
        )}

        <div className="mb-6 flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
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
            return (
              <li
                key={o.id}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {o.productTitle}
                    </p>
                    <p className="text-sm text-gray-500">
                      ฿{o.price.toLocaleString("th-TH")} · สั่งซื้อเมื่อ{" "}
                      {new Date(o.createdAt).toLocaleDateString("th-TH")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                      STATUS_STYLE[o.status] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </div>

                {o.status === "completed" && (
                  <div className="mt-2">
                    {review ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <StarDisplay value={review.rating} />
                        {review.comment && (
                          <span className="text-gray-500">
                            &quot;{review.comment}&quot;
                          </span>
                        )}
                      </div>
                    ) : openReviewFor === o.id ? (
                      <ReviewForm
                        order={o}
                        onSubmitted={(review) => {
                          setReviewedByOrderId((prev) => ({
                            ...prev,
                            [o.id]: review,
                          }));
                          setOpenReviewFor(null);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setOpenReviewFor(o.id)}
                        className="text-sm font-medium text-emerald-600 hover:underline"
                      >
                        ให้คะแนนร้านค้า
                      </button>
                    )}
                  </div>
                )}

                {o.status === "completed" && !justDisputedIds.has(o.id) && (
                  <div className="mt-2">
                    {openDisputeFor === o.id ? (
                      <DisputeForm
                        order={o}
                        onOpened={() => {
                          setJustDisputedIds((prev) => new Set(prev).add(o.id));
                          setOpenDisputeFor(null);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setOpenDisputeFor(o.id)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        มีปัญหากับคำสั่งซื้อนี้? ขอคืนเงิน/คืนสินค้า
                      </button>
                    )}
                  </div>
                )}

                {(o.status === "disputed" ||
                  o.status === "refunded" ||
                  justDisputedIds.has(o.id)) && (
                  <div className="mt-2">
                    <Link
                      href={`/support/cases/${o.id}`}
                      className="text-sm font-medium text-emerald-600 hover:underline"
                    >
                      ดูสถานะข้อพิพาท →
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </section>
      <Footer />
    </main>
  );
}
