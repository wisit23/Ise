/* eslint-disable no-unused-vars */
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Pagination from "../../Pagination";

import Badge from "../ui/Badge";
import KpiCard from "../ui/KpiCard";
import ChartCard from "../ui/ChartCard";
import DropdownFilter from "../ui/DropdownFilter";
import {
  TICKET_STATUS_LABEL, TICKET_STATUS_STYLE, PRIORITY_LABEL, PRIORITY_STYLE,
  AGENT_NEXT_STATUS, DISPUTE_STATUS_LABEL, DISPUTE_STATUS_STYLE, ORDER_STATUS_LABEL,
  HELP_CATEGORIES, DONUT_PRIORITY_COLORS, DONUT_DISPUTE_COLORS, PAGE_SIZE
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";


export default // ─── FAQ Section ──────────────────────────────────────────────────────────────

function FaqSection({ token }) {
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [closingForm, setClosingForm] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [closingCategoryDropdown, setClosingCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef(null);

  const closeCategoryDropdown = () => {
    setClosingCategoryDropdown(true);
    setTimeout(() => {
      setShowCategoryDropdown(false);
      setClosingCategoryDropdown(false);
    }, 140);
  };

  const toggleCategoryDropdown = () => {
    if (showCategoryDropdown) {
      closeCategoryDropdown();
    } else {
      setShowCategoryDropdown(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown((prev) => {
          if (prev) {
            setClosingCategoryDropdown(true);
            setTimeout(() => {
              setShowCategoryDropdown(false);
              setClosingCategoryDropdown(false);
            }, 140);
          }
          return prev;
        });
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [form, setForm] = useState({ title: "", body: "", category: "OTHER" });
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState(null);

  function closeForm() {
    setClosingForm(true);
    setTimeout(() => {
      setShowForm(false);
      setClosingForm(false);
    }, 280);
  }

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: 50 });
    if (status) params.set("status", status);
    apiFetch(`/api/support/help/manage?${params}`, { token })
      .then((data) => setItems(data.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [status, token]);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/support/help", { method: "POST", token, body: form });
      setForm({ title: "", body: "", category: "OTHER" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id) {
    setPublishingId(id);
    try {
      await apiFetch(`/api/support/help/${id}/publish`, { method: "PATCH", token });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col min-h-full">
        <div className="mb-5 flex items-center justify-between">
        <DropdownFilter
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "ทั้งหมด" },
            { value: "DRAFT", label: "ฉบับร่าง" },
            { value: "PUBLISHED", label: "เผยแพร่แล้ว" },
          ]}
        />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          เขียนบทความใหม่
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400">ยังไม่มีบทความในหมวดนี้</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="mb-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                  {a.category}
                </span>
                <p className="font-medium text-gray-900">{a.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{a.body}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  a.status === "PUBLISHED"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {a.status === "PUBLISHED" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
              </span>
            </div>
            {a.status !== "PUBLISHED" && (
              <button
                onClick={() => handlePublish(a.id)}
                disabled={publishingId === a.id}
                className="mt-2 text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50"
              >
                {publishingId === a.id ? "กำลังเผยแพร่..." : "เผยแพร่บทความนี้"}
              </button>
            )}
          </li>
        ))}
      </ul>
      </div>

      {/* FAQ Modal */}
      {(showForm || closingForm) && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm ${closingForm ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className={`w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ${closingForm ? "animate-fade-out" : "animate-fade-in-up"}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">เขียนบทความใหม่ (New FAQ)</h2>
              <button onClick={closeForm} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full aspect-square text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-5 p-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">หัวข้อบทความ</label>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="เช่น วิธีการคืนสินค้า..."
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>
                <div className="col-span-1 relative" ref={categoryDropdownRef}>
                  <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">หมวดหมู่</label>
                  <button
                    type="button"
                    onClick={toggleCategoryDropdown}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none hover:border-slate-300 hover:bg-slate-50 transition-colors focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  >
                    <span className="truncate">
                      {HELP_CATEGORIES.find((c) => c.value === form.category)?.label || "เลือกหมวดหมู่"}
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">
                      expand_more
                    </span>
                  </button>
                  {(showCategoryDropdown || closingCategoryDropdown) && (
                    <div className={`absolute top-full left-0 mt-2 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-20 ${closingCategoryDropdown ? "animate-dropdown-out" : "animate-dropdown-in"}`}>
                      {HELP_CATEGORIES.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => { setForm({ ...form, category: c.value }); closeCategoryDropdown(); }}
                          className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                            form.category === c.value ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">เนื้อหาบทความ</label>
                <textarea
                  required
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  placeholder="เขียนอธิบายรายละเอียดที่นี่..."
                  className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition-colors hover:bg-emerald-700 hover:shadow-lg disabled:opacity-50"
                >
                  {submitting ? "กำลังบันทึก..." : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">save</span> บันทึกเป็นฉบับร่าง
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


