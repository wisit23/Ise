"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import MediaUploader from "../../../../components/MediaUploader";
import TagInput from "../../../../components/TagInput";
import Select from "../../../../components/ui/Select";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";
import { fetchCategories, fetchConditions } from "../../../../lib/catalog";

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

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  condition: "",
  size: "",
  location: "",
  tags: [],
  media: [],
  startingPrice: "",
  bidIncrement: "",
};

function SellerAuctionSubmitContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const productId = searchParams.get("productId");

  const [user, setUser] = useState(undefined);
  const [kycStatus, setKycStatus] = useState(null);
  const [round, setRound] = useState(null);
  const [loadingRound, setLoadingRound] = useState(true);
  const [roundError, setRoundError] = useState("");

  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (storedUser?.role !== "SELLER") {
      return;
    }
    apiFetch("/api/auth/kyc/mine", { token })
      .then((data) => setKycStatus(data.kycStatus))
      .catch(() => setKycStatus("NONE"));
  }, [router]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => console.error("โหลดหมวดหมู่ไม่สำเร็จ:", err));
    fetchConditions()
      .then((items) => {
        setConditions(items);
        setForm((prev) =>
          prev.condition ? prev : { ...prev, condition: items[0]?.value || "" },
        );
      })
      .catch((err) => console.error("โหลดรายการสภาพสินค้าไม่สำเร็จ:", err));
  }, []);

  useEffect(() => {
    if (!productId) return;
    apiFetch(`/api/products/${productId}`)
      .then((prod) => {
        setForm((prev) => ({
          ...prev,
          title: prod.title || "",
          description: prod.description || "",
          category: prod.category || "",
          condition: prod.condition || prev.condition,
          size: prod.size || "Free size",
          location: prod.location || "",
          tags: prod.styleTags || prod.tags || [],
          media: prod.media || [],
        }));
      })
      .catch((err) => {
        setError(err.message || "ไม่สามารถโหลดข้อมูลสินค้าเดิมได้");
      });
  }, [productId]);

  useEffect(() => {
    if (!roundId) {
      setRoundError("กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม");
      setLoadingRound(false);
      return;
    }

    setLoadingRound(true);
    setRoundError("");

    apiFetch(`/api/products/auctions/rounds/${roundId}`)
      .then((data) => {
        const now = new Date();
        const start = new Date(data.submissionStartsAt);
        const end = new Date(data.submissionEndsAt);

        if (data.cancelledAt || data.phase === "cancelled") {
          setRoundError(
            "รอบประมูลนี้ถูกยกเลิกแล้ว ไม่สามารถส่งสินค้าเข้าร่วมได้",
          );
        } else if (start > now) {
          setRoundError(
            "รอบประมูลนี้ยังไม่เปิดรับสินค้า กรุณาเลือกรอบที่กำลังเปิดรับ",
          );
        } else if (end <= now) {
          setRoundError("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น");
        } else {
          setRound(data);
        }
      })
      .catch((err) => {
        setRoundError(
          err.message?.includes("ไม่พบ") || err.status === 404
            ? "ไม่พบรอบประมูลที่เลือก กรุณากลับไปเลือกรอบใหม่"
            : err.message || "เกิดข้อผิดพลาดในการตรวจสอบรอบประมูล",
        );
      })
      .finally(() => setLoadingRound(false));
  }, [roundId]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (kycStatus && kycStatus !== "VERIFIED") {
      setError(
        kycStatus === "PENDING"
          ? "บัญชีอยู่ระหว่างการตรวจสอบเอกสารยืนยันตัวตน (KYC) กรุณารอการอนุมัติก่อนส่งสินค้าเข้าประมูล"
          : "บัญชีผู้ขายต้องผ่านการยืนยันตัวตน (KYC) ก่อน จึงจะสามารถส่งสินค้าเข้าประมูลได้",
      );
      return;
    }

    if (!roundId || !round) {
      setError("กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม");
      return;
    }

    const now = new Date();
    if (new Date(round.submissionEndsAt) <= now) {
      setError("รอบประมูลนี้ปิดรับสินค้าแล้ว กรุณาเลือกรอบอื่น");
      return;
    }

    if (!form.title?.trim() || !form.category) {
      setError("กรุณากรอกชื่อสินค้าและเลือกหมวดหมู่ให้ครบถ้วน");
      return;
    }

    const roundCats = round.categories;
    if (Array.isArray(roundCats) && roundCats.length > 0) {
      if (!roundCats.includes(form.category)) {
        setError(
          `รอบประมูลนี้ไม่เปิดรับสินค้าหมวดหมู่ "${form.category}" กรุณาเลือกรอบอื่นหรือเปลี่ยนหมวดหมู่สินค้า`,
        );
        return;
      }
    }

    const startingPrice = Number(form.startingPrice);
    const bidIncrement = Number(form.bidIncrement);
    if (!Number.isInteger(startingPrice) || startingPrice <= 0) {
      setError("ราคาเริ่มต้นต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
      return;
    }
    if (!Number.isInteger(bidIncrement) || bidIncrement <= 0) {
      setError("ราคาเสนอเพิ่มขั้นต่ำต้องเป็นจำนวนเต็มบวกมากกว่า 0 บาท");
      return;
    }

    setSubmitting(true);
    try {
      const payload = productId
        ? {
            roundId,
            productId,
            startingPrice,
            bidIncrement,
          }
        : {
            roundId,
            title: form.title,
            description: form.description,
            category: form.category,
            condition: form.condition,
            size: form.size || "Free size",
            location: form.location,
            tags: form.tags,
            media: form.media,
            startingPrice,
            bidIncrement,
          };

      await apiFetch("/api/products/auctions", {
        method: "POST",
        body: payload,
      });

      router.push("/seller/auctions");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (user === undefined) {
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

  const isKycLocked = Boolean(kycStatus && kycStatus !== "VERIFIED");

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              ลงสินค้าใหม่เข้าประมูล
            </h1>
            <p className="text-sm text-gray-500">
              กรอกรายละเอียดสินค้าและกำหนดราคาเริ่มต้นสำหรับรอบประมูลที่เลือก
            </p>
          </div>
          <Link
            href="/seller/auctions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            ← หน้ารวมรอบประมูล
          </Link>
        </div>

        {/* KYC Alert */}
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

        {/* Round Status Banner or Error State */}
        {loadingRound ? (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 animate-pulse">
            กำลังตรวจสอบรอบการประมูล...
          </div>
        ) : roundError || !round ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
            <span className="material-symbols-outlined mx-auto text-4xl text-red-500 mb-2">
              error
            </span>
            <h3 className="text-base font-bold text-red-900">
              ไม่สามารถเปิดฟอร์มลงสินค้าได้
            </h3>
            <p className="mt-1 text-sm text-red-700">
              {roundError || "กรุณาเลือกรอบประมูลก่อนส่งสินค้าเข้าร่วม"}
            </p>
            <div className="mt-4">
              <Link
                href="/seller/auctions"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
              >
                ← เปลี่ยนรอบประมูล
              </Link>
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-emerald-100">
              <div>
                <span className="text-xs font-semibold uppercase text-emerald-700 tracking-wide">
                  รอบการประมูลที่เลือก
                </span>
                <h2 className="font-bold text-emerald-950 text-lg">
                  {round.title}
                </h2>
              </div>
              <Link
                href="/seller/auctions"
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 shadow-sm shrink-0"
              >
                <span className="material-symbols-outlined text-sm">
                  swap_horiz
                </span>
                เปลี่ยนรอบประมูล
              </Link>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-emerald-950">
              <div className="rounded-lg bg-white/80 p-3 border border-emerald-100">
                <span className="text-gray-500 block mb-0.5">
                  ปิดรับสินค้า:
                </span>
                <span className="font-bold text-red-600">
                  {fmt(round.submissionEndsAt)}
                </span>
              </div>
              <div className="rounded-lg bg-white/80 p-3 border border-emerald-100">
                <span className="text-gray-500 block mb-0.5">
                  ช่วงเวลาประมูลจริง:
                </span>
                <span className="text-gray-700 font-medium">
                  {fmt(round.auctionStartsAt)} — {fmt(round.auctionEndsAt)}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-white/80 p-3 border border-emerald-100 text-xs">
              <span className="text-gray-500 block mb-1">
                หมวดหมู่ที่เปิดรับในรอบนี้:
              </span>
              {Array.isArray(round.categories) &&
              round.categories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {round.categories.map((c) => (
                    <span
                      key={c}
                      className="inline-block rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-semibold text-emerald-900"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  ทุกหมวดหมู่ (All Categories)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Form only rendered when round is valid and not error */}
        {!loadingRound && !roundError && round && (
          <form
            onSubmit={handleSubmit}
            className={`flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm ${
              isKycLocked ? "opacity-75 bg-gray-50/50" : ""
            }`}
          >
            <fieldset
              disabled={isKycLocked || submitting}
              className="flex flex-col gap-5"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  รูปภาพ / วิดีโอสินค้า
                </label>
                <MediaUploader
                  value={form.media}
                  onChange={(media) => setForm({ ...form, media })}
                  token={getAccessToken()}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  ชื่อสินค้า
                </label>
                <input
                  required
                  placeholder="เช่น เสื้อยืดวินเทจ Nike"
                  value={form.title}
                  onChange={update("title")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  รายละเอียดสินค้า
                </label>
                <textarea
                  placeholder="สภาพสินค้า ตำหนิ (ถ้ามี) และเหตุผลที่ขาย"
                  value={form.description}
                  onChange={update("description")}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    หมวดหมู่
                  </label>
                  <input
                    required
                    list="category-suggestions"
                    placeholder="พิมพ์หรือเลือกหมวดหมู่"
                    value={form.category}
                    onChange={update("category")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                  />
                  <datalist id="category-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  {Array.isArray(round?.categories) &&
                    round.categories.length > 0 && (
                      <p className="mt-1 text-[11px] text-emerald-700">
                        รอบนี้เปิดรับเฉพาะ: {round.categories.join(", ")}
                      </p>
                    )}
                </div>
                <div>
                  <Select
                    label="สภาพสินค้า"
                    value={form.condition}
                    onChange={update("condition")}
                    options={conditions}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    ไซส์
                  </label>
                  <input
                    placeholder="เช่น M, 40, Free size"
                    value={form.size}
                    onChange={update("size")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    สถานที่ตั้งสินค้า
                  </label>
                  <input
                    placeholder="เช่น กรุงเทพฯ, จตุจักร"
                    value={form.location}
                    onChange={update("location")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  แท็ก
                </label>
                <TagInput
                  value={form.tags}
                  onChange={(tags) => setForm({ ...form, tags })}
                  placeholder="พิมพ์แท็กแล้วกด Enter เช่น vintage, denim"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-5">
                <div>
                  <label
                    htmlFor="startingPrice"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    ราคาเริ่มต้น (บาท)
                  </label>
                  <input
                    id="startingPrice"
                    required
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={form.startingPrice}
                    onChange={update("startingPrice")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="bidIncrement"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    เพิ่มขั้นต่ำต่อครั้ง (บาท)
                  </label>
                  <input
                    id="bidIncrement"
                    required
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={form.bidIncrement}
                    onChange={update("bidIncrement")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </fieldset>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || isKycLocked}
              className="rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition"
            >
              {submitting ? "กำลังส่งเข้าประมูล..." : "ลงสินค้าเข้าประมูล"}
            </button>
          </form>
        )}
      </section>
      <Footer />
    </main>
  );
}

export default function SellerAuctionSubmitPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50">
          <NavBar />
          <p className="mx-auto max-w-lg px-4 py-10 text-gray-500">
            กำลังโหลด...
          </p>
        </main>
      }
    >
      <SellerAuctionSubmitContent />
    </Suspense>
  );
}
