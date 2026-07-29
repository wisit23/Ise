"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import MediaUploader from "../../components/MediaUploader";
import TagInput from "../../components/TagInput";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import { fetchCategories, fetchConditions } from "../../lib/catalog";

export default function SellPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    condition: "",
    size: "",
    location: "",
    tags: [],
    media: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
    fetchConditions()
      .then((items) => {
        setConditions(items);
        setForm((prev) =>
          prev.condition ? prev : { ...prev, condition: items[0]?.value || "" },
        );
      })
      .catch(() => {});
  }, []);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const product = await apiFetch("/api/products", {
        method: "POST",
        token,
        body: {
          title: form.title,
          description: form.description,
          price: Math.round(Number(form.price)),
          category: form.category,
          condition: form.condition,
          size: form.size || "Free size",
          location: form.location,
          tags: form.tags,
          media: form.media,
        },
      });
      router.push(`/products/${product.id}`);
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

  if (user?.role !== "SELLER") {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <NavBar />
        <section className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
          <h1 className="mb-4 text-xl font-bold text-gray-900">ลงขายสินค้า</h1>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            บัญชีนี้เป็นบัญชีผู้ซื้อ ลงขายสินค้าไม่ได้ —
            ต้องสมัครด้วยบัญชีผู้ขายก่อน
          </div>
          <Link
            href="/register"
            className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            สมัครบัญชีผู้ขาย
          </Link>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-bold text-gray-900">ลงขายสินค้า</h1>
        <p className="mb-6 text-sm text-gray-500">
          กรอกรายละเอียดให้ครบเพื่อให้ผู้ซื้อตัดสินใจได้ง่ายขึ้น
        </p>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-6"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              รูปภาพ / วิดีโอสินค้า
            </label>
            <MediaUploader
              value={form.media}
              onChange={(media) => setForm({ ...form, media })}
              token={getAccessToken()}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ชื่อสินค้า
            </label>
            <input
              required
              placeholder="เช่น เสื้อยืดวินเทจ Nike"
              value={form.title}
              onChange={update("title")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              รายละเอียดสินค้า
            </label>
            <textarea
              placeholder="สภาพสินค้า ตำหนิ (ถ้ามี) และเหตุผลที่ขาย"
              value={form.description}
              onChange={update("description")}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                ราคา (บาท)
              </label>
              <input
                required
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={form.price}
                onChange={update("price")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                สภาพสินค้า
              </label>
              <select
                value={form.condition}
                onChange={update("condition")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              >
                {conditions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                หมวดหมู่
              </label>
              <input
                required
                list="category-suggestions"
                placeholder="พิมพ์หรือเลือกหมวดหมู่"
                value={form.category}
                onChange={update("category")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                ไซส์
              </label>
              <input
                placeholder="เช่น M, 40, Free size"
                value={form.size}
                onChange={update("size")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              สถานที่ตั้งสินค้า
            </label>
            <input
              placeholder="เช่น กรุงเทพฯ, จตุจักร"
              value={form.location}
              onChange={update("location")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              แท็ก
            </label>
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
              placeholder="พิมพ์แท็กแล้วกด Enter เช่น vintage, denim"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังลงขาย..." : "ลงขาย"}
          </button>
        </form>
      </section>
      <Footer />
    </main>
  );
}
