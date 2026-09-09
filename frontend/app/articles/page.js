"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch, mediaUrl } from "../../lib/api";

const PAGE_SIZE = 9;

const CATEGORIES = [
  { key: "", label: "ทั้งหมด", icon: "apps" },
  { key: "care", label: "การดูแลเสื้อผ้า", icon: "local_laundry_service" },
  { key: "styling", label: "เคล็ดลับการแต่งตัว", icon: "styler" },
  { key: "sustainability", label: "แฟชั่นยั่งยืน & Eco", icon: "eco" },
  { key: "general", label: "สาระน่ารู้", icon: "lightbulb" },
];

const CATEGORY_MAP = {
  care: { label: "การดูแลเสื้อผ้า", color: "bg-blue-50 text-blue-700 border-blue-200" },
  styling: { label: "เคล็ดลับการแต่งตัว", color: "bg-purple-50 text-purple-700 border-purple-200" },
  sustainability: { label: "แฟชั่นยั่งยืน", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  general: { label: "สาระน่ารู้", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

function formatThaiDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function estimateReadingTime(text) {
  if (!text) return "2 นาที";
  const words = text.trim().length;
  const minutes = Math.max(1, Math.ceil(words / 400));
  return `${minutes} นาที`;
}

function ArticlesPageContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "";

  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState(initialCategory);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
        params.set("page", page);
        params.set("limit", PAGE_SIZE);

        const data = await apiFetch(`/api/products/articles?${params}`);
        setArticles(data.items || []);
        setTotalPages(data.totalPages || 1);
        setTotalItems(data.total || 0);
      } catch (err) {
        console.error("Failed to load articles:", err);
        setError(err.message || "ไม่สามารถโหลดบทความได้");
      } finally {
        setLoading(false);
      }
    }

    fetchArticles();
  }, [category, debouncedQ, page]);

  return (
    <main className="min-h-screen flex flex-col bg-slate-50/60">
      <NavBar />

      {/* Hero Header */}
      <header className="relative overflow-hidden bg-gradient-to-b from-brand-50/80 via-white to-slate-50/60 border-b border-slate-200/70 pt-10 pb-12 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-4">
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            RE-LOOP Community & Knowledge Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
            สาระน่ารู้ & เคล็ดลับแฟชั่นหมุนเวียน
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            รวมบทความ ไอเดียการแต่งตัว วิธีดูแลรักษาเสื้อผ้ามือสอง และเรื่องราวดีๆ 
            เพื่อร่วมสร้างโลกที่ยั่งยืนผ่านการใช้ซ้ำอย่างคุ้มค่า
          </p>

          {/* Search Box */}
          <div className="mt-8 mx-auto max-w-xl">
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-slate-400 text-[20px] pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาบทความ เช่น ซักผ้า, วินเทจ, แฟชั่นยั่งยืน..."
                className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all text-sm"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Category Tabs & Content Area */}
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar">
          {CATEGORIES.map((cat) => {
            const isActive = category === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setCategory(cat.key);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold shrink-0 transition-all ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {cat.icon}
                </span>
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Status Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 mb-6">
          <span>
            {debouncedQ ? (
              <>
                ผลการค้นหาสำหรับ &ldquo;<strong className="text-slate-800">{debouncedQ}</strong>&rdquo;
              </>
            ) : (
              "บทความล่าสุด"
            )}
            {" · "}
            {totalItems} บทความ
          </span>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <Skeleton className="h-44 w-full rounded-xl mb-4" />
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-4/5 mb-3" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState description={error} onRetry={() => setPage(page)} />
        ) : articles.length === 0 ? (
          <EmptyState
            title="ไม่พบบทความ"
            description={
              debouncedQ
                ? `ไม่พบบทความที่ตรงกับคำค้น "${debouncedQ}" ลองค้นหาด้วยคำอื่นดูครับ`
                : "ยังไม่มีบทความในหมวดหมู่นี้"
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => {
              const catInfo = CATEGORY_MAP[article.category] || {
                label: article.category || "บทความ",
                color: "bg-slate-50 text-slate-700 border-slate-200",
              };

              return (
                <Link
                  key={article.id}
                  href={`/articles/${article.id}`}
                  className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200"
                >
                  {/* Cover Image Container */}
                  <div className="relative aspect-[16/10] w-full bg-slate-100 overflow-hidden">
                    {article.coverImage ? (
                      <img
                        src={mediaUrl(article.coverImage)}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                        <span className="material-symbols-outlined text-[44px]">menu_book</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-semibold border backdrop-blur-md ${catInfo.color}`}
                      >
                        {catInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Article Card Details */}
                  <div className="flex flex-col flex-1 p-5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
                      <span>{formatThaiDate(article.publishedAt || article.createdAt)}</span>
                      <span>·</span>
                      <span>อ่าน {estimateReadingTime(article.content)}</span>
                    </div>

                    <h2 className="text-base font-bold text-slate-900 group-hover:text-brand-600 line-clamp-2 leading-snug mb-2 transition-colors">
                      {article.title}
                    </h2>

                    {article.summary && (
                      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4 flex-1">
                        {article.summary}
                      </p>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-auto">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-emerald-600">
                          verified
                        </span>
                        {article.authorName || "ฝ่ายการตลาด RE-LOOP"}
                      </span>
                      <span className="font-semibold text-brand-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                        อ่านต่อ <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="mt-10 flex justify-center">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}

export default function ArticlesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex flex-col bg-slate-50">
          <NavBar />
          <div className="mx-auto max-w-6xl px-4 py-12">
            <Skeleton className="h-10 w-48 mb-6" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </main>
      }
    >
      <ArticlesPageContent />
    </Suspense>
  );
}
