"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Modal from "../../../components/ui/Modal";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const STATUS_LABEL = {
  pending_approval: "รออนุมัติจาก Marketing",
  rejected: "ถูกปฏิเสธ",
  approved: "อนุมัติแล้ว (เตรียมเปิดประมูลตามรอบ)",
  scheduled: "ตั้งเวลาแล้ว รอเปิด",
  open: "กำลังประมูล",
  closed: "ปิดประมูลแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

const STATUS_STYLE = {
  pending_approval: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  approved: "bg-sky-50 text-sky-700",
  scheduled: "bg-sky-50 text-sky-700",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-500",
};

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function roundAcceptsProduct(round, product) {
  if (!product) return true;
  const categories = Array.isArray(round.categories) ? round.categories : [];
  return categories.length === 0 || categories.includes(product.category);
}

function RoundSelectionList({
  rounds,
  loading,
  product,
  isKycLocked,
  onRetry,
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500 animate-pulse">
        กำลังตรวจสอบรอบการประมูล...
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <span className="material-symbols-outlined text-4xl text-gray-400">
          event_busy
        </span>
        <h3 className="mt-2 text-sm font-bold text-gray-800">
          ขณะนี้ยังไม่มีรอบประมูลที่เปิดรับสินค้า
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">
          ฝ่ายการตลาดยังไม่ได้เปิดรอบรับสินค้าเข้าประมูล
          กรุณากลับมาตรวจสอบอีกครั้งในภายหลัง
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          ลองโหลดอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {rounds.map((round) => {
        const categories = Array.isArray(round.categories)
          ? round.categories
          : [];
        const acceptsProduct = roundAcceptsProduct(round, product);
        const href = product
          ? `/seller/auctions/submit?roundId=${round.id}&productId=${product.id}`
          : `/seller/auctions/submit?roundId=${round.id}`;

        return (
          <article
            key={round.id}
            className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                <h3 className="text-sm font-bold text-gray-900">
                  {round.title}
                </h3>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  กำลังเปิดรับ
                </span>
              </div>

              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">ปิดรับสินค้า</dt>
                  <dd className="text-right font-semibold text-red-600">
                    {fmt(round.submissionEndsAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">ช่วงเวลาประมูล</dt>
                  <dd className="text-right text-gray-700">
                    {fmt(round.auctionStartsAt)} — {fmt(round.auctionEndsAt)}
                  </dd>
                </div>
              </dl>

              <div className="mt-3">
                <p className="mb-1 text-[11px] text-gray-500">
                  หมวดหมู่ที่เปิดรับ
                </p>
                <div className="flex flex-wrap gap-1">
                  {categories.length > 0 ? (
                    categories.map((category) => (
                      <span
                        key={category}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                      >
                        {category}
                      </span>
                    ))
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      ทุกหมวดหมู่ (All Categories)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-3">
              {isKycLocked ? (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-lg bg-gray-200 py-2.5 text-xs font-semibold text-gray-400"
                >
                  ต้องยืนยันตัวตน (KYC) ก่อนส่งสินค้า
                </button>
              ) : !acceptsProduct ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-amber-700">
                    รอบนี้ไม่รับสินค้าหมวดหมู่ {product.category}
                  </p>
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-lg bg-gray-200 py-2.5 text-xs font-semibold text-gray-400"
                  >
                    เลือกรอบนี้ไม่ได้
                  </button>
                </div>
              ) : (
                <Link
                  href={href}
                  className="block w-full rounded-lg bg-emerald-600 py-2.5 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  {product ? "เลือกรอบนี้สำหรับสินค้านี้" : "เลือกรอบนี้"}
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function SellerAuctionsPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [myAuctions, setMyAuctions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [roundInfo, setRoundInfo] = useState(null);
  const [loadingRound, setLoadingRound] = useState(true);
  const [kycStatus, setKycStatus] = useState(null);
  const [actionRequiredProducts, setActionRequiredProducts] = useState([]);
  const [roundPicker, setRoundPicker] = useState(null);
  const [relistProduct, setRelistProduct] = useState(null);
  const [relistPrice, setRelistPrice] = useState("");
  const [relistLoading, setRelistLoading] = useState(false);
  const [relistError, setRelistError] = useState("");

  const load = useCallback((currentUser) => {
    if (!currentUser) return;
    setLoading(true);
    apiFetch("/api/products/auctions?limit=100")
      .then((data) =>
        setMyAuctions(data.items.filter((a) => a.sellerId === currentUser.id)),
      )
      .catch((err) =>
        setError(
          err.message ||
            "เกิดข้อผิดพลาดในการโหลดรายการประมูล กรุณาลองใหม่อีกครั้ง",
        ),
      )
      .finally(() => setLoading(false));

    setLoadingRound(true);
    apiFetch("/api/products/auctions/rounds/current")
      .then((data) => setRoundInfo(data))
      .catch((err) => console.error("โหลดข้อมูลรอบประมูลไม่สำเร็จ:", err))
      .finally(() => setLoadingRound(false));

    const token = getAccessToken();
    if (token) {
      apiFetch("/api/products/mine?status=auction_action_required", { token })
        .then((data) => setActionRequiredProducts(data?.items || []))
        .catch((err) =>
          console.error("โหลดสินค้าที่รอการดำเนินการไม่สำเร็จ:", err),
        );
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (storedUser?.role !== "SELLER") {
      setLoading(false);
      return;
    }
    apiFetch("/api/auth/kyc/mine", { token })
      .then((data) => setKycStatus(data.kycStatus))
      .catch(() => setKycStatus("NONE"));
    load(storedUser);
  }, [router, load]);

  if (user === undefined || loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-lg px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (user?.role !== "SELLER") {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <NavBar />
        <section className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
          <h1 className="mb-4 text-xl font-bold text-gray-900">
            ลงสินค้าเข้าประมูล
          </h1>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            บัญชีนี้ไม่ใช่บัญชีผู้ขาย กรุณาเข้าสู่ระบบด้วยบัญชีผู้ขาย
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  async function handleRelistSubmit(e) {
    e.preventDefault();
    setRelistError("");
    const priceNum = Number(relistPrice);
    if (!Number.isInteger(priceNum) || priceNum <= 0) {
      setRelistError("ราคาขายใหม่ต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
      return;
    }
    setRelistLoading(true);
    try {
      const token = getAccessToken();
      await apiFetch(`/api/products/${relistProduct.id}/relist-available`, {
        method: "POST",
        token,
        body: { price: priceNum },
      });
      setRelistProduct(null);
      setRelistPrice("");
      load(user);
    } catch (err) {
      setRelistError(err.message || "เกิดข้อผิดพลาดในการนำสินค้ากลับไปขาย");
    } finally {
      setRelistLoading(false);
    }
  }

  const isKycLocked = Boolean(kycStatus && kycStatus !== "VERIFIED");

  // Determine active submission rounds (array)
  const activeSubmissionRounds = Array.isArray(
    roundInfo?.activeSubmissionRounds,
  )
    ? roundInfo.activeSubmissionRounds
    : roundInfo?.isSubmissionOpen && roundInfo?.round
      ? [roundInfo.round]
      : [];

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">สินค้าประมูล</h1>
            <p className="mt-1 text-sm text-gray-500">
              ส่งสินค้าเข้ารอบประมูล หรือตรวจสอบรายการที่คุณเคยส่ง
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRoundPicker({ product: null })}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-lg"
            >
              gavel
            </span>
            เลือกรอบประมูล
          </button>
        </div>

        {/* KYC Notice */}
        {isKycLocked && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-900 text-base">
                  ⚠️ บัญชีผู้ขายยังไม่ผ่านการยืนยันตัวตน (KYC)
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {kycStatus === "PENDING"
                    ? "เอกสารของคุณอยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่ กรุณารอผลอนุมัติก่อนลงสินค้าหรือส่งประมูล"
                    : "ระบบกำหนดให้บัญชีผู้ขายต้องยืนยันตัวตนก่อน จึงจะสามารถลงขายหรือส่งสินค้าเข้าประมูลได้"}
                </p>
              </div>
              <Link
                href="/seller/onboarding"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 shrink-0"
              >
                ไปหน้ายืนยันตัวตน
              </Link>
            </div>
          </div>
        )}

        {/* Section: รอคุณดำเนินการ (สินค้าจากรอบที่ยกเลิกหรือไม่มีผู้เสนอราคา) */}
        {actionRequiredProducts.length > 0 && (
          <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50/60 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-700 text-xl">
                  pending_actions
                </span>
                <h2 className="text-base font-bold text-amber-900">
                  {`รอคุณดำเนินการ (${actionRequiredProducts.length})`}
                </h2>
              </div>
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Action Required
              </span>
            </div>
            <p className="mt-2 text-xs text-amber-800">
              สินค้าเหล่านี้ถูกยกเลิกรอบประมูลหรือปิดประมูลโดยไม่มีผู้เสนอราคา
              กรุณาเลือกดำเนินการต่อโดยส่งเข้ารอบประมูลใหม่
              หรือนำกลับไปขายแบบปกติ
            </p>

            <ul className="mt-4 space-y-3">
              {actionRequiredProducts.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-900 text-sm truncate">
                      {p.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      หมวดหมู่: {p.category} · สถานะ: รอคุณดำเนินการ
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRoundPicker({ product: p })}
                      className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition"
                    >
                      ส่งเข้ารอบประมูลใหม่
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRelistProduct(p);
                        setRelistPrice("");
                        setRelistError("");
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                    >
                      นำกลับไปขายแบบปกติ
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section: สินค้าที่ส่งเข้าประมูลของฉัน */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900 flex items-center justify-between">
            <span>สินค้าที่ส่งเข้าประมูลของฉัน ({myAuctions.length})</span>
          </h2>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {myAuctions.length === 0 ? (
            <p className="text-sm text-gray-500 rounded-xl bg-white border border-gray-200 p-6 text-center">
              ยังไม่มีสินค้าที่ส่งเข้าประมูล
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {myAuctions.map((a) => {
                const cancelReason =
                  a.cancellationReason || a.round?.cancellationReason || "";
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/auctions/${a.id}`}
                        className="block truncate font-medium text-gray-900 hover:text-emerald-600"
                      >
                        {a.product?.title || a.productId}
                      </Link>
                      <p className="text-xs text-gray-500">
                        ราคาเริ่มต้น {baht(a.startingPrice)}
                      </p>
                      {a.status === "cancelled" && cancelReason && (
                        <p className="mt-1 text-xs font-medium text-rose-700">
                          เหตุผลที่ยกเลิก: {cancelReason}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                        STATUS_STYLE[a.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Modal เลือกรอบประมูลสำหรับสินค้าใหม่หรือสินค้าที่รอดำเนินการ */}
        <Modal
          open={Boolean(roundPicker)}
          onClose={() => setRoundPicker(null)}
          title={roundPicker?.product ? "เลือกรอบประมูลใหม่" : "เลือกรอบประมูล"}
          description={
            roundPicker?.product
              ? `เลือกรอบที่เปิดรับสินค้า “${roundPicker.product.title}”`
              : "เลือกรอบที่กำลังเปิดรับสินค้าเพื่อดำเนินการต่อ"
          }
          size="xl"
        >
          {roundPicker && (
            <RoundSelectionList
              rounds={activeSubmissionRounds}
              loading={loadingRound}
              product={roundPicker.product}
              isKycLocked={isKycLocked}
              onRetry={() => load(user)}
            />
          )}
        </Modal>

        {/* Modal กำหนดราคาขายใหม่เพื่อนำกลับไปขายปกติ */}
        <Modal
          open={Boolean(relistProduct)}
          onClose={() => !relistLoading && setRelistProduct(null)}
          title="นำสินค้ากลับไปขายแบบปกติ"
          description={`กำหนดราคาขายใหม่สำหรับ "${relistProduct?.title || ""}"`}
        >
          {relistProduct && (
            <form onSubmit={handleRelistSubmit} className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs text-slate-700 space-y-1">
                <p>
                  <strong>ชื่อสินค้า:</strong> {relistProduct.title}
                </p>
                <p>
                  <strong>หมวดหมู่:</strong> {relistProduct.category}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ราคาขายใหม่ (บาท) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={relistPrice}
                  onChange={(e) => setRelistPrice(e.target.value)}
                  placeholder="กรอกราคาขายใหม่ เช่น 500"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  * ต้องระบุราคาเป็นจำนวนเต็มบวก และสินค้าจะเปิดขายทันทีใน
                  Marketplace
                </span>
              </div>

              {relistError && (
                <p className="text-xs text-rose-600 font-medium">
                  {relistError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRelistProduct(null)}
                  disabled={relistLoading}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={relistLoading || !relistPrice}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                >
                  {relistLoading ? "กำลังดำเนินการ..." : "ยืนยันการนำไปขาย"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </section>
      <Footer />
    </main>
  );
}
