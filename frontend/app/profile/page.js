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
      </section>
      <Footer />
    </main>
  );
}
