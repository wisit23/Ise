"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Badge from "../../panel/ui/Badge";
import RadioSelect from "../../ui/RadioSelect";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";
import { apiFetch } from "../../../lib/api";
import { ORDER_STATUS_LABEL } from "../../../lib/supportConstants";

const SEARCH_TYPE_OPTIONS = [
  { value: "orderId", label: "รหัสคำสั่งซื้อ (Order ID)" },
  { value: "buyerId", label: "รหัสผู้ซื้อ (Buyer ID / Email)" },
  { value: "sellerId", label: "รหัสผู้ขาย (Seller ID / Shop Name / Email)" },
  { value: "userId", label: "รหัสผู้ใช้ทั่วไป (User ID / Email)" },
];

const SEARCH_PLACEHOLDERS = {
  orderId: "ระบุรหัสคำสั่งซื้อ เช่น ord_123456...",
  buyerId: "ระบุ Buyer ID หรืออีเมลของผู้ซื้อ...",
  sellerId: "ระบุ Seller ID, ชื่อร้านค้า หรืออีเมลของผู้ขาย...",
  userId: "ระบุ User ID หรืออีเมลของผู้ใช้งาน...",
};

const ORDER_STATUS_STYLE = {
  pending: "border border-amber-400 text-amber-700 bg-amber-50",
  confirmed: "border border-sky-400 text-sky-700 bg-sky-50",
  shipped: "border border-blue-400 text-blue-700 bg-blue-50",
  completed: "border border-emerald-400 text-emerald-700 bg-emerald-50",
  cancelled: "border border-slate-300 text-slate-500 bg-slate-50",
  disputed: "border border-red-400 text-red-700 bg-red-50",
  refunded: "border border-purple-400 text-purple-700 bg-purple-50",
};

const KYC_STATUS_STYLE = {
  VERIFIED: "border border-emerald-400 text-emerald-700 bg-emerald-50",
  PENDING: "border border-amber-400 text-amber-700 bg-amber-50",
  REJECTED: "border border-red-400 text-red-700 bg-red-50",
};

const KYC_STATUS_LABEL = {
  VERIFIED: "ยืนยันแล้ว",
  PENDING: "รอดำเนินการ",
  REJECTED: "ไม่อนุมัติ",
};

