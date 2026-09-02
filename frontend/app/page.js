"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ProductCard from "../components/ProductCard";
import Button from "../components/ui/Button";
import ErrorState from "../components/ui/ErrorState";
import Skeleton from "../components/ui/Skeleton";
import { apiFetch, mediaUrl } from "../lib/api";
import { fetchCategoryCounts } from "../lib/catalog";

const NEW_ARRIVALS_COUNT = 8;

/* One icon per real category name, falling back to a generic tag icon for
   anything new added later so this never silently renders blank. Deliberately
   not exhaustive of every possible Thai word — just the ones product-service
   actually has right now. */
const CATEGORY_ICON = {
  กระเป๋า: "shopping_bag",
  กางเกง: "checkroom",
  รองเท้า: "footprint",
  สกุชชี่: "toys",
  เครื่องประดับ: "diamond",
  เครื่องใช้ไฟฟ้า: "bolt",
  เดรส: "checkroom",
  เสื้อผ้า: "checkroom",
  เสื้อยืด: "checkroom",
  แจ็คเก็ต: "checkroom",
};

const VALUE_PROPS = [
  {
    icon: "lock_clock",
    title: "จองสินค้าให้ระหว่างชำระเงิน",
    body: "กดจ่ายเงินแล้วระบบล็อกสินค้าให้ 10 นาที ไม่ต้องกลัวมีคนแย่งซื้อไปก่อนคุณจะโอนเสร็จ",
  },
  {
    icon: "gavel",
    title: "มีข้อพิพาท ทีมงานช่วยตัดสิน",
    body: "ได้รับสินค้าไม่ตรงปก แจ้งข้อพิพาทได้จากหน้าคำสั่งซื้อ ทีมงานตรวจสอบและตัดสินให้ทุกฝ่าย",
  },
  {
    icon: "verified",
    title: "มองหาร้านที่ยืนยันตัวตนแล้ว",
    body: "ร้านค้าที่ผ่านการยืนยันตัวตนจะมีเครื่องหมายติ๊กสีเขียวข้างชื่อร้าน ก่อนซื้อลองเช็กดูได้เสมอ",
  },
];

