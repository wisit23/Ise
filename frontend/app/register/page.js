"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Footer from "../../components/Footer";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
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
        body: { ...form, role: "BUYER" },
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
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="focus-ring mb-6 rounded text-2xl font-bold text-brand-600"
        >
          RE-LOOP
        </Link>

        <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-center text-lg font-semibold text-gray-900">
            สมัครสมาชิก
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                required
                label="ชื่อ"
                autoComplete="given-name"
                value={form.firstName}
                onChange={update("firstName")}
              />
              <Input
                required
                label="นามสกุล"
                autoComplete="family-name"
                value={form.lastName}
                onChange={update("lastName")}
              />
            </div>
            <Input
              required
              type="email"
              label="อีเมล"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update("email")}
            />
            <Input
              label="เบอร์โทรศัพท์"
              hint="ไม่บังคับ"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={update("phone")}
            />
            <Input
              required
              type="password"
              label="รหัสผ่าน"
              hint="อย่างน้อย 8 ตัวอักษร"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={update("password")}
            />

            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" loading={loading}>
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-sm text-ink-muted">
          มีบัญชีอยู่แล้ว?{" "}
          <Link
            href="/login"
            className="focus-ring rounded text-brand-600 hover:underline"
          >
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
      <Footer />
    </main>
  );
}
