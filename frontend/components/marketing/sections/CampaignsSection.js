"use client";

import { useEffect, useState } from "react";
import Button from "../../ui/Button";
import Modal from "../../ui/Modal";
import EmptyState from "../../ui/EmptyState";
import ErrorState from "../../ui/ErrorState";
import Skeleton from "../../ui/Skeleton";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { apiFetch } from "../../../lib/api";
import { fetchCategories } from "../../../lib/catalog";

const STATUS_MAP = {
  draft: {
    label: "ฉบับร่าง",
    color: "bg-slate-100 text-slate-700 border-slate-200",
  },
  pending_approval: {
    label: "รออนุมัติ",
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  approved: {
    label: "อนุมัติแล้ว",
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  published: {
    label: "เผยแพร่อยู่",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  ended: {
    label: "สิ้นสุดแล้ว",
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  rejected: {
    label: "ถูกปฏิเสธ",
    color: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

const STATUS_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "draft", label: "ฉบับร่าง" },
  { value: "pending_approval", label: "รออนุมัติ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "published", label: "เผยแพร่อยู่" },
  { value: "ended", label: "สิ้นสุดแล้ว" },
  { value: "rejected", label: "ถูกปฏิเสธ" },
];

function formatThaiDateTime(dateString) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  const datePart = d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart} น.`;
}

function formatThaiDate(dateString) {
  return formatThaiDateTime(dateString);
}

function toLocalDatetimeInput(date) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignsSection({ token }) {
  const [campaigns, setCampaigns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Editor modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minOrderPrice, setMinOrderPrice] = useState("0");
  const [applicableCategory, setApplicableCategory] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [budget, setBudget] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Action dialog state
  const [confirmAction, setConfirmAction] = useState(null); // { type, campaign, label, actionFn }
  const [actionLoading, setActionLoading] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState("");

  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  }

  async function loadCampaigns() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", 100);

      const data = await apiFetch(`/api/products/campaigns?${params}`, {
        token,
      });
      setCampaigns(data.items || []);
    } catch (err) {
      console.error("Failed to load campaigns:", err);
      setError(err.message || "ไม่สามารถดึงข้อมูลแคมเปญได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => console.error("Could not load categories:", err));
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [token, statusFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadCampaigns();
  }

  function openCreateModal() {
    setEditingCampaign(null);
    setCode("");
    setName("");
    setDescription("");
    setDiscountType("PERCENT");
    setDiscountValue("15");
    setMaxDiscount("200");
    setMinOrderPrice("0");
    setApplicableCategory("");
    setUsageLimit("100");
    setBudget("");

    const now = new Date();
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setStartsAt(toLocalDatetimeInput(now));
    setEndsAt(toLocalDatetimeInput(nextMonth));

    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(camp) {
    setEditingCampaign(camp);
    setCode(camp.code);
    setName(camp.name);
    setDescription(camp.description || "");
    setDiscountType(camp.discountType || "PERCENT");
    setDiscountValue(String(camp.discountValue || ""));
    setMaxDiscount(camp.maxDiscount ? String(camp.maxDiscount) : "");
    setMinOrderPrice(String(camp.minOrderPrice || 0));
    setApplicableCategory(camp.applicableCategory || "");
    setUsageLimit(camp.usageLimit ? String(camp.usageLimit) : "");
    setBudget(camp.budget ? String(camp.budget) : "");
    setStartsAt(toLocalDatetimeInput(camp.startsAt));
    setEndsAt(toLocalDatetimeInput(camp.endsAt));
    setFormError("");
    setModalOpen(true);
  }

  async function handleSaveCampaign(e) {
    e.preventDefault();
    setFormError("");

    if (!code.trim()) {
      setFormError("กรุณาระบุรหัสโค้ดแคมเปญ");
      return;
    }
    if (!name.trim()) {
      setFormError("กรุณาระบุชื่อแคมเปญ");
      return;
    }
    const val = Number(discountValue);
    if (!val || val <= 0) {
      setFormError("มูลค่าส่วนลดต้องเป็นตัวเลขที่มากกว่า 0");
      return;
    }
    if (discountType === "PERCENT" && (val < 1 || val > 100)) {
      setFormError("ส่วนลดแบบเปอร์เซ็นต์ต้องอยู่ระหว่าง 1 ถึง 100%");
      return;
    }
    if (!startsAt || !endsAt) {
      setFormError("กรุณาระบุทั้งวันเวลาเริ่มต้นและสิ้นสุด");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setFormError("วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: val,
        minOrderPrice: Number(minOrderPrice) || 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        applicableCategory: applicableCategory.trim() || null,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        budget: budget ? Number(budget) : null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      };

      if (editingCampaign) {
        await apiFetch(`/api/products/campaigns/${editingCampaign.id}`, {
          method: "PATCH",
          token,
          body: payload,
        });
        showToast("บันทึกการแก้ไขแคมเปญสำเร็จ");
      } else {
        await apiFetch("/api/products/campaigns", {
          method: "POST",
          token,
          body: payload,
        });
        showToast("สร้างแคมเปญฉบับร่างใหม่สำเร็จ");
      }

      setModalOpen(false);
      loadCampaigns();
    } catch (err) {
      console.error("Save campaign failed:", err);
      setFormError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setSaving(false);
    }
  }

  // Lifecycle action trigger
  async function triggerAction(endpoint, successMsg, method = "POST") {
    setActionLoading(true);
    try {
      await apiFetch(endpoint, {
        method,
        token,
      });
      showToast(successMsg);
      setConfirmAction(null);
      loadCampaigns();
    } catch (err) {
      console.error("Lifecycle action failed:", err);
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await apiFetch(`/api/products/campaigns/${rejectTarget.id}/reject`, {
        method: "POST",
        token,
        body: { reason: rejectReason.trim() },
      });
      showToast("ปฏิเสธแคมเปญเรียบร้อยแล้ว");
      setRejectTarget(null);
      setRejectReason("");
      loadCampaigns();
    } catch (err) {
      console.error("Reject campaign failed:", err);
      showToast(`ปฏิเสธไม่สำเร็จ: ${err.message}`);
    } finally {
      setRejecting(false);
    }
  }

  // Summary KPIs
  const totalCampaigns = campaigns.length;
  const now = new Date();
  const publishedCount = campaigns.filter(
    (c) =>
      c.status === "published" &&
      new Date(c.startsAt) <= now &&
      new Date(c.endsAt) >= now,
  ).length;
  const pendingCount = campaigns.filter(
    (c) => c.status === "pending_approval",
  ).length;
  const totalClaimed = campaigns.reduce(
    (sum, c) => sum + (c._count?.vouchers || c.usedCount || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl transition-all animate-in fade-in slide-in-from-bottom-5">
          <span className="material-symbols-outlined text-emerald-400 text-lg">
            check_circle
          </span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & KPI Summary Cards */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            ระบบจัดการแคมเปญและคูปองส่วนลด
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            สร้าง อนุมัติ เผยแพร่ และตรวจสอบเงื่อนไขส่วนลดโปรโมชันตามลำดับขั้น
            (MKT-001 / UR-15, UR-16)
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 px-4 rounded-xl shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          สร้างแคมเปญใหม่
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold text-slate-500">
              แคมเปญทั้งหมด
            </span>
            <span className="material-symbols-outlined text-lg text-slate-400">
              inventory_2
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            {totalCampaigns}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-xs font-semibold text-emerald-700">
              กำลังเผยแพร่ (Active)
            </span>
            <span className="material-symbols-outlined text-lg">
              campaign
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {publishedCount}
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-semibold text-amber-700">
              รออนุมัติ
            </span>
            <span className="material-symbols-outlined text-lg">
              pending_actions
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {pendingCount}
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between text-blue-600">
            <span className="text-xs font-semibold text-blue-700">
              สิทธิ์ที่ถูกเก็บไปแล้ว
            </span>
            <span className="material-symbols-outlined text-lg">
              confirmation_number
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-700">
            {totalClaimed}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="ค้นหารหัสโค้ด หรือชื่อแคมเปญ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            ค้นหา
          </button>
        </form>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 shrink-0">
            สถานะ:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content Table / List */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <Skeleton className="h-6 w-1/4 rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={loadCampaigns} />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon="confirmation_number"
          title="ยังไม่มีแคมเปญโปรโมชัน"
          description="กดปุ่ม 'สร้างแคมเปญใหม่' ด้านบน เพื่อเริ่มต้นตั้งค่าโปรโมชันและโค้ดส่วนลด"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">รหัส / ชื่อแคมเปญ</th>
                  <th className="px-4 py-3">ส่วนลด</th>
                  <th className="px-4 py-3">เงื่อนไขการใช้</th>
                  <th className="px-4 py-3">ช่วงเวลา (เปิด - ปิด)</th>
                  <th className="px-4 py-3">การใช้สิทธิ์</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {campaigns.map((camp) => {
                  const isExpired = (camp.status === "published" || camp.status === "approved") && new Date(camp.endsAt) < now;
                  const effectiveStatus = isExpired ? "ended" : camp.status;
                  const statusInfo = isExpired
                    ? {
                        label: "สิ้นสุดแล้ว (หมดเวลา)",
                        color: "bg-purple-50 text-purple-700 border-purple-200",
                      }
                    : STATUS_MAP[effectiveStatus] || {
                        label: camp.status,
                        color: "bg-slate-100 text-slate-700",
                      };
                  const discountLabel =
                    camp.discountType === "PERCENT"
                      ? `ลด ${camp.discountValue}% ${camp.maxDiscount ? `(สูงสุด ฿${camp.maxDiscount})` : ""}`
                      : `ลด ฿${camp.discountValue}`;

                  return (
                    <tr
                      key={camp.id}
                      className="hover:bg-slate-50/60 transition"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {camp.code}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-800 mt-1 line-clamp-1">
                          {camp.name}
                        </div>
                        {camp.description && (
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {camp.description}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-bold text-brand-700">
                          {discountLabel}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 space-y-0.5">
                        <div>
                          ขั้นต่ำ:{" "}
                          <span className="font-semibold text-slate-800">
                            ฿{camp.minOrderPrice || 0}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          หมวด:{" "}
                          <span className="font-medium text-slate-700">
                            {camp.applicableCategory || "ทุกหมวดหมู่"}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-[11px] text-slate-600 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="วันเวลาเริ่มต้น" />
                          <span>
                            เปิด: <strong className="font-semibold text-slate-700">{formatThaiDateTime(camp.startsAt)}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" title="วันเวลาสิ้นสุด" />
                          <span>
                            ปิด: <strong className="font-semibold text-slate-700">{formatThaiDateTime(camp.endsAt)}</strong>
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">
                          {camp._count?.vouchers ?? camp.usedCount ?? 0}
                          {camp.usageLimit ? ` / ${camp.usageLimit}` : " สิทธิ์"}
                        </div>
                        {camp.usageLimit && (
                          <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className="bg-brand-500 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.round(((camp.usedCount || 0) / camp.usageLimit) * 100))}%`,
                              }}
                            />
                          </div>
                        )}
                        {camp.budget && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            งบ: ฿{camp.budget.toLocaleString("th-TH")}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Action buttons based on State Machine */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {camp.status === "draft" && (
                            <>
                              <button
                                onClick={() => openEditModal(camp)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
                                title="แก้ไขฉบับร่าง"
                              >
                                แก้ไข
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    title: "ยืนยันส่งขออนุมัติ",
                                    message: `คุณต้องการส่งแคมเปญ "${camp.name}" (${camp.code}) เพื่อขออนุมัติใช่หรือไม่?`,
                                    confirmLabel: "ส่งขออนุมัติ",
                                    actionFn: () =>
                                      triggerAction(
                                        `/api/products/campaigns/${camp.id}/submit`,
                                        "ส่งขออนุมัติแคมเปญสำเร็จ",
                                      ),
                                  })
                                }
                                className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 transition shadow-xs"
                              >
                                ส่งขออนุมัติ
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    title: "ยืนยันการลบแคมเปญ",
                                    message: `คุณต้องการลบแคมเปญฉบับร่าง "${camp.name}" (${camp.code}) ใช่หรือไม่? ข้อมูลนี้จะถูกลบถาวร`,
                                    confirmLabel: "ลบแคมเปญ",
                                    variant: "danger",
                                    actionFn: () =>
                                      triggerAction(
                                        `/api/products/campaigns/${camp.id}`,
                                        "ลบแคมเปญฉบับร่างเรียบร้อยแล้ว",
                                        "DELETE",
                                      ),
                                  })
                                }
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                                title="ลบฉบับร่างนี้"
                              >
                                ลบ
                              </button>
                            </>
                          )}

                          {camp.status === "pending_approval" && (
                            <>
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    title: "ยืนยันอนุมัติแคมเปญ",
                                    message: `คุณต้องการอนุมัติแคมเปญ "${camp.name}" (${camp.code}) ใช่หรือไม่? (ระบบจะบันทึก Audit Log)`,
                                    confirmLabel: "อนุมัติแคมเปญ",
                                    actionFn: () =>
                                      triggerAction(
                                        `/api/products/campaigns/${camp.id}/approve`,
                                        "อนุมัติแคมเปญเรียบร้อยแล้ว",
                                      ),
                                  })
                                }
                                className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 transition shadow-xs"
                              >
                                อนุมัติ
                              </button>
                              <button
                                onClick={() => {
                                  setRejectTarget(camp);
                                  setRejectReason("");
                                }}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                              >
                                ปฏิเสธ
                              </button>
                            </>
                          )}

                          {camp.status === "approved" && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  title: "ยืนยันเผยแพร่แคมเปญ",
                                  message: `เมื่อเผยแพร่แคมเปญ "${camp.name}" (${camp.code}) ผู้ซื้อจะสามารถเห็นและเริ่มกดเก็บคูปองได้ตามวันเวลาที่กำหนด`,
                                  confirmLabel: "เผยแพร่แคมเปญ",
                                  actionFn: () =>
                                    triggerAction(
                                      `/api/products/campaigns/${camp.id}/publish`,
                                      "เผยแพร่แคมเปญเปิดให้ใช้งานแล้ว",
                                    ),
                                })
                              }
                              className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition shadow-xs"
                            >
                              เผยแพร่ (Publish)
                            </button>
                          )}

                          {camp.status === "published" && !isExpired && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  title: "ยืนยันสิ้นสุดแคมเปญ",
                                  message: `คุณต้องการสั่งปิดแคมเปญ "${camp.name}" (${camp.code}) ทันทีใช่หรือไม่? ผู้ซื้อจะไม่สามารถกดเก็บสิทธิ์เพิ่มได้`,
                                  confirmLabel: "ปิดแคมเปญ",
                                  variant: "danger",
                                  actionFn: () =>
                                    triggerAction(
                                      `/api/products/campaigns/${camp.id}/end`,
                                      "ปิดแคมเปญเรียบร้อยแล้ว",
                                    ),
                                })
                              }
                              className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition shadow-xs"
                            >
                              ปิดแคมเปญ
                            </button>
                          )}

                          {(camp.status === "ended" || isExpired) && (
                            <span className="text-[11px] text-slate-400 font-medium px-2 py-1">
                              สิ้นสุดแล้ว
                            </span>
                          )}

                          {camp.status === "rejected" && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  title: "ยืนยันการลบแคมเปญ",
                                  message: `คุณต้องการลบแคมเปญที่ถูกปฏิเสธ "${camp.name}" (${camp.code}) ใช่หรือไม่?`,
                                  confirmLabel: "ลบแคมเปญ",
                                  variant: "danger",
                                  actionFn: () =>
                                    triggerAction(
                                      `/api/products/campaigns/${camp.id}`,
                                      "ลบแคมเปญเรียบร้อยแล้ว",
                                      "DELETE",
                                    ),
                                })
                              }
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                              title="ลบแคมเปญที่ถูกปฏิเสธ"
                            >
                              ลบ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal สร้าง / แก้ไขแคมเปญ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCampaign ? "แก้ไขแคมเปญฉบับร่าง" : "สร้างแคมเปญโปรโมชันใหม่"}
      >
        <form onSubmit={handleSaveCampaign} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                รหัสโค้ดโปรโมชัน (Code) *
              </label>
              <input
                type="text"
                placeholder="เช่น SUMMER20, DENIM50"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                className="w-full font-mono font-bold uppercase rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ประเภทส่วนลด *
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="PERCENT">ลดเป็นเปอร์เซ็นต์ (%)</option>
                <option value="FIXED">ลดเป็นจำนวนเงินคงที่ (บาท)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ชื่อแคมเปญ *
            </label>
            <input
              type="text"
              placeholder="เช่น ลดพิเศษต้อนรับซัมเมอร์สำหรับคนรักยีนส์"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              รายละเอียดเงื่อนไข (Description)
            </label>
            <textarea
              rows={2}
              placeholder="ระบุรายละเอียดเพิ่มเติมสำหรับแสดงให้ลูกค้าเห็น..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {discountType === "PERCENT"
                  ? "เปอร์เซ็นต์ส่วนลด (%) *"
                  : "มูลค่าส่วนลด (บาท) *"}
              </label>
              <input
                type="number"
                min="1"
                max={discountType === "PERCENT" ? "100" : undefined}
                placeholder={discountType === "PERCENT" ? "1-100" : "50"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {discountType === "PERCENT"
                  ? "เพดานลดสูงสุด (บาท, ไม่บังคับ)"
                  : "เพดานลดสูงสุด"}
              </label>
              <input
                type="number"
                min="1"
                disabled={discountType !== "PERCENT"}
                placeholder={discountType === "PERCENT" ? "เช่น 200" : "ไม่จำเป็น"}
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ยอดซื้อขั้นต่ำ (บาท)
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={minOrderPrice}
                onChange={(e) => setMinOrderPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                หมวดหมู่สินค้าที่ใช้ได้
              </label>
              <select
                value={applicableCategory}
                onChange={(e) => setApplicableCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">ใช้ได้กับทุกหมวดหมู่</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                จำนวนสิทธิ์ใช้งานรวม (สิทธิ์)
              </label>
              <input
                type="number"
                min="1"
                placeholder="เช่น 100 (ไม่บังคับ)"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                เพดานงบประมาณรวม (Budget, บาท)
              </label>
              <input
                type="number"
                min="1"
                placeholder="เช่น 50000 (ไม่บังคับ)"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                วันเวลาเริ่มต้น *
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                วันเวลาสิ้นสุด *
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              ยกเลิก
            </button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกแคมเปญ"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal ปฏิเสธแคมเปญ */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="ระบุเหตุผลในการปฏิเสธแคมเปญ"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            คุณกำลังปฏิเสธแคมเปญ{" "}
            <span className="font-bold text-slate-800">
              "{rejectTarget?.name}" ({rejectTarget?.code})
            </span>
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              เหตุผลประกอบการปฏิเสธ (จะถูกบันทึกลงในแคมเปญ)
            </label>
            <textarea
              rows={3}
              placeholder="เช่น งบประมาณเกินกำหนด, อัตราส่วนลดสูงเกินไป..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              disabled={rejecting}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 shadow-sm transition"
            >
              {rejecting ? "กำลังปฏิเสธ..." : "ยืนยันปฏิเสธ"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Action Dialog */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || "ยืนยันการดำเนินการ"}
        message={confirmAction?.message || ""}
        confirmLabel={confirmAction?.confirmLabel || "ยืนยัน"}
        variant={confirmAction?.variant || "primary"}
        loading={actionLoading}
        onConfirm={() => confirmAction?.actionFn?.()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
