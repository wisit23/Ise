"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import Pagination from "../../components/Pagination";
import { apiFetch } from "../../lib/api";
import { fetchCategories } from "../../lib/catalog";

const PAGE_SIZE = 12;

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const urlCategory = searchParams.get("category") || "";

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState(urlQuery);
  const [category, setCategory] = useState(urlCategory);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(query, cat, pageNum) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (cat) params.set("category", cat);
      params.set("page", pageNum);
      params.set("limit", PAGE_SIZE);
      const path = query
        ? `/api/products/search?q=${encodeURIComponent(query)}&${params}`
        : `/api/products/feed?${params}`;
      const data = await apiFetch(path);
      setItems(data.items);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setQ(urlQuery);
    setCategory(urlCategory);
    setPage(1);
    load(urlQuery, urlCategory, 1);
  }, [urlQuery, urlCategory]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    load(q, category, 1);
  }

  function toggleCategory(c) {
    const next = category === c ? "" : c;
    setCategory(next);
    setPage(1);
    load(q, next, 1);
  }

  function handlePageChange(next) {
    setPage(next);
    load(q, category, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-[200px_1fr]">
        <aside className="hidden sm:block">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">หมวดหมู่</h2>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              <button
                onClick={() => toggleCategory("")}
                className={`w-full rounded-md px-2 py-1.5 text-left ${
                  !category
                    ? "bg-emerald-50 font-medium text-emerald-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                ทั้งหมด
              </button>
            </li>
            {categories.map((c) => (
              <li key={c}>
                <button
                  onClick={() => toggleCategory(c)}
                  className={`w-full rounded-md px-2 py-1.5 text-left ${
                    category === c
                      ? "bg-emerald-50 font-medium text-emerald-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-gray-900">
              {category || "สินค้าทั้งหมด"}
              {q && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ผลการค้นหา &quot;{q}&quot;
                </span>
              )}
            </h1>
            <form onSubmit={handleSearch} className="flex gap-2 sm:hidden">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาสินค้า..."
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                ค้นหา
              </button>
            </form>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto sm:hidden">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  category === c
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-300 text-gray-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading && <p className="text-gray-500">กำลังโหลด...</p>}
          {!loading && items.length === 0 && (
            <p className="text-gray-500">ไม่พบสินค้า</p>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={handlePageChange}
          />
        </div>
      </section>
      <Footer />
    </main>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}
