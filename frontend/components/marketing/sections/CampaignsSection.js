"use client";

import { useEffect, useState } from "react";
import Button from "../../ui/Button";
import Modal from "../../ui/Modal";
import EmptyState from "../../ui/EmptyState";
import ErrorState from "../../ui/ErrorState";
import Skeleton from "../../ui/Skeleton";
import ConfirmDialog from "../../ui/ConfirmDialog";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import RadioSelect from "../../ui/RadioSelect";
import { apiFetch } from "../../../lib/api";
import { fetchCategories } from "../../../lib/catalog";
import { MARKETING_PAGE_SIZE } from "../marketingConstants";
import MarketingPagination from "./MarketingPagination";

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

const DISCOUNT_TYPE_OPTIONS = [
  { value: "PERCENT", label: "ลดเป็นเปอร์เซ็นต์ (%)" },
  { value: "FIXED", label: "ลดเป็นจำนวนเงินคงที่ (บาท)" },
];

const SEGMENT_FIELD_OPTIONS = [
  { value: "brandPreference", label: "แบรนด์ที่สนใจ (brandPreference)" },
  { value: "favoriteCategory", label: "หมวดหมู่ที่สนใจ (favoriteCategory)" },
  { value: "styleTag", label: "สไตล์แฟชั่นที่สนใจ (styleTag)" },
];

const SEGMENT_OP_BRAND_OPTIONS = [
  { value: "in", label: "ให้เฉพาะกลุ่มนี้" },
  { value: "nin", label: "ยกเว้นกลุ่มนี้" },
];

const SEGMENT_OP_GENERAL_OPTIONS = [
  { value: "eq", label: "ให้เฉพาะกลุ่มนี้" },
  { value: "neq", label: "ยกเว้นกลุ่มนี้" },
];

const STYLE_TAG_OPTIONS = [
  { value: "", label: "-- เลือกสไตล์ --" },
  { value: "streetwear", label: "Streetwear" },
  { value: "vintage", label: "Vintage" },
  { value: "minimal", label: "Minimal" },
  { value: "y2k", label: "Y2K" },
  { value: "casual", label: "Casual" },
  { value: "sportswear", label: "Sportswear" },
  { value: "workwear", label: "Workwear" },
];

const SCORE_BAND_PLACEHOLDERS = [
  { key: "none", min: 0, max: 0 },
  { key: "emerging", min: 1, max: 6 },
  { key: "moderate", min: 7, max: 14 },
  { key: "high", min: 15, max: 24 },
  { key: "very_high", min: 25, max: 33 },
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

function toLocalDatetimeInput(date) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSegmentSummary(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return "ทุกคน";
  const r = rules[0];
  const fieldLabels = {
    favoriteCategory: "หมวดที่ชอบ",
    preferredSize: "ไซส์",
    sizePreference: "ไซส์",
    styleTag: "สไตล์",
    stylePreference: "สไตล์",
    brandPreference: "แบรนด์ที่สนใจ",
  };
  const label = fieldLabels[r.field] || r.field;
  const val = Array.isArray(r.value) ? r.value.join(", ") : r.value;
  return `${label}: ${val}`;
}

function formatAudienceSummary(criteria) {
  if (!criteria) return "ทุกคน";
  const dimensions = [
    ["category", "หมวดหมู่"],
    ["brand", "แบรนด์"],
    ["style", "สไตล์"],
    ["size", "ไซซ์"],
  ]
    .filter(([key]) => criteria[key])
    .map(([key, label]) => `${label}: ${criteria[key]}`);
  return `${dimensions.join(" · ")} · คะแนน ${criteria.minScore ?? 1}–${criteria.maxScore ?? 33}`;
}

function campaignEndLabel(campaign, isExpired) {
  if (isExpired || campaign.endReason === "EXPIRED") {
    return "สิ้นสุดแล้ว (หมดเวลา)";
  }
  if (campaign.endReason === "BUDGET_EXHAUSTED") {
    return "สิ้นสุดแล้ว (วงเงินครบ)";
  }
  if (campaign.endReason === "USAGE_LIMIT_REACHED") {
    return "สิ้นสุดแล้ว (สิทธิ์หมด)";
  }
  if (campaign.endReason === "ADMIN_CLOSED") {
    return "สิ้นสุดแล้ว (ปิดโดยผู้ดูแล)";
  }
  return "สิ้นสุดแล้ว";
}

function CampaignCouponPreview({ campaign }) {
  const isPercent = campaign.discountType === "PERCENT";
  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">
            ตัวอย่างคูปอง
          </div>
          <div className="mt-1 truncate font-mono text-base font-bold text-slate-900">
            {campaign.code || "รหัสคูปอง"}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-700">
            {campaign.name || "ชื่อแคมเปญ"}
          </div>
        </div>
        <div className="rounded-xl bg-brand-600 px-3 py-2 text-right text-white">
          <div className="text-[10px] opacity-80">รับส่วนลด</div>
          <div className="text-lg font-bold leading-none">
            {isPercent
              ? `${campaign.discountValue || 0}%`
              : `฿${Number(campaign.discountValue || 0).toLocaleString("th-TH")}`}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
        <div>
          ยอดซื้อขั้นต่ำ ฿
          {Number(campaign.minOrderPrice || 0).toLocaleString("th-TH")}
        </div>
        <div>ใช้กับ {campaign.applicableCategory || "ทุกหมวดหมู่"}</div>
        {isPercent && campaign.maxDiscount ? (
          <div>
            ลดสูงสุด ฿{Number(campaign.maxDiscount).toLocaleString("th-TH")}
          </div>
        ) : null}
        <div>
          กลุ่มเป้าหมาย:{" "}
          {campaign.audienceCriteria
            ? formatAudienceSummary(campaign.audienceCriteria)
            : formatSegmentSummary(campaign.targetSegment)}
        </div>
      </div>
      {campaign.description ? (
        <p className="mt-3 border-t border-brand-100 pt-2 text-[11px] text-slate-500">
          {campaign.description}
        </p>
      ) : null}
    </div>
  );
}

