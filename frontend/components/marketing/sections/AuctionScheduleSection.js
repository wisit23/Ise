"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import Badge from "../../panel/ui/Badge";
import DropdownFilter from "../../panel/ui/DropdownFilter";

const STATUS_LABEL = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติจาก Marketing",
  rejected: "ถูกปฏิเสธ",
  approved: "อนุมัติแล้ว รอกำหนดเวลา",
  scheduled: "ตั้งเวลาแล้ว รอเปิด",
  open: "กำลังประมูล",
  closed: "ปิดประมูลแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

const STATUS_STYLE = {
  draft: "bg-slate-100 text-slate-600",
  pending_approval: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  approved: "bg-sky-50 text-sky-700",
  scheduled: "bg-sky-50 text-sky-700",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
};

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString("th-TH") : "—";
}

function RoundManagementSection({ token, onRoundCreated }) {
  const [roundInfo, setRoundInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subStartsAt, setSubStartsAt] = useState("");
  const [subEndsAt, setSubEndsAt] = useState("");
  const [aucStartsAt, setAucStartsAt] = useState("");
  const [aucEndsAt, setAucEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function loadRound() {
    setLoading(true);
    apiFetch("/api/products/auctions/rounds/current", { token })
      .then((data) => setRoundInfo(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRound();
  }, [token]);

  async function handleCreateRound(e) {
    e.preventDefault();
    setFormError("");
    if (!title || !subStartsAt || !subEndsAt || !aucStartsAt || !aucEndsAt) {
      setFormError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/products/auctions/rounds", {
        method: "POST",
        token,
        body: {
          title,
          submissionStartsAt: new Date(subStartsAt).toISOString(),
          submissionEndsAt: new Date(subEndsAt).toISOString(),
          auctionStartsAt: new Date(aucStartsAt).toISOString(),
          auctionEndsAt: new Date(aucEndsAt).toISOString(),
        },
      });
      setShowCreateForm(false);
      setTitle("");
      setSubStartsAt("");
      setSubEndsAt("");
      setAucStartsAt("");
      setAucEndsAt("");
      loadRound();
      if (onRoundCreated) onRoundCreated();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const round = roundInfo?.round;

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-xl">event_available</span>
            การจัดการรอบการประมูล (Auction Rounds)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            กำหนดช่วงเวลารับสินค้าและช่วงเวลาเริ่มประมูลจริงสำหรับผู้ขาย
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition"
        >
          <span className="material-symbols-outlined text-sm">
            {showCreateForm ? "close" : "add_circle"}
          </span>
          {showCreateForm ? "ปิดฟอร์ม" : "สร้างรอบประมูลใหม่"}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateRound} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 animate-fade-in-up">
          <h4 className="text-sm font-bold text-emerald-950 mb-3">เปิดรอบประมูลใหม่</h4>
          {formError && <p className="mb-3 text-xs text-red-600 font-medium">{formError}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">ชื่อรอบการประมูล</label>
              <input
                required
                type="text"
                placeholder="เช่น รอบประมูลสินค้ามือสองประจำสัปดาห์ที่ 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-3 rounded-lg bg-white p-3 border border-emerald-100">
              <span className="font-semibold text-emerald-800 block text-xs">📅 ช่วงเวลารับสินค้าจากผู้ขาย</span>
              <div>
                <label className="block text-slate-500 mb-0.5">วัน-เวลาเริ่มเปิดรับ</label>
                <input
                  required
                  type="datetime-local"
                  value={subStartsAt}
                  onChange={(e) => setSubStartsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-0.5">วัน-เวลาปิดรับสินค้า</label>
                <input
                  required
                  type="datetime-local"
                  value={subEndsAt}
                  onChange={(e) => setSubEndsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg bg-white p-3 border border-emerald-100">
              <span className="font-semibold text-emerald-800 block text-xs">🔨 ช่วงเวลาประมูลจริง</span>
              <div>
                <label className="block text-slate-500 mb-0.5">วัน-เวลาเริ่มเปิดประมูล</label>
                <input
                  required
                  type="datetime-local"
                  value={aucStartsAt}
                  onChange={(e) => setAucStartsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-0.5">วัน-เวลาสิ้นสุดการประมูล</label>
                <input
                  required
                  type="datetime-local"
                  value={aucEndsAt}
                  onChange={(e) => setAucEndsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกและเปิดรอบ"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="text-xs text-slate-400">กำลังโหลดสถานะรอบประมูล...</p>
        ) : round ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200/70">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-slate-900">{round.title}</span>
                {roundInfo?.isSubmissionOpen ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    🟢 เปิดรับสินค้าอยู่
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                    🔒 ปิดรับสินค้าแล้ว
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <span>
                  <strong>รับสินค้า:</strong> {new Date(round.submissionStartsAt).toLocaleString("th-TH")} — {new Date(round.submissionEndsAt).toLocaleString("th-TH")}
                </span>
                <span>
                  <strong>เคาะประมูลจริง:</strong> {new Date(round.auctionStartsAt).toLocaleString("th-TH")} — {new Date(round.auctionEndsAt).toLocaleString("th-TH")}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              สินค้าในรอบนี้: <span className="font-bold text-slate-800">{round._count?.auctions ?? 0}</span> รายการ
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
            ยังไม่มีรอบการประมูล กรุณากด &ldquo;สร้างรอบประมูลใหม่&rdquo; ด้านบนเพื่อกำหนดช่วงเวลารับสินค้า
          </div>
        )}
      </div>
    </div>
  );
}

function BulkScheduleBar({ count, onApply, onClear }) {
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!startsAt || !endsAt) {
      setError("กรุณาระบุเวลาเปิดและปิดประมูล");
      return;
    }
    setSaving(true);
    try {
      await onApply({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      setStartsAt("");
      setEndsAt("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky top-0 z-10 mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
    >
      <p className="w-full text-sm font-medium text-emerald-800">
        เลือกไว้ {count} รายการ — ตั้งเวลาให้พร้อมกันทีเดียว
      </p>
      <div>
        <label className="block text-xs text-slate-600">เวลาเปิดประมูล</label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600">เวลาปิดประมูล</label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? "กำลังตั้งเวลา..." : "ตั้งเวลา"}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        ยกเลิก
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

export default function AuctionScheduleSection({ token }) {
  const [auctions, setAuctions] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    const qs = statusFilter ? `&status=${statusFilter}` : "";
    apiFetch(`/api/products/auctions?limit=50${qs}`, { token })
      .then((data) => setAuctions(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter, token]);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkSchedule({ startsAt, endsAt }) {
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/products/auctions/${id}/schedule`, {
          method: "PATCH",
          token,
          body: { startsAt, endsAt },
        }),
      ),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    load();
    if (failed > 0) {
      throw new Error(
        `ตั้งเวลาสำเร็จ ${ids.length - failed}/${ids.length} รายการ — ${failed} รายการล้มเหลว (สถานะอาจเปลี่ยนไปแล้ว)`,
      );
    }
  }

  async function handleApprove(id) {
    try {
      await apiFetch(`/api/products/auctions/${id}/approve`, {
        method: "PATCH",
        token,
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReject(id) {
    try {
      await apiFetch(`/api/products/auctions/${id}/reject`, {
        method: "PATCH",
        token,
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCancel(id) {
    try {
      await apiFetch(`/api/products/auctions/${id}/cancel`, {
        method: "PATCH",
        token,
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const eligibleIds = new Set(
    auctions.filter((a) => a.status === "approved").map((a) => a.id),
  );

  return (
    <div className="animate-fade-in-up">
      {/* ส่วนจัดการรอบการประมูล */}
      <RoundManagementSection token={token} onRoundCreated={load} />

      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          ตรวจสอบและอนุมัติสินค้าประมูล หรือเลือกดูตามสถานะเพื่อตั้งเวลา
        </p>
        <DropdownFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: "ทุกสถานะ" },
            ...Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </div>

      {selected.size > 0 && (
        <BulkScheduleBar
          count={selected.size}
          onApply={handleBulkSchedule}
          onClear={() => setSelected(new Set())}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      ) : auctions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-slate-500 mb-2">
            gavel
          </span>
          <p className="text-sm font-semibold text-slate-600">
            ยังไม่มีรายการประมูลในหมวดนี้
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {auctions.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)]"
            >
              {eligibleIds.has(a.id) && (
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggleSelected(a.id)}
                  aria-label={`เลือก ${a.product?.title || a.productId}`}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                />
              )}

              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${a.productId}`}
                      className="truncate font-semibold text-slate-900 hover:text-emerald-600"
                    >
                      {a.product?.title || a.productId}
                    </Link>
                    {a.round && (
                      <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                        รอบ: {a.round.title}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      ราคาเริ่มต้น {baht(a.startingPrice)} · เพิ่มขั้นต่ำครั้งละ{" "}
                      {baht(a.bidIncrement)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      เปิด {fmt(a.scheduledStartAt)} · ปิด{" "}
                      {fmt(a.scheduledEndAt)}
                    </p>
                  </div>
                  <Badge
                    text={STATUS_LABEL[a.status] || a.status}
                    style={
                      STATUS_STYLE[a.status] || "bg-slate-100 text-slate-600"
                    }
                  />
                </div>

                {/* ปุ่มอนุมัติและปฏิเสธสำหรับ Marketing */}
                {a.status === "pending_approval" && (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => handleApprove(a.id)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition"
                    >
                      ✓ อนุมัติสินค้าเข้าประมูล
                    </button>
                    <button
                      onClick={() => handleReject(a.id)}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                    >
                      ✕ ปฏิเสธ
                    </button>
                  </div>
                )}

                {["approved", "scheduled"].includes(a.status) && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => handleCancel(a.id)}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      ยกเลิกการประมูลนี้
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
