"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch, submitKyc } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const STATUS_LABEL = {
  NONE: "ยังไม่ได้ยืนยันตัวตน",
  PENDING: "รอการตรวจสอบ (Pending)",
  VERIFIED: "ยืนยันตัวตนเรียบร้อย (Verified)",
  REJECTED: "การยืนยันครั้งก่อนถูกปฏิเสธ",
};

function formatIdCardDisplay(val) {
  const clean = (val || "").replace(/\D/g, "");
  if (clean.length <= 1) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 1)}-${clean.slice(1)}`;
  if (clean.length <= 10)
    return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5)}`;
  if (clean.length <= 12)
    return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10)}`;
  return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12, 13)}`;
}

export default function SellerOnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [user, setUser] = useState(undefined);
  const [status, setStatus] = useState(null); // { kycStatus, sellerProfile, latestApplication }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    shopName: "",
    idCardNumber: "",
    address: "",
    bankAccount: "",
  });
  const [documentFile, setDocumentFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login?next=/seller/onboarding");
      return;
    }
    setUser(getStoredUser());
    setLoading(true);
    apiFetch("/api/auth/kyc/mine", { token })
      .then((data) => {
        setStatus(data);
        if (data.sellerProfile) {
          setForm({
            shopName: data.sellerProfile.shopName || "",
            idCardNumber: data.sellerProfile.idCardNumber || "",
            address: data.sellerProfile.address || "",
            bankAccount: data.sellerProfile.bankAccount || "",
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [router]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!documentFile) {
      setError("กรุณาอัปโหลดรูปถ่ายบัตรประชาชนเพื่อยืนยันตัวตน");
      return;
    }
    if (form.idCardNumber.replace(/\D/g, "").length !== 13) {
      setError("กรุณากรอกรหัสบัตรประชาชน 13 หลักให้ถูกต้อง");
      return;
    }

    setSubmitting(true);
    try {
      await submitKyc(
        {
          shopName: form.shopName,
          idCardNumber: form.idCardNumber.replace(/\D/g, ""),
          address: form.address,
          bankAccount: form.bankAccount,
        },
        documentFile,
      );
      load();
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
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-600">
              การยืนยันตัวตนผู้ขายใช้ได้เฉพาะบัญชีประเภทผู้ขาย (Seller)
              เท่านั้น
            </p>
            <Link
              href="/register"
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              สมัครบัญชีผู้ขาย
            </Link>
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  const kycStatus = status?.kycStatus || "NONE";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />

      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-emerald-600">
              หน้าแรก
            </Link>
            <span>/</span>
            <span className="text-gray-800">ยืนยันตัวตนผู้ขาย</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            ยืนยันตัวตนผู้ขาย (Seller Verification)
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            กรอกข้อมูลและอัปโหลดรูปถ่ายบัตรประชาชนเพื่อเปิดสิทธิ์ลงขายสินค้าใน
            RE-LOOP — สถานะปัจจุบัน:{" "}
            <span className="font-semibold text-gray-800">
              {STATUS_LABEL[kycStatus]}
            </span>
          </p>
        </div>

        {kycStatus === "PENDING" ? (
          <div className="rounded-xl border border-amber-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-600">
                ⏳
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  ข้อมูลอยู่ระหว่างการตรวจสอบโดยแอดมิน
                </h2>
                <p className="text-sm text-amber-700">
                  สถานะ: {STATUS_LABEL.PENDING}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              เจ้าหน้าที่กำลังตรวจสอบรูปถ่ายบัตรประชาชนและข้อมูลของคุณ
              เมื่อได้รับการอนุมัติแล้วจะสามารถลงขายสินค้าได้ทันที
            </p>
            <div className="mt-6 space-y-3 border-t border-gray-100 pt-4 text-sm text-gray-700">
              <div>
                <span className="font-medium text-gray-500">ชื่อร้านค้า:</span>{" "}
                <span className="font-semibold text-gray-900">
                  {status.sellerProfile?.shopName}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">
                  ยื่นคำขอเมื่อ:
                </span>{" "}
                {status.latestApplication?.submittedAt &&
                  new Date(
                    status.latestApplication.submittedAt,
                  ).toLocaleString("th-TH")}
              </div>
            </div>
          </div>
        ) : kycStatus === "VERIFIED" ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-600">
                ✓
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  คุณได้รับการยืนยันตัวตนเป็นผู้ขายแล้ว
                </h2>
                <p className="text-sm text-emerald-700">
                  สถานะ: {STATUS_LABEL.VERIFIED}
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-3 border-t border-gray-100 pt-4 text-sm text-gray-700">
              <div>
                <span className="font-medium text-gray-500">ชื่อร้านค้า:</span>{" "}
                <span className="font-semibold text-gray-900">
                  {status.sellerProfile?.shopName}
                </span>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Link
                href="/sell"
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                ลงขายสินค้า
              </Link>
              <Link
                href="/seller/dashboard"
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                แดชบอร์ดผู้ขาย
              </Link>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            {kycStatus === "REJECTED" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="font-bold text-red-900">
                  ⚠️ การยืนยันตัวตนครั้งก่อนหน้าถูกปฏิเสธ
                </p>
                <p className="mt-1">
                  เหตุผล:{" "}
                  {status.latestApplication?.reason ||
                    "เอกสารหรือข้อมูลไม่ถูกต้อง"}
                </p>
                <p className="mt-2 text-xs text-red-700">
                  กรุณาตรวจสอบและแก้ไขข้อมูลด้านล่างให้ถูกต้อง
                  แล้วกดส่งข้อมูลใหม่อีกครั้ง
                </p>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                1. ข้อมูลร้านค้า
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    ชื่อร้านค้า <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="เช่น Vintage Studio"
                    value={form.shopName}
                    onChange={(e) =>
                      setForm({ ...form, shopName: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    เลขบัญชีธนาคาร / พร้อมเพย์ (ไม่บังคับ)
                  </label>
                  <input
                    placeholder="เช่น กสิกรไทย 123-4-56789-0"
                    value={form.bankAccount}
                    onChange={(e) =>
                      setForm({ ...form, bankAccount: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                2. รหัสประจำตัวประชาชนและที่อยู่
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    รหัสประจำตัวประชาชน 13 หลัก{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    maxLength={17}
                    placeholder="x-xxxx-xxxxx-xx-x"
                    value={formatIdCardDisplay(form.idCardNumber)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        idCardNumber: e.target.value.replace(/\D/g, "").slice(0, 13),
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    ที่อยู่สำหรับติดต่อและจัดส่ง/คืนสินค้า{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="บ้านเลขที่, หมู่, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <h2 className="mb-2 text-base font-semibold text-gray-900">
                3. รูปถ่ายบัตรประชาชน{" "}
                <span className="text-red-500">*</span>
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                กรุณาถ่ายรูปด้านหน้าบัตรประชาชนให้ชัดเจน เห็นชื่อ นามสกุล
                และเลขประจำตัวชัดเจน
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />

              {imagePreview ? (
                <div className="relative overflow-hidden rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={imagePreview}
                      alt="ตัวอย่างรูปถ่ายบัตรประชาชน"
                      className="h-28 w-44 rounded-md border border-gray-200 object-cover shadow-sm"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        เลือกรูปถ่ายแล้ว
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 underline"
                      >
                        เปลี่ยนรูปถ่าย
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center hover:border-emerald-500 hover:bg-emerald-50/30 transition"
                >
                  <span className="mb-2 text-3xl">🪪</span>
                  <p className="text-sm font-medium text-gray-700">
                    คลิกเพื่อเลือกรูปถ่ายบัตรประชาชน
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    รองรับไฟล์ JPG, PNG, WEBP (ขนาดไม่เกิน 10MB)
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {submitting
                  ? "กำลังบันทึกข้อมูลยืนยันตัวตน..."
                  : "ยืนยันข้อมูลเพื่อเป็นผู้ขาย"}
              </button>
            </div>
          </form>
        )}
      </section>

      <Footer />
    </main>
  );
}
