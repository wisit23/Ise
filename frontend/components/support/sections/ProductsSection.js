"use client";
import { useState } from "react";
import { apiFetch } from "../../../lib/api";
import Badge from "../../panel/ui/Badge";

const STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "ถูกจองไว้",
  sold: "ขายแล้ว",
  removed: "ถูกลบโดยแอดมิน",
};

const STATUS_STYLE = {
  available: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-slate-100 text-slate-600",
  removed: "bg-red-50 text-red-600",
};

// ─── Products Section (Admin only) ─────────────────────────────────────────
// Lets Admin find any listing and remove/restore it directly, instead of
// only being reachable when a Report happens to reference the product.

export default function ProductsSection({ token }) {
  const [query, setQuery] = useState("");
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [items, setItems] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reasonById, setReasonById] = useState({});

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: 20 });
      if (includeRemoved) params.set("status", "removed");
      const data = await apiFetch(`/api/products/admin/search?${params}`, {
        token,
      });
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(product) {
    const reason = (reasonById[product.id] || "").trim();
    if (!reason) {
      setError("กรุณาระบุเหตุผลก่อนลบสินค้า");
      return;
    }
    if (!window.confirm(`ยืนยันลบสินค้า "${product.title}"?`)) return;
    setBusyId(product.id);
    setError("");
    try {
      await apiFetch(`/api/auth/admin/products/${product.id}/remove`, {
        method: "POST",
        token,
        body: { reason },
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, status: "removed" } : p,
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(product) {
    setBusyId(product.id);
    setError("");
    try {
      const updated = await apiFetch(
        `/api/auth/admin/products/${product.id}/restore`,
        { method: "POST", token },
      );
      setItems((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, status: updated.status } : p,
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className={`animate-fade-in-up flex flex-col ${!searched ? "items-center justify-center min-h-[40vh] pt-10 text-center" : ""}`}
    >
      {!searched && (
        <div className="mb-8 animate-in zoom-in-95 duration-500">
          <span className="material-symbols-outlined text-[64px] text-emerald-600 mb-2 drop-shadow-sm">
            inventory_2
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            จัดการสินค้า
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            ค้นหาสินค้าเพื่อลบออกจากระบบ หรือกู้คืนสินค้าที่เคยลบ
          </p>
        </div>
      )}

      <div
        className={`w-full transition-all duration-500 ease-out ${searched ? "max-w-4xl mb-6" : "max-w-2xl"}`}
      >
        <form
          onSubmit={handleSearch}
          className="relative flex w-full items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.06)] transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 hover:border-slate-300"
        >
          <div className="flex flex-1 items-center px-3">
            <span className="material-symbols-outlined mr-2 text-[20px] text-slate-400">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า, แท็ก, หมวดหมู่..."
              className="w-full border-0 bg-transparent py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
        <label className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <input
            type="checkbox"
            checked={includeRemoved}
            onChange={(e) => setIncludeRemoved(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          ค้นหาเฉพาะสินค้าที่ถูกลบไปแล้ว (เพื่อกู้คืน)
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {searched && !loading && items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-300 mb-2">
            search_off
          </span>
          <p className="text-sm font-semibold text-slate-600">
            ไม่พบสินค้าที่ตรงกับเงื่อนไข
          </p>
        </div>
      )}

      <ul className="flex w-full max-w-4xl flex-col gap-3">
        {items.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {p.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-slate-500">
                  <span>รหัส {p.id.slice(0, 8)}</span>
                  <span>฿{p.price?.toLocaleString("th-TH")}</span>
                  <span>{p.category}</span>
                  <span>ผู้ขาย {p.sellerId?.slice(0, 8)}</span>
                </div>
              </div>
              <Badge
                text={STATUS_LABEL[p.status] || p.status}
                style={STATUS_STYLE[p.status] || "bg-slate-100 text-slate-600"}
              />
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              {p.status === "removed" ? (
                <button
                  onClick={() => handleRestore(p)}
                  disabled={busyId === p.id}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  กู้คืนสินค้า
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={reasonById[p.id] || ""}
                    onChange={(e) =>
                      setReasonById((r) => ({ ...r, [p.id]: e.target.value }))
                    }
                    placeholder="เหตุผลในการลบ..."
                    className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleRemove(p)}
                    disabled={busyId === p.id}
                    className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    ลบสินค้า
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
