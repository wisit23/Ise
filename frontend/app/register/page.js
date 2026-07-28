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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">สมัครสมาชิก</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <input
            required
            placeholder="ชื่อ"
            value={form.firstName}
            onChange={update("firstName")}
            className="w-1/2 rounded-md border border-gray-300 px-3 py-2"
          />
          <input
            required
            placeholder="นามสกุล"
            value={form.lastName}
            onChange={update("lastName")}
            className="w-1/2 rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <input
          required
          type="email"
          placeholder="อีเมล"
          value={form.email}
          onChange={update("email")}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="เบอร์โทรศัพท์ (ไม่บังคับ)"
          value={form.phone}
          onChange={update("phone")}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          required
          type="password"
          placeholder="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
          value={form.password}
          onChange={update("password")}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-600 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="text-emerald-600 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </main>
  );
}
