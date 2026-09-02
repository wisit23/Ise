"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ProductCard from "../components/ProductCard";
import ErrorState from "../components/ui/ErrorState";
import Skeleton from "../components/ui/Skeleton";
import Reveal from "../components/ui/Reveal";
import { apiFetch, mediaUrl } from "../lib/api";
import { fetchActiveCategories } from "../lib/catalog";

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

/* Three steps, as in the reference. Each line describes a mechanic this
   codebase actually has — the reservation hold, confirm-to-close, and the
   dispute queue — rather than the escrow-and-7-day-returns promise the
   mockup carried, which nothing in order-service implements. */
const HOW_IT_WORKS = [
  {
    icon: "search",
    title: "เลือกของที่ถูกใจ",
    body: "ดูรูปจริงทุกมุม สภาพสินค้า ไซซ์ และคะแนนร้าน ก่อนตัดสินใจ",
  },
  {
    icon: "lock_clock",
    title: "จองแล้วค่อยจ่าย",
    body: "ระบบล็อกสินค้าให้ 10 นาที ระหว่างที่คุณชำระเงิน ไม่ต้องแข่งกับใคร",
  },
  {
    icon: "inventory",
    title: "รับของ แล้วให้คะแนน",
    body: "ตรงปกก็กดรับแล้วรีวิวได้เลย ไม่ตรงปกแจ้งข้อพิพาทให้ทีมงานตัดสิน",
  },
];

/** Eyebrow, title, one line of context, and an optional link on the right. */
function SectionHead({ eyebrow, title, lead, action }) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-8">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[.14em] text-brand-600">
          {eyebrow}
        </span>
        <h2 className="mb-1 mt-1.5 text-xl">{title}</h2>
        <p className="max-w-[46ch] text-sm text-ink-subtle">{lead}</p>
      </div>
      {action}
    </div>
  );
}

