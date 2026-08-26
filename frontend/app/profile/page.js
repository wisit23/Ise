"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { apiFetch } from "../../lib/api";
import {
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession,
} from "../../lib/auth";

const ROLE_LABEL = { BUYER: "ผู้ซื้อ", SELLER: "ผู้ขาย", ADMIN: "แอดมิน" };

export default function ProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const user = getStoredUser();
    setForm(user);
  }, [router]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const updated = await apiFetch("/api/auth/me", {
        method: "PATCH",
        token,
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
        },
      });
      saveSession({
        accessToken: token,
        refreshToken: getRefreshToken(),
        user: updated,
      });
      setForm(updated);
      setNotice("บันทึกข้อมูลสำเร็จ");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!form) {
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
      <section className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-bold text-gray-900">ตั้งค่าโปรไฟล์</h1>
        <p className="mb-6 text-sm text-gray-500">
          {form.email} ·{" "}
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            {ROLE_LABEL[form.role] || form.role}
          </span>
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6"
        >
          <div className="flex gap-3">
            <div className="w-1/2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                ชื่อ
              </label>
              <input
                required
                value={form.firstName}
                onChange={update("firstName")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              />
            </div>
            <div className="w-1/2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                นามสกุล
              </label>
              <input
                required
                value={form.lastName}
                onChange={update("lastName")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              เบอร์โทรศัพท์
            </label>
            <input
              value={form.phone || ""}
              onChange={update("phone")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
          </button>
        </form>

        {form.role === "BUYER" ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-sm">
            <h2 className="text-base font-semibold text-emerald-950">
              สนใจเป็นผู้ขายใน RE-LOOP?
            </h2>
            <p className="mt-1 text-emerald-800">
              ยืนยันตัวตนด้วยบัตรประชาชนและข้อมูลที่อยู่ เพื่อเปิดร้านค้าและลงขายเสื้อผ้ามือสองของคุณได้ทันที
            </p>
            <a
              href="/seller/onboarding"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <span>🪪</span>
              <span>ยืนยันตัวตนผู้ขาย (KYC)</span>
            </a>
          </div>
        ) : form.role === "SELLER" ? (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  ข้อมูลผู้ขาย (Seller Profile)
                </h2>
                <p className="mt-0.5 text-gray-500">
                  สถานะการยืนยันตัวตน:{" "}
                  <span className="font-medium text-emerald-600">
                    ✓ ยืนยันตัวตนเรียบร้อยแล้ว
                  </span>
                </p>
              </div>
              <a
                href="/seller/dashboard"
                className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
              >
                ไปที่แดชบอร์ดผู้ขาย
              </a>
            </div>
            {form.sellerProfile?.shopName && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500">ชื่อร้านค้า</p>
                <p className="font-medium text-gray-800">
                  {form.sellerProfile.shopName}
                </p>
              </div>
            )}
            {form.sellerProfile?.address && (
              <div className="mt-2">
                <p className="text-xs text-gray-500">ที่อยู่ผู้ขาย</p>
                <p className="text-gray-700">{form.sellerProfile.address}</p>
              </div>
            )}
          </div>
        ) : null}
      </section>
      <Footer />
    </main>
  );
}
