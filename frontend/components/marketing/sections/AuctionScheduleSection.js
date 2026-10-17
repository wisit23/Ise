"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import Badge from "../../panel/ui/Badge";
import Modal from "../../ui/Modal";
import AuctionReviewModal from "./AuctionReviewModal";
import { STATUS_LABEL, STATUS_STYLE, baht } from "./auctionPresentation";
import { MARKETING_PAGE_SIZE } from "../marketingConstants";
import MarketingPagination from "./MarketingPagination";
import RoundEditModal from "./RoundEditModal";
import AuctionItemFilters from "./AuctionItemFilters";

const HIDDEN_MARKETING_FILTER_STATUSES = new Set(["approved"]);
const DATE_TIME_INPUT_MINUTE_MS = 60_000;

function getNextMinuteLocalInputValue(now = new Date()) {
  const nextMinute = new Date(
    (Math.floor(now.getTime() / DATE_TIME_INPUT_MINUTE_MS) + 1) *
      DATE_TIME_INPUT_MINUTE_MS,
  );
  const localDate = new Date(
    nextMinute.getTime() - nextMinute.getTimezoneOffset() * DATE_TIME_INPUT_MINUTE_MS,
  );
  return localDate.toISOString().slice(0, 16);
}

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DateTimeRange({
  start,
  end,
  startLabel = "เริ่ม",
  endLabel = "สิ้นสุด",
  compact = false,
}) {
  return (
    <dl className="grid gap-1.5 text-xs text-slate-600">
      <div
        className={
          compact
            ? "min-w-0"
            : "grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-2"
        }
      >
        <dt className="font-medium text-slate-500">{startLabel}</dt>
        <dd
          className={`min-w-0 font-medium leading-5 text-slate-700 ${
            compact ? "mt-0.5" : ""
          }`}
        >
          {fmt(start)}
        </dd>
      </div>
      <div
        className={
          compact
            ? "min-w-0 border-t border-slate-100 pt-1.5"
            : "grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-2"
        }
      >
        <dt className="font-medium text-slate-500">{endLabel}</dt>
        <dd
          className={`min-w-0 font-medium leading-5 text-slate-700 ${
            compact ? "mt-0.5" : ""
          }`}
        >
          {fmt(end)}
        </dd>
      </div>
    </dl>
  );
}

function RoundCategories({ categories, tone = "emerald" }) {
  const hasCategories = Array.isArray(categories) && categories.length > 0;
  const categoryStyle =
    tone === "slate"
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {hasCategories ? (
        categories.map((category) => (
          <span
            key={category}
            className={`max-w-full rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 break-words ${categoryStyle}`}
            title={category}
          >
            {category}
          </span>
        ))
      ) : (
        <span className="whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium leading-5 text-slate-700">
          ทุกหมวดหมู่
        </span>
      )}
    </div>
  );
}

function RoundItemCount({ round, align = "left" }) {
  const isUnlimited = round.maxItems == null;
  const submittedCount = isUnlimited
    ? (round._count?.auctions ?? 0)
    : (round.submittedItemCount ?? 0);
  const isFull = !isUnlimited && submittedCount >= round.maxItems;

  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <span className="whitespace-nowrap font-semibold text-slate-800">
        <span>
          {isUnlimited ? submittedCount : `${submittedCount} / ${round.maxItems}`}
        </span>{" "}
        รายการ
      </span>
      <span
        className={`mt-0.5 block whitespace-nowrap text-[11px] ${
          isFull ? "font-semibold text-amber-700" : "text-slate-500"
        }`}
      >
        {isUnlimited ? "ไม่จำกัดจำนวน" : isFull ? "เต็มแล้ว" : "ยังรับเพิ่มได้"}
      </span>
    </div>
  );
}

const ROUND_PHASE_LABEL = {
  upcoming: "รอเปิดรับสินค้า",
  submission: "กำลังเปิดรับสินค้า",
  waiting: "ปิดรับสินค้าแล้ว รอรอบประมูล",
  auction: "กำลังเคาะประมูล",
  ended: "ปิดรอบแล้ว",
  cancelled: "ยกเลิกรอบแล้ว",
};