export default function OrdersSection({
  token,
  initialUserId = "",
  initialOrderId = "",
}) {
  const toast = useToast();

  const [searchType, setSearchType] = useState("orderId");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  // Search Results
  const [orderResults, setOrderResults] = useState([]);
  const [userResult, setUserResult] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [orderHistory, setOrderHistory] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
    summary: null,
  });
  const [orderHistoryRole, setOrderHistoryRole] = useState("all");
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [orderHistoryError, setOrderHistoryError] = useState("");
  const [safetyHistory, setSafetyHistory] = useState({
    reports: { items: [], page: 1, total: 0, totalPages: 1 },
    actions: { items: [], page: 1, total: 0, totalPages: 1 },
  });
  const [safetyHistoryError, setSafetyHistoryError] = useState({
    reports: "",
    actions: "",
  });

  // Moderation Dialog State
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  async function loadOrderHistory(userId, relationRole, page = 1) {
    setOrderHistoryLoading(true);
    setOrderHistoryError("");
    try {
      const params = new URLSearchParams({
        role: relationRole,
        page: String(page),
        limit: "10",
      });
      const data = await apiFetch(
        `/api/orders/support/users/${encodeURIComponent(userId)}/history?${params}`,
        { token },
      );
      setUserOrders(data.items || []);
      setOrderHistory({
        page: data.page || page,
        total: data.total || 0,
        totalPages: data.totalPages || 1,
        summary: data.summary || null,
      });
    } catch (err) {
      setUserOrders([]);
      setOrderHistory((current) => ({ ...current, page, total: 0 }));
      setOrderHistoryError(err.message || "ไม่สามารถโหลดประวัติคำสั่งซื้อได้");
    } finally {
      setOrderHistoryLoading(false);
    }
  }

  async function loadSafetyHistory(userId, kind, page = 1) {
    setSafetyHistoryError((current) => ({ ...current, [kind]: "" }));
    try {
      const params = new URLSearchParams({
        kind,
        page: String(page),
        limit: "5",
      });
      const data = await apiFetch(
        `/api/auth/admin/users/${encodeURIComponent(userId)}/history?${params}`,
        { token },
      );
      setSafetyHistory((current) => ({
        ...current,
        [kind]: {
          items: data.items || [],
          page: data.page || page,
          total: data.total || 0,
          totalPages: data.totalPages || 1,
        },
      }));
    } catch (err) {
      setSafetyHistoryError((current) => ({
        ...current,
        [kind]: err.message || "ไม่สามารถโหลดประวัติความปลอดภัยได้",
      }));
    }
  }

  // Core Search Procedure
  async function executeSearch(typeToSearch, queryToSearch) {
    const q = (queryToSearch ?? query).trim();
    const type = typeToSearch ?? searchType;
    if (!q) return;

    setLoading(true);
    setError("");
    setSearched(true);
    setUserResult(null);
    setOrderResults([]);
    setUserOrders([]);
    setOrderHistoryError("");
    setSafetyHistoryError({ reports: "", actions: "" });

    try {
      if (type === "orderId") {
        const params = new URLSearchParams({ orderId: q });
        const data = await apiFetch(`/api/orders/support/search?${params}`, {
          token,
        });
        setOrderResults(data.items || []);
      } else {
        // User/Buyer/Seller lookup
        const user = await apiFetch(
          `/api/auth/admin/users/${encodeURIComponent(q)}`,
          { token },
        );
        setUserResult(user);
        const relationRole =
          type === "buyerId" ? "buyer" : type === "sellerId" ? "seller" : "all";
        setOrderHistoryRole(relationRole);
        await Promise.all([
          loadOrderHistory(user.id, relationRole, 1),
          loadSafetyHistory(user.id, "reports", 1),
          loadSafetyHistory(user.id, "actions", 1),
        ]);
      }
    } catch (err) {
      setError(
        err.message?.includes("not found") || err.message?.includes("404")
          ? "ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา"
          : err.message || "เกิดข้อผิดพลาดในการค้นหา",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialOrderId) {
      setSearchType("orderId");
      setQuery(initialOrderId);
      executeSearch("orderId", initialOrderId);
      return;
    }
    if (initialUserId) {
      setSearchType("userId");
      setQuery(initialUserId);
      executeSearch("userId", initialUserId);
    }
  }, [initialOrderId, initialUserId]);

  function handleFormSubmit(e) {
    e.preventDefault();
    executeSearch();
  }

  // Quick jump from order card to user lookup
  function handleQuickUserSearch(type, id) {
    if (!id) return;
    setSearchType(type);
    setQuery(id);
    executeSearch(type, id);
  }

  // Re-fetch user details after moderation action
  async function refreshUserData(userId) {
    try {
      const refreshed = await apiFetch(
        `/api/auth/admin/users/${encodeURIComponent(userId)}`,
        { token },
      );
      setUserResult(refreshed);
    } catch (err) {
      console.error("Failed to refresh user data:", err);
    }
  }

  // Execute Moderation Action (Warn, Suspend, Restore)
  async function handleConfirmAction(reason) {
    if (!pendingAction) return;
    const { type, targetId, userName } = pendingAction;
    setActionBusy(true);

    try {
      const restrictionScopes = {
        restrictBuyer: "BUYER",
        restrictSeller: "SELLER",
      };
      const isRestriction = Boolean(restrictionScopes[type]);
      const isRestrictionRevoke = type === "restoreCommerce";
      const path = isRestriction
        ? `/api/auth/admin/users/${targetId}/commerce-restriction`
        : isRestrictionRevoke
          ? `/api/auth/admin/users/${targetId}/commerce-restriction/revoke`
          : `/api/auth/admin/users/${targetId}/${type}`;
      const body = isRestriction
        ? { reason, scope: restrictionScopes[type] }
        : isRestrictionRevoke
          ? { reason, scope: "ALL_COMMERCE" }
          : { reason };

      await apiFetch(path, {
        method: "POST",
        token,
        body,
      });

      const successMessages = {
        warn: `บันทึกการตักเตือนคุณ ${userName} สำเร็จ`,
        suspend: `ระงับการใช้งานบัญชีของคุณ ${userName} เรียบร้อยแล้ว`,
        restore: `ปลดการระงับบัญชีของคุณ ${userName} เรียบร้อยแล้ว`,
        restrictBuyer: `เพิกถอนสิทธิ์การซื้อของคุณ ${userName} แล้ว โดยผู้ใช้ยังเข้าสู่ระบบได้`,
        restrictSeller: `เพิกถอนสิทธิ์การขายของคุณ ${userName} แล้ว โดยผู้ใช้ยังเข้าสู่ระบบได้`,
        restoreCommerce: `คืนสิทธิ์การซื้อขายของคุณ ${userName} แล้ว`,
      };

      toast.success(
        successMessages[type] || "ดำเนินการเสร็จสิ้น",
        "Trust & Safety Action",
      );
      setPendingAction(null);
      await refreshUserData(targetId);
      await loadSafetyHistory(targetId, "actions", 1);
    } catch (err) {
      toast.error(
        err.message || "ไม่สามารถทำรายการได้ กรุณาลองใหม่อีกครั้ง",
        "เกิดข้อผิดพลาด",
      );
    } finally {
      setActionBusy(false);
    }
  }

  function copyToClipboard(text) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  const userDisplayName = userResult
    ? [userResult.firstName, userResult.lastName].filter(Boolean).join(" ") ||
      userResult.email
    : "";
  const userRoles =
    userResult?.roles || (userResult?.role ? [userResult.role] : []);
  const commerceRestrictions = new Set(userResult?.commerceRestrictions || []);
  const hasCommerceRestriction = commerceRestrictions.size > 0;
  const actionCopy = {
    warn: {
      title: "ตักเตือนผู้ใช้งาน",
      description: `ระบุเหตุผลในการตักเตือนคุณ ${pendingAction?.userName || ""} การตักเตือนนี้จะถูกบันทึกในประวัติความปลอดภัยของผู้ใช้`,
      label: "ยืนยันการตักเตือน",
      reasonLabel: "เหตุผลในการตักเตือน",
      tone: "primary",
    },
    suspend: {
      title: "ยืนยันการระงับบัญชีผู้ใช้งาน (Ban)",
      description: `คุณกำลังจะระงับบัญชีของคุณ ${pendingAction?.userName || ""} ผู้ใช้จะไม่สามารถเข้าสู่ระบบได้ ใช้เฉพาะมาตรการฉุกเฉินที่ต้องตัดการเข้าถึงทั้งหมด`,
      label: "ระงับบัญชีทันที",
      reasonLabel: "เหตุผลในการระงับบัญชี",
      tone: "danger",
    },
    restore: {
      title: "ยืนยันการปลดการระงับบัญชี",
      description: `คืนสิทธิ์เข้าสู่ระบบให้คุณ ${pendingAction?.userName || ""} โดยไม่เปลี่ยนข้อจำกัดจากเคสอื่น`,
      label: "ปลดการระงับ",
      reasonLabel: "เหตุผลในการปลดการระงับ",
      tone: "primary",
    },
    restrictBuyer: {
      title: "เพิกถอนสิทธิ์การซื้อ",
      description: `คุณ ${pendingAction?.userName || ""} จะยังเข้าสู่ระบบและดูข้อมูลเดิมได้ แต่สร้างรายการซื้อ จอง ชำระเงิน ใช้คูปอง หรือประมูลใหม่ไม่ได้`,
      label: "ยืนยันเพิกถอนสิทธิ์ซื้อ",
      reasonLabel: "เหตุผลในการเพิกถอนสิทธิ์ซื้อ",
      tone: "danger",
    },
    restrictSeller: {
      title: "เพิกถอนสิทธิ์การขาย",
      description: `คุณ ${pendingAction?.userName || ""} จะยังเข้าสู่ระบบและดูข้อมูลเดิมได้ แต่เปิดร้าน ลงหรือแก้สินค้า เพิ่มวิดีโอ และส่งประมูลใหม่ไม่ได้`,
      label: "ยืนยันเพิกถอนสิทธิ์ขาย",
      reasonLabel: "เหตุผลในการเพิกถอนสิทธิ์ขาย",
      tone: "danger",
    },
    restoreCommerce: {
      title: "คืนสิทธิ์การซื้อขาย",
      description: `คืนเฉพาะสิทธิ์การซื้อขายของคุณ ${pendingAction?.userName || ""} โดยไม่ปลด Hold หรือ moderation จากเคสอื่น`,
      label: "ยืนยันคืนสิทธิ์",
      reasonLabel: "เหตุผลในการคืนสิทธิ์",
      tone: "primary",
    },
  }[pendingAction?.type];

  return (
    <div
      className={`animate-fade-in-up flex flex-col ${
        !searched
          ? "items-center justify-center min-h-[40vh] pt-10 text-center"
          : ""
      }`}
    >
      {/* Hero Welcome Banner */}
      {!searched && (
        <div className="mb-8 animate-in zoom-in-95 duration-500">
          <span className="material-symbols-outlined text-[64px] text-emerald-600 mb-2 drop-shadow-sm">
            manage_search
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            ศูนย์ค้นหาข้อมูล Trust & Safety
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500 max-w-md mx-auto">
            ค้นหาข้อมูลคำสั่งซื้อ ผู้ซื้อ ผู้ขาย หรือบัญชีผู้ใช้งาน
            พร้อมตรวจสอบสถิติความปลอดภัยและดำเนินการควบคุมบัญชี
          </p>
        </div>
      )}

      {/* Search Bar */}
      <div
        className={`w-full transition-all duration-500 ease-out ${
          searched ? "max-w-5xl mb-6" : "max-w-3xl"
        }`}
      >
        <form
          onSubmit={handleFormSubmit}
          className="relative flex w-full items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 hover:border-slate-300"
        >
          <RadioSelect
            options={SEARCH_TYPE_OPTIONS}
            value={searchType}
            onChange={(val) => {
              setSearchType(val);
              setError("");
            }}
            variant="panel"
            size="sm"
            className="w-56 border-r border-slate-200 shrink-0"
            buttonClassName="!border-0 !shadow-none bg-slate-50/80 rounded-l-[8px] rounded-r-none py-2.5 pl-3.5 pr-2.5 text-xs font-semibold"
          />

          <div className="flex flex-1 items-center px-3">
            <span className="material-symbols-outlined mr-2 text-[20px] text-slate-400">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                SEARCH_PLACEHOLDERS[searchType] || "พิมพ์ข้อความค้นหา..."
              }
              className="w-full border-0 bg-transparent py-2 text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-slate-600 p-1"
                title="ล้างข้อความ"
              >
                <span className="material-symbols-outlined text-[16px]">
                  close
                </span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex shrink-0 items-center gap-1 rounded-[8px] bg-emerald-600 px-5 py-2.5 text-xs font-bold tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[16px]">
                  progress_activity
                </span>
                กำลังค้นหา...
              </>
            ) : (
              "ค้นหา"
            )}
          </button>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="w-full max-w-5xl mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500 text-[22px]">
            error
          </span>
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Empty State */}
      {searched &&
        !loading &&
        !error &&
        !userResult &&
        orderResults.length === 0 && (
          <div className="w-full max-w-5xl rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-slate-400 mb-2">
              search_off
            </span>
            <p className="text-base font-bold text-slate-700">
              ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              กรุณาตรวจสอบความถูกต้องของรหัส หรือลองค้นหาด้วยอีเมล
              หรือชื่อร้านค้าของผู้ขาย
            </p>
          </div>
        )}

      {/* 1. USER PROFILE & MODERATION RESULT CARD */}
      {userResult && (
        <div className="w-full max-w-5xl space-y-6 animate-in fade-in-50 duration-300">
          {/* Main User Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* Header: User Profile Info */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white text-xl font-bold shadow-md shadow-emerald-500/20">
                  {userDisplayName.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900">
                      {userDisplayName}
                    </h3>
                    {userResult.status === "ACTIVE" ? (
                      <Badge
                        text="บัญชีปกติ (ACTIVE)"
                        style="bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold"
                      />
                    ) : userResult.status === "SUSPENDED" ? (
                      <Badge
                        text="ถูกระงับ (SUSPENDED)"
                        style="bg-rose-50 text-rose-700 border border-rose-300 font-semibold"
                      />
                    ) : userResult.status?.startsWith("RESTRICTED_") ? (
                      <Badge
                        text="จำกัดสิทธิ์การซื้อขาย"
                        style="bg-amber-50 text-amber-800 border border-amber-300 font-semibold"
                      />
                    ) : (
                      <Badge
                        text={userResult.status}
                        style="bg-slate-100 text-slate-700 border border-slate-300"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1 font-mono">
                      <span className="material-symbols-outlined text-[15px] text-slate-400">
                        badge
                      </span>
                      ID: {userResult.id}
                      <button
                        onClick={() => copyToClipboard(userResult.id)}
                        className="ml-1 text-slate-400 hover:text-slate-600 inline-flex items-center"
                        title="คัดลอกรหัสผู้ใช้"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedId ? "check" : "content_copy"}
                        </span>
                      </button>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-slate-400">
                        mail
                      </span>
                      {userResult.email}
                    </span>
                    {userResult.phone && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-slate-400">
                            call
                          </span>
                          {userResult.phone}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Roles */}
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    <span className="text-[11px] font-medium text-slate-400">
                      สิทธิ์ผู้ใช้:
                    </span>
                    {userRoles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      type: "warn",
                      targetId: userResult.id,
                      userName: userDisplayName,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/60 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-600">
                    warning
                  </span>
                  ตักเตือนผู้ใช้
                </button>

                {userRoles.includes("BUYER") &&
                  !commerceRestrictions.has("BUYER_COMMERCE") &&
                  userResult.status !== "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: "restrictBuyer",
                          targetId: userResult.id,
                          userName: userDisplayName,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        shopping_cart_off
                      </span>
                      เพิกถอนสิทธิ์ซื้อ
                    </button>
                  )}

                {userRoles.includes("SELLER") &&
                  !commerceRestrictions.has("SELLER_COMMERCE") &&
                  userResult.status !== "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: "restrictSeller",
                          targetId: userResult.id,
                          userName: userDisplayName,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        store_off
                      </span>
                      เพิกถอนสิทธิ์ขาย
                    </button>
                  )}

                {hasCommerceRestriction && (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({
                        type: "restoreCommerce",
                        targetId: userResult.id,
                        userName: userDisplayName,
                      })
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      settings_backup_restore
                    </span>
                    คืนสิทธิ์ซื้อขาย
                  </button>
                )}

                {userResult.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({
                        type: "suspend",
                        targetId: userResult.id,
                        userName: userDisplayName,
                      })
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50/60 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-rose-600">
                      block
                    </span>
                    ระงับบัญชี (Ban)
                  </button>
                ) : userResult.status === "SUSPENDED" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({
                        type: "restore",
                        targetId: userResult.id,
                        userName: userDisplayName,
                      })
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">
                      lock_open
                    </span>
                    ปลดการระงับ
                  </button>
                ) : null}
              </div>
            </div>

            {/* Safety Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    รายงานที่ได้รับ (Reports)
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-slate-400">
                    flag
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-black ${
                      (userResult.safetySummary?.reportCount || 0) > 0
                        ? "text-rose-600"
                        : "text-slate-800"
                    }`}
                  >
                    {userResult.safetySummary?.reportCount ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">ครั้ง</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    การตักเตือน (Warnings)
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-amber-500">
                    warning
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-black ${
                      (userResult.safetySummary?.warningCount || 0) > 0
                        ? "text-amber-600"
                        : "text-slate-800"
                    }`}
                  >
                    {userResult.safetySummary?.warningCount ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">ครั้ง</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    การระงับบัญชี (Suspensions)
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-rose-500">
                    block
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-black ${
                      (userResult.safetySummary?.suspensionCount || 0) > 0
                        ? "text-rose-600"
                        : "text-slate-800"
                    }`}
                  >
                    {userResult.safetySummary?.suspensionCount ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">ครั้ง</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    ออเดอร์สถานะ completed
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-emerald-500">
                    task_alt
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-800">
                    {orderHistoryError
                      ? "—"
                      : (orderHistory.summary?.completedOrders ?? "—")}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ตามสถานะระบบ ไม่ใช่หลักฐานรับพัสดุ
                  </span>
                </div>
              </div>
            </div>

            {/* Seller Profile Information (if registered as seller) */}
            {userResult.sellerProfile && (
              <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/30 p-5">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-emerald-100/60">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-emerald-600">
                      storefront
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      ข้อมูลร้านค้า (Seller Profile)
                    </span>
                  </div>
                  <Badge
                    text={
                      KYC_STATUS_LABEL[userResult.sellerProfile.kycStatus] ||
                      userResult.sellerProfile.kycStatus
                    }
                    style={
                      KYC_STATUS_STYLE[userResult.sellerProfile.kycStatus] ||
                      "bg-slate-100 text-slate-700"
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">
                      ชื่อร้านค้า
                    </span>
                    <span className="font-bold text-slate-800">
                      {userResult.sellerProfile.shopName || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">
                      ข้อมูลยืนยันตัวตน
                    </span>
                    <span className="font-medium text-slate-700">
                      ดูเลขบัตร เอกสาร และบัญชีธนาคารได้เฉพาะในคิวตรวจ KYC
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[
              ["reports", "ประวัติ Report"],
              ["actions", "ประวัติ Warning / Restriction / Suspend / Restore"],
            ].map(([kind, label]) => {
              const history = safetyHistory[kind];
              return (
                <div
                  key={kind}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-800">
                      {label}
                    </h4>
                    <span className="text-xs font-semibold text-slate-500">
                      ทั้งหมด {history.total}
                    </span>
                  </div>
                  {safetyHistoryError[kind] && history.items.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <p>
                        โหลดประวัติความปลอดภัยไม่ได้: {safetyHistoryError[kind]}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          loadSafetyHistory(userResult.id, kind, history.page)
                        }
                        className="mt-2 font-bold underline"
                      >
                        ลองใหม่
                      </button>
                    </div>
                  ) : history.items.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500">
                      ไม่มีประวัติประเภทนี้
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {history.items.map((item) => {
                        const reportId =
                          kind === "reports" ? item.id : item.sourceReportId;
                        return (
                          <div
                            key={item.id}
                            className="rounded-lg bg-slate-50 p-3 text-xs"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-slate-800">
                                  {kind === "reports"
                                    ? `REP-${item.id.slice(0, 6).toUpperCase()} · ${item.status}`
                                    : item.action}
                                </p>
                                <p className="mt-1 text-slate-600">
                                  {item.reason || "ไม่ระบุเหตุผล"}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  {new Date(
                                    item.reportedAt || item.createdAt,
                                  ).toLocaleString("th-TH")}
                                </p>
                              </div>
                              {reportId && (
                                <Link
                                  href={`/workspace?tab=admin_inbox&reportId=${encodeURIComponent(reportId)}`}
                                  className="shrink-0 font-bold text-emerald-700 hover:underline"
                                >
                                  เปิดเคสต้นทาง
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {history.totalPages > 1 && (
                    <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                      <button
                        type="button"
                        disabled={history.page <= 1}
                        onClick={() =>
                          loadSafetyHistory(
                            userResult.id,
                            kind,
                            history.page - 1,
                          )
                        }
                        className="rounded border px-2 py-1 disabled:opacity-40"
                      >
                        ก่อนหน้า
                      </button>
                      <span>
                        {history.page}/{history.totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={history.page >= history.totalPages}
                        onClick={() =>
                          loadSafetyHistory(
                            userResult.id,
                            kind,
                            history.page + 1,
                          )
                        }
                        className="rounded border px-2 py-1 disabled:opacity-40"
                      >
                        ถัดไป
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Associated Orders for this user */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-slate-500">
                  receipt_long
                </span>
                ประวัติคำสั่งซื้อที่เกี่ยวข้อง
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  {orderHistoryError ? "—" : orderHistory.total}
                </span>
              </h4>
            </div>
            <p className="text-[11px] text-slate-500">
              สถิติส่งช้าและปัญหาพัสดุ: ยังไม่มีข้อมูล shipping ที่เชื่อถือได้
              (รอ TSR-10)
            </p>

            {orderHistoryLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs font-semibold text-slate-500">
                กำลังโหลดประวัติคำสั่งซื้อ...
              </div>
            ) : orderHistoryError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="text-xs font-semibold text-amber-800">
                  ประวัติคำสั่งซื้อไม่พร้อมใช้งาน: {orderHistoryError}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    loadOrderHistory(
                      userResult.id,
                      orderHistoryRole,
                      orderHistory.page,
                    )
                  }
                  className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800"
                >
                  ลองใหม่
                </button>
              </div>
            ) : userOrders.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <span className="material-symbols-outlined text-[32px] text-slate-300 mb-1">
                  order_approve
                </span>
                <p className="text-xs font-semibold text-slate-500">
                  ไม่พบประวัติคำสั่งซื้อของผู้ใช้งานรายนี้ในระบบ
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {userOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          #{order.id}
                        </span>
                        <Badge
                          text={
                            ORDER_STATUS_LABEL[order.status] || order.status
                          }
                          style={
                            ORDER_STATUS_STYLE[order.status] ||
                            "bg-slate-100 text-slate-700"
                          }
                        />
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>
                          ผู้ซื้อ: {order.buyer?.name || order.buyerId}
                        </span>
                        <span>•</span>
                        <span>
                          ผู้ขาย: {order.seller?.name || order.sellerId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <span className="text-sm font-extrabold text-slate-900">
                        ฿
                        {Number(
                          order.finalPrice ??
                            order.price ??
                            order.totalAmount ??
                            0,
                        ).toLocaleString()}
                      </span>
                      <Link
                        href={`/orders?id=${order.id}`}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        ดูรายละเอียด
                        <span className="material-symbols-outlined text-[15px]">
                          chevron_right
                        </span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!orderHistoryLoading &&
              !orderHistoryError &&
              orderHistory.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
                  <button
                    type="button"
                    disabled={orderHistory.page <= 1}
                    onClick={() =>
                      loadOrderHistory(
                        userResult.id,
                        orderHistoryRole,
                        orderHistory.page - 1,
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40"
                  >
                    ก่อนหน้า
                  </button>
                  <span>
                    หน้า {orderHistory.page} / {orderHistory.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={orderHistory.page >= orderHistory.totalPages}
                    onClick={() =>
                      loadOrderHistory(
                        userResult.id,
                        orderHistoryRole,
                        orderHistory.page + 1,
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40"
                  >
                    ถัดไป
                  </button>
                </div>
              )}
          </div>
        </div>
      )}

      {/* 2. ORDER SEARCH RESULT CARDS (when searching directly by orderId) */}
      {!userResult && orderResults.length > 0 && (
        <div className="w-full max-w-5xl space-y-4 animate-in fade-in-50 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-slate-500">
                receipt_long
              </span>
              พบ {orderResults.length} คำสั่งซื้อ
            </h3>
          </div>

          <div className="grid gap-4">
            {orderResults.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-slate-900">
                      #{order.id}
                    </span>
                    <Badge
                      text={ORDER_STATUS_LABEL[order.status] || order.status}
                      style={
                        ORDER_STATUS_STYLE[order.status] ||
                        "bg-slate-100 text-slate-700"
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-slate-900">
                      ฿
                      {Number(
                        order.finalPrice ??
                          order.price ??
                          order.totalAmount ??
                          0,
                      ).toLocaleString()}
                    </span>
                    <Link
                      href={`/orders?id=${order.id}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      ดูรายละเอียดคำสั่งซื้อ
                      <span className="material-symbols-outlined text-[16px]">
                        chevron_right
                      </span>
                    </Link>
                  </div>
                </div>

                {/* Parties Details with Instant Quick Lookup */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Buyer Box */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        ผู้ซื้อ (Buyer)
                      </span>
                      <span className="font-semibold text-slate-800 block">
                        {order.buyer?.name || "ไม่ระบุชื่อ"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 block truncate max-w-[200px]">
                        {order.buyerId}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickUserSearch("buyerId", order.buyerId)
                      }
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-2xs shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        person_search
                      </span>
                      ตรวจสอบผู้ซื้อ
                    </button>
                  </div>

                  {/* Seller Box */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        ผู้ขาย (Seller)
                      </span>
                      <span className="font-semibold text-slate-800 block">
                        {order.seller?.name || "ไม่ระบุชื่อ"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 block truncate max-w-[200px]">
                        {order.sellerId}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickUserSearch("sellerId", order.sellerId)
                      }
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-2xs shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        storefront
                      </span>
                      ตรวจสอบผู้ขาย
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moderation Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingAction)}
        busy={actionBusy}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
        title={actionCopy?.title || "ยืนยันการดำเนินการ"}
        description={actionCopy?.description || ""}
        confirmLabel={actionCopy?.label || "ยืนยัน"}
        tone={actionCopy?.tone || "primary"}
        reason="required"
        reasonLabel={actionCopy?.reasonLabel || "เหตุผล"}
        reasonHint="กรุณาระบุรายละเอียดเพื่อบันทึกลงใน Audit Log สำหรับการตรวจสอบย้อนหลัง"
      />
    </div>
  );
}
