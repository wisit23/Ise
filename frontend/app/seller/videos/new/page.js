"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import VideoUploader from "../../../../components/VideoUploader";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";

export default function UploadVideoPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [fetchingProducts, setFetchingProducts] = useState(true);
  const [form, setForm] = useState({
    productId: "",
    videoUrl: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  useEffect(() => {
    if (user?.role !== "SELLER") {
      setFetchingProducts(false);
      return;
    }
    apiFetch("/api/products/mine?limit=50", { token: getAccessToken() })
      .then((data) => {
        setProducts(data.items || []);
        if (data.items?.length > 0) {
          setForm((prev) => ({ ...prev, productId: data.items[0].id }));
        }
      })
      .catch((err) => setError(err.message || "โหลดรายการสินค้าไม่สำเร็จ"))
      .finally(() => setFetchingProducts(false));
  }, [user]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.productId) {
      setError("กรุณาเลือกสินค้า");
      return;
    }
    if (!form.videoUrl) {
      setError("กรุณาอัปโหลดไฟล์วิดีโอ");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/products/videos", {
        method: "POST",
        token: getAccessToken(),
        body: {
          videoUrl: form.videoUrl,
          description: form.description,
          productId: form.productId,
          sellerName: user?.firstName,
        },
      });
      router.push("/swipe");
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
          <h1 className="mb-4 text-xl font-bold text-gray-900">
            อัปโหลดคลิปรีวิว
          </h1>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            บัญชีนี้เป็นบัญชีผู้ซื้อ อัปโหลดคลิปรีวิวไม่ได้ —
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
      <section className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          อัปโหลดคลิปรีวิว
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          คลิปนี้จะไปแสดงในหน้า{" "}
          <Link href="/swipe" className="text-emerald-600 hover:underline">
            ปัดดูสินค้า
          </Link>{" "}
          พร้อมลิงก์ไปหน้าสินค้าของคุณ
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              เลือกสินค้าของคุณ
            </label>
            {fetchingProducts ? (
              <p className="text-sm text-gray-500">กำลังโหลดรายการสินค้า...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-red-600">
                คุณยังไม่มีสินค้าในร้าน กรุณา
                <Link href="/sell" className="mx-1 underline">
                  ลงขายสินค้า
                </Link>
                ก่อนอัปโหลดคลิป
              </p>
            ) : (
              <select
                value={form.productId}
                onChange={update("productId")}
                className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} (฿{p.price.toLocaleString("th-TH")})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ไฟล์วิดีโอ
            </label>
            <VideoUploader
              value={form.videoUrl}
              onChange={(videoUrl) => setForm({ ...form, videoUrl })}
              token={getAccessToken()}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              รายละเอียดรีวิว
            </label>
            <textarea
              rows={3}
              placeholder="เขียนอธิบายสินค้าหรือรีวิวสั้นๆ..."
              value={form.description}
              onChange={update("description")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || products.length === 0 || !form.videoUrl}
            className="rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังบันทึก..." : "เผยแพร่คลิปรีวิว"}
          </button>
        </form>
      </section>
      <Footer />
    </main>
  );
}
