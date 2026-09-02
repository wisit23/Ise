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
import { fetchCategoryPreviews } from "../lib/catalog";

const NEW_ARRIVALS_COUNT = 8;

/* One icon per real category name, falling back to a generic tag for
   anything added later so a new category never renders blank. */
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

/* Bento rhythm: the first tile is a 2x2 hero and the fourth is a wide
   banner, everything else is a unit square. Keyed by index so it holds
   whatever the real category list turns out to be. */
const TILE_SPAN = {
  0: "sm:col-span-2 sm:row-span-2",
  3: "sm:col-span-2",
};

const VALUE_PROPS = [
  {
    icon: "lock_clock",
    title: "จองสินค้าให้ 10 นาที",
    body: "กดสั่งซื้อแล้วระบบล็อกของไว้ให้ ไม่ต้องกลัวโดนแย่งระหว่างที่กำลังโอน",
  },
  {
    icon: "gavel",
    title: "มีข้อพิพาท ทีมงานตัดสิน",
    body: "ได้ของไม่ตรงปก แจ้งได้จากหน้าคำสั่งซื้อ มีคนกลางตรวจหลักฐานให้ทั้งสองฝ่าย",
  },
  {
    icon: "verified",
    title: "ดูได้ว่าร้านไหนยืนยันตัวตนแล้ว",
    body: "ร้านที่ผ่าน KYC จะมีเครื่องหมายรับรองข้างชื่อ เช็กก่อนโอนได้ทุกครั้ง",
  },
];

