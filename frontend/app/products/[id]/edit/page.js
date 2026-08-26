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

export default function EditProductPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push(`/login?next=/products/${id}/edit`);
      return;
    }
    const currentUser = getStoredUser();
    setUser(currentUser);

    Promise.all([
      apiFetch(`/api/products/${id}`),
      fetchCategories(),
      fetchConditions(),
    ])
      .then(([prod, cats, conds]) => {
        if (currentUser?.id !== prod.sellerId && currentUser?.role !== "ADMIN") {
          setError("คุณไม่มีสิทธิ์แก้ไขสินค้านี้ (เฉพาะเจ้าของสินค้าเท่านั้น)");
          setLoading(false);
          return;
        }

        setCategories(cats);
        setConditions(conds);
        setForm({
          title: prod.title || "",
          description: prod.description || "",
          price: prod.price || "",
          category: prod.category || "",
          condition: prod.condition || "",
          size: prod.size || "",
          location: prod.location || "",
          tags: Array.isArray(prod.tags) ? prod.tags : [],
          media: Array.isArray(prod.media) ? prod.media : [],
          status: prod.status || "available",
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, router]);

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

    if (!form.media || form.media.length < 4) {
      setError(
        `กรุณาใส่รูปภาพหรือวิดีโอสินค้าอย่างน้อย 4 รูป (ปัจจุบันมี ${form.media?.length || 0} รูป)`
      );
      return;
    }

    setSaving(true);
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
          status: form.status,
        },
      });
      router.push(`/products/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบโพสต์สินค้านี้?")) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setDeleting(true);
    try {
      await apiFetch(`/api/products/${id}`, {
        method: "DELETE",
        token,
      });
      router.push("/seller/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading || user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-lg px-4 py-10 text-gray-500">
          กำลังโหลดข้อมูลสินค้า...
        </p>
      </main>
    );
  }

  if (error && !form) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <NavBar />
        <section className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <h2 className="mb-2 text-base font-bold text-red-900">เกิดข้อผิดพลาด</h2>
            <p>{error}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              กลับหน้าแรก
            </Link>
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link href="/seller/dashboard" className="hover:text-emerald-600">
                แดชบอร์ด
              </Link>
              <span>/</span>
              <Link href={`/products/${id}`} className="hover:text-emerald-600">
                รายละเอียดสินค้า
              </Link>
              <span>/</span>
              <span className="text-gray-800">แก้ไขสินค้า</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              แก้ไขโพสต์สินค้า
            </h1>
          </div>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
          >
            {deleting ? "กำลังลบ..." : "🗑️ ลบสินค้านี้"}
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              รูปภาพ / วิดีโอสินค้า <span className="text-red-500">*</span>{" "}
              <span className="text-xs font-normal text-gray-500">
                (ต้องมีอย่างน้อย 4 รูป, สูงสุด 8 รูป)
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
              ชื่อสินค้า <span className="text-red-500">*</span>
            </label>
            <input
              required
              placeholder="เช่น เสื้อยืดวินเทจ Nike"
              value={form.title}
              onChange={update("title")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                ราคา (บาท) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={form.price}
                onChange={update("price")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                สภาพสินค้า
              </label>
              <select
                value={form.condition}
                onChange={update("condition")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
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
                หมวดหมู่ <span className="text-red-500">*</span>
              </label>
              <input
                required
                list="category-options"
                placeholder="เช่น เสื้อยืด, กางเกงยีนส์"
                value={form.category}
                onChange={update("category")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                ไซส์ (Size)
              </label>
              <input
                placeholder="เช่น S, M, L, 32, Free size"
                value={form.size}
                onChange={update("size")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              สถานที่ / ช่องทางจัดส่ง
            </label>
            <input
              placeholder="เช่น จัดส่งด่วน Flash / นัดรับสยาม"
              value={form.location}
              onChange={update("location")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              สถานะสินค้า
            </label>
            <select
              value={form.status}
              onChange={update("status")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="available">พร้อมขาย (Available)</option>
              <option value="sold">ขายแล้ว (Sold)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              แท็กค้นหา (Tags)
            </label>
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
              placeholder="พิมพ์แท็กแล้วกด Enter เช่น vintage, denim"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 border-t border-gray-100 pt-4">
            <Link
              href={`/products/${id}`}
              className="w-1/3 rounded-lg border border-gray-300 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              ยกเลิก
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="w-2/3 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          </div>
        </form>
      </section>
      <Footer />
    </main>
  );
}