const HOW_IT_WORKS = [
  {
    icon: "search",
    title: "เลือกสินค้าที่ถูกใจ",
    body: "ดูรูปจริงของสินค้า สภาพ ไซซ์ และคะแนนร้านค้าให้ครบก่อนตัดสินใจ",
  },
  {
    icon: "lock_clock",
    title: "จองแล้วค่อยจ่าย",
    body: "กดสั่งซื้อ ระบบล็อกสินค้าให้ 10 นาทีเพื่อให้คุณชำระเงินได้โดยไม่ถูกแย่ง",
  },
  {
    icon: "local_shipping",
    title: "รับสินค้า หรือแจ้งปัญหา",
    body: "ได้รับของแล้วให้คะแนนร้านค้าได้เลย หรือแจ้งข้อพิพาทหากไม่ตรงปกที่ตกลงไว้",
  },
];

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  /* This used to be `.catch(() => {})`, which meant a backend outage rendered
     the landing page as a hero over empty space with nothing to click and no
     hint that anything had gone wrong. */
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch(`/api/products/feed?limit=${NEW_ARRIVALS_COUNT}`)
      .then((feed) => {
        setItems(feed.items);
        setTotal(feed.total);
      })
      .catch((err) => setError(String(err?.message || err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Decorative relative to the product grid above — a category with zero
    // real listings is worse than not showing categories at all, so this is
    // the live count per category, not the raw category table. If it fails,
    // the rail just stays empty; it should not take the whole page down.
    fetchCategoryCounts()
      .then((counts) => {
        setCategories(
          Object.entries(counts)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
        );
      })
      .catch((err) =>
        console.error("โหลดจำนวนสินค้าต่อหมวดหมู่ไม่สำเร็จ:", err),
      )
      .finally(() => setCategoriesLoading(false));
  }, []);

  const heroPhotos = items.filter((p) => p.media?.length).slice(0, 3);

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <NavBar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line bg-surface-subtle">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.05fr_0.95fr] md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              แฟชั่นมือสอง คัดสภาพแล้ว
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl md:text-[2.75rem]">
              RE-LOOP — ตลาดแฟชั่นมือสอง
              <br className="hidden sm:block" /> ที่ซื้อขายกันอย่างมั่นใจ
            </h1>
            <p className="mt-4 max-w-md text-ink-muted">
              เสื้อผ้า กระเป๋า รองเท้า และของมือสองสภาพดี
              ตรวจสอบร้านค้าและรีวิวได้ก่อนตัดสินใจซื้อทุกครั้ง
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button href="/products" size="lg" icon="storefront">
                เลือกซื้อสินค้า
              </Button>
              <Button href="/swipe" size="lg" variant="secondary" icon="swipe">
                ปัดดูสินค้า
              </Button>
              <Button href="/sell" size="lg" variant="secondary" icon="sell">
                เริ่มขายสินค้า
              </Button>
            </div>

            <div className="mt-8 flex items-center gap-2 text-sm text-ink-muted">
              <span
                className="material-symbols-outlined text-[18px] text-brand-600"
                aria-hidden="true"
              >
                inventory_2
              </span>
              {total === null ? (
                <Skeleton className="h-4 w-40" />
              ) : (
                <span>
                  มีสินค้าให้เลือกตอนนี้{" "}
                  <b className="font-semibold text-gray-900">
                    {total.toLocaleString("th-TH")}
                  </b>{" "}
                  ชิ้น
                </span>
              )}
            </div>
          </div>

          {/* Real listings, not stock photography — this is what is
              actually for sale on the site right now, so the hero never
              promises a selection that does not exist. */}
          <div className="relative hidden aspect-square md:block">
            {loading ? (
              <div className="grid h-full grid-cols-2 gap-3">
                <Skeleton className="row-span-2 rounded-2xl" />
                <Skeleton className="rounded-2xl" />
                <Skeleton className="rounded-2xl" />
              </div>
            ) : heroPhotos.length > 0 ? (
              <div className="grid h-full grid-cols-2 grid-rows-2 gap-3">
                <Link
                  href={`/products/${heroPhotos[0].id}`}
                  className="focus-ring row-span-2 overflow-hidden rounded-2xl border border-line shadow-sm"
                >
                  <img
                    src={mediaUrl(heroPhotos[0].media[0].url)}
                    alt={heroPhotos[0].title}
                    className="h-full w-full object-cover transition duration-500 hover:scale-105"
                  />
                </Link>
                {heroPhotos.slice(1, 3).map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="focus-ring overflow-hidden rounded-2xl border border-line shadow-sm"
                  >
                    <img
                      src={mediaUrl(p.media[0].url)}
                      alt={p.title}
                      className="h-full w-full object-cover transition duration-500 hover:scale-105"
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-line-strong bg-white text-sm text-ink-subtle">
                ยังไม่มีรูปสินค้าให้แสดง
              </div>
            )}

            <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-lg lg:flex">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <span
                  className="material-symbols-outlined text-[20px]"
                  aria-hidden="true"
                >
                  lock_clock
                </span>
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-gray-900">
                  จองสินค้าให้ 10 นาที
                </p>
                <p className="text-xs text-ink-subtle">ระหว่างที่คุณชำระเงิน</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <ErrorState
            description="ไม่สามารถโหลดสินค้าได้ในขณะนี้"
            detail={error}
            onRetry={load}
          />
        </section>
      ) : (
        <>
          {/* ── Value props ────────────────────────────────────── */}
          <section className="border-b border-line bg-white">
            <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
              {VALUE_PROPS.map((v) => (
                <div key={v.title} className="flex gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <span
                      className="material-symbols-outlined text-[22px]"
                      aria-hidden="true"
                    >
                      {v.icon}
                    </span>
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">{v.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{v.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Category rail ──────────────────────────────────── */}
          <section className="mx-auto w-full max-w-6xl px-4 py-10">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  เลือกซื้อตามหมวดหมู่
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  แสดงเฉพาะหมวดที่มีสินค้าให้ซื้อจริงในระบบตอนนี้
                </p>
              </div>
            </div>

            <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
              {categoriesLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="h-[86px] w-[136px] shrink-0 rounded-xl"
                    />
                  ))
                : categories.map((c) => (
                    <Link
                      key={c.name}
                      href={`/products?category=${encodeURIComponent(c.name)}`}
                      className="focus-ring flex w-[136px] shrink-0 flex-col items-center gap-2 rounded-xl border border-line bg-white px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <span
                          className="material-symbols-outlined text-[22px]"
                          aria-hidden="true"
                        >
                          {CATEGORY_ICON[c.name] || "sell"}
                        </span>
                      </span>
                      <span className="line-clamp-1 text-sm font-medium text-gray-800">
                        {c.name}
                      </span>
                      <span className="text-xs text-ink-subtle">
                        {c.count.toLocaleString("th-TH")} ชิ้น
                      </span>
                    </Link>
                  ))}
            </div>
          </section>

          {/* ── New arrivals ───────────────────────────────────── */}
          <section className="mx-auto w-full max-w-6xl px-4 pb-14">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                สินค้าเข้าใหม่
              </h2>
              <Link
                href="/products"
                className="focus-ring flex shrink-0 items-center gap-1 rounded text-sm font-medium text-brand-600 hover:underline"
              >
                ดูทั้งหมด
                {total !== null ? ` ${total.toLocaleString("th-TH")} ชิ้น` : ""}
                <span
                  className="material-symbols-outlined text-[16px]"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </Link>
            </div>

            {loading ? (
              <Skeleton.CardGrid count={NEW_ARRIVALS_COUNT} />
            ) : items.length === 0 ? (
              <p className="text-sm text-ink-muted">
                ยังไม่มีสินค้าลงขายในระบบ
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </section>

          {/* ── How it works ───────────────────────────────────── */}
          <section className="border-y border-line bg-surface-subtle">
            <div className="mx-auto w-full max-w-6xl px-4 py-14">
              <h2 className="mb-8 text-center text-lg font-semibold text-gray-900">
                ซื้อขายกันยังไงให้ปลอดภัย
              </h2>
              <div className="grid gap-6 sm:grid-cols-3">
                {HOW_IT_WORKS.map((step, i) => (
                  <div
                    key={step.title}
                    className="rounded-xl border border-line bg-white p-6"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                        {i + 1}
                      </span>
                      <span
                        className="material-symbols-outlined text-[22px] text-brand-600"
                        aria-hidden="true"
                      >
                        {step.icon}
                      </span>
                    </div>
                    <p className="mt-4 font-semibold text-gray-900">
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Sell CTA ────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-6xl px-4 py-14">
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-brand-600 px-6 py-12 text-center text-white sm:px-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                <span
                  className="material-symbols-outlined text-[24px]"
                  aria-hidden="true"
                >
                  add_circle
                </span>
              </span>
              <h2 className="text-2xl font-bold">
                มีของที่ไม่ได้ใช้แล้วใช่ไหม
              </h2>
              <p className="max-w-md text-sm text-brand-50">
                ลงขายได้ฟรี ไม่มีค่าธรรมเนียมแรกเข้า ถ่ายรูป ตั้งราคา
                แล้วลงขายได้ทันที
              </p>
              {/* Not <Button variant="secondary">: its base classes already
                  set a background/text colour, and Tailwind utilities from
                  two different class strings don't reliably override one
                  another by source order alone. A one-off white-on-brand
                  button is simplest and safest written directly. */}
              <Link
                href="/sell"
                className="focus-ring mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-base font-medium text-brand-700 transition hover:bg-brand-50"
              >
                <span
                  className="material-symbols-outlined text-[18px] leading-none"
                  aria-hidden="true"
                >
                  sell
                </span>
                เริ่มลงขายเลย
              </Link>
            </div>
          </section>
        </>
      )}

      <Footer />
    </main>
  );
}