const HOW_IT_WORKS = [
  {
    icon: "search",
    title: "เลือกของที่ถูกใจ",
    body: "ดูรูปจริงทุกมุม สภาพสินค้า ไซซ์ และคะแนนร้านให้ครบก่อนตัดสินใจ",
  },
  {
    icon: "lock_clock",
    title: "จองแล้วค่อยจ่าย",
    body: "ระบบล็อกสินค้าให้ 10 นาที ชำระเงินได้สบายๆ โดยไม่ต้องแข่งกับใคร",
  },
  {
    icon: "inventory",
    title: "รับของ แล้วให้คะแนน",
    body: "ได้ของตรงปกก็รีวิวร้านได้เลย ถ้าไม่ตรงปกแจ้งข้อพิพาทได้ทันที",
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
    // Secondary to the product grid: if this fails the rail just stays
    // empty rather than taking the whole page down with it.
    fetchCategoryPreviews()
      .then(setCategories)
      .catch((err) => console.error("โหลดหมวดหมู่ไม่สำเร็จ:", err))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const heroPhotos = items.filter((p) => p.media?.length).slice(0, 3);

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface-subtle">
        {/* Soft brand wash behind the collage, clipped by the section. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-brand-100/50 blur-3xl"
        />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1fr_0.9fr] md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700">
              <span
                className="material-symbols-outlined text-[15px] leading-none"
                aria-hidden="true"
              >
                recycling
              </span>
              แฟชั่นมือสอง ซื้อขายอย่างมั่นใจ
            </span>

            <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-5xl">
              ให้ของที่คุณรัก
              <br />
              ได้มี
              {/* The brand swipe sits behind the word, not under it, so the
                  descenders in ชีวิตรอบสอง stay readable. */}
              <span className="relative whitespace-nowrap text-brand-700">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-1 -z-10 h-3.5 rounded bg-brand-200/70 sm:h-4"
                />
                ชีวิตรอบสอง
              </span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">
              RE-LOOP คือตลาดแฟชั่นมือสองที่ให้คุณตรวจสอบร้าน ดูรีวิว
              และจองของไว้ก่อนจ่ายเงิน — ซื้อสบายใจ ขายได้จริง
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="/products" size="lg" icon="storefront">
                เลือกซื้อสินค้า
              </Button>
              <Button href="/sell" size="lg" variant="secondary" icon="sell">
                เริ่มขายฟรี
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6 text-sm">
              <span className="flex items-center gap-2 text-ink-muted">
                <span
                  className="material-symbols-outlined text-[19px] leading-none text-brand-600"
                  aria-hidden="true"
                >
                  inventory_2
                </span>
                {total === null ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  <>
                    <b className="font-bold text-gray-900">
                      {total.toLocaleString("th-TH")}
                    </b>{" "}
                    ชิ้นพร้อมขายตอนนี้
                  </>
                )}
              </span>
              <span className="flex items-center gap-2 text-ink-muted">
                <span
                  className="material-symbols-outlined text-[19px] leading-none text-brand-600"
                  aria-hidden="true"
                >
                  category
                </span>
                {categoriesLoading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <>
                    <b className="font-bold text-gray-900">
                      {categories.length}
                    </b>{" "}
                    หมวดหมู่
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Staggered collage of the site's own newest listings — real
              merchandise rather than stock photography, so the hero can
              never promise a selection that doesn't exist. */}
          <div className="relative hidden md:block">
            {loading ? (
              <div className="grid h-[440px] grid-cols-2 grid-rows-6 gap-4">
                <Skeleton className="col-start-1 row-span-4 row-start-1 rounded-3xl" />
                <Skeleton className="col-start-2 row-span-4 row-start-2 rounded-3xl" />
                <Skeleton className="col-start-1 row-span-2 row-start-5 rounded-3xl" />
              </div>
            ) : heroPhotos.length > 0 ? (
              <div className="grid h-[440px] grid-cols-2 grid-rows-6 gap-4">
                {[
                  "col-start-1 row-start-1 row-span-4",
                  "col-start-2 row-start-2 row-span-4",
                  "col-start-1 row-start-5 row-span-2",
                ].map((placement, i) => {
                  const p = heroPhotos[i];
                  if (!p) return null;
                  return (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className={`focus-ring group relative overflow-hidden rounded-3xl bg-gray-100 shadow-[0_18px_40px_-12px_rgba(11,18,16,0.18)] ${placement}`}
                    >
                      <img
                        src={mediaUrl(p.media[0].url)}
                        alt={p.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-xs font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <span className="line-clamp-1">{p.title}</span>
                        <span className="font-bold">
                          ฿{p.price.toLocaleString("th-TH")}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[440px] items-center justify-center rounded-3xl border border-dashed border-line-strong bg-white text-sm text-ink-subtle">
                ยังไม่มีรูปสินค้าให้แสดง
              </div>
            )}

            {heroPhotos.length > 0 && !loading && (
              /* The collage leaves column 2 / row 6 empty by design — the
                 badge drops into that gap instead of covering a photo. */
              <div className="absolute -bottom-3 right-0 flex w-[calc(50%-0.5rem)] items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_18px_40px_-12px_rgba(11,18,16,0.22)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <span
                    className="material-symbols-outlined text-[21px]"
                    aria-hidden="true"
                  >
                    lock_clock
                  </span>
                </span>
                <span className="leading-tight">
                  <b className="block text-sm font-semibold text-gray-900">
                    จองสินค้าให้ 10 นาที
                  </b>
                  <span className="text-xs text-ink-subtle">
                    ระหว่างที่คุณชำระเงิน
                  </span>
                </span>
              </div>
            )}
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
          <section className="border-y border-line bg-white">
            <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
              {VALUE_PROPS.map((v) => (
                <div key={v.title} className="flex gap-3.5">
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
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {v.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Category bento ─────────────────────────────────── */}
          <section className="mx-auto w-full max-w-6xl px-4 py-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                  เลือกซื้อตามหมวดหมู่
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  แสดงเฉพาะหมวดที่มีของขายจริงในระบบตอนนี้
                </p>
              </div>
              <Link
                href="/products"
                className="focus-ring hidden shrink-0 items-center gap-1 rounded text-sm font-semibold text-brand-600 hover:underline sm:flex"
              >
                ดูสินค้าทั้งหมด
                <span
                  className="material-symbols-outlined text-[17px]"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </Link>
            </div>

            <div className="grid auto-rows-[132px] grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {categoriesLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className={`rounded-2xl ${TILE_SPAN[i] || ""}`}
                    />
                  ))
                : categories.map((c, i) => (
                    <Link
                      key={c.name}
                      href={`/products?category=${encodeURIComponent(c.name)}`}
                      className={`focus-ring group relative overflow-hidden rounded-2xl bg-gray-900 ${
                        TILE_SPAN[i] || ""
                      }`}
                    >
                      {/* The newest listing in the category doubles as its
                          cover art — no separate category-image table to
                          maintain, and it can never go stale. */}
                      {c.coverUrl && (
                        <img
                          src={mediaUrl(c.coverUrl)}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-110"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-gray-950/85 via-gray-950/25 to-transparent"
                      />

                      <span className="relative flex h-full flex-col justify-end p-3.5 sm:p-4">
                        <span
                          className="material-symbols-outlined mb-auto w-fit rounded-lg bg-white/15 p-1.5 text-[19px] leading-none text-white backdrop-blur"
                          aria-hidden="true"
                        >
                          {CATEGORY_ICON[c.name] || "sell"}
                        </span>
                        <span
                          className={`font-bold leading-tight text-white ${
                            i === 0 ? "text-xl sm:text-2xl" : "text-base"
                          }`}
                        >
                          {c.name}
                        </span>
                        <span className="mt-0.5 text-xs text-white/75">
                          {c.count.toLocaleString("th-TH")} ชิ้น
                        </span>
                      </span>
                    </Link>
                  ))}
            </div>
          </section>

          {/* ── New arrivals ───────────────────────────────────── */}
          <section className="border-t border-line bg-surface-subtle">
            <div className="mx-auto w-full max-w-6xl px-4 py-14">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                    เข้าใหม่ล่าสุด
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    ของที่เพิ่งลงขาย เรียงจากใหม่ที่สุด
                  </p>
                </div>
                <Link
                  href="/products"
                  className="focus-ring flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-brand-600 hover:underline"
                >
                  ดูทั้งหมด
                  {total !== null && ` ${total.toLocaleString("th-TH")} ชิ้น`}
                  <span
                    className="material-symbols-outlined text-[17px]"
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
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── How it works ───────────────────────────────────── */}
          <section className="mx-auto w-full max-w-6xl px-4 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900">
              ซื้อขายยังไงให้ปลอดภัย
            </h2>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-ink-muted">
              ทุกคำสั่งซื้อเดินตามสามขั้นนี้ ไม่มีขั้นตอนซ่อน
            </p>

            <ol className="mt-10 grid gap-5 sm:grid-cols-3">
              {HOW_IT_WORKS.map((step, i) => (
                <li
                  key={step.title}
                  className="relative rounded-2xl border border-line bg-white p-6"
                >
                  <span
                    aria-hidden="true"
                    className="absolute right-5 top-4 text-5xl font-bold leading-none text-gray-100"
                  >
                    {i + 1}
                  </span>
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <span
                      className="material-symbols-outlined text-[22px]"
                      aria-hidden="true"
                    >
                      {step.icon}
                    </span>
                  </span>
                  <p className="relative mt-4 font-semibold text-gray-900">
                    {step.title}
                  </p>
                  <p className="relative mt-1 text-sm leading-relaxed text-ink-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Sell CTA ────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-6xl px-4 pb-16">
            <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-6 py-14 text-center sm:px-12">
              <span
                aria-hidden="true"
                className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10"
              />

              <div className="relative">
                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                  มีของที่ไม่ได้ใช้แล้วใช่ไหม
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-50">
                  ลงขายได้ฟรี ไม่มีค่าธรรมเนียมแรกเข้า ถ่ายรูป ตั้งราคา
                  แล้วลงขายได้เลย
                </p>
                {/* Not <Button>: its variants already set a background and
                    text colour, and two Tailwind class strings don't
                    reliably override each other by source order. A one-off
                    white-on-brand button is safest written directly. */}
                <Link
                  href="/sell"
                  className="focus-ring mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-brand-700 shadow-lg transition hover:bg-brand-50"
                >
                  <span
                    className="material-symbols-outlined text-[19px] leading-none"
                    aria-hidden="true"
                  >
                    sell
                  </span>
                  เริ่มลงขายเลย
                </Link>
              </div>
            </div>
          </section>
        </>
      )}

      <Footer />
    </main>
  );
}
