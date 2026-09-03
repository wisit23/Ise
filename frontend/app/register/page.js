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
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="focus-ring mb-6 rounded text-2xl font-bold text-brand-600"
        >
          RE-LOOP
        </Link>

        <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8 shadow-sm">
          <h1 className="mb-4 text-center text-lg font-semibold text-gray-900">
            สมัครสมาชิก
          </h1>

          {/* Radio semantics, not two loose buttons: this is one choice with
              two options, and it decides which fields the form shows. */}
          <div
            role="radiogroup"
            aria-label="ประเภทบัญชี"
            className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-gray-100 p-1"
          >
            {[
              { value: "BUYER", label: "สมัครเป็นผู้ซื้อ" },
              { value: "SELLER", label: "สมัครเป็นผู้ขาย" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={form.role === opt.value}
                onClick={() => setForm({ ...form, role: opt.value })}
                className={`focus-ring rounded-md py-2 text-sm font-medium transition ${
                  form.role === opt.value
                    ? "bg-white text-brand-700 shadow"
                    : "text-ink-muted hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

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

            {form.role === "SELLER" && (
              <>
                <Input
                  required
                  label="ชื่อร้านค้า"
                  value={form.shopName}
                  onChange={update("shopName")}
                />
                <Alert tone="success">
                  บัญชีผู้ขายใช้ลงขายสินค้าได้ทันที
                  เฉพาะบัญชีที่สมัครเป็นผู้ขายเท่านั้นที่ลงขายได้
                </Alert>
              </>
            )}

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
