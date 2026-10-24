"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProductCard from "../ProductCard";
import ErrorState from "../ui/ErrorState";
import Skeleton from "../ui/Skeleton";
import { apiFetch } from "../../lib/api";
import { createFeedSeed } from "../../lib/recommendationFeed";
import useCatalogLiveRefresh from "../../lib/useCatalogLiveRefresh";

const FALLBACK_COPY = {
  guest:
    "เข้าสู่ระบบและเลือกความสนใจ เพื่อดูสินค้าที่เหมาะกับคุณ ระหว่างนี้ลองดูสินค้าใหม่ได้เลย",
  "no-profile":
    "เลือกความสนใจ ค้นหาสินค้า หรือกดใจคลิป เพื่อให้เราแนะนำได้ตรงใจขึ้น",
  "no-matches":
    "ยังไม่มีสินค้าตรงกับความสนใจของคุณ ลองดูสินค้าใหม่เหล่านี้ก่อนได้",
  "profile-unavailable":
    "โหลดข้อมูลความสนใจไม่ได้ชั่วคราว จึงแสดงสินค้าใหม่ให้ก่อน",
  "non-customer": "สินค้าใหม่ที่พร้อมขายในตอนนี้",
};

export default function RecommendedProducts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(null);
  const seedRef = useRef(null);

  const load = useCallback(({ silent = false } = {}) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!silent) {
      setData(null);
      setLoading(true);
      setError("");
    }
    seedRef.current ||= createFeedSeed();
    return apiFetch(`/api/products/recommendations?limit=8&seed=${seedRef.current}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && !silent)
          setError(err.message || "โหลดสินค้าแนะนำไม่สำเร็จ");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  useCatalogLiveRefresh(() => load({ silent: true }));

  useEffect(() => {
    load();
    const authChanged = () => {
      seedRef.current = createFeedSeed();
      load();
    };
    window.addEventListener("reloop:auth", authChanged);
    return () => {
      window.removeEventListener("reloop:auth", authChanged);
      requestRef.current?.abort();
    };
  }, [load]);

  return (
    <section
      aria-labelledby="recommendations-heading"
      className="mx-auto w-[min(100%-2.5rem,1280px)] py-[clamp(3.5rem,7vw,6rem)]"
    >
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 id="recommendations-heading" className="mb-2 text-xl">
            แนะนำสำหรับคุณ
          </h2>
          <p className="max-w-[64ch] text-sm text-ink-subtle">
            {data?.personalized
              ? "คัดจากความสนใจ การค้นหา คลิปที่กดใจ และสินค้าที่ซื้อ พร้อมเหตุผลใต้แต่ละชิ้น"
              : loading
                ? "กำลังเลือกสินค้าให้คุณ…"
                : FALLBACK_COPY[data?.fallbackReason] ||
                  "ค้นหาสินค้าที่เหมาะกับคุณ"}
          </p>
        </div>
        <Link
          href={data?.fallbackReason === "guest" ? "/login" : "/profile"}
          className="focus-ring rounded text-sm font-semibold text-brand-600"
        >
          {data?.fallbackReason === "guest"
            ? "เข้าสู่ระบบเพื่อรับคำแนะนำ"
            : "ปรับความสนใจ"}
        </Link>
      </div>
      {loading ? (
        <Skeleton.CardGrid count={8} />
      ) : error ? (
        <ErrorState
          description="ไม่สามารถโหลดสินค้าแนะนำได้ในขณะนี้"
          detail={error}
          onRetry={load}
        />
      ) : !data?.items?.length ? (
        <p className="text-sm text-ink-subtle">
          ยังไม่มีสินค้าพร้อมขายสำหรับแนะนำ ลองกลับมาดูอีกครั้ง
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-[clamp(1rem,2vw,1.6rem)] max-[560px]:grid-cols-2 max-[560px]:gap-[.9rem]">
          {data.items.map((product) => (
            <div key={product.id} className="min-w-0">
              <ProductCard product={product} />
              <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
                {product.recommendation?.reasons?.length
                  ? product.recommendation.reasons.join(" · ")
                  : product.recommendation?.bucket === "discovery"
                    ? "ลองค้นพบสินค้าที่ต่างออกไป"
                    : "สินค้าใหม่ที่คุณอาจสนใจ"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
