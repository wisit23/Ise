"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "ถูกล็อกไว้ในตะกร้าแล้ว",
  sold: "ขายแล้ว",
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    apiFetch(`/api/products/${id}`)
      .then(setProduct)
      .catch((err) => setError(err.message));
  }, [id]);

  async function addToCart() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return null;
    }
    const user = getStoredUser();
    if (user?.id === product.sellerId) {
      setNotice("คุณไม่สามารถซื้อสินค้าของตัวเองได้");
      return null;
    }

    setBusy(true);
    setNotice("");
    try {
      await apiFetch("/api/orders", {
        method: "POST",
        token,
        body: { productId: product.id },
      });
      setAdded(true);
      setProduct({ ...product, status: "reserved" });
      return true;
    } catch (err) {
      setNotice(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToCart() {
    await addToCart();
  }

  async function handleBuyNow() {
    const ok = await addToCart();
    if (ok) router.push("/cart");
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-5xl px-4 py-10 text-red-600">{error}</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-5xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  const available = product.status === "available";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />

      <nav className="mx-auto w-full max-w-5xl px-4 pt-4 text-xs text-gray-400">
        <Link href="/products" className="hover:text-emerald-600">
          สินค้า
        </Link>
        {" / "}
        <Link
          href={`/products?category=${encodeURIComponent(product.category)}`}
          className="hover:text-emerald-600"
        >
          {product.category}
        </Link>
        {" / "}
        <span className="text-gray-500">{product.title}</span>
      </nav>

      <section className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-4 py-6 sm:grid-cols-2">
        <div>
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-400">
              ไม่มีรูปภาพ
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.title}</h1>
          <p className="mt-3 text-3xl font-bold text-emerald-600">
            ฿{product.price.toLocaleString("th-TH")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              สภาพ: {product.condition}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              ไซส์: {product.size}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 ${
                available
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {STATUS_LABEL[product.status] || product.status}
            </span>
          </div>

          <p className="mt-5 whitespace-pre-line text-sm text-gray-700">
            {product.description}
          </p>

          {notice && <p className="mt-4 text-sm text-red-600">{notice}</p>}
          {added && (
            <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              เพิ่มลงตะกร้าแล้ว สินค้าถูกล็อกไว้ให้คุณ ไปที่{" "}
              <Link href="/cart" className="font-medium underline">
                ตะกร้า
              </Link>{" "}
              เพื่อชำระเงิน
            </p>
          )}

          {!added && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={!available || busy}
                className="flex-1 rounded-md border border-emerald-600 py-3 font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
              >
                {busy ? "กำลังเพิ่ม..." : "เพิ่มลงตะกร้า"}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!available || busy}
                className="flex-1 rounded-md bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {available ? "ซื้อเลย" : "สินค้าไม่พร้อมขาย"}
              </button>
            </div>
          )}
        </div>
      </section>
      <Footer />
    </main>
  );
}
