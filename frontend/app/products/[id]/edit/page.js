"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import MediaUploader from "../../../../components/MediaUploader";
import TagInput from "../../../../components/TagInput";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";
import { fetchCategories, fetchConditions } from "../../../../lib/catalog";

const MIN_MEDIA_COUNT = 4;
const MAX_MEDIA_COUNT = 8;

export default function EditProductPage() {
  const { id } = useParams();
  const router = useRouter();

  const [user, setUser] = useState(undefined);
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  useEffect(() => {
    apiFetch(`/api/products/${id}`)
      .then((p) => {
        setProduct(p);
        setForm({
          title: p.title,
          description: p.description || "",
          price: String(p.price),
          category: p.category,
          condition: p.condition,
          size: p.size || "",
          location: p.location || "",
          tags: p.tags || [],
          media: p.media || [],
        });
      })
      .catch(() => setNotFound(true));
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
    fetchConditions()
      .then(setConditions)
      .catch(() => {});
  }, [id]);

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
    if (form.media.length < MIN_MEDIA_COUNT) {
      setError(
        `กรุณาอัปโหลดรูปภาพหรือวิดีโอสินค้าอย่างน้อย ${MIN_MEDIA_COUNT} รูป (ปัจจุบันมี ${form.media.length} รูป)`,
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      await apiFetch(`/api/products/${id}`, {
        method: "PATCH",
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
      router.push(`/products/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (user === undefined || (!product && !notFound)) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-lg px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-lg px-4 py-10 text-gray-500">
          ไม่พบสินค้านี้
        </p>
      </main>
    );
  }

  if (getStoredUser()?.id !== product.sellerId) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <NavBar />
        <section className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            คุณไม่มีสิทธิ์แก้ไขสินค้านี้ — แก้ไขได้เฉพาะเจ้าของสินค้าเท่านั้น
          </div>
          <Link
            href={`/products/${id}`}
            className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            กลับไปดูสินค้า
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
        <h1 className="mb-1 text-xl font-bold text-gray-900">แก้ไขสินค้า</h1>
        <p className="mb-6 text-sm text-gray-500">
          แก้ไขรายละเอียดสินค้าที่วางขายไปแล้ว
        </p>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-6"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              รูปภาพ / วิดีโอสินค้า <span className="text-red-500">*</span>{" "}
              <span className="font-normal text-gray-400">
                (อย่างน้อย {MIN_MEDIA_COUNT} รูป, สูงสุด {MAX_MEDIA_COUNT} รูป)
              </span>
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
          <div className="flex gap-3">
            <Link
              href={`/products/${id}`}
              className="rounded-md border border-gray-300 px-4 py-2.5 text-center font-medium text-gray-700 hover:bg-gray-50"
            >
              ยกเลิก
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          </div>
        </form>
      </section>
      <Footer />
    </main>
  );
}
