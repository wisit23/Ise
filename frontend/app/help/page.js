"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Pagination from "../../components/Pagination";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { apiFetch } from "../../lib/api";

const PAGE_SIZE = 10;
const POPULAR_TAGS = [
  "คืนเงิน",
  "ติดตามพัสดุ",
  "สมัครขาย",
  "ยืนยันตัวตน",
  "ประมูล",
  "คำสั่งซื้อ",
];

/**
 * Highlight matched search query in text smoothly
 */
function highlightText(text, query) {
  if (!query || !query.trim() || !text) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="rounded bg-brand-100/90 px-1 py-0.5 font-semibold text-brand-900 transition-colors"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function HelpCenterPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  // Debounce query to avoid whole-page jumping while typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 200);
    return () => clearTimeout(handler);
  }, [q]);

  // Fetch help articles smoothly in background without destroying DOM
  useEffect(() => {
    let isCurrent = true;
    setIsSearching(true);

    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (debouncedQ) params.set("q", debouncedQ);

    apiFetch(`/api/support/help?${params}`)
      .then((data) => {
        if (!isCurrent) return;
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
        setError("");
      })
      .catch((err) => {
        if (isCurrent) setError(err.message);
      })
      .finally(() => {
        if (isCurrent) {
          setIsSearching(false);
          setInitialLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [debouncedQ, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setDebouncedQ(q.trim());
    setPage(1);
  }

  function handleTagClick(tag) {
    const nextQ = q === tag ? "" : tag;
    setQ(nextQ);
    setDebouncedQ(nextQ);
    setPage(1);
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            ศูนย์ช่วยเหลือ
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            ค้นหาคำตอบด่วนก่อนติดต่อทีมซัพพอร์ต หรือ{" "}
            <Link
              href="/support/tickets"
              className="font-semibold text-brand-600 hover:underline"
            >
              เปิดตั๋วแจ้งปัญหา
            </Link>
          </p>
        </div>

        {/* Search Bar with Real-time Animation & Clear Button */}
        <form onSubmit={handleSearchSubmit} className="mb-3.5 flex items-center gap-2">
          <div className="relative flex-1">
            <span
              className={`material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] transition-colors ${
                isSearching ? "text-brand-600" : "text-slate-400"
              }`}
              aria-hidden="true"
            >
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา เช่น คืนเงิน, ติดตามพัสดุ, สมัครขาย..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setDebouncedQ("");
                  setPage(1);
                }}
                aria-label="ล้างคำค้นหา"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:scale-90"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">
                  close
                </span>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-95"
          >
            {isSearching ? (
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">
                search
              </span>
            )}
            ค้นหา
          </button>
        </form>

        {/* Quick Suggestion Pills */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium">คำค้นยอดนิยม:</span>
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className={`rounded-full border px-3 py-1 transition-all duration-200 active:scale-95 ${
                q === tag
                  ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {error && (
          <div className="animate-slide-up mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {/* Results Container - Stable DOM: no full-screen wipe/flash on search */}
        {initialLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-2.5 h-4 w-20 rounded-full bg-slate-200" />
                <div className="mb-2 h-5 w-2/3 rounded bg-slate-200" />
                <div className="h-4 w-full rounded bg-slate-100" />
                <div className="mt-1.5 h-4 w-4/5 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="ไม่พบบทความที่ตรงกับคำค้นหา"
            description={
              debouncedQ
                ? `ไม่พบบทความสำหรับ "${debouncedQ}" ลองค้นหาด้วยคำสำคัญอื่น หรือเปิดตั๋วเพื่อสอบถามทีมงาน`
                : "ยังไม่มีบทความในศูนย์ช่วยเหลือตอนนี้"
            }
            action={
              debouncedQ ? (
                <Button
                  variant="secondary"
                  icon="clear_all"
                  onClick={() => {
                    setQ("");
                    setDebouncedQ("");
                    setPage(1);
                  }}
                >
                  ล้างคำค้นหา
                </Button>
              ) : (
                <Button href="/support/tickets" icon="confirmation_number">
                  เปิดตั๋วแจ้งปัญหา
                </Button>
              )
            }
          />
        ) : (
          <ul className="flex flex-col gap-3.5">
            {items.map((a) => (
              <li
                key={a.id}
                className="animate-slide-up group rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
                    <span className="material-symbols-outlined text-[13px]">
                      label
                    </span>
                    {a.category}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 transition-colors group-hover:text-brand-700">
                  {highlightText(a.title, debouncedQ)}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {highlightText(a.body, debouncedQ)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-6">
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
