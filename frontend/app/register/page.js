"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { saveSession } from "../../lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    role: "BUYER",
    shopName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: form,
      });
      saveSession(data);
      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <Link href="/" className="mb-6 text-2xl font-bold text-emerald-600">
        RE-LOOP
      </Link>

      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-center text-lg font-semibold text-gray-900">
          สมัครสมาชิก
        </h1>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setForm({ ...form, role: "BUYER" })}
            className={`rounded-md py-2 text-sm font-medium transition ${
              form.role === "BUYER"
                ? "bg-white text-emerald-700 shadow"
                : "text-gray-500"
            }`}
          >
            สมัครเป็นผู้ซื้อ
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, role: "SELLER" })}
            className={`rounded-md py-2 text-sm font-medium transition ${
              form.role === "SELLER"
                ? "bg-white text-emerald-700 shadow"
                : "text-gray-500"
            }`}
          >
            สมัครเป็นผู้ขาย
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <input
              required
              placeholder="ชื่อ"
              value={form.firstName}
              onChange={update("firstName")}
              className="w-1/2 rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
            <input
              required
              placeholder="นามสกุล"
              value={form.lastName}
              onChange={update("lastName")}
              className="w-1/2 rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>
          <input
            required
            type="email"
            placeholder="อีเมล"
            value={form.email}
            onChange={update("email")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
          />
          <input
            placeholder="เบอร์โทรศัพท์ (ไม่บังคับ)"
            value={form.phone}
            onChange={update("phone")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
          />
          <input
            required
            type="password"
            placeholder="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
            value={form.password}
            onChange={update("password")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
          />

          {form.role === "SELLER" && (
            <input
              required
              placeholder="ชื่อร้านค้า"
              value={form.shopName}
              onChange={update("shopName")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          )}

          {form.role === "SELLER" && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              บัญชีผู้ขายใช้ลงขายสินค้าได้ทันที
              เฉพาะบัญชีที่สมัครเป็นผู้ขายเท่านั้นที่ลงขายได้
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-sm text-gray-600">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="text-emerald-600 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </main>
  );
}
