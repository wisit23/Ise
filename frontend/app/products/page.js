"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import Reveal from "../../components/ui/Reveal";
import Pagination from "../../components/Pagination";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch } from "../../lib/api";
import { fetchCategories, fetchConditions } from "../../lib/catalog";

const PAGE_SIZE = 12;

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const urlCategory = searchParams.get("category") || "";

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [options, setOptions] = useState({ brands: [], styles: [], sizes: [] });
  const [q, setQ] = useState(urlQuery);
  const [category, setCategory] = useState(urlCategory);
  const [style, setStyle] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(
    query,
    cat,
    pageNum,
    active = { style, brand, size, condition, minPrice, maxPrice },
  ) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (cat) params.set("category", cat);
      for (const [key, value] of Object.entries(active))
        if (value) params.set(key, value);
      params.set("page", pageNum);
      params.set("limit", PAGE_SIZE);
      const path =
        query || Object.values(active).some(Boolean) || cat
          ? `/api/products/search${query ? `?q=${encodeURIComponent(query)}&` : "?"}${params}`
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
    // A failed category fetch only costs the filter list, not the product
    // grid, so it degrades to "no filters" rather than blocking the page.
    fetchCategories()
      .then(setCategories)
      .catch((err) => console.error("Failed to load categories:", err));
    fetchConditions()
      .then(setConditions)
      .catch((err) => console.error("Failed to load conditions:", err));
    apiFetch("/api/products/filters")
      .then(setOptions)
      .catch((err) => console.error("Failed to load filters:", err));
  }, []);

  function applyFilters() {
    const active = { style, brand, size, condition, minPrice, maxPrice };
    setPage(1);
    load(q, category, 1, active);
  }

  function handleSearch(e) {
    e.preventDefault();
    applyFilters();
  }

  function toggleCategory(c) {
    const next = category === c ? "" : c;
    setCategory(next);
    setPage(1);
    load(q, next, 1);
  }

  const hasActiveFilters = Boolean(
    q ||
    category ||
    style ||
    brand ||
    size ||
    condition ||
    minPrice ||
    maxPrice,
  );

  function clearFilters() {
    const empty = {
      style: "",
      brand: "",
      size: "",
      condition: "",
      minPrice: "",
      maxPrice: "",
    };
    setQ("");
    setCategory("");
    setStyle("");
    setBrand("");
    setSize("");
    setCondition("");
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
    load("", "", 1, empty);
  }

  function handlePageChange(next) {
    setPage(next);
    load(q, category, next, {
      style,
      brand,
      size,
      condition,
      minPrice,
      maxPrice,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
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
                    ? "bg-brand-50 font-medium text-brand-700"
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
                      ? "bg-brand-50 font-medium text-brand-700"
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
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["style", style, setStyle, "สไตล์"],
              ["brand", brand, setBrand, "แบรนด์"],
              ["size", size, setSize, "ขนาด"],
            ].map(([key, value, setter, label]) => (
              <select
                key={key}
                aria-label={label}
                value={value}
                onChange={(e) => {
                  setter(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-line-strong px-2 py-2 text-sm"
              >
                <option value="">{label}: ทั้งหมด</option>
                {(options[key === "style" ? "styles" : `${key}s`] || []).map(
                  (item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ),
                )}
              </select>
            ))}
            <select
              aria-label="สภาพสินค้า"
              value={condition}
              onChange={(e) => {
                setCondition(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-line-strong px-2 py-2 text-sm"
            >
              <option value="">สภาพ: ทั้งหมด</option>
              {conditions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              aria-label="ราคาต่ำสุด"
              inputMode="numeric"
              type="number"
              min="0"
              placeholder="ราคาต่ำสุด"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="rounded-md border border-line-strong px-2 py-2 text-sm"
            />
            <input
              aria-label="ราคาสูงสุด"
              inputMode="numeric"
              type="number"
              min="0"
              placeholder="ราคาสูงสุด"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="rounded-md border border-line-strong px-2 py-2 text-sm"
            />
            <Button type="button" variant="secondary" onClick={applyFilters}>
              ใช้ตัวกรอง
            </Button>
            {hasActiveFilters && (
              <Button type="button" variant="secondary" onClick={clearFilters}>
                ล้างตัวกรอง
              </Button>
            )}
          </div>

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
                aria-label="ค้นหาสินค้า"
                placeholder="ค้นหาสินค้า..."
                className="focus-ring placeholder:text-ink-subtle rounded-md border border-line-strong px-3 py-2 text-sm"
              />
              <Button type="submit">ค้นหา</Button>
            </form>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto sm:hidden">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  category === c
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-line-strong text-gray-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {error ? (
            <ErrorState
              description="ไม่สามารถโหลดรายการสินค้าได้ในขณะนี้"
              detail={error}
              onRetry={() => load(q, category, page)}
            />
          ) : loading ? (
            <Skeleton.CardGrid count={PAGE_SIZE} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="ไม่พบสินค้าที่ตรงกับเงื่อนไข"
              description={
                q ||
                category ||
                style ||
                brand ||
                size ||
                condition ||
                minPrice ||
                maxPrice
                  ? "ลองใช้คำค้นอื่น หรือล้างตัวกรองเพื่อดูสินค้าทั้งหมด"
                  : "ยังไม่มีสินค้าในระบบตอนนี้"
              }
              action={
                (q ||
                  category ||
                  style ||
                  brand ||
                  size ||
                  condition ||
                  minPrice ||
                  maxPrice) && (
                  <Button
                    variant="secondary"
                    icon="filter_alt_off"
                    onClick={clearFilters}
                  >
                    ล้างตัวกรอง
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {items.map((p, i) => (
                  <Reveal key={p.id} delay={Math.min(i, 7) * 45}>
                    <ProductCard product={p} />
                  </Reveal>
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={handlePageChange}
              />
            </>
          )}
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
