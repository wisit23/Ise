"use client";

import { useCallback, useEffect, useState } from "react";
import ProductCard from "../../components/ProductCard";
import NavA from "../../components/nav-lab/NavA";
import NavB from "../../components/nav-lab/NavB";
import NavC from "../../components/nav-lab/NavC";
import { FALLBACK_CATEGORIES } from "../../components/nav-lab/navLabData";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch } from "../../lib/api";
import { fetchCategories } from "../../lib/catalog";

/* Sandbox for choosing the buyer navigation. Not linked from anywhere and not
   part of the product — delete this route once a variant is picked.

   Real products and real categories are loaded so the header is judged over
   actual content, and the page is deliberately long enough to scroll, which
   is the only way to see variant B's second row collapse. */

const VARIANTS = [
  {
    key: "A",
    name: "แถวเดียว",
    claim: "ทุกอย่างอยู่ในแถวเดียว ไม่มีอะไรขยับ ไม่มีอะไรซ่อน",
    cost: "ช่องค้นหาแคบลง และไม่เหลือที่ให้แถวหมวดหมู่",
  },
  {
    key: "B",
    name: "สองแถว + ยุบตอนเลื่อน",
    claim:
      "แถวบนเป็นพระเอก แถวล่างจางกว่า เลื่อนแนวนอนได้ และยุบหายเมื่อเลื่อนลง",
    cost: "header สูงกว่าตอนอยู่บนสุด และมีการเคลื่อนไหวให้ต้องคุ้นเคย",
  },
  {
    key: "C",
    name: "ปุ่มฟีเจอร์เด่น + ซ่อนค้นหา",
    claim: "ทุกฟีเจอร์มีปุ่มพร้อมไอคอนที่ระดับบนสุด ไม่มีอะไรอยู่ในเมนู",
    cost: "ค้นหาต้องกดก่อน 1 ครั้ง และบนมือถือไม่มีแถบล่าง",
  },
];

export default function UiLabPage() {
  const [variant, setVariant] = useState("B");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch("/api/products/feed?limit=24")
      .then((data) => setItems(data.items))
      .catch((err) => setError(String(err?.message || err)))
      .finally(() => setLoading(false));

    // Falls back to a static list so the second row can still be judged with
    // the backend down.
    fetchCategories()
      .then((c) => c.length && setCategories(c))
      .catch((err) => console.error("โหลดหมวดหมู่ไม่สำเร็จ:", err));
  }, []);

  useEffect(load, [load]);

  const active = VARIANTS.find((v) => v.key === variant);

  return (
    <div className="min-h-screen bg-surface-subtle pb-20 sm:pb-0">
      {variant === "A" && <NavA />}
      {variant === "B" && <NavB categories={categories} />}
      {variant === "C" && <NavC />}

      <main className="mx-auto w-full max-w-[1280px] px-5 py-8">
        <section className="mb-8 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-700">
            UI Lab · เลือกแบบ Navigation
          </p>

          <div
            role="radiogroup"
            aria-label="เลือกแบบ navigation"
            className="mt-3 flex flex-wrap gap-2"
          >
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                role="radio"
                aria-checked={variant === v.key}
                onClick={() => setVariant(v.key)}
                className={`focus-ring rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  variant === v.key
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line-strong bg-white text-gray-700 hover:border-brand-400"
                }`}
              >
                {v.key} — {v.name}
              </button>
            ))}
          </div>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-brand-700">ข้อดี</dt>
              <dd className="text-ink-muted">{active.claim}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-amber-700">
                สิ่งที่ต้องแลก
              </dt>
              <dd className="text-ink-muted">{active.cost}</dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-brand-300/50 pt-3 text-xs text-ink-muted">
            ลองเลื่อนหน้าลงเพื่อดูพฤติกรรมตอน scroll · ย่อจอเหลือ 375px
            เพื่อดูฝั่งมือถือ (A และ B มีแถบล่าง 5 ช่อง, C ไม่มี)
          </p>
        </section>

        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          สินค้าเข้าใหม่
        </h2>

        {error ? (
          <ErrorState
            description="ไม่สามารถโหลดสินค้าได้ — header ยังกดดูได้ตามปกติ"
            detail={error}
            onRetry={load}
          />
        ) : loading ? (
          <Skeleton.CardGrid count={12} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
