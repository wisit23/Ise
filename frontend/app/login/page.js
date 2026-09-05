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
      // An executive's job here is the dashboard, not the storefront — land
      // them on the business overview straight after login (UR-27).
      router.push(data.user?.role === "EXECUTIVE" ? "/executive" : "/");
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
            เข้าสู่ระบบ
          </h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Labels rather than placeholder-only fields: a placeholder
                disappears the moment you type, leaving no way to check what a
                filled-in box was asking for. */}
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
              required
              type="password"
              label="รหัสผ่าน"
              autoComplete="current-password"
              value={form.password}
              onChange={update("password")}
            />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" loading={loading}>
              {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          ยังไม่มีบัญชี?{" "}
          <Link
            href="/register"
            className="focus-ring rounded text-brand-600 hover:underline"
          >
            สมัครสมาชิก
          </Link>
        </p>
      </div>
      {/* The buyer journey map calls out that a first-time visitor is deciding
          whether to trust the platform at exactly this point, and the footer
          carries the "who runs this" line. */}
      <Footer />
    </main>
  );
}
