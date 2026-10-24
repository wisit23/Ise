"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import VideoUploader from "../../VideoUploader";
import { apiFetch, mediaUrl } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import useSellerLiveRefresh from "../../../lib/useSellerLiveRefresh";
import { PRODUCT_STATUS_LABEL } from "./sellerStatus";

const PAGE_SIZE = 12;

export default function SellerVideoList({ products = [] }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  async function load({ silent = false } = {}) {
    const currentRequest = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch(
        `/api/products/videos/mine?page=${page}&limit=${PAGE_SIZE}`,
        { token: getAccessToken() },
      );
      if (currentRequest !== requestId.current) return;
      const pages = Math.max(1, data.totalPages || 1);
      setTotalPages(pages);
      if (page > pages) setPage(pages);
      else setItems(data.items || []);
      setError("");
    } catch (err) {
      if (currentRequest === requestId.current)
        setError(err.message || "โหลดคลิปไม่สำเร็จ");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
  }, [page]);
  useSellerLiveRefresh(() => load({ silent: true }), {
    events: ["notification:new", "product:updated", "product:deleted"],
  });

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/products/videos/${editing.id}`, {
        method: "PATCH",
        token: getAccessToken(),
        body: {
          title: editing.title,
          description: editing.description,
          videoUrl: editing.videoUrl,
          productId: editing.productId,
        },
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message || "บันทึกคลิปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/products/videos/${deleting.id}`, {
        method: "DELETE",
        token: getAccessToken(),
      });
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err.message || "ลบคลิปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const eligibleProducts = products.filter(
    (p) => !p.moderatedAt && !["sold", "removed"].includes(p.status),
  );
  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const buttonClass =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50";

  return (
    <section aria-label="คลิปสินค้า" className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/seller/videos/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          อัปโหลดคลิปใหม่
        </Link>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}{" "}
          <button type="button" onClick={() => load()} className="underline">
            ลองใหม่
          </button>
        </div>
      )}
      {editing && (
        <form
          onSubmit={save}
          aria-label="แก้ไขคลิป"
          className="space-y-4 rounded-xl border border-emerald-200 bg-white p-5"
        >
          <h2 className="font-semibold text-slate-900">แก้ไขคลิป</h2>
          <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
            <label className="block text-sm">
              ชื่อคลิป
              <input
                className={inputClass}
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              สินค้าที่เชื่อมโยง
              <select
                required
                className={inputClass}
                value={editing.productId}
                onChange={(e) =>
                  setEditing({ ...editing, productId: e.target.value })
                }
              >
                {eligibleProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-1 text-sm">ไฟล์วิดีโอ</p>
              <VideoUploader
                value={editing.videoUrl}
                onChange={(videoUrl) =>
                  setEditing((prev) => ({ ...prev, videoUrl }))
                }
                token={getAccessToken()}
              />
            </div>
            <label className="block text-sm">
              รายละเอียดคลิป
              <textarea
                rows={3}
                className={inputClass}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
          </fieldset>
          <div className="flex gap-2">
            <button
              disabled={
                busy ||
                !editing.videoUrl ||
                !eligibleProducts.some((p) => p.id === editing.productId)
              }
              className={`${buttonClass} bg-emerald-600 text-white`}
            >
              {busy ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
              className={buttonClass}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <div
          role="alertdialog"
          aria-label="ยืนยันลบคลิป"
          className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-5"
        >
          <p>
            ลบคลิป “{deleting.title || deleting.product?.title}” ใช่ไหม?
            คลิปจะหายจากหน้าปัดสินค้า รวมถึงความคิดเห็นและรายการสนใจของคลิปนี้
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className={`${buttonClass} bg-red-600 text-white`}
            >
              {busy ? "กำลังลบ..." : "ยืนยันลบคลิป"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleting(null)}
              className={buttonClass}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p role="status" className="py-10 text-center text-slate-500">
          กำลังโหลดคลิป...
        </p>
      ) : !items.length && !error ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-slate-500">
          ยังไม่มีคลิปสินค้าที่ยังไม่ขาย เริ่มต้นด้วยปุ่ม “อัปโหลดคลิปใหม่”
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((clip) => (
            <article
              key={clip.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <video
                aria-label={`เล่นคลิป ${clip.title || clip.product?.title}`}
                src={mediaUrl(clip.videoUrl)}
                controls
                playsInline
                preload="metadata"
                className="aspect-[9/12] max-h-80 w-full bg-black object-contain"
              />
              <div className="space-y-3 p-4">
                <h2 className="break-words font-semibold text-slate-900">
                  {clip.title || clip.product?.title || "คลิปสินค้า"}
                </h2>
                <Link
                  href={`/products/${clip.productId}`}
                  className="group flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined rounded-lg bg-white p-2 text-emerald-600"
                  >
                    shopping_bag
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-emerald-700">
                      ดูสินค้าที่เชื่อมโยง
                    </span>
                    <span className="block truncate text-sm font-semibold">
                      {clip.product?.title}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1"
                  >
                    arrow_forward
                  </span>
                </Link>
                <Link
                  href={`/swipe?video=${encodeURIComponent(clip.id)}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px]"
                  >
                    play_circle
                  </span>
                  ดูในหน้าปัดคลิป
                </Link>
                <p className="text-xs text-slate-500">
                  ลงเมื่อ {new Date(clip.createdAt).toLocaleString("th-TH")}
                </p>
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {PRODUCT_STATUS_LABEL[clip.product?.status] ||
                    clip.product?.status}
                </span>
                {clip.description && (
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-600">
                    {clip.description}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !!clip.product?.moderatedAt ||
                      clip.product?.status === "removed"
                    }
                    onClick={() => {
                      setDeleting(null);
                      setEditing({
                        ...clip,
                        title: clip.title || "",
                        description: clip.description || "",
                      });
                    }}
                    className={buttonClass}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(null);
                      setDeleting(clip);
                    }}
                    className={`${buttonClass} text-red-600`}
                  >
                    ลบคลิป
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <nav
          aria-label="หน้ารายการคลิป"
          className="flex items-center justify-center gap-4"
        >
          <button
            disabled={loading || busy || page <= 1}
            onClick={() => setPage(page - 1)}
            className={buttonClass}
          >
            ก่อนหน้า
          </button>
          <span className="text-sm">
            หน้า {page} / {totalPages}
          </span>
          <button
            disabled={loading || busy || page >= totalPages}
            onClick={() => setPage(page + 1)}
            className={buttonClass}
          >
            ถัดไป
          </button>
        </nav>
      )}
    </section>
  );
}
