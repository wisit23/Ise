"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import Reveal from "../../components/ui/Reveal";
import Pagination from "../../components/Pagination";
import Button from "../../components/ui/Button";
import Select from "../../components/ui/Select";
import Input from "../../components/ui/Input";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch } from "../../lib/api";
import { fetchCategories, fetchConditions } from "../../lib/catalog";
import {
  getAccessToken,
  getCurrentRoles,
  isCustomerAccountRoles,
} from "../../lib/auth";

import { createFeedSeed } from "../../lib/recommendationFeed";

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
  const [personalized, setPersonalized] = useState(false);
  const requestRef = useRef(null);
  const appliedRef = useRef(null);
  const seedRef = useRef(null);

  async function load(
    query,
    cat,
    pageNum,
    active = { style, brand, size, condition, minPrice, maxPrice },
    recordSearch = false,
  ) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    appliedRef.current = { query, cat, active };
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      seedRef.current ||= createFeedSeed();
      params.set("seed", seedRef.current);
      if (cat) params.set("category", cat);
      for (const [key, value] of Object.entries(active))
        if (value) params.set(key, value);
      params.set("page", pageNum);
      params.set("limit", PAGE_SIZE);
      if (query) params.set("q", query);
      if (
        recordSearch &&
        query.trim() &&
        getAccessToken() &&
        isCustomerAccountRoles(getCurrentRoles())
      ) {
        // Record submitted searches, not typing or pagination. Ranking still
        // works when history storage is temporarily unavailable.
        await apiFetch("/api/products/recommendations/search-events", {
          method: "POST",
          body: { query },
          signal: controller.signal,
        }).catch((err) => {
          if (!controller.signal.aborted)
            console.error("บันทึกการค้นหาไม่สำเร็จ:", err);
        });
      }
      if (controller.signal.aborted) return;
      const data = await apiFetch(`/api/products/recommendations?${params}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setItems(data.items);
      setTotalPages(data.totalPages);
      setPersonalized(Boolean(data.personalized));
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    setQ(urlQuery);
    setCategory(urlCategory);
    setPage(1);
    load(
      urlQuery,
      urlCategory,
      1,
      { style, brand, size, condition, minPrice, maxPrice },
      true,
    );
  }, [urlQuery, urlCategory]);

  useEffect(() => {
    const authChanged = () => {
      seedRef.current = createFeedSeed();
      setItems([]);
      setPersonalized(false);
      setPage(1);
      const applied = appliedRef.current;
      if (applied) load(applied.query, applied.cat, 1, applied.active);
    };
    window.addEventListener("reloop:auth", authChanged);
    return () => {
      window.removeEventListener("reloop:auth", authChanged);
      requestRef.current?.abort();
    };
  }, []);

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
    load(q, category, 1, active, true);
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
          <div className="mb-6 rounded-2xl border border-line bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
              <span
                className="material-symbols-outlined text-[20px] text-brand-600"
                aria-hidden="true"
              >
                tune
              </span>
              <h2 className="text-sm font-semibold text-ink">ตัวกรองสินค้า</h2>
              <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
                เลือกสไตล์และช่วงราคาที่ต้องการ
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-4">
              {[
                ["style", style, setStyle, "สไตล์"],
                ["brand", brand, setBrand, "แบรนด์"],
                ["size", size, setSize, "ขนาด"],
              ].map(([key, value, setter, label]) => (
                <Select
                  key={key}
                  label={label}
                  name={key}
                  searchable={key === "style" || key === "brand"}
                  searchPlaceholder={`ค้นหา${label}...`}
                  value={value}
                  size="lg"
                  onChange={(event) => {
                    setter(event.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: "", label: "ทั้งหมด" },
                    ...(
                      options[key === "style" ? "styles" : key + "s"] || []
                    ).map((item) => ({ value: item, label: item })),
                  ]}
                />
              ))}
              <Select
                label="สภาพสินค้า"
                name="condition"
                value={condition}
                size="lg"
                onChange={(event) => {
                  setCondition(event.target.value);
                  setPage(1);
                }}
                options={[{ value: "", label: "ทั้งหมด" }, ...conditions]}
              />
            </div>
            <div className="flex flex-col gap-4 rounded-b-2xl border-t border-line bg-surface-subtle/60 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid min-w-0 grid-cols-2 gap-3 lg:max-w-[360px] lg:flex-1">
                <Input
                  label="ราคาต่ำสุด"
                  inputMode="numeric"
                  type="number"
                  min="0"
                  placeholder="0 ฿"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  className="min-h-11"
                />
                <Input
                  label="ราคาสูงสุด"
                  inputMode="numeric"
                  type="number"
                  min="0"
                  placeholder="ไม่จำกัด"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  className="min-h-11"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={applyFilters}
                  icon="filter_alt"
                  className="min-h-11 flex-1 sm:flex-none"
                >
                  ใช้ตัวกรอง
                </Button>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearFilters}
                    icon="restart_alt"
                    className="min-h-11"
                  >
                    ล้างตัวกรอง
                  </Button>
                )}
              </div>
            </div>
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
            <form
              onSubmit={handleSearch}
              className="flex w-full min-w-0 gap-2 sm:hidden"
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="ค้นหาสินค้า"
                placeholder="ค้นหาสินค้าหรือชื่อร้าน..."
                className="focus-ring placeholder:text-ink-subtle min-w-0 flex-1 rounded-md border border-line-strong px-3 py-2 text-sm"
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

          {!loading && personalized && (
            <p className="mb-4 text-sm text-ink-subtle">
              เรียงตามความสนใจ การค้นหา คลิปที่กดใจ และสินค้าที่คุณซื้อ
              พร้อมสินค้าใหม่และสินค้าที่น่าลอง
            </p>
          )}

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
                hasActiveFilters
                  ? "ลองใช้คำค้นอื่น หรือล้างตัวกรองเพื่อดูสินค้าทั้งหมด"
                  : "ยังไม่มีสินค้าในระบบตอนนี้"
              }
              action={
                hasActiveFilters && (
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
                    {p.recommendation?.reasons?.length > 0 && (
                      <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
                        {p.recommendation.reasons.join(" · ")}
                      </p>
                    )}
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