function MoreLink({ href, children }) {
  return (
    <Link
      href={href}
      className="focus-ring group/more inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-brand-600"
    >
      {children}
      <span
        className="material-symbols-outlined text-[17px] leading-none transition-transform duration-300 group-hover/more:translate-x-1"
        aria-hidden="true"
      >
        arrow_forward
      </span>
    </Link>
  );
}

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const railRef = useRef(null);

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
    fetchActiveCategories()
      .then(setCategories)
      .catch((err) => console.error("โหลดหมวดหมู่ไม่สำเร็จ:", err))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const scrollRail = (dir) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: dir * rail.clientWidth * 0.8 });
  };

  const heroPhotos = items.filter((p) => p.media?.length).slice(0, 3);

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────── */}
      {/* The hero sits on its own tinted ground with a closing rule: with a
          white background it ran straight into the category rail and the two
          read as one long block. */}
      <section className="relative overflow-clip border-b border-line bg-[linear-gradient(180deg,theme(colors.brand.50/.45),theme(colors.surface.subtle))] pb-[clamp(3.5rem,7vw,6rem)] pt-[clamp(3rem,6vw,5.5rem)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-[14%] -top-[38%] aspect-square w-[min(70vw,760px)] rounded-full bg-[radial-gradient(circle_at_30%_30%,theme(colors.brand.50),transparent_68%)]"
        />

        <div className="relative mx-auto grid w-[min(100%-2.5rem,1280px)] items-center gap-[clamp(2rem,5vw,4.5rem)] lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-1.5 text-xs font-semibold text-brand-700">
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-brand-600"
              />
              คัดสภาพแล้ว ตรวจสอบร้านได้ก่อนซื้อ
            </span>

            <h1 className="my-5 text-hero leading-[1.22] tracking-[-.035em]">
              ให้ของที่คุณรัก
              <br />
              ได้มี
              <span className="relative whitespace-nowrap text-brand-600">
                {/* Swipes in behind the words on load, as in the reference. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-[.06em] -z-10 h-[.28em] origin-left scale-x-0 animate-swipe rounded-[3px] bg-brand-100"
                />
                ชีวิตรอบสอง
              </span>
            </h1>

            <p className="max-w-[50ch] text-[clamp(1rem,.95rem+.25vw,1.125rem)] text-ink-muted">
              ตลาดแฟชั่นมือสองที่ให้คุณดูรีวิวร้าน เช็กสภาพสินค้า
              และจองของไว้ก่อนจ่ายเงิน — ซื้อสบายใจ ขายได้จริง
            </p>

            <div className="my-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-[2.1em] py-[1.05em] text-base font-semibold text-white shadow-brand transition duration-[250ms] ease-ease hover:-translate-y-0.5 hover:bg-brand-700 active:scale-[.97]"
              >
                เลือกซื้อสินค้า
                <span
                  className="material-symbols-outlined text-[17px] leading-none"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </Link>
              <Link
                href="/sell"
                className="focus-ring inline-flex items-center justify-center rounded-full border-[1.5px] border-line bg-white px-[2.1em] py-[1.05em] text-base font-semibold transition duration-[250ms] ease-ease hover:-translate-y-0.5 hover:border-brand-600 hover:text-brand-600 active:scale-[.97]"
              >
                เริ่มขายฟรี
              </Link>
            </div>

            {/* The reference showed avatar stacks and "4.9/5 จากรีวิว 23,481
                รายการ". Those numbers do not exist here, so this is the
                catalogue size instead — real, and it updates itself. */}
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
              <span className="flex items-center gap-2 text-ink-subtle">
                <span
                  className="material-symbols-outlined text-[19px] leading-none text-brand-600"
                  aria-hidden="true"
                >
                  inventory_2
                </span>
                {total === null ? (
                  <Skeleton className="h-4 w-28" />
                ) : (
                  <>
                    <b className="font-semibold text-ink">
                      {total.toLocaleString("th-TH")}
                    </b>
                    ชิ้นพร้อมขายตอนนี้
                  </>
                )}
              </span>
              <span className="flex items-center gap-2 text-ink-subtle">
                <span
                  className="material-symbols-outlined text-[19px] leading-none text-brand-600"
                  aria-hidden="true"
                >
                  category
                </span>
                {categoriesLoading ? (
                  <Skeleton className="h-4 w-20" />
                ) : (
                  <>
                    <b className="font-semibold text-ink">
                      {categories.length}
                    </b>
                    หมวดหมู่
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Staggered collage of the site's own newest listings — real
              merchandise rather than stock photography, so the hero can
              never promise a selection that doesn't exist. */}
          <div className="relative mx-auto hidden w-full max-w-[520px] lg:block">
            {loading ? (
              <div className="grid grid-cols-2 grid-rows-[repeat(5,58px)] gap-[14px]">
                <Skeleton className="col-start-1 row-[1/4] rounded-lg" />
                <Skeleton className="col-start-2 row-[2/5] rounded-lg" />
                <Skeleton className="col-start-1 row-[4/6] rounded-lg" />
              </div>
            ) : heroPhotos.length > 0 ? (
              <div className="grid grid-cols-2 grid-rows-[repeat(5,58px)] gap-[14px]">
                {[
                  "col-start-1 row-[1/4]",
                  "col-start-2 row-[2/5]",
                  "col-start-1 row-[4/6]",
                ].map((placement, i) => {
                  const p = heroPhotos[i];
                  if (!p) return null;
                  return (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className={`focus-ring group overflow-hidden rounded-lg bg-gray-100 shadow-3 ${placement}`}
                    >
                      <img
                        src={mediaUrl(p.media[0].url)}
                        alt={p.title}
                        className="h-full w-full object-cover transition-transform duration-[800ms] ease-ease group-hover:scale-[1.07]"
                      />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="grid h-[350px] place-items-center rounded-lg border border-dashed border-line-strong text-sm text-ink-subtle">
                ยังไม่มีรูปสินค้าให้แสดง
              </div>
            )}

            {heroPhotos.length > 0 && !loading && (
              <div className="absolute -bottom-5 right-0 flex w-[calc(50%-7px)] animate-bob items-center gap-3 rounded-md border border-line bg-white px-[1.05rem] py-3 shadow-3">
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
                  <span
                    className="material-symbols-outlined text-[17px]"
                    aria-hidden="true"
                  >
                    lock_clock
                  </span>
                </span>
                <span>
                  <b className="block text-sm leading-tight">
                    จองสินค้าให้ 10 นาที
                  </b>
                  <small className="text-xs text-ink-subtle">
                    ระหว่างที่คุณชำระเงิน
                  </small>
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {error ? (
        <section className="mx-auto w-[min(100%-2.5rem,1280px)] py-[clamp(3.5rem,7vw,6rem)]">
          <ErrorState
            description="ไม่สามารถโหลดสินค้าได้ในขณะนี้"
            detail={error}
            onRetry={load}
          />
        </section>
      ) : (
        <>
          {/* ── Categories ─────────────────────────────────────── */}
          <Reveal
            as="section"
            className="mx-auto w-[min(100%-2.5rem,1280px)] py-[clamp(3.5rem,7vw,6rem)]"
          >
            <SectionHead
              eyebrow="Shop by category"
              title="เลือกจากหมวดที่คุณตามหา"
              lead="แสดงเฉพาะหมวดที่มีของขายจริงในระบบตอนนี้ กดแล้วไม่เจอหน้าว่าง"
              action={<MoreLink href="/products">ดูทั้งหมด</MoreLink>}
            />

            <div className="relative">
              <button
                type="button"
                onClick={() => scrollRail(-1)}
                aria-label="เลื่อนซ้าย"
                className="focus-ring absolute -left-3.5 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white shadow-2 transition hover:scale-105 hover:bg-surface-subtle lg:grid"
              >
                <span
                  className="material-symbols-outlined text-[19px]"
                  aria-hidden="true"
                >
                  chevron_left
                </span>
              </button>

              <div
                ref={railRef}
                className="scrollbar-none flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-smooth py-2.5 -my-2.5 px-1 -mx-1"
              >
                {categoriesLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-[150px] w-[150px] shrink-0 rounded-md"
                      />
                    ))
                  : categories.map((c) => (
                      <Link
                        key={c.name}
                        href={`/products?category=${encodeURIComponent(c.name)}`}
                        className="focus-ring group/cat w-[150px] shrink-0 snap-start rounded-md border border-line bg-white px-4 py-[1.35rem] text-center transition-all duration-200 ease-out hover:border-brand-400 hover:shadow-2"
                      >
                        <span className="mx-auto mb-[.7rem] grid h-[50px] w-[50px] place-items-center rounded-[14px] bg-surface-subtle text-brand-600 transition-colors duration-[250ms] group-hover/cat:bg-brand-50">
                          <span
                            className="material-symbols-outlined text-[24px]"
                            aria-hidden="true"
                          >
                            {CATEGORY_ICON[c.name] || "sell"}
                          </span>
                        </span>
                        <b className="block truncate text-sm font-semibold text-ink">
                          {c.name}
                        </b>
                        <small className="text-xs text-ink-subtle">
                          {c.count.toLocaleString("th-TH")} ชิ้น
                        </small>
                      </Link>
                    ))}
              </div>

              <button
                type="button"
                onClick={() => scrollRail(1)}
                aria-label="เลื่อนขวา"
                className="focus-ring absolute -right-3.5 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white shadow-2 transition hover:scale-105 hover:bg-surface-subtle lg:grid"
              >
                <span
                  className="material-symbols-outlined text-[19px]"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
            </div>
          </Reveal>

          {/* ── New arrivals ───────────────────────────────────── */}
          <Reveal
            as="section"
            className="mx-auto w-[min(100%-2.5rem,1280px)] pb-[clamp(3.5rem,7vw,6rem)]"
          >
            <SectionHead
              eyebrow="New arrivals"
              title="สินค้าเข้าใหม่ล่าสุด"
              lead="เรียงจากที่เพิ่งลงขาย ระบุสภาพและไซซ์ไว้ครบก่อนกดเข้าไปดู"
              action={
                <MoreLink href="/products">
                  ดูทั้งหมด
                  {total !== null && ` ${total.toLocaleString("th-TH")} ชิ้น`}
                </MoreLink>
              }
            />

            {loading ? (
              <Skeleton.CardGrid count={NEW_ARRIVALS_COUNT} />
            ) : items.length === 0 ? (
              <p className="text-sm text-ink-subtle">
                ยังไม่มีสินค้าลงขายในระบบ
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-[clamp(1rem,2vw,1.6rem)] max-[560px]:grid-cols-2 max-[560px]:gap-[.9rem]">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </Reveal>

          {/* ── How it works ───────────────────────────────────── */}
          <Reveal
            as="section"
            className="border-y border-line bg-surface-subtle"
          >
            <div className="mx-auto w-[min(100%-2.5rem,1280px)] py-[clamp(3.5rem,7vw,6rem)]">
              <SectionHead
                eyebrow="How it works"
                title="ซื้อขายยังไงให้ปลอดภัย"
                lead="ทุกคำสั่งซื้อเดินตามสามขั้นนี้ ไม่มีขั้นตอนซ่อน"
              />

              <ol className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
                {HOW_IT_WORKS.map((step, i) => (
                  <li
                    key={step.title}
                    className="relative overflow-hidden rounded-lg border border-line bg-white px-[1.6rem] py-[1.9rem] transition duration-300 ease-ease hover:-translate-y-1 hover:shadow-2"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1 font-display text-[3.6rem] font-bold leading-none text-gray-100"
                    >
                      0{i + 1}
                    </span>
                    <span className="mb-4 grid h-[46px] w-[46px] place-items-center rounded-[13px] bg-brand-50 text-brand-600">
                      <span
                        className="material-symbols-outlined text-[21px]"
                        aria-hidden="true"
                      >
                        {step.icon}
                      </span>
                    </span>
                    <h3 className="mb-1.5 text-[1.075rem]">{step.title}</h3>
                    <p className="text-sm text-ink-subtle">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>

          {/* ── Sell CTA ────────────────────────────────────────── */}
          <Reveal
            as="section"
            className="mx-auto w-[min(100%-2.5rem,1280px)] py-[clamp(3.5rem,7vw,6rem)]"
          >
            <div className="relative overflow-hidden rounded-xl bg-[linear-gradient(135deg,theme(colors.brand.700),theme(colors.brand.500)_55%,theme(colors.brand.300))] px-[clamp(1.5rem,4vw,3.5rem)] py-[clamp(2.5rem,5vw,4.25rem)] text-center text-white">
              <span
                aria-hidden="true"
                className="absolute -left-[90px] -top-[160px] h-[340px] w-[340px] rounded-full bg-white/[.09]"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-[140px] -right-[60px] h-[260px] w-[260px] rounded-full bg-white/[.09]"
              />

              <div className="relative">
                <h2 className="mb-2.5 text-xl">มีของที่ไม่ได้ใช้แล้วใช่ไหม</h2>
                <p className="mx-auto mb-[1.9rem] max-w-[52ch] text-sm opacity-90">
                  ลงขายฟรี ไม่มีค่าธรรมเนียมแรกเข้า ถ่ายรูป ตั้งราคา กดลง —
                  ใช้เวลาไม่ถึง 2 นาที
                </p>
                {/* Written out rather than <Button>: its variants set their
                    own background and text colour, and two Tailwind class
                    strings don't reliably override each other by order. */}
                <Link
                  href="/sell"
                  className="focus-ring inline-flex items-center justify-center rounded-full bg-white px-[2.1em] py-[1.05em] text-base font-semibold text-brand-700 shadow-[0_12px_30px_-8px_rgba(0,0,0,.35)] transition duration-[250ms] ease-ease hover:-translate-y-0.5 hover:bg-brand-50 active:scale-[.97]"
                >
                  เริ่มขายสินค้าเลย
                </Link>
              </div>
            </div>
          </Reveal>
        </>
      )}

      <Footer />
    </main>
  );
}