const ROUND_PHASE_STYLE = {
  upcoming: "bg-sky-50 text-sky-700 border-sky-200",
  submission: "bg-emerald-50 text-emerald-700 border-emerald-200",
  waiting: "bg-amber-50 text-amber-700 border-amber-200",
  auction:
    "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold animate-pulse",
  ended: "bg-slate-100 text-slate-500 border-slate-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

const ROUND_CANCEL_FORM_ID = "cancel-auction-round-form";
// PostgreSQL INTEGER bound; no arbitrary business quota limit.
const MAX_ROUND_CAPACITY = 2147483647;

export function RoundManagementSection({ token, onRoundCreated, refreshRevision = 0 }) {
  const [editingRound, setEditingRound] = useState(null);
  const [roundInfo, setRoundInfo] = useState(null);
  const [allRounds, setAllRounds] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoryMode, setCategoryMode] = useState("all");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [roundPage, setRoundPage] = useState(1);
  const [roundTotal, setRoundTotal] = useState(0);
  const [roundTotalPages, setRoundTotalPages] = useState(1);

  useEffect(() => {
    apiFetch("/api/products/categories")
      .then((data) =>
        setAvailableCategories(Array.isArray(data?.items) ? data.items : []),
      )
      .catch(() => setAvailableCategories([]));
  }, []);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [maxItems, setMaxItems] = useState("");
  const [subStartsAt, setSubStartsAt] = useState("");
  const [subEndsAt, setSubEndsAt] = useState("");
  const [aucStartsAt, setAucStartsAt] = useState("");
  const [aucEndsAt, setAucEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [cancellingRound, setCancellingRound] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [roundCancelWarning, setRoundCancelWarning] = useState(null);
  const [roundRetrying, setRoundRetrying] = useState(false);
  const [roundCancelFeedback, setRoundCancelFeedback] = useState("");
  const [roundError, setRoundError] = useState("");
  const [viewingRound, setViewingRound] = useState(null);

  function loadRounds(pageToLoad = roundPage) {
    setLoading(true);
    setRoundError("");
    const params = new URLSearchParams();
    params.set("page", String(pageToLoad));
    params.set("limit", String(MARKETING_PAGE_SIZE));

    Promise.all([
      apiFetch("/api/products/auctions/rounds/current", { token }).catch(
        () => null,
      ),
      apiFetch(`/api/products/auctions/rounds?${params.toString()}`, {
        token,
      }),
    ])
      .then(([currentData, listData]) => {
        setRoundInfo(currentData);
        const items = Array.isArray(listData?.items) ? listData.items : [];
        const nextTotal = Number.isFinite(listData?.total)
          ? listData.total
          : items.length;
        const nextTotalPages = Number.isFinite(listData?.totalPages)
          ? Math.max(1, listData.totalPages)
          : Math.max(1, Math.ceil(nextTotal / MARKETING_PAGE_SIZE));

        setAllRounds(items);
        setRoundTotal(nextTotal);
        setRoundTotalPages(nextTotalPages);

        if (pageToLoad > nextTotalPages) {
          setRoundPage(nextTotalPages);
          const clampParams = new URLSearchParams();
          clampParams.set("page", String(nextTotalPages));
          clampParams.set("limit", String(MARKETING_PAGE_SIZE));
          apiFetch(`/api/products/auctions/rounds?${clampParams.toString()}`, {
            token,
          })
            .then((clampedData) => {
              setAllRounds(
                Array.isArray(clampedData?.items) ? clampedData.items : [],
              );
              setRoundTotal(
                Number.isFinite(clampedData?.total)
                  ? clampedData.total
                  : nextTotal,
              );
              setRoundTotalPages(
                Number.isFinite(clampedData?.totalPages)
                  ? Math.max(1, clampedData.totalPages)
                  : nextTotalPages,
              );
            })
            .catch(() => {});
        } else {
          setRoundPage(pageToLoad);
        }
      })
      .catch((err) => {
        console.error(err);
        setRoundError(
          err.message || "เกิดข้อผิดพลาดในการโหลดรอบประมูล กรุณาลองใหม่อีกครั้ง",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setRoundPage(1);
    loadRounds(1);
  }, [token]);

  useEffect(() => {
    if (refreshRevision > 0) loadRounds();
  }, [refreshRevision]);

  async function handleCreateRound(e) {
    e.preventDefault();
    setFormError("");
    if (!title || !title.trim()) {
      setFormError("กรุณากรอกชื่อรอบการประมูลให้ครบถ้วน");
      return;
    }
    if (!subStartsAt || !subEndsAt || !aucStartsAt || !aucEndsAt) {
      setFormError(
        "กรุณาระบุวันและเวลาเปิดรับสินค้าและวันเวลาประมูลให้ครบถ้วน",
      );
      return;
    }
    if (new Date(subStartsAt).getTime() < Date.now()) {
      setFormError("เวลาเริ่มเปิดรับสินค้าต้องเป็นเวลาปัจจุบันหรืออนาคต");
      return;
    }

    if (categoryMode === "specific" && selectedCategories.length === 0) {
      setFormError("กรุณาเลือกอย่างน้อย 1 หมวดหมู่ หรือเลือกรับทุกหมวดหมู่");
      return;
    }
    const capacity = Number(maxItems);
    if (!Number.isInteger(capacity) || capacity <= 0 || capacity > MAX_ROUND_CAPACITY) {
      setFormError("กรุณาระบุจำนวนสินค้าสูงสุดเป็นจำนวนเต็มบวก");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/products/auctions/rounds", {
        method: "POST",
        token,
        body: {
          title: title.trim(),
          maxItems: capacity,
          submissionStartsAt: new Date(subStartsAt).toISOString(),
          submissionEndsAt: new Date(subEndsAt).toISOString(),
          auctionStartsAt: new Date(aucStartsAt).toISOString(),
          auctionEndsAt: new Date(aucEndsAt).toISOString(),
          categories: categoryMode === "all" ? [] : selectedCategories,
        },
      });
      setShowCreateForm(false);
      setTitle("");
      setMaxItems("");
      setSubStartsAt("");
      setSubEndsAt("");
      setAucStartsAt("");
      setAucEndsAt("");
      setCategoryMode("all");
      setSelectedCategories([]);
      setRoundPage(1);
      loadRounds();
      if (onRoundCreated) onRoundCreated();
    } catch (err) {
      setFormError(
        err.message || "เกิดข้อผิดพลาดในการสร้างรอบประมูล กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmCancelRound(e) {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setCancelError("กรุณาระบุเหตุผลในการยกเลิกรอบประมูล");
      return;
    }
    setCancelling(true);
    setCancelError("");
    const targetRound = cancellingRound;
    const trimmed = cancelReason.trim();
    try {
      const res = await apiFetch(
        `/api/products/auctions/rounds/${targetRound.id}/cancel`,
        {
          method: "PATCH",
          token,
          body: { reason: trimmed },
        },
      );
      if (res?.warnings?.length > 0) {
        if (typeof alert === "function") {
          alert("คำเตือน: " + res.warnings.join("\n"));
        }
        setRoundCancelWarning({
          roundId: targetRound.id,
          roundTitle: targetRound.title,
          reason: trimmed,
          warnings: res.warnings,
        });
        setRoundCancelFeedback("");
      } else {
        setRoundCancelWarning(null);
        setRoundCancelFeedback(
          `ยกเลิกรอบประมูล "${targetRound.title}" เรียบร้อยแล้ว`,
        );
      }
      setCancellingRound(null);
      setCancelReason("");
      loadRounds();
      if (onRoundCreated) onRoundCreated();
    } catch (err) {
      setCancelError(err.message || "เกิดข้อผิดพลาดในการยกเลิกรอบประมูล");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRetryRoundNotification() {
    if (!roundCancelWarning || roundRetrying) return;
    setRoundRetrying(true);
    try {
      const res = await apiFetch(
        `/api/products/auctions/rounds/${roundCancelWarning.roundId}/cancel`,
        {
          method: "PATCH",
          token,
          body: { reason: roundCancelWarning.reason || "ยกเลิกรอบประมูล" },
        },
      );
      if (res?.warnings?.length > 0) {
        setRoundCancelWarning((prev) => ({
          ...prev,
          warnings: res.warnings,
        }));
      } else {
        setRoundCancelWarning(null);
        setRoundCancelFeedback(
          "ส่งข้อความแจ้งเตือนการยกเลิกรอบประมูลครบทุกฝ่ายเรียบร้อยแล้ว",
        );
      }
    } catch (err) {
      setRoundCancelWarning((prev) => ({
        ...prev,
        warnings: [
          err.message ||
            "เกิดข้อผิดพลาดในการส่งแจ้งเตือนซ้ำ กรุณาลองใหม่อีกครั้ง",
        ],
      }));
    } finally {
      setRoundRetrying(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0">
              event_available
            </span>
            การจัดการรอบการประมูล (Auction Rounds)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            สามารถสร้างรอบเปิดรับสินค้าและรอบประมูลหลายรอบพร้อมกันได้
            สินค้าแต่ละรายการจะผูกกับรอบที่เลือก
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition shrink-0 w-full sm:w-auto"
        >
          <span className="material-symbols-outlined text-sm">
            {showCreateForm ? "close" : "add_circle"}
          </span>
          {showCreateForm ? "ปิดฟอร์ม" : "สร้างรอบประมูลใหม่"}
        </button>
      </div>

      {roundCancelWarning && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900"
        >
          <span>
            ⚠️ ยกเลิกรอบประมูล &ldquo;{roundCancelWarning.roundTitle}&rdquo;
            เรียบร้อยแล้ว แต่พบคำเตือนการแจ้งเตือน:{" "}
            {roundCancelWarning.warnings.join(", ")}
          </span>
          <button
            type="button"
            disabled={roundRetrying}
            onClick={handleRetryRoundNotification}
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {roundRetrying
              ? "กำลังส่งแจ้งเตือนซ้ำ..."
              : "ลองส่งแจ้งเตือนอีกครั้ง"}
          </button>
        </div>
      )}

      {roundCancelFeedback && !roundCancelWarning && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
          ✓ {roundCancelFeedback}
        </div>
      )}

      {showCreateForm && (
        <form
          onSubmit={handleCreateRound}
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 animate-fade-in-up"
        >
          <h4 className="text-sm font-bold text-emerald-950 mb-3">
            เปิดรอบประมูลใหม่
          </h4>
          {formError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium">
              ⚠️ {formError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">
                ชื่อรอบการประมูล
              </label>
              <input
                required
                type="text"
                placeholder="เช่น รอบประมูลสินค้ามือสองประจำสัปดาห์ที่ 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="round-max-items" className="block text-slate-700 font-medium mb-1">จำนวนสินค้าสูงสุดต่อรอบ</label>
              <input id="round-max-items" type="number" required min="1" step="1" max={MAX_ROUND_CAPACITY}
                value={maxItems} onChange={event => setMaxItems(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500" />
              <p className="mt-1 text-slate-500">นับตั้งแต่ส่งสำเร็จ รวมรายการรออนุมัติ ปฏิเสธหรือยกเลิกแล้วคืนช่องว่าง</p>
            </div>
            <div className="space-y-3 rounded-lg bg-white p-3 border border-emerald-100">
              <span className="font-semibold text-emerald-800 block text-xs">
                📅 ช่วงเวลารับสินค้าจากผู้ขาย
              </span>
              <div>
                <label
                  htmlFor="subStartsAt"
                  className="block text-slate-500 mb-0.5"
                >
                  วัน-เวลาเริ่มเปิดรับ
                </label>
                <input
                  id="subStartsAt"
                  required
                  type="datetime-local"
                  min={getNextMinuteLocalInputValue()}
                  value={subStartsAt}
                  onChange={(e) => setSubStartsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor="subEndsAt"
                  className="block text-slate-500 mb-0.5"
                >
                  วัน-เวลาปิดรับสินค้า
                </label>
                <input
                  id="subEndsAt"
                  required
                  type="datetime-local"
                  value={subEndsAt}
                  onChange={(e) => setSubEndsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="md:col-span-2 rounded-lg bg-white p-3 border border-emerald-100">
              <span className="font-semibold text-emerald-800 block text-xs mb-2">
                🏷️ หมวดหมู่สินค้าที่เปิดรับ
              </span>
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="radio"
                    name="categoryMode"
                    value="all"
                    checked={categoryMode === "all"}
                    onChange={() => setCategoryMode("all")}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  รับทุกหมวดหมู่ (All Categories)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="radio"
                    name="categoryMode"
                    value="specific"
                    checked={categoryMode === "specific"}
                    onChange={() => setCategoryMode("specific")}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  เลือกเฉพาะบางหมวดหมู่
                </label>
              </div>
              {categoryMode === "specific" && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500 mb-2">
                    เลือกหมวดหมู่ที่ต้องการเปิดรับในรอบนี้:
                  </p>
                  {availableCategories.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      กำลังโหลดหมวดหมู่...
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableCategories.map((cat) => {
                        const isSelected = selectedCategories.includes(cat);
                        return (
                          <label
                            key={cat}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border cursor-pointer transition select-none ${
                              isSelected
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-medium"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              aria-label={cat}
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedCategories(
                                    selectedCategories.filter((c) => c !== cat),
                                  );
                                } else {
                                  setSelectedCategories([
                                    ...selectedCategories,
                                    cat,
                                  ]);
                                }
                              }}
                              className="text-emerald-600 rounded focus:ring-emerald-500"
                            />
                            {cat}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg bg-white p-3 border border-emerald-100">
              <span className="font-semibold text-emerald-800 block text-xs">
                🔨 ช่วงเวลาประมูลจริง
              </span>
              <div>
                <label
                  htmlFor="aucStartsAt"
                  className="block text-slate-500 mb-0.5"
                >
                  วัน-เวลาเริ่มเปิดประมูล
                </label>
                <input
                  id="aucStartsAt"
                  required
                  type="datetime-local"
                  value={aucStartsAt}
                  onChange={(e) => setAucStartsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor="aucEndsAt"
                  className="block text-slate-500 mb-0.5"
                >
                  วัน-เวลาสิ้นสุดการประมูล
                </label>
                <input
                  id="aucEndsAt"
                  required
                  type="datetime-local"
                  value={aucEndsAt}
                  onChange={(e) => setAucEndsAt(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col-reverse sm:flex-row justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="w-full sm:w-auto rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกและเปิดรอบ"}
            </button>
          </div>
        </form>
      )}

      {/* Modal ยืนยันการยกเลิกรอบประมูล */}
      <Modal
        open={Boolean(cancellingRound)}
        onClose={() => !cancelling && setCancellingRound(null)}
        title="ยกเลิกรอบการประมูล"
        description="ตรวจสอบข้อมูลและระบุเหตุผลก่อนยืนยัน"
        footer={
          cancellingRound ? (
            <>
              <button
                type="button"
                onClick={() => setCancellingRound(null)}
                disabled={cancelling}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                กลับ
              </button>
              <button
                type="submit"
                form={ROUND_CANCEL_FORM_ID}
                disabled={cancelling || !cancelReason.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? "กำลังยกเลิก..." : "ยืนยันการยกเลิกรอบ"}
              </button>
            </>
          ) : null
        }
      >
        {cancellingRound && (
          <form
            id={ROUND_CANCEL_FORM_ID}
            onSubmit={handleConfirmCancelRound}
            className="space-y-4"
          >
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500">
                  รอบประมูลที่ต้องการยกเลิก
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {cancellingRound.title}
                </p>
              </div>
              <dl className="grid gap-3 px-4 py-3 text-xs text-slate-700 sm:grid-cols-[1fr_auto]">
                <div>
                  <dt className="font-medium text-slate-500">ช่วงเวลาประมูล</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {fmt(cancellingRound.auctionStartsAt)} —{" "}
                    {fmt(cancellingRound.auctionEndsAt)}
                  </dd>
                </div>
                <div className="sm:min-w-28">
                  <dt className="font-medium text-slate-500">สินค้าในรอบ</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                    {cancellingRound._count?.auctions ?? 0} รายการ
                  </dd>
                </div>
              </dl>
            </div>

            {(cancellingRound.phase === "auction" ||
              cancellingRound.roundPhase === "auction") && (
              <div
                role="alert"
                className="flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined mt-0.5 text-[18px] leading-none text-amber-600"
                >
                  warning
                </span>
                <div>
                  <p className="font-semibold">รอบนี้กำลังเคาะประมูล</p>
                  <p className="mt-0.5 leading-relaxed text-amber-900">
                    การยกเลิกจะยุติการประมูลทันที ผู้เสนอราคาจะได้รับผลกระทบ
                    และสินค้าจะเปลี่ยนเป็นสถานะรอการดำเนินการ
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                เหตุผลในการยกเลิกรอบประมูล{" "}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="ระบุเหตุผลในการยกเลิกรอบประมูลให้ผู้ที่ได้รับผลกระทบเข้าใจ"
                className="w-full resize-none rounded-lg border border-slate-300 p-3 text-xs leading-relaxed text-slate-900 transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
              <span className="mt-1 block text-right text-[11px] text-slate-400">
                {cancelReason.length}/500 ตัวอักษร
              </span>
            </div>

            {cancelError && (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
              >
                {cancelError}
              </p>
            )}
          </form>
        )}
      </Modal>

      {/* ตารางรายการรอบประมูลทั้งหมด (All Auction Rounds) */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-slate-400">
            history
          </span>
          ประวัติและรายการรอบการประมูลทั้งหมด ({roundError ? "—" : roundTotal})
        </h4>

        {loading ? (
          <p className="text-xs text-slate-400 py-3">กำลังโหลดประวัติรอบประมูล...</p>
        ) : roundError ? (
          <p className="text-xs text-red-600 py-3">{roundError}</p>
        ) : allRounds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 my-2">
            ยังไม่มีประวัติรอบการประมูล
          </div>
        ) : (
          <div className="min-w-0 rounded-xl border border-slate-200">
            <table className="w-full table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[11%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-2 py-2.5 font-semibold">ชื่อรอบ</th>
                  <th className="px-2 py-2.5 font-semibold">สถานะ</th>
                  <th className="px-2 py-2.5 font-semibold">ช่วงรับสินค้า</th>
                  <th className="px-2 py-2.5 font-semibold">ช่วงประมูล</th>
                  <th className="px-2 py-2.5 font-semibold">หมวดหมู่</th>
                  <th className="px-2 py-2.5 text-right font-semibold">จำนวนสินค้า</th>
                  <th className="px-2 py-2.5 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allRounds.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-slate-50/50">
                    <td className="min-w-0 px-2 py-3 font-semibold leading-5 text-slate-900">
                      <span className="line-clamp-2 break-words" title={r.title}>
                        {r.title}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`inline-flex max-w-full whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          ROUND_PHASE_STYLE[r.phase] ||
                          "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {ROUND_PHASE_LABEL[r.phase] || r.phase || "—"}
                      </span>
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <DateTimeRange
                        start={r.submissionStartsAt}
                        end={r.submissionEndsAt}
                        endLabel="ปิดรับ"
                        compact
                      />
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <DateTimeRange
                        start={r.auctionStartsAt}
                        end={r.auctionEndsAt}
                        endLabel="ปิดรอบ"
                        compact
                      />
                    </td>
                    <td className="min-w-0 px-2 py-3 text-slate-600">
                      <RoundCategories categories={r.categories} tone="slate" />
                    </td>
                    <td className="px-2 py-3 text-right text-slate-700">
                      <RoundItemCount round={r} align="right" />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="ml-auto flex max-w-32 flex-col items-stretch gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingRound(r)}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        aria-label={`ดูรายละเอียดรอบ ${r.title}`}
                      >
                        <span className="material-symbols-outlined text-[15px] leading-none" aria-hidden="true">
                          search
                        </span>
                        ดูรายละเอียด
                      </button>
                      {!r.cancelledAt && !["ended", "cancelled"].includes(r.phase) && (
                        <button type="button" onClick={() => setEditingRound(r)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                          แก้ไขเวลา
                        </button>
                      )}
                      {r.phase !== "cancelled" &&
                        r.phase !== "ended" &&
                        !r.cancelledAt && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingRound(r);
                              setCancelReason("");
                              setCancelError("");
                            }}
                            className="w-full rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-semibold leading-4 text-rose-700 transition hover:bg-rose-100"
                          >
                            ยกเลิกรอบประมูล
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingRound && <RoundEditModal key={editingRound.id} round={editingRound} token={token}
          onClose={() => setEditingRound(null)} onSaved={() => { loadRounds(); onRoundCreated?.(); }} />}
        <Modal
          open={Boolean(viewingRound)}
          onClose={() => setViewingRound(null)}
          title="รายละเอียดรอบการประมูล"
          description="ข้อมูลแบบอ่านอย่างเดียวจากประวัติรอบการประมูล"
          size="md"
        >
          {viewingRound && (
            <div className="space-y-4 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">ชื่อรอบ</p>
                <p className="mt-1 break-words font-semibold text-slate-900">{viewingRound.title}</p>
                <div className="mt-3">
                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROUND_PHASE_STYLE[viewingRound.phase] || "border-slate-200 bg-slate-100 text-slate-600"}`}>
                    {ROUND_PHASE_LABEL[viewingRound.phase] || viewingRound.phase || "—"}
                  </span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-3">
                  <h5 className="mb-2 text-xs font-semibold text-slate-800">ช่วงรับสินค้า</h5>
                  <DateTimeRange start={viewingRound.submissionStartsAt} end={viewingRound.submissionEndsAt} endLabel="ปิดรับ" />
                </section>
                <section className="rounded-xl border border-slate-200 p-3">
                  <h5 className="mb-2 text-xs font-semibold text-slate-800">ช่วงประมูล</h5>
                  <DateTimeRange start={viewingRound.auctionStartsAt} end={viewingRound.auctionEndsAt} endLabel="ปิดรอบ" />
                </section>
              </div>
              <section className="rounded-xl border border-slate-200 p-3">
                <h5 className="mb-2 text-xs font-semibold text-slate-800">หมวดหมู่ที่เปิดรับ</h5>
                <RoundCategories categories={viewingRound.categories} tone="slate" />
              </section>
              {(viewingRound.cancellationReason || viewingRound.cancelledAt) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <strong>เหตุผลที่ยกเลิก:</strong>{" "}
                  {viewingRound.cancellationReason || "ไม่ระบุเหตุผล"}
                </div>
              )}
            </div>
          )}
        </Modal>
        <MarketingPagination
          page={roundPage}
          totalPages={roundTotalPages}
          total={roundTotal}
          loading={loading}
          error={roundError}
          onPageChange={(p) => {
            setRoundPage(p);
            loadRounds(p);
          }}
          className="mt-3 rounded-lg border border-slate-200"
        />
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
      setError("กรุณาระบุวันและเวลาเปิดและปิดประมูลให้ครบถ้วน");
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
      setError(
        err.message || "เกิดข้อผิดพลาดในการตั้งเวลาประมูล กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky top-0 z-10 mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 sm:p-4 shadow-sm"
    >
      <p className="w-full text-xs sm:text-sm font-medium text-emerald-800">
        เลือกไว้ {count} รายการ — ตั้งเวลาให้พร้อมกันทีเดียว
      </p>
      <div className="w-full sm:w-auto flex-1 min-w-[180px]">
        <label className="block text-xs text-slate-600 mb-1">
          เวลาเปิดประมูล
        </label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs sm:text-sm"
        />
      </div>
      <div className="w-full sm:w-auto flex-1 min-w-[180px]">
        <label className="block text-xs text-slate-600 mb-1">
          เวลาปิดประมูล
        </label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs sm:text-sm"
        />
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 sm:flex-initial rounded-md bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
        >
          {saving ? "กำลังตั้งเวลา..." : "ตั้งเวลา"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex-1 sm:flex-initial rounded-md border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50"
        >
          ยกเลิก
        </button>
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

function getFriendlyErrorMessage(err, actionName = "ทำรายการ") {
  const msg = err?.message || "";
  const isTechnical =
    !msg ||
    /failed \(\d+\)/i.test(msg) ||
    /internal server/i.test(msg) ||
    /prisma/i.test(msg) ||
    /syntaxerror/i.test(msg) ||
    /typeerror/i.test(msg) ||
    /network/i.test(msg) ||
    /econnrefused/i.test(msg) ||
    /cannot read/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /token/i.test(msg);

  if (isTechnical) {
    return `เกิดข้อผิดพลาดในการ${actionName}รายการประมูล กรุณาลองใหม่อีกครั้ง`;
  }
  return msg;
}

export default function AuctionScheduleSection({ token }) {
  const [roundCapacityRevision, setRoundCapacityRevision] = useState(0);
  const [auctions, setAuctions] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilters, setStatusFilters] = useState([]);
  const [roundFilters, setRoundFilters] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [allRoundsForFilter, setAllRoundsForFilter] = useState([]);
  const [filterRoundsError, setFilterRoundsError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewAuction, setReviewAuction] = useState(null);
  const [actionState, setActionState] = useState({ id: null, type: null });
  const [actionError, setActionError] = useState("");
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");

  // Single-item cancel modal state (MKT-DEC-026)
  const [cancellingItem, setCancellingItem] = useState(null);
  const [itemCancelReason, setItemCancelReason] = useState("");
  const [itemCancelling, setItemCancelling] = useState(false);
  const [itemCancelError, setItemCancelError] = useState("");
  const [itemCancelFeedback, setItemCancelFeedback] = useState("");
  const [itemCancelWarning, setItemCancelWarning] = useState(null);
  const [itemRetrying, setItemRetrying] = useState(false);

  function loadFilterRounds() {
    setFilterRoundsError("");
    apiFetch("/api/products/auctions/rounds", { token })
      .then((data) => setAllRoundsForFilter(data?.items || []))
      .catch((err) => {
        const msg = err?.message || "";
        const isTech =
          !msg ||
          /failed \(\d+\)/i.test(msg) ||
          /internal server/i.test(msg) ||
          /prisma/i.test(msg) ||
          /fetch failed/i.test(msg) ||
          /network/i.test(msg);
        setFilterRoundsError(
          isTech
            ? "ไม่สามารถโหลดรายการรอบประมูลสำหรับตัวกรองได้ กรุณาลองใหม่อีกครั้ง"
            : msg,
        );
      });
  }

  function load(pageToLoad = page) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("page", String(pageToLoad));
    params.set("limit", String(MARKETING_PAGE_SIZE));
    if (statusFilters.length) params.set("statuses", statusFilters.join(","));
    if (roundFilters.length) params.set("roundIds", roundFilters.join(","));
    if (searchFilter) params.set("search", searchFilter);
    apiFetch(`/api/products/auctions?${params.toString()}`, { token })
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        const nextTotal = Number.isFinite(data?.total) ? data.total : items.length;
        const nextTotalPages = Number.isFinite(data?.totalPages)
          ? Math.max(1, data.totalPages)
          : Math.max(1, Math.ceil(nextTotal / MARKETING_PAGE_SIZE));

        setAuctions(items);
        setTotal(nextTotal);
        setTotalPages(nextTotalPages);

        if (pageToLoad > nextTotalPages) {
          setPage(nextTotalPages);
          const clampParams = new URLSearchParams();
          clampParams.set("page", String(nextTotalPages));
          clampParams.set("limit", String(MARKETING_PAGE_SIZE));
          if (statusFilters.length) clampParams.set("statuses", statusFilters.join(","));
          if (roundFilters.length) clampParams.set("roundIds", roundFilters.join(","));
          if (searchFilter) clampParams.set("search", searchFilter);
          apiFetch(`/api/products/auctions?${clampParams.toString()}`, { token })
            .then((clampedData) => {
              setAuctions(
                Array.isArray(clampedData?.items) ? clampedData.items : [],
              );
              setTotal(
                Number.isFinite(clampedData?.total)
                  ? clampedData.total
                  : nextTotal,
              );
              setTotalPages(
                Number.isFinite(clampedData?.totalPages)
                  ? Math.max(1, clampedData.totalPages)
                  : nextTotalPages,
              );
            })
            .catch(() => {});
        } else {
          setPage(pageToLoad);
        }
      })
      .catch((err) =>
        setError(
          err.message ||
            "เกิดข้อผิดพลาดในการโหลดรายการประมูล กรุณาลองใหม่อีกครั้ง",
        ),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadFilterRounds();
  }, [token]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [statusFilters, roundFilters, searchFilter, token]);

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
        `ตั้งเวลาสำเร็จ ${ids.length - failed}/${ids.length} รายการ — ${failed} รายการไม่สำเร็จ (สถานะอาจไม่พร้อมตั้งเวลา)`,
      );
    }
  }

  function handleOpenReview(auctionItem) {
    setActionError("");
    setReviewAuction(auctionItem);
  }

  function handleCloseReview() {
    if (actionState.id) return;
    setActionError("");
    setReviewAuction(null);
  }

  async function handleApprove(id) {
    if (actionState.id) return;
    setActionState({ id, type: "approve" });
    setError("");
    setActionError("");
    try {
      await apiFetch(`/api/products/auctions/${id}/approve`, {
        method: "PATCH",
        token,
      });
      if (reviewAuction?.id === id) {
        setReviewAuction(null);
      }
      load();
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "อนุมัติ");
      if (reviewAuction?.id === id) {
        setActionError(friendlyMsg);
      } else {
        setError(friendlyMsg);
      }
    } finally {
      setActionState({ id: null, type: null });
    }
  }

  function handleOpenReject(auctionItem) {
    if (reviewAuction?.id === auctionItem.id) {
      setReviewAuction(null);
    }
    setRejectingItem(auctionItem);
    setRejectReason("");
    setRejectError("");
  }

  async function handleReject(e) {
    e?.preventDefault?.();
    const id = rejectingItem?.id;
    if (actionState.id) return;
    const trimmedReason = rejectReason.trim();
    if (!id || !trimmedReason) {
      setRejectError("กรุณาระบุเหตุผลในการปฏิเสธสินค้า");
      return;
    }
    if (trimmedReason.length > 500) {
      setRejectError("เหตุผลในการปฏิเสธต้องมีความยาวไม่เกิน 500 ตัวอักษร");
      return;
    }
    setActionState({ id, type: "reject" });
    setError("");
    setActionError("");
    setRejectError("");
    try {
      await apiFetch(`/api/products/auctions/${id}/reject`, {
        method: "PATCH",
        token,
        body: { reason: trimmedReason },
      });
      if (reviewAuction?.id === id) {
        setReviewAuction(null);
      }
      setRejectingItem(null);
      setRejectReason("");
      setRoundCapacityRevision(revision => revision + 1);
      load();
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "ปฏิเสธ");
      setRejectError(friendlyMsg);
    } finally {
      setActionState({ id: null, type: null });
    }
  }

  function handleOpenCancelItem(auctionItem) {
    setCancellingItem(auctionItem);
    setItemCancelReason("");
    setItemCancelError("");
    setItemCancelFeedback("");
    setItemCancelWarning(null);
  }

  async function handleConfirmCancelItem(e) {
    e?.preventDefault?.();
    if (!cancellingItem || itemCancelling) return;
    const trimmed = itemCancelReason.trim();
    if (!trimmed) {
      setItemCancelError("กรุณาระบุเหตุผลในการยกเลิกรายการประมูล");
      return;
    }
    if (trimmed.length > 500) {
      setItemCancelError("เหตุผลในการยกเลิกต้องมีความยาวไม่เกิน 500 ตัวอักษร");
      return;
    }
    setItemCancelling(true);
    setItemCancelError("");
    try {
      const targetId = cancellingItem.id;
      const res = await apiFetch(`/api/products/auctions/${targetId}/cancel`, {
        method: "PATCH",
        token,
        body: { cancellationReason: trimmed, reason: trimmed },
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      setCancellingItem(null);
      setItemCancelReason("");
      if (res?.warnings?.length > 0) {
        setItemCancelWarning({
          auctionId: targetId,
          reason: trimmed,
          warnings: res.warnings,
        });
        setItemCancelFeedback(
          `ยกเลิกรายการประมูลเรียบร้อยแล้ว (คำเตือนการแจ้งเตือน: ${res.warnings.join(", ")})`,
        );
      } else {
        setItemCancelWarning(null);
        setItemCancelFeedback(
          "ยกเลิกรายการประมูลเรียบร้อยแล้ว (ส่งการแจ้งเตือนให้ผู้ที่เกี่ยวข้องแล้ว)",
        );
      }
      setRoundCapacityRevision(revision => revision + 1);
      load();
    } catch (err) {
      setItemCancelError(getFriendlyErrorMessage(err, "ยกเลิก"));
    } finally {
      setItemCancelling(false);
    }
  }

  async function handleRetryItemNotification() {
    if (!itemCancelWarning || itemRetrying) return;
    setItemRetrying(true);
    try {
      const res = await apiFetch(
        `/api/products/auctions/${itemCancelWarning.auctionId}/cancel`,
        {
          method: "PATCH",
          token,
          body: {
            cancellationReason: itemCancelWarning.reason,
            reason: itemCancelWarning.reason,
          },
        },
      );
      if (res?.warnings?.length > 0) {
        setItemCancelWarning((prev) => ({
          ...prev,
          warnings: res.warnings,
        }));
        setItemCancelFeedback(
          `ยกเลิกรายการประมูลเรียบร้อยแล้ว (คำเตือนการแจ้งเตือน: ${res.warnings.join(", ")})`,
        );
      } else {
        setItemCancelWarning(null);
        setItemCancelFeedback(
          "ส่งข้อความแจ้งเตือนการยกเลิกรายการประมูลครบทุกฝ่ายเรียบร้อยแล้ว",
        );
      }
    } catch (err) {
      setItemCancelFeedback(
        `ไม่สามารถส่งแจ้งเตือนซ้ำได้: ${getFriendlyErrorMessage(err, "ส่งแจ้งเตือน")}`,
      );
    } finally {
      setItemRetrying(false);
    }
  }

  const eligibleIds = new Set(
    auctions.filter((a) => a.status === "approved").map((a) => a.id),
  );

  return (
    <div className="animate-fade-in-up">
      {/* ส่วนจัดการรอบการประมูล */}
      <RoundManagementSection
        token={token}
        refreshRevision={roundCapacityRevision}
        onRoundCreated={() => {
          load();
          loadFilterRounds();
        }}
      />

      <section className="mb-5 overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              inventory_2
            </span>
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">
              รายการสินค้าประมูล
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 sm:text-sm">
              ค้นหา ตรวจสอบ และจัดการสินค้าตามรอบประมูลหรือสถานะ
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <AuctionItemFilters
            rounds={allRoundsForFilter}
            selectedRoundIds={roundFilters}
            onRoundIdsChange={setRoundFilters}
            statusOptions={Object.entries(STATUS_LABEL)
              .filter(([value]) => !HIDDEN_MARKETING_FILTER_STATUSES.has(value))
              .map(([value, label]) => ({
                value,
                label,
              }))}
            selectedStatuses={statusFilters}
            onStatusesChange={setStatusFilters}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onSearchSubmit={() => setSearchFilter(searchInput.trim())}
          />
        </div>
      </section>

      {selected.size > 0 && (
        <BulkScheduleBar
          count={selected.size}
          onApply={handleBulkSchedule}
          onClear={() => setSelected(new Set())}
        />
      )}

      {filterRoundsError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {filterRoundsError}
        </p>
      )}

      {itemCancelFeedback && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-xs font-medium ${
            itemCancelWarning
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <span>
            {itemCancelWarning ? "⚠️ " : "✓ "}
            {itemCancelFeedback}
          </span>
          {itemCancelWarning && (
            <button
              type="button"
              disabled={itemRetrying}
              onClick={handleRetryItemNotification}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {itemRetrying
                ? "กำลังส่งแจ้งเตือนซ้ำ..."
                : "ลองส่งแจ้งเตือนอีกครั้ง"}
            </button>
          )}
        </div>
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
              className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200/60 bg-white p-3.5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.03)] sm:p-4"
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

              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${a.productId}`}
                      className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-900 hover:text-emerald-600 sm:text-base sm:leading-6"
                      title={a.product?.title || a.productId}
                    >
                      {a.product?.title || a.productId}
                    </Link>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                      <span
                        className="material-symbols-outlined shrink-0 text-[15px] leading-none text-slate-400"
                        aria-hidden="true"
                      >
                        storefront
                      </span>
                      <span className="truncate" title={a.sellerDisplayName || "ไม่พบชื่อร้าน"}>
                        ร้าน: {a.sellerDisplayName || "ไม่พบชื่อร้าน"}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 self-start">
                    <Badge
                      text={STATUS_LABEL[a.status] || a.status}
                      style={
                        `${STATUS_STYLE[a.status] || "bg-slate-100 text-slate-600"} whitespace-nowrap`
                      }
                    />
                  </div>
                </div>

                <dl className="mt-3 grid min-w-0 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="font-medium text-slate-500">รอบประมูล</dt>
                    <dd
                      className="mt-1 break-words font-semibold leading-5 text-emerald-700"
                      title={a.round?.title || "ไม่ระบุรอบ"}
                    >
                      {a.round?.title || "ไม่ระบุรอบ"}
                    </dd>
                    {(a.round?.cancelledAt || a.round?.phase === "cancelled") && (
                      <span className="mt-1 inline-flex whitespace-nowrap rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-600">
                        รอบถูกยกเลิกแล้ว
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <dt className="font-medium text-slate-500">หมวดหมู่สินค้า</dt>
                    <dd className="mt-1 break-words font-medium leading-5 text-slate-700">
                      {a.product?.category || "ไม่ระบุ"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-medium text-slate-500">ราคาเสนอ</dt>
                    <dd className="mt-1 leading-5 text-slate-700">
                      <span className="block font-semibold">
                        เริ่ม {baht(a.startingPrice)}
                      </span>
                      <span className="block text-slate-500">
                        เพิ่มขั้นต่ำ {baht(a.bidIncrement)}
                      </span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="mb-1 font-medium text-slate-500">ช่วงประมูล</dt>
                    <DateTimeRange
                      start={a.scheduledStartAt}
                      end={a.scheduledEndAt}
                      endLabel="ปิดรอบ"
                      compact
                    />
                  </div>
                </dl>

                {a.status === "cancelled" &&
                  (a.cancellationReason || a.round?.cancellationReason) && (
                    <p className="mt-2 inline-block max-w-full break-words rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700">
                      เหตุผลที่ยกเลิก:{" "}
                      {a.cancellationReason || a.round?.cancellationReason}
                    </p>
                  )}

                {/* ปุ่มตรวจสอบ อนุมัติ และปฏิเสธสำหรับ Marketing */}
                {a.status === "pending_approval" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleOpenReview(a)}
                      disabled={Boolean(actionState.id)}
                      className="flex-1 sm:flex-initial rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition text-center disabled:opacity-50"
                    >
                      ตรวจสอบสินค้า
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(a.id)}
                      disabled={
                        Boolean(actionState.id) ||
                        Boolean(
                          a.round?.cancelledAt ||
                          a.round?.phase === "cancelled",
                        )
                      }
                      title={
                        a.round?.cancelledAt || a.round?.phase === "cancelled"
                          ? "ไม่สามารถอนุมัติได้เนื่องจากรอบประมูลถูกยกเลิกแล้ว"
                          : ""
                      }
                      className="flex-1 sm:flex-initial rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition text-center disabled:opacity-50"
                    >
                      {actionState.id === a.id && actionState.type === "approve"
                        ? "กำลังอนุมัติ..."
                        : "✓ อนุมัติสินค้าเข้าประมูล"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenReject(a)}
                      disabled={Boolean(actionState.id)}
                      className="flex-1 sm:flex-initial rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition text-center disabled:opacity-50"
                    >
                      {actionState.id === a.id && actionState.type === "reject"
                        ? "กำลังปฏิเสธ..."
                        : "ปฏิเสธสินค้า"}
                    </button>
                  </div>
                )}

                {["approved", "scheduled", "open"].includes(a.status) &&
                  !a.winningOrderId && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenReview(a)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden="true">search</span>
                        ดูรายละเอียด
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCancelItem(a)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                      >
                        ยกเลิกรายการประมูล
                      </button>
                    </div>
                  )}

                {["rejected", "cancelled", "closed"].includes(a.status) && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleOpenReview(a)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden="true">search</span>
                      ดูรายละเอียด
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <MarketingPagination
        page={page}
        totalPages={totalPages}
        total={total}
        loading={loading}
        error={error}
        onPageChange={(newPage) => {
          setPage(newPage);
          load(newPage);
        }}
        className="mt-3 rounded-xl border border-slate-200"
      />

      {/* Modal ยืนยันการยกเลิกเฉพาะรายการประมูล (MKT-DEC-026) */}
      <Modal
        open={Boolean(cancellingItem)}
        onClose={() => !itemCancelling && setCancellingItem(null)}
        title="ยืนยันการยกเลิกรายการประมูล"
        description="การยกเลิกรายการประมูลจะมีผลเฉพาะสินค้าที่เลือก รายการอื่นในรอบเดียวกันจะดำเนินต่อตามปกติ"
        size="md"
      >
        {cancellingItem && (
          <form onSubmit={handleConfirmCancelItem} className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs text-slate-700 space-y-1.5">
              <p>
                <strong>ชื่อสินค้า:</strong>{" "}
                {cancellingItem.product?.title || cancellingItem.productId}
              </p>
              <p>
                <strong>ชื่อรอบประมูล:</strong>{" "}
                {cancellingItem.round?.title || "ไม่ระบุ"}
              </p>
              <p>
                <strong>ผลกระทบ:</strong> เฉพาะรายการประมูลนี้จะถูกยกเลิก
                และสินค้าจะเปลี่ยนสถานะเป็นรอการดำเนินการของผู้ขาย
                โดยรายการอื่นในรอบเดียวกันจะดำเนินต่อตามปกติ
              </p>
            </div>

            {cancellingItem.status === "open" && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 font-medium">
                ⚠️ <strong>คำเตือน:</strong>{" "}
                รายการประมูลนี้กำลังเปิดเคาะราคาอยู่
                ระบบจะแจ้งเตือนผู้ขายและผู้ซื้อที่เคยเสนอราคาในรายการนี้ทันที
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                เหตุผลในการยกเลิกรายการประมูล{" "}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={itemCancelReason}
                onChange={(e) => setItemCancelReason(e.target.value)}
                placeholder="ระบุเหตุผลในการยกเลิกรายการประมูล (สูงสุด 500 ตัวอักษร)..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 block text-right mt-0.5">
                {itemCancelReason.length}/500 ตัวอักษร
              </span>
            </div>

            {itemCancelError && (
              <p className="text-xs text-rose-600 font-medium">
                {itemCancelError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancellingItem(null)}
                disabled={itemCancelling}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                กลับ
              </button>
              <button
                type="submit"
                disabled={itemCancelling || !itemCancelReason.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 shadow-sm"
              >
                {itemCancelling
                  ? "กำลังยกเลิกรายการ..."
                  : "ยืนยันการยกเลิกรายการ"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(rejectingItem)}
        onClose={() => !actionState.id && setRejectingItem(null)}
        title="ปฏิเสธสินค้าเข้าประมูล"
        description="ระบุเหตุผลที่ชัดเจนเพื่อเก็บไว้ในประวัติและแจ้งให้ผู้ขายทราบ"
        size="md"
      >
        {rejectingItem && (
          <form onSubmit={handleReject} className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
              <p><strong>ชื่อสินค้า:</strong> {rejectingItem.product?.title || rejectingItem.productId}</p>
              <p className="mt-1"><strong>รอบประมูล:</strong> {rejectingItem.round?.title || "ไม่ระบุ"}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                เหตุผลในการปฏิเสธสินค้า <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="ระบุรายละเอียดที่ผู้ขายต้องแก้ไข (สูงสุด 500 ตัวอักษร)"
                className="w-full resize-none rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
              />
              <span className="mt-0.5 block text-right text-[11px] text-slate-400">{rejectReason.length}/500 ตัวอักษร</span>
            </div>
            {rejectError && <p role="alert" className="text-xs font-medium text-rose-600">{rejectError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setRejectingItem(null)} disabled={Boolean(actionState.id)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                กลับ
              </button>
              <button type="submit" disabled={Boolean(actionState.id) || !rejectReason.trim()} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {actionState.id === rejectingItem.id && actionState.type === "reject" ? "กำลังปฏิเสธ..." : "ยืนยันการปฏิเสธสินค้า"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal ตรวจสอบรายละเอียดสินค้าก่อนอนุมัติเข้าประมูล */}
      <AuctionReviewModal
        isOpen={Boolean(reviewAuction)}
        auction={reviewAuction}
        onClose={handleCloseReview}
        onApprove={() => reviewAuction && handleApprove(reviewAuction.id)}
        onReject={() => reviewAuction && handleOpenReject(reviewAuction)}
        actionLoading={actionState}
        errorMessage={actionError}
        readOnly={reviewAuction?.status !== "pending_approval"}
      />
    </div>
  );
}

export { AuctionReviewModal, STATUS_LABEL, STATUS_STYLE, baht };
