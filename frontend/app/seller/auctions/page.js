"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import MediaUploader from "../../../components/MediaUploader";
import TagInput from "../../../components/TagInput";
import Select from "../../../components/ui/Select";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";
import { fetchCategories, fetchConditions } from "../../../lib/catalog";

const STATUS_LABEL = {
  pending_approval: "รออนุมัติจาก Admin",
  rejected: "ถูกปฏิเสธ",
  approved: "อนุมัติแล้ว รอ Marketing ตั้งเวลา",
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

export default function SellerAuctionsPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [myAuctions, setMyAuctions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentRoundInfo, setCurrentRoundInfo] = useState(null);
  const [loadingRound, setLoadingRound] = useState(true);
  const [kycStatus, setKycStatus] = useState(null);

  function load(currentUser) {
    setLoading(true);
    apiFetch("/api/products/auctions?limit=100")
      .then((data) =>
        setMyAuctions(data.items.filter((a) => a.sellerId === currentUser.id)),
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    setLoadingRound(true);
    apiFetch("/api/products/auctions/rounds/current")
      .then((data) => setCurrentRoundInfo(data))
      .catch((err) => console.error("โหลดข้อมูลรอบประมูลไม่สำเร็จ:", err))
      .finally(() => setLoadingRound(false));
  }

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
    if (!currentRoundInfo?.isSubmissionOpen) {
      setError("ขณะนี้ไม่อยู่ในช่วงเวลาเปิดรับสินค้าเข้าประมูล หรือยังไม่มีรอบประมูล");
      return;
    }
    if (!form.title || !form.category) {
      setError("กรุณากรอกชื่อสินค้าและหมวดหมู่");
      return;
    }
    const startingPrice = Number(form.startingPrice);
    const bidIncrement = Number(form.bidIncrement);
    if (!Number.isInteger(startingPrice) || startingPrice <= 0) {
      setError("ราคาเริ่มต้นต้องเป็นจำนวนเต็มมากกว่า 0");
      return;
    }
    if (!Number.isInteger(bidIncrement) || bidIncrement <= 0) {
      setError("เพิ่มขั้นต่ำต่อครั้งต้องเป็นจำนวนเต็มมากกว่า 0");
      return;
    }

    setSubmitting(true);
    try {
      // Same product as /sell creates, priced at the auction's starting
      // price so the listing still makes sense if it's ever viewed outside
      // Created directly with status "auction" so it never appears
      // in the general product feed, search, or seller storefront.
      const product = await apiFetch("/api/products", {
        method: "POST",
        body: {
          title: form.title,
          description: form.description,
          price: startingPrice,
          category: form.category,
          condition: form.condition,
          size: form.size || "Free size",
          location: form.location,
          tags: form.tags,
          media: form.media,
          status: "auction",
        },
      });

      await apiFetch("/api/products/auctions", {
        method: "POST",
        body: { productId: product.id, startingPrice, bidIncrement },
      });

      setForm(EMPTY_FORM);
      load(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

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

  const isKycLocked = Boolean(kycStatus && kycStatus !== "VERIFIED");

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          ลงสินค้าใหม่เข้าประมูล
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          กรอกรายละเอียดสินค้าเหมือนลงขายปกติ
          พร้อมตั้งราคาเริ่มต้นและเรทการเสนอราคา
        </p>

        {/* แจ้งเตือนสถานะ KYC หากยังไม่ผ่านการยืนยันตัวตน */}
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

        {/* ข้อมูลรอบการประมูลปัจจุบัน */}
        {loadingRound ? (
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 animate-pulse">
            กำลังตรวจสอบรอบการประมูล...
          </div>
        ) : currentRoundInfo?.isSubmissionOpen && currentRoundInfo?.round ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="font-semibold text-emerald-900 text-base">
                  รอบการประมูล: {currentRoundInfo.round.title}
                </span>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                🟢 กำลังเปิดรับสินค้า
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-emerald-950">
              <div className="rounded-lg bg-white/80 p-3 border border-emerald-100">
                <div className="font-medium text-emerald-800 mb-1">📅 ช่วงเวลารับสินค้า</div>
                <div className="text-xs text-gray-600">เริ่มรับ: {new Date(currentRoundInfo.round.submissionStartsAt).toLocaleString("th-TH")}</div>
                <div className="text-xs font-semibold text-red-600">ปิดรับ: {new Date(currentRoundInfo.round.submissionEndsAt).toLocaleString("th-TH")}</div>
              </div>
              <div className="rounded-lg bg-white/80 p-3 border border-emerald-100">
                <div className="font-medium text-emerald-800 mb-1">🔨 ช่วงเวลาประมูลจริง</div>
                <div className="text-xs text-gray-600">เริ่มประมูล: {new Date(currentRoundInfo.round.auctionStartsAt).toLocaleString("th-TH")}</div>
                <div className="text-xs text-gray-600">สิ้นสุด: {new Date(currentRoundInfo.round.auctionEndsAt).toLocaleString("th-TH")}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-base mb-2">
              <span>🔒 ขณะนี้ไม่มีรอบเปิดรับสินค้าเข้าประมูล หรือหมดเวลาเปิดรับแล้ว</span>
            </div>
            <p className="text-sm text-amber-800 leading-relaxed">
              ผู้ขายจะสามารถส่งสินค้าเข้าประมูลได้เฉพาะในช่วงเวลาที่ทีมการตลาดเปิดรอบรับสมัครเท่านั้น
              {currentRoundInfo?.round && (
                <span className="block mt-1 text-xs text-amber-700">
                  (รอบล่าสุด &ldquo;{currentRoundInfo.round.title}&rdquo; ปิดรับเมื่อ {new Date(currentRoundInfo.round.submissionEndsAt).toLocaleString("th-TH")})
                </span>
              )}
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-6 ${
            !currentRoundInfo?.isSubmissionOpen || isKycLocked ? "opacity-75 bg-gray-50/50" : ""
          }`}
        >
          <fieldset disabled={!currentRoundInfo?.isSubmissionOpen || isKycLocked || submitting} className="flex flex-col gap-5">
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

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                ราคาเริ่มต้น (บาท)
              </label>
              <input
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
              <label className="mb-1 block text-sm font-medium text-gray-700">
                เพิ่มขั้นต่ำต่อครั้ง (บาท)
              </label>
              <input
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

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !currentRoundInfo?.isSubmissionOpen}
            className="rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!currentRoundInfo?.isSubmissionOpen
              ? "ไม่อยู่ในช่วงเปิดรับสินค้าเข้าประมูล"
              : submitting
                ? "กำลังส่งเข้าประมูล..."
                : "ลงสินค้าเข้าประมูล"}
          </button>
        </form>

        <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-900">
          สินค้าที่ส่งเข้าประมูลของฉัน ({myAuctions.length})
        </h2>
        {myAuctions.length === 0 ? (
          <p className="text-sm text-gray-500">
            ยังไม่มีสินค้าที่ส่งเข้าประมูล
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {myAuctions.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/auctions/${a.id}`}
                    className="truncate font-medium text-gray-900 hover:text-emerald-600"
                  >
                    {a.product?.title || a.productId}
                  </Link>
                  <p className="text-xs text-gray-500">
                    ราคาเริ่มต้น {baht(a.startingPrice)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                    STATUS_STYLE[a.status] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {STATUS_LABEL[a.status] || a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Footer />
    </main>
  );
}
