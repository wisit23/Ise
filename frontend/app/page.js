"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ProductCard from "../components/ProductCard";
import { apiFetch } from "../lib/api";
import { fetchCategories } from "../lib/catalog";

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    apiFetch("/api/products/feed")
      .then((data) => setItems(data.items.slice(0, 8)))
      .catch(() => {});
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-20">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            RE-LOOP — แพลตฟอร์มซื้อ-ขายแฟชั่นมือสอง
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-gray-500">
            ค้นหาเสื้อผ้ามือสองที่ตรงสไตล์คุณ ซื้อขายอย่างปลอดภัยและตรงไปตรงมา
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/products"
              className="rounded-md bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700"
            >
              เลือกซื้อสินค้า
            </Link>
            <Link
              href="/swipe"
              className="rounded-md border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              ปัดดูสินค้า
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              เริ่มขายสินค้า
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">หมวดหมู่</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {categories.map((c) => (
            <Link
              key={c}
              href={`/products?category=${encodeURIComponent(c)}`}
              className="flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-700 hover:border-emerald-400 hover:text-emerald-600"
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      {items.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-16">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              สินค้าล่าสุด
            </h2>
            <Link
              href="/products"
              className="text-sm text-emerald-600 hover:underline"
            >
              ดูทั้งหมด
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
