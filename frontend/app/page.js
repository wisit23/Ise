"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ProductCard from "../components/ProductCard";
import Button from "../components/ui/Button";
import ErrorState from "../components/ui/ErrorState";
import Skeleton from "../components/ui/Skeleton";
import { apiFetch } from "../lib/api";
import { fetchCategories } from "../lib/catalog";

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* This used to be `.catch(() => {})`, which meant a backend outage rendered
     the landing page as a hero over empty space with nothing to click and no
     hint that anything had gone wrong. */
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([apiFetch("/api/products/feed"), fetchCategories()])
      .then(([feed, cats]) => {
        setItems(feed.items.slice(0, 8));
        setCategories(cats);
      })
      .catch((err) => setError(String(err?.message || err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />

      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-20">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            RE-LOOP — แพลตฟอร์มซื้อ-ขายแฟชั่นมือสอง
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            ค้นหาเสื้อผ้ามือสองที่ตรงสไตล์คุณ ซื้อขายอย่างปลอดภัยและตรงไปตรงมา
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/products" size="lg" icon="storefront">
              เลือกซื้อสินค้า
            </Button>
            <Button href="/swipe" size="lg" variant="secondary" icon="swipe">
              ปัดดูสินค้า
            </Button>
            <Button href="/register" size="lg" variant="secondary" icon="sell">
              เริ่มขายสินค้า
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <ErrorState
            description="ไม่สามารถโหลดสินค้าและหมวดหมู่ได้ในขณะนี้"
            detail={error}
            onRetry={load}
          />
        </section>
      ) : (
        <>
          <section className="mx-auto w-full max-w-6xl px-4 py-10">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              หมวดหมู่
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-[74px] w-full" />
                  ))
                : categories.map((c) => (
                    <Link
                      key={c}
                      href={`/products?category=${encodeURIComponent(c)}`}
                      className="focus-ring flex items-center justify-center rounded-lg border border-line bg-white px-3 py-6 text-center text-sm text-gray-700 transition hover:border-brand-400 hover:text-brand-600"
                    >
                      {c}
                    </Link>
                  ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-6xl px-4 pb-16">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                สินค้าล่าสุด
              </h2>
              <Link
                href="/products"
                className="focus-ring rounded text-sm text-brand-600 hover:underline"
              >
                ดูทั้งหมด
              </Link>
            </div>
            {loading ? (
              <Skeleton.CardGrid count={8} />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Footer />
    </main>
  );
}
