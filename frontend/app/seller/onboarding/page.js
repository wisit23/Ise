"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch, uploadFiles, mediaUrl } from "../../../lib/api";
import {
  getAccessToken,
  getStoredUser,
  saveSession,
  getRefreshToken,
} from "../../../lib/auth";

export default function SellerOnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [user, setUser] = useState(undefined);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    idCardNumber: "",
    address: "",
    shopName: "",
    bankAccount: "",
    idCardImageUrl: "",
  });

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login?next=/seller/onboarding");
      return;
    }

    const stored = getStoredUser();
    setUser(stored);
    if (stored) {
      setForm((prev) => ({
        ...prev,
        firstName: stored.firstName || "",
        lastName: stored.lastName || "",
        phone: stored.phone || "",
        shopName:
          stored.sellerProfile?.shopName ||
          (stored.firstName ? `ร้านค้าของ ${stored.firstName}` : ""),
        idCardNumber: stored.sellerProfile?.idCardNumber || "",
        address: stored.sellerProfile?.address || "",
        bankAccount: stored.sellerProfile?.bankAccount || "",
        idCardImageUrl: stored.sellerProfile?.kycDocumentUrl || "",
      }));
      if (stored.sellerProfile?.kycDocumentUrl) {
        setImagePreview(mediaUrl(stored.sellerProfile.kycDocumentUrl));
      }
    }
  }, [router]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  // Format ID card input with dashes: x-xxxx-xxxxx-xx-x
  function handleIdCardChange(e) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 13);
    setForm({ ...form, idCardNumber: raw });
  }

  function formatIdCardDisplay(val) {
    if (!val) return "";
    const clean = val.replace(/\D/g, "");
    if (clean.length <= 1) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 1)}-${clean.slice(1)}`;
    if (clean.length <= 10)
      return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5)}`;
    if (clean.length <= 12)
      return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10)}`;
    return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12, 13)}`;
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setError("");
    setUploadingImage(true);

    // Instant local preview
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);

    try {
      const uploaded = await uploadFiles([file], token);
      if (uploaded && uploaded[0]?.url) {
        setForm((prev) => ({ ...prev, idCardImageUrl: uploaded[0].url }));
      }
    } catch (err) {
      setError(`ไม่สามารถอัปโหลดรูปภาพได้: ${err.message}`);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    if (!form.idCardImageUrl) {
      setError("กรุณาอัปโหลดรูปถ่ายบัตรประชาชนเพื่อยืนยันตัวตน");
      return;
    }

    if (form.idCardNumber.replace(/\D/g, "").length !== 13) {
      setError("กรุณากรอกรหัสบัตรประชาชน 13 หลักให้ถูกต้อง");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await apiFetch("/api/auth/kyc", {
        method: "POST",
        token,
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          idCardNumber: form.idCardNumber,
          address: form.address,
          shopName: form.shopName,
          bankAccount: form.bankAccount,
          kycDocumentUrl: form.idCardImageUrl,
        },
      });

      // Update session with new role (SELLER) and new tokens
      if (result?.accessToken) {
        saveSession({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || getRefreshToken(),
          user: result.user,
        });
        setUser(result.user);
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
            กรอกข้อมูลและอัปโหลดรูปถ่ายบัตรประชาชนเพื่อเปิดสิทธิ์การเป็นผู้ขายใน RE-LOOP
          </p>
        </div>

        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
              ✓
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              ยืนยันตัวตนผู้ขายสำเร็จเรียบร้อย!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              บัญชีของคุณได้รับการอนุมัติเป็นผู้ขายแล้ว คุณสามารถลงขายสินค้าและเปิดหน้าร้านได้ทันที
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <Link
                href="/sell"
                className="rounded-lg bg-emerald-600 px-6 py-2.5 font-medium text-white shadow hover:bg-emerald-700 transition"
              >
                ลงขายสินค้าชิ้นแรก
              </Link>
              <Link
                href="/seller/dashboard"
                className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                ไปที่แดชบอร์ดผู้ขาย
              </Link>
            </div>
          </div>
        ) : user?.role === "SELLER" && user?.sellerProfile?.kycStatus === "VERIFIED" ? (
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
                  สถานะ: ยืนยันตัวตนเรียบร้อย (Verified Seller)
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-gray-100 pt-4 text-sm text-gray-700">
              <div>
                <span className="font-medium text-gray-500">ชื่อร้านค้า:</span>{" "}
                <span className="font-semibold text-gray-900">
                  {user.sellerProfile.shopName}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">ที่อยู่ผู้ขาย:</span>{" "}
                <span>{user.sellerProfile.address || "-"}</span>
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
            {/* Step 1: Personal Info */}
            <div>
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                1. ข้อมูลส่วนบุคคล
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    ชื่อจริง <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="เช่น สมชาย"
                    value={form.firstName}
                    onChange={update("firstName")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    นามสกุล <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="เช่น ใจดี"
                    value={form.lastName}
                    onChange={update("lastName")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="tel"
                    placeholder="เช่น 0812345678"
                    value={form.phone}
                    onChange={update("phone")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    รหัสประจำตัวประชาชน 13 หลัก <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    maxLength={17}
                    placeholder="x-xxxx-xxxxx-xx-x"
                    value={formatIdCardDisplay(form.idCardNumber)}
                    onChange={handleIdCardChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    ระบุตัวเลข 13 หลักตามบัตรประชาชน
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2: Address */}
            <div className="border-t border-gray-100 pt-5">
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                2. ที่อยู่สำหรับติดต่อและจัดส่ง/คืนสินค้า <span className="text-red-500">*</span>
              </h2>
              <div>
                <textarea
                  required
                  rows={3}
                  placeholder="บ้านเลขที่, หมู่, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์"
                  value={form.address}
                  onChange={update("address")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Step 3: Shop & Payment details */}
            <div className="border-t border-gray-100 pt-5">
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                3. ข้อมูลร้านค้า
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
                    onChange={update("shopName")}
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
                    onChange={update("bankAccount")}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 4: ID Card Photo Upload */}
            <div className="border-t border-gray-100 pt-5">
              <h2 className="mb-2 text-base font-semibold text-gray-900">
                4. รูปถ่ายบัตรประชาชน <span className="text-red-500">*</span>
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                กรุณาถ่ายรูปด้านหน้าบัตรประชาชนให้ชัดเจน เห็นชื่อ นามสกุล และเลขประจำตัวชัดเจน
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageSelect}
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
                        {uploadingImage
                          ? "กำลังอัปโหลดรูปภาพ..."
                          : "อัปโหลดรูปถ่ายเรียบร้อยแล้ว"}
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
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
                    {uploadingImage
                      ? "กำลังอัปโหลด..."
                      : "คลิกเพื่อเลือกรูปถ่ายบัตรประชาชน"}
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
                disabled={loading || uploadingImage}
                className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {loading
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
