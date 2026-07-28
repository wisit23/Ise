"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { saveSession } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
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
      const data = await apiFetch("/api/auth/login", {
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <Link href="/" className="mb-6 text-2xl font-bold text-emerald-600">
        RE-LOOP
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-lg font-semibold text-gray-900">
          เข้าสู่ระบบ
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            required
            type="email"
            placeholder="อีเมล"
            value={form.email}
            onChange={update("email")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
          />
          <input
            required
            type="password"
            placeholder="รหัสผ่าน"
            value={form.password}
            onChange={update("password")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
      <p className="mt-6 text-sm text-gray-600">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="text-emerald-600 hover:underline">
          สมัครสมาชิก
        </Link>
      </p>
    </main>
  );
}