export default function CampaignsSection({
  token,
  audienceSeed,
  onAudienceSeedConsumed,
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState(null);

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

  // Target Segment state
  const [segmentMode, setSegmentMode] = useState("all"); // "all" | "score" | "legacy"
  const [segmentField, setSegmentField] = useState("brandPreference");
  const [segmentOp, setSegmentOp] = useState("in");
  const [segmentValue, setSegmentValue] = useState("");
  const [availableBrands, setAvailableBrands] = useState([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [brandsError, setBrandsError] = useState("");
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [audienceOptions, setAudienceOptions] = useState(null);
  const [audienceCategory, setAudienceCategory] = useState("");
  const [audienceBrand, setAudienceBrand] = useState("");
  const [audienceStyle, setAudienceStyle] = useState("");
  const [audienceMinScore, setAudienceMinScore] = useState("15");
  const [audienceMaxScore, setAudienceMaxScore] = useState("33");
  const [audienceFrom, setAudienceFrom] = useState("");
  const [audienceTo, setAudienceTo] = useState("");
  const [audiencePreview, setAudiencePreview] = useState(null);
  const [audiencePreviewStale, setAudiencePreviewStale] = useState(false);
  const [audiencePreviewLoading, setAudiencePreviewLoading] = useState(false);
  const [audiencePreviewError, setAudiencePreviewError] = useState("");

  const trimmedSearch = brandSearch.trim();
  const isBrandSelectDisabled =
    loadingBrands || !!brandsError || availableBrands.length === 0;
  const exactMatchBrand = trimmedSearch
    ? availableBrands.find(
        (b) =>
          b.trim().toLowerCase() === trimmedSearch.toLowerCase() &&
          !selectedBrands.some(
            (sb) => sb.trim().toLowerCase() === b.trim().toLowerCase(),
          ),
      ) || null
    : null;
  const filteredBrands = availableBrands
    .filter((b) => {
      if (!trimmedSearch) return true;
      return b.toLowerCase().includes(trimmedSearch.toLowerCase());
    })
    .filter(
      (b) => !selectedBrands.some((sb) => sb.toLowerCase() === b.toLowerCase()),
    );

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [viewCampaign, setViewCampaign] = useState(null);

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

  async function loadCampaigns(pageToLoad = page) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", pageToLoad);
      params.set("limit", MARKETING_PAGE_SIZE);

      const data = await apiFetch(`/api/products/campaigns?${params}`, {
        token,
      });
      const items = data.items || [];
      const totalCount = data.total ?? items.length;
      const calculatedTotalPages = Math.max(
        1,
        data.totalPages ?? Math.ceil(totalCount / MARKETING_PAGE_SIZE),
      );

      if (calculatedTotalPages > 0 && pageToLoad > calculatedTotalPages) {
        setPage(calculatedTotalPages);
        loadCampaigns(calculatedTotalPages);
        return;
      }

      setCampaigns(items);
      setTotal(totalCount);
      setTotalPages(calculatedTotalPages);
      setSummary(data.summary || null);
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
    let cancelled = false;
    setLoadingBrands(true);
    setBrandsError("");
    apiFetch("/api/products/filters")
      .then((data) => {
        if (!cancelled) {
          if (data && Array.isArray(data.brands)) {
            setAvailableBrands(data.brands.filter(Boolean));
          } else {
            setAvailableBrands([]);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Could not load filter brands:", err);
          setBrandsError("ไม่สามารถโหลดรายชื่อแบรนด์จากระบบได้");
          setAvailableBrands([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBrands(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/products/campaigns/audience/options", { token })
      .then((result) => {
        if (!cancelled) setAudienceOptions(result);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Could not load audience options:", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    setPage(1);
    loadCampaigns(1);
  }, [token, statusFilter]);

  useEffect(() => {
    if (!audienceSeed) return;
    openCreateModal(audienceSeed);
    onAudienceSeedConsumed?.();
  }, [audienceSeed]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadCampaigns(1);
  }

  function handleSelectBrand(name) {
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const matchedBrand = availableBrands.find(
      (b) => b.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (!matchedBrand) return;
    const lower = matchedBrand.toLowerCase();
    if (selectedBrands.some((b) => b.trim().toLowerCase() === lower)) {
      setBrandSearch("");
      return;
    }
    setSelectedBrands((prev) => [...prev, matchedBrand]);
    setBrandSearch("");
  }

  function handleRemoveBrand(nameToRemove) {
    setSelectedBrands((prev) =>
      prev.filter(
        (b) => b.trim().toLowerCase() !== nameToRemove.trim().toLowerCase(),
      ),
    );
  }

  function resetAudienceEditor(criteria = null) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const normalized = (value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "";
    setAudienceCategory(normalized(criteria?.category));
    setAudienceBrand(normalized(criteria?.brand));
    setAudienceStyle(normalized(criteria?.style));
    setAudienceMinScore(String(criteria?.minScore ?? 15));
    setAudienceMaxScore(String(Math.min(Number(criteria?.maxScore ?? 33), 33)));
    setAudienceFrom(
      criteria?.from ? toLocalDatetimeInput(criteria.from) : toLocalDatetimeInput(from),
    );
    setAudienceTo(
      criteria?.to ? toLocalDatetimeInput(criteria.to) : toLocalDatetimeInput(to),
    );
    setAudiencePreview(null);
    setAudiencePreviewStale(false);
    setAudiencePreviewError("");
  }

  function openCreateModal(prefilledAudience = null) {
    const audienceCriteria =
      prefilledAudience && !prefilledAudience.nativeEvent
        ? prefilledAudience
        : null;
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
    setSegmentMode(audienceCriteria ? "score" : "all");
    setSegmentField("brandPreference");
    setSegmentOp("in");
    setSelectedBrands([]);
    setBrandSearch("");
    setSegmentValue("");
    resetAudienceEditor(audienceCriteria);

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

    resetAudienceEditor(camp.audienceCriteria || null);
    const rule =
      Array.isArray(camp.targetSegment) && camp.targetSegment.length > 0
        ? camp.targetSegment[0]
        : null;
    if (camp.audienceCriteria) {
      setSegmentMode("score");
      setSegmentField("brandPreference");
      setSegmentOp("in");
      setSelectedBrands([]);
      setSegmentValue("");
    } else if (rule && rule.field) {
      setSegmentMode("legacy");
      setSegmentField(rule.field);
      const rawOp = rule.operator || rule.op;
      let op = rawOp;
      if (rule.field === "brandPreference") {
        if (rawOp === "neq" || rawOp === "nin") {
          op = "nin";
        } else {
          op = "in";
        }
      } else {
        op = rawOp || "eq";
      }
      setSegmentOp(op);
      if (rule.field === "brandPreference") {
        const rawBrands = Array.isArray(rule.value)
          ? rule.value
          : typeof rule.value === "string"
            ? rule.value
                .split(",")
                .map((b) => b.trim())
                .filter(Boolean)
            : [];
        const seen = new Set();
        const brandList = [];
        for (const b of rawBrands) {
          const lower = b.trim().toLowerCase();
          if (lower && !seen.has(lower)) {
            seen.add(lower);
            brandList.push(b.trim());
          }
        }
        setSelectedBrands(brandList);
        setSegmentValue("");
      } else {
        setSelectedBrands([]);
        setSegmentValue(
          Array.isArray(rule.value)
            ? rule.value.join(", ")
            : String(rule.value ?? ""),
        );
      }
    } else {
      setSegmentMode("all");
      setSegmentField("brandPreference");
      setSegmentOp("in");
      setSelectedBrands([]);
      setSegmentValue("");
    }
    setBrandSearch("");

    setFormError("");
    setModalOpen(true);
  }

  function openDuplicateModal(camp) {
    openEditModal(camp);
    setEditingCampaign(null);
    setCode("");
    setName(`${camp.name} (สำเนา)`);
    const now = new Date();
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setStartsAt(toLocalDatetimeInput(now));
    setEndsAt(toLocalDatetimeInput(nextMonth));
  }

  function buildAudienceCriteria() {
    const criteria = {
      category: audienceCategory.trim() || undefined,
      brand: audienceBrand.trim() || undefined,
      style: audienceStyle.trim() || undefined,
      minScore: Number(audienceMinScore),
      maxScore: Number(audienceMaxScore),
      from: audienceFrom ? new Date(audienceFrom).toISOString() : undefined,
      to: audienceTo ? new Date(audienceTo).toISOString() : undefined,
    };
    if (!criteria.category && !criteria.brand && !criteria.style) {
      throw new Error("กรุณาเลือกอย่างน้อย 1 เป้าหมายจากหมวดหมู่ แบรนด์ หรือสไตล์");
    }
    if (
      !Number.isFinite(criteria.minScore) ||
      !Number.isFinite(criteria.maxScore) ||
      !Number.isInteger(criteria.minScore) ||
      !Number.isInteger(criteria.maxScore) ||
      criteria.minScore < 0 ||
      criteria.maxScore > 33 ||
      criteria.minScore > criteria.maxScore
    ) {
      throw new Error("ช่วงคะแนนต้องอยู่ระหว่าง 0–33 และคะแนนเริ่มต้นต้องไม่มากกว่าคะแนนสิ้นสุด");
    }
    if (!criteria.from || !criteria.to || new Date(criteria.from) >= new Date(criteria.to)) {
      throw new Error("ช่วงเวลาที่ใช้คำนวณคะแนนไม่ถูกต้อง");
    }
    return criteria;
  }

  async function handlePreviewAudience() {
    setAudiencePreviewError("");
    let criteria;
    try {
      criteria = buildAudienceCriteria();
    } catch (validationError) {
      setAudiencePreviewError(validationError.message);
      return;
    }
    setAudiencePreviewLoading(true);
    try {
      const result = await apiFetch("/api/products/campaigns/audience/preview", {
        method: "POST",
        token,
        body: criteria,
      });
      setAudiencePreview(result);
      setAudiencePreviewStale(false);
    } catch (requestError) {
      setAudiencePreviewStale(Boolean(audiencePreview));
      setAudiencePreviewError(
        requestError.message || "ไม่สามารถคำนวณกลุ่มเป้าหมายได้",
      );
    } finally {
      setAudiencePreviewLoading(false);
    }
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
    const minimumOrder = Number(minOrderPrice) || 0;
    const configuredBudget = budget ? Number(budget) : null;
    const configuredUsageLimit = usageLimit ? Number(usageLimit) : null;
    if (discountType === "FIXED" && val >= minimumOrder) {
      setFormError(
        "ส่วนลดคงที่ต้องน้อยกว่ายอดซื้อขั้นต่ำ เพื่อไม่ให้ยอดชำระเป็นศูนย์หรือติดลบ",
      );
      return;
    }
    if (
      discountType === "FIXED" &&
      configuredBudget !== null &&
      configuredUsageLimit !== null &&
      configuredBudget < configuredUsageLimit * val
    ) {
      setFormError(
        "งบประมาณต้องไม่น้อยกว่าจำนวนสิทธิ์คูณส่วนลดคงที่ต่อครั้ง",
      );
      return;
    }
    if (!startsAt || !endsAt) {
      setFormError("กรุณาระบุทั้งวันเวลาเริ่มต้นและสิ้นสุด");
      return;
    }
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    const now = new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setFormError("รูปแบบวันเวลาเริ่มต้นหรือสิ้นสุดไม่ถูกต้อง");
      return;
    }
    if (endDate.getTime() <= now.getTime()) {
      setFormError(
        "ไม่สามารถกำหนดช่วงเวลาที่สิ้นสุดไปแล้วได้ วันเวลาสิ้นสุดต้องอยู่ในอนาคต",
      );
      return;
    }
    if (endDate <= startDate) {
      setFormError("วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น");
      return;
    }
    if (startDate.getTime() < now.getTime() - 60000) {
      setFormError("ไม่สามารถกำหนดวันเวลาเริ่มต้นย้อนหลังในอดีตได้");
      return;
    }

    let targetSegment = null;
    let audienceCriteria = null;
    if (segmentMode === "score") {
      try {
        audienceCriteria = buildAudienceCriteria();
      } catch (validationError) {
        setFormError(validationError.message);
        return;
      }
    } else if (segmentMode === "legacy") {
      if (segmentField === "brandPreference") {
        if (!selectedBrands || selectedBrands.length === 0) {
          setFormError("กรุณาระบุหรือเลือกอย่างน้อย 1 แบรนด์เป้าหมาย");
          return;
        }
        targetSegment = [
          {
            field: "brandPreference",
            operator: segmentOp === "nin" ? "nin" : "in",
            value: selectedBrands,
          },
        ];
      } else {
        const trimmedVal = segmentValue.trim();
        if (!trimmedVal) {
          setFormError("กรุณาระบุหรือเลือกค่าเป้าหมาย");
          return;
        }
        let finalVal = trimmedVal;
        if (
          (segmentOp === "in" || segmentOp === "nin") &&
          finalVal.includes(",")
        ) {
          finalVal = finalVal
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        targetSegment = [
          {
            field: segmentField,
            operator: segmentOp,
            value: finalVal,
          },
        ];
      }
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
        targetSegment,
        audienceCriteria,
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
  async function triggerAction(
    endpoint,
    successMsg,
    method = "POST",
    body,
  ) {
    setActionLoading(true);
    try {
      const result = await apiFetch(endpoint, {
        method,
        token,
        ...(body ? { body } : {}),
      });
      const warnings = result?.notificationWarnings || result?.chatWarnings;
      showToast(
        Array.isArray(warnings) && warnings.length
          ? `${successMsg} แต่ ${warnings.join(" · ")}`
          : successMsg,
      );
      setConfirmAction(null);
      loadCampaigns();
    } catch (err) {
      console.error("Lifecycle action failed:", err);
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  function openEndCampaignConfirmation(campaign, { cancellation = false } = {}) {
    const actionLabel = cancellation ? "ยกเลิกแคมเปญ" : "ปิดแคมเปญ";
    setConfirmAction({
      title: cancellation
        ? "ยืนยันยกเลิกแคมเปญ"
        : "ยืนยันสิ้นสุดแคมเปญ",
      message: cancellation
        ? `คุณต้องการยกเลิกแคมเปญ "${campaign.name}" (${campaign.code}) ใช่หรือไม่? แคมเปญนี้จะไม่สามารถเผยแพร่ได้อีก`
        : `คุณต้องการสั่งปิดแคมเปญ "${campaign.name}" (${campaign.code}) ทันทีใช่หรือไม่? ผู้ซื้อจะไม่สามารถกดเก็บสิทธิ์เพิ่มได้`,
      confirmLabel: actionLabel,
      tone: "danger",
      reason: "required",
      reasonLabel: `เหตุผลที่${actionLabel}`,
      reasonHint: "เหตุผลนี้จะถูกบันทึกใน Audit Log",
      actionFn: (reason) =>
        triggerAction(
          `/api/products/campaigns/${campaign.id}/end`,
          `${actionLabel}เรียบร้อยแล้ว`,
          "POST",
          { reason },
        ),
    });
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

  // Summary KPIs (aggregated across dataset before pagination)
  const totalCampaigns = summary?.total ?? total ?? campaigns.length;
  const now = new Date();
  const publishedCount =
    summary?.published ??
    campaigns.filter(
      (c) =>
        c.status === "published" &&
        new Date(c.startsAt) <= now &&
        new Date(c.endsAt) >= now,
    ).length;
  const pendingCount =
    summary?.pending ??
    campaigns.filter((c) => c.status === "pending_approval").length;
  const totalClaimed =
    summary?.totalClaimed ??
    campaigns.reduce(
      (sum, c) => sum + (c._count?.vouchers || c.usedCount || 0),
      0,
    );
  const percentageBudgetWarning =
    discountType === "PERCENT" &&
    Boolean(budget) &&
    Boolean(usageLimit) &&
    (!maxDiscount ||
      Number(budget) < Number(usageLimit) * Number(maxDiscount));
  const previewTargetSegment =
    segmentMode !== "legacy"
      ? null
      : [
          {
            field: segmentField,
            value:
              segmentField === "brandPreference"
                ? selectedBrands
                : segmentValue,
          },
        ];
  const campaignPreview = {
    code,
    name,
    description,
    discountType,
    discountValue,
    minOrderPrice,
    maxDiscount,
    applicableCategory,
    targetSegment: previewTargetSegment,
    audienceCriteria:
      segmentMode === "score"
        ? {
            category: audienceCategory,
            brand: audienceBrand,
            style: audienceStyle,
            minScore: audienceMinScore,
            maxScore: audienceMaxScore,
          }
        : null,
  };
  const audienceDimensionFields = [
    ["หมวดหมู่", audienceCategory, setAudienceCategory, audienceOptions?.dimensions?.categories || []],
    ["แบรนด์", audienceBrand, setAudienceBrand, audienceOptions?.dimensions?.brands || []],
    ["สไตล์", audienceStyle, setAudienceStyle, audienceOptions?.dimensions?.styles || []],
  ];
  const audiencePreviewStats = [
    ["ได้สิทธิ์", audiencePreview ? `${audiencePreview.eligibleCustomers} คน` : "—"],
    ["คะแนนต่ำสุด", audiencePreview?.minimumObserved ?? "—"],
    ["คะแนนสูงสุด", audiencePreview?.maximumObserved ?? "—"],
    ["คะแนนเฉลี่ย", audiencePreview?.averageScore ?? "—"],
    ["ค่ากลาง", audiencePreview?.medianScore ?? "—"],
    [
      "สูงสุดที่เป็นไปได้",
      audiencePreview
        ? `${audiencePreview.maximumPossible} / ${audiencePreview.globalMaximum}`
        : `— / ${audienceOptions?.globalMaximum || 33}`,
    ],
  ];
  const audienceDistribution = audiencePreview?.distribution ||
    audienceOptions?.scoreBands || SCORE_BAND_PLACEHOLDERS;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 max-w-[calc(100vw-2rem)] sm:max-w-md z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl transition-all animate-in fade-in slide-in-from-bottom-5">
          <span className="material-symbols-outlined text-emerald-400 text-lg shrink-0">
            check_circle
          </span>
          <span className="truncate">{toastMessage}</span>
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
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 px-4 rounded-xl shadow-sm w-full sm:w-auto justify-center shrink-0"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          สร้างแคมเปญใหม่
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-4 gap-3">
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
            <span className="material-symbols-outlined text-lg">campaign</span>
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
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 items-center gap-2 w-full"
        >
          <div className="relative flex-1 min-w-0">
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
            className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition shrink-0"
          >
            ค้นหา
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs font-semibold text-slate-500 shrink-0">
            สถานะ:
          </label>
          <DropdownFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            align="right"
          />
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
          <div>
            <table className="w-full table-fixed text-left text-xs [&_th]:px-2 [&_td]:px-2 xl:[&_th]:px-4 xl:[&_td]:px-4 [&_td]:break-words">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[11%]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </colgroup>
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
                  const isExpired =
                    (camp.status === "published" ||
                      camp.status === "approved") &&
                    new Date(camp.endsAt) < now;
                  const effectiveStatus = isExpired ? "ended" : camp.status;
                  const statusInfo = isExpired
                    ? {
                        label: campaignEndLabel(camp, true),
                        color: "bg-purple-50 text-purple-700 border-purple-200",
                      }
                    : {
                        ...(STATUS_MAP[effectiveStatus] || {
                          label: camp.status,
                          color: "bg-slate-100 text-slate-700",
                        }),
                      };
                  if (effectiveStatus === "ended") {
                    statusInfo.label = campaignEndLabel(camp, false);
                  }
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
                          <span title={camp.code} className="min-w-0 truncate font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {camp.code}
                          </span>
                        </div>
                        <div title={camp.name} className="font-semibold text-slate-800 mt-1 line-clamp-1">
                          {camp.name}
                        </div>
                        {camp.description && (
                          <div title={camp.description} className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
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
                        {camp.audienceCriteria ||
                        (Array.isArray(camp.targetSegment) &&
                          camp.targetSegment.length > 0) ? (
                          <div className="mt-1">
                            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                              <span className="material-symbols-outlined text-[12px]">
                                group
                              </span>
                              {camp.audienceCriteria
                                ? `${formatAudienceSummary(camp.audienceCriteria)} · ${camp.audienceSize ?? 0} สิทธิ์`
                                : formatSegmentSummary(camp.targetSegment)}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            กลุ่มเป้าหมาย: ทุกคน
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-[11px] text-slate-600 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                            title="วันเวลาเริ่มต้น"
                          />
                          <span>
                            เปิด:{" "}
                            <strong className="font-semibold text-slate-700">
                              {formatThaiDateTime(camp.startsAt)}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"
                            title="วันเวลาสิ้นสุด"
                          />
                          <span>
                            ปิด:{" "}
                            <strong className="font-semibold text-slate-700">
                              {formatThaiDateTime(camp.endsAt)}
                            </strong>
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">
                          เก็บ {camp.claimedCount ?? camp.usedCount ?? 0}
                          {camp.usageLimit
                            ? ` / โควตา ${camp.usageLimit}`
                            : " / ไม่จำกัด"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          ใช้สำเร็จ {camp.redeemedCount ?? 0} สิทธิ์
                        </div>
                        {camp.usageLimit && (
                          <div className="w-16 max-w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className="bg-brand-500 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.round(((camp.usedCount || 0) / camp.usageLimit) * 100))}%`,
                              }}
                            />
                          </div>
                        )}
                        {camp.budget ? (
                          <>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                              {`ใช้งบ ฿${Number(camp.spentBudget || 0).toLocaleString("th-TH")} / งบ ฿${camp.budget.toLocaleString("th-TH")}`}
                            </div>
                            <div
                              className="w-16 max-w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1"
                              title="สัดส่วนงบประมาณที่ใช้"
                            >
                              <div
                                className={`h-full rounded-full ${
                                  (camp.spentBudget || 0) >= camp.budget
                                    ? "bg-rose-500"
                                    : "bg-amber-500"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round(
                                      ((camp.spentBudget || 0) / camp.budget) *
                                        100,
                                    ),
                                  )}%`,
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-[10px] font-medium text-slate-500">
                            ไม่จำกัดงบ
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex max-w-full items-center justify-center px-2 py-0.5 rounded-full text-center text-[11px] font-semibold border ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Action buttons based on State Machine */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5 [&_button]:max-w-full [&_button]:whitespace-normal">
                          <button
                            type="button"
                            onClick={() => setViewCampaign(camp)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            title="ดูรายละเอียดแคมเปญ"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              visibility
                            </span>
                            ดู
                          </button>
                          <button
                            type="button"
                            onClick={() => openDuplicateModal(camp)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            title="สร้างฉบับร่างจากแคมเปญนี้"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              content_copy
                            </span>
                            สร้างซ้ำ
                          </button>
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

                          {camp.status === "approved" && !isExpired && (
                            <>
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
                              <button
                                onClick={() =>
                                  openEndCampaignConfirmation(camp, {
                                    cancellation: true,
                                  })
                                }
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                              >
                                ยกเลิกแคมเปญ
                              </button>
                            </>
                          )}

                          {camp.status === "published" && !isExpired && (
                            <button
                              onClick={() => openEndCampaignConfirmation(camp)}
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
          <MarketingPagination
            page={page}
            totalPages={totalPages}
            total={total}
            loading={loading}
            onPageChange={(p) => {
              setPage(p);
              loadCampaigns(p);
            }}
          />
        </div>
      )}

      <Modal
        open={Boolean(viewCampaign)}
        onClose={() => setViewCampaign(null)}
        title="รายละเอียดแคมเปญ"
        size="lg"
      >
        {viewCampaign && (
          <div className="space-y-4">
            <CampaignCouponPreview campaign={viewCampaign} />
            <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">ช่วงเวลาเริ่ม</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {formatThaiDateTime(viewCampaign.startsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">ช่วงเวลาสิ้นสุด</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {formatThaiDateTime(viewCampaign.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">จำนวนสิทธิ์</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  เก็บ {viewCampaign.claimedCount ?? viewCampaign.usedCount ?? 0}
                  {viewCampaign.usageLimit
                    ? ` / โควตา ${viewCampaign.usageLimit}`
                    : " / ไม่จำกัด"}
                  {` · ใช้สำเร็จ ${viewCampaign.redeemedCount ?? 0}`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">งบประมาณ</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {viewCampaign.budget
                    ? `ใช้งบ ฿${Number(viewCampaign.spentBudget || 0).toLocaleString("th-TH")} / งบ ฿${Number(viewCampaign.budget).toLocaleString("th-TH")}`
                    : "ไม่จำกัดงบ"}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      {/* Modal สร้าง / แก้ไขแคมเปญ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingCampaign ? "แก้ไขแคมเปญฉบับร่าง" : "สร้างแคมเปญโปรโมชันใหม่"
        }
      >
        <form onSubmit={handleSaveCampaign} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label
                htmlFor="campaign-discount-type"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                ประเภทส่วนลด *
              </label>
              <RadioSelect
                id="campaign-discount-type"
                name="discountType"
                value={discountType}
                onChange={setDiscountType}
                options={DISCOUNT_TYPE_OPTIONS}
                variant="form"
                size="sm"
                className="w-full"
                buttonClassName="w-full"
              />
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

          <CampaignCouponPreview campaign={campaignPreview} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                placeholder={
                  discountType === "PERCENT" ? "เช่น 200" : "ไม่จำเป็น"
                }
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <label
                htmlFor="campaign-applicable-category"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                หมวดหมู่สินค้าที่ใช้ได้
              </label>
              <RadioSelect
                id="campaign-applicable-category"
                name="applicableCategory"
                value={applicableCategory}
                onChange={setApplicableCategory}
                options={[
                  { value: "", label: "ใช้ได้กับทุกหมวดหมู่" },
                  ...categories.map((cat) => ({ value: cat, label: cat })),
                ]}
                variant="form"
                size="sm"
                className="w-full"
                buttonClassName="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <p className="mt-1 text-[10px] text-slate-500">
                จำกัดจำนวนครั้งที่ใช้คูปอง ไม่ใช่จำนวนลูกค้าที่อยู่ในกลุ่มเป้าหมาย
              </p>
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

          {percentageBudgetWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              งบที่กำหนดอาจไม่พอสำหรับทุกสิทธิ์ของส่วนลดแบบเปอร์เซ็นต์
              ระบบจะตรวจวงเงินจริงอีกครั้งก่อนใช้คูปองทุกครั้ง
            </div>
          )}

          {/* กำหนดกลุ่มเป้าหมาย (Buyer Segmentation) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-indigo-600">
                  group
                </span>
                <span className="text-xs font-bold text-slate-800">
                  กลุ่มผู้ซื้อจากความสนใจ (Buyer interest targeting)
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="segmentMode"
                    value="all"
                    checked={segmentMode === "all"}
                    onChange={() => setSegmentMode("all")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span
                    className={
                      segmentMode === "all"
                        ? "font-bold text-brand-700"
                        : "text-slate-600"
                    }
                  >
                    ทุกคน (Universal)
                  </span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="segmentMode"
                    value="score"
                    checked={segmentMode === "score"}
                    onChange={() => {
                      setSegmentMode("score");
                    }}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span
                    className={
                      segmentMode === "score"
                        ? "font-bold text-indigo-700"
                        : "text-slate-600"
                    }
                  >
                    ตามคะแนนความสนใจ
                  </span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="segmentMode"
                    value="legacy"
                    checked={segmentMode === "legacy"}
                    onChange={() => setSegmentMode("legacy")}
                    className="text-slate-600 focus:ring-slate-400"
                  />
                  <span className={segmentMode === "legacy" ? "font-bold text-slate-700" : "text-slate-500"}>
                    เฉพาะกลุ่มเป้าหมาย
                  </span>
                </label>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              ใช้กำหนดว่าผู้ซื้อกลุ่มใดเหมาะกับโปรโมชันนี้
              ไม่ใช่การกำหนดว่าสินค้าแบรนด์ใดใช้คูปองได้
            </p>

            {segmentMode === "score" && (
              <div className="space-y-3 border-t border-slate-200/80 pt-3">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] text-indigo-800">
                  ระบบรวมสัญญาณจากโปรไฟล์ การค้นหา การกดใจ และการซื้อจริง จากนั้นบันทึกสิทธิ์ของผู้ที่อยู่ในช่วงคะแนนตอนเผยแพร่แคมเปญ
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {audienceDimensionFields.map(([label, value, setter, values]) => (
                    <label key={label} className="text-[11px] font-semibold text-slate-700">
                      {label}
                      <select
                        value={value}
                        onChange={(event) => {
                          setter(event.target.value);
                          setAudiencePreviewStale(Boolean(audiencePreview));
                        }}
                        className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                      >
                        <option value="">ไม่กำหนด</option>
                        {values.map((option) => <option key={option} value={option.toLowerCase()}>{option}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <label className="text-[11px] font-semibold text-slate-700">
                    คะแนนเริ่มต้น
                    <input type="number" min="0" max="33" step="1" value={audienceMinScore} onChange={(event) => { setAudienceMinScore(event.target.value); setAudiencePreviewStale(Boolean(audiencePreview)); }} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-700">
                    คะแนนสิ้นสุด
                    <input type="number" min="0" max="33" step="1" value={audienceMaxScore} onChange={(event) => { setAudienceMaxScore(event.target.value); setAudiencePreviewStale(Boolean(audiencePreview)); }} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-700">
                    เริ่มเก็บสัญญาณ
                    <input type="datetime-local" value={audienceFrom} onChange={(event) => { setAudienceFrom(event.target.value); setAudiencePreviewStale(Boolean(audiencePreview)); }} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs" />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-700">
                    สิ้นสุดสัญญาณ
                    <input type="datetime-local" value={audienceTo} onChange={(event) => { setAudienceTo(event.target.value); setAudiencePreviewStale(Boolean(audiencePreview)); }} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">ช่วงคะแนนที่ใช้: 0, 1–6, 7–14, 15–24 และ 25–33</p>
                  <button type="button" onClick={handlePreviewAudience} disabled={audiencePreviewLoading} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                    {audiencePreviewLoading ? "กำลังคำนวณ..." : "คำนวณสิทธิ์และสถิติ"}
                  </button>
                </div>
                {audiencePreviewError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{audiencePreviewError}</p> : null}
                <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3">
                    {!audiencePreview ? (
                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                        ยังไม่ได้คำนวณ เลือกกลุ่มและช่วงคะแนนแล้วกด “คำนวณสิทธิ์และสถิติ”
                      </p>
                    ) : audiencePreviewStale ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                        เงื่อนไขเปลี่ยนแล้ว ผลด้านล่างเป็นผลก่อนหน้า กรุณาคำนวณใหม่
                      </p>
                    ) : null}
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {audiencePreviewStats.map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-slate-50 p-2 text-center">
                          <div className="text-[9px] text-slate-500">{label}</div>
                          <div className="mt-0.5 text-sm font-bold text-slate-800">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {audienceDistribution.map((band) => (
                        <div key={band.key} className="rounded-lg border border-slate-100 px-1.5 py-2 text-center">
                          <div className="text-[9px] text-slate-500">{band.min === band.max ? "0" : `${band.min}–${band.max}`}</div>
                          <div className="text-xs font-bold text-slate-800">{band.count ?? "—"}{band.count === undefined ? "" : " คน"}</div>
                        </div>
                      ))}
                    </div>
                </div>
              </div>
            )}

            {segmentMode === "legacy" && (
              <div className="pt-2 border-t border-slate-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="segment-field-select"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      เงื่อนไขเป้าหมาย
                    </label>
                    <RadioSelect
                      id="segment-field-select"
                      name="segmentField"
                      nativeAriaLabel="เลือกเงื่อนไขเป้าหมาย"
                      value={segmentField}
                      onChange={(newField) => {
                        if (newField === segmentField) return;
                        setSegmentField(newField);
                        setSelectedBrands([]);
                        setBrandSearch("");
                        setSegmentValue("");
                        if (newField === "brandPreference") {
                          setSegmentOp("in");
                        } else {
                          setSegmentOp("eq");
                        }
                      }}
                      options={SEGMENT_FIELD_OPTIONS}
                      variant="form"
                      size="sm"
                      className="w-full"
                      buttonClassName="w-full"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="segment-op-select"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      การเลือกกลุ่มเป้าหมาย
                    </label>
                    <RadioSelect
                      id="segment-op-select"
                      name="segmentOp"
                      nativeAriaLabel="เลือกวิธีกำหนดกลุ่มเป้าหมาย"
                      value={segmentOp}
                      onChange={setSegmentOp}
                      options={
                        segmentField === "brandPreference"
                          ? SEGMENT_OP_BRAND_OPTIONS
                          : SEGMENT_OP_GENERAL_OPTIONS
                      }
                      variant="form"
                      size="sm"
                      className="w-full"
                      buttonClassName="w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    ค่าเป้าหมาย
                  </label>
                  {segmentField === "brandPreference" ? (
                    <div className="space-y-2">
                      {/* Selected Brand Chips */}
                      {selectedBrands.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded-xl border border-slate-200 min-h-[38px] items-center">
                          {selectedBrands.map((b) => (
                            <span
                              key={b}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 text-xs font-medium text-indigo-700"
                            >
                              <span>{b}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBrand(b)}
                                aria-label={`ลบแบรนด์ ${b}`}
                                className="text-indigo-400 hover:text-indigo-800 transition ml-0.5 text-sm leading-none focus:outline-none"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic px-1">
                          ยังไม่ได้เลือกแบรนด์ (เลือกจากรายการด้านล่าง
                          หรือพิมพ์ค้นหาแล้วกดเลือก)
                        </div>
                      )}

                      {/* Brand search and add input */}
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={brandSearch}
                          disabled={isBrandSelectDisabled}
                          onChange={(e) => setBrandSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (exactMatchBrand) {
                                handleSelectBrand(exactMatchBrand);
                              }
                            }
                          }}
                          placeholder={
                            loadingBrands
                              ? "กำลังโหลดรายชื่อแบรนด์..."
                              : brandsError
                                ? "ไม่สามารถค้นหาแบรนด์ได้ (เกิดข้อผิดพลาด)"
                                : availableBrands.length === 0
                                  ? "ไม่มีข้อมูลแบรนด์ในระบบ"
                                  : "ค้นหาชื่อแบรนด์ในระบบ เช่น Nike..."
                          }
                          aria-label="ค้นหาหรือระบุแบรนด์"
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (exactMatchBrand) {
                              handleSelectBrand(exactMatchBrand);
                            }
                          }}
                          disabled={isBrandSelectDisabled || !exactMatchBrand}
                          aria-label="เพิ่มแบรนด์"
                          className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                        >
                          เลือก
                        </button>
                      </div>

                      {/* Suggestions / Available Brands List */}
                      {loadingBrands ? (
                        <p className="text-[11px] text-slate-400">
                          กำลังโหลดรายชื่อแบรนด์...
                        </p>
                      ) : brandsError ? (
                        <p className="text-[11px] text-rose-500 font-medium">
                          {brandsError}
                        </p>
                      ) : availableBrands.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">
                          ไม่มีข้อมูลแบรนด์ในระบบ
                          (ไม่สามารถกำหนดกลุ่มเป้าหมายตามแบรนด์ได้)
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium text-slate-400 block">
                            แบรนด์ที่มีในระบบ (คลิกเพื่อเลือก):
                          </span>
                          {filteredBrands.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic py-1">
                              ไม่พบแบรนด์ที่ตรงกับคำค้นหา
                            </p>
                          ) : (
                            <div
                              tabIndex={0}
                              aria-label="รายการแบรนด์ที่มีในระบบ"
                              className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 bg-white rounded-xl border border-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300"
                            >
                              {filteredBrands.map((brand) => (
                                <button
                                  key={brand}
                                  type="button"
                                  onClick={() => handleSelectBrand(brand)}
                                  className="inline-flex items-center rounded-lg bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/60 px-2 py-0.5 text-[11px] text-slate-600 transition"
                                >
                                  + {brand}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : segmentField === "favoriteCategory" ? (
                    <RadioSelect
                      id="segment-favorite-category-select"
                      name="segmentValue"
                      nativeAriaLabel="เลือกหมวดหมู่ที่สนใจ"
                      value={segmentValue}
                      onChange={setSegmentValue}
                      options={[
                        { value: "", label: "-- เลือกหมวดหมู่ --" },
                        ...categories.map((c) => ({ value: c, label: c })),
                      ]}
                      variant="form"
                      size="sm"
                      className="w-full"
                      buttonClassName="w-full"
                    />
                  ) : segmentField === "styleTag" ? (
                    <RadioSelect
                      id="segment-style-tag-select"
                      name="segmentValue"
                      nativeAriaLabel="เลือกสไตล์แฟชั่นที่สนใจ"
                      value={segmentValue}
                      onChange={setSegmentValue}
                      options={STYLE_TAG_OPTIONS}
                      variant="form"
                      size="sm"
                      className="w-full"
                      buttonClassName="w-full"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="ระบุค่าเป้าหมาย"
                      value={segmentValue}
                      onChange={(e) => setSegmentValue(e.target.value)}
                      aria-label="ระบุค่าเป้าหมาย"
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                วันเวลาเริ่มต้น *
              </label>
              <input
                type="datetime-local"
                aria-label="วันเวลาเริ่มต้น"
                value={startsAt}
                min={toLocalDatetimeInput(new Date())}
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
                aria-label="วันเวลาสิ้นสุด"
                value={endsAt}
                min={startsAt || toLocalDatetimeInput(new Date())}
                onChange={(e) => setEndsAt(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              ยกเลิก
            </button>
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm"
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
              &quot;{rejectTarget?.name}&quot; ({rejectTarget?.code})
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

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              disabled={rejecting}
              className="w-full sm:w-auto rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 shadow-sm transition"
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
        description={confirmAction?.message || ""}
        confirmLabel={confirmAction?.confirmLabel || "ยืนยัน"}
        tone={confirmAction?.tone || confirmAction?.variant || "primary"}
        reason={confirmAction?.reason || "none"}
        reasonLabel={confirmAction?.reasonLabel}
        reasonHint={confirmAction?.reasonHint}
        busy={actionLoading}
        onConfirm={(reason) => confirmAction?.actionFn?.(reason)}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
