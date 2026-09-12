"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";

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

function CampaignsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "mine" ? "mine" : "available";

  const [tab, setTab] = useState(initialTab);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // Available campaigns state
  const [availableCampaigns, setAvailableCampaigns] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [availableError, setAvailableError] = useState("");

  // My vouchers state
  const [myVouchers, setMyVouchers] = useState([]);
  const [claimedCampaignIds, setClaimedCampaignIds] = useState(new Set());
  const [usedCampaignIds, setUsedCampaignIds] = useState(new Set());
  const [loadingMine, setLoadingMine] = useState(false);
  const [mineError, setMineError] = useState("");
  const [walletFilter, setWalletFilter] = useState("all");

  function getVoucherStatus(v) {
    if (!v) return "EXPIRED";
    if (v.status === "USED") return "USED";
    const camp = v.campaign;
    const endsAt = camp?.endsAt ? new Date(camp.endsAt) : null;
    const isPast = endsAt && endsAt < new Date();
    if (v.status === "EXPIRED" || camp?.status === "ended" || isPast) {
      return "EXPIRED";
    }
    if (v.usedOrderId) {
      return "LOCKED";
    }
    return "CLAIMED";
  }

  const activeVouchers = myVouchers.filter(
    (v) => getVoucherStatus(v) === "CLAIMED",
  );
  const lockedVouchers = myVouchers.filter(
    (v) => getVoucherStatus(v) === "LOCKED",
  );
  const usedVouchers = myVouchers.filter((v) => getVoucherStatus(v) === "USED");
  const expiredVouchers = myVouchers.filter(
    (v) => getVoucherStatus(v) === "EXPIRED",
  );

  const filteredVouchers =
    walletFilter === "active"
      ? activeVouchers
      : walletFilter === "locked"
        ? lockedVouchers
        : walletFilter === "used"
          ? usedVouchers
          : walletFilter === "expired"
            ? expiredVouchers
            : myVouchers;

  // Action states
  const [claimingId, setClaimingId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  }

  useEffect(() => {
    const t = getAccessToken();
    setToken(t);
    setUser(getStoredUser());
  }, []);

  // Fetch available campaigns
  async function loadAvailable() {
    setLoadingAvailable(true);
    setAvailableError("");
    try {
      const data = await apiFetch("/api/products/campaigns/available");
      setAvailableCampaigns(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      console.error("Failed to load available campaigns:", err);
      setAvailableError(err.message || "ไม่สามารถโหลดคูปองส่วนลดได้");
    } finally {
      setLoadingAvailable(false);
    }
  }

  // Fetch user's vouchers
  async function loadMyVouchers() {
    if (!token) {
      setMyVouchers([]);
      setClaimedCampaignIds(new Set());
      setUsedCampaignIds(new Set());
      return;
    }
    setLoadingMine(true);
    setMineError("");
    try {
      const data = await apiFetch("/api/products/campaigns/my-vouchers", {
        token,
      });
      const items = Array.isArray(data) ? data : data?.items || [];
      setMyVouchers(items);
      const claimedSet = new Set(
        items
          .filter((v) => getVoucherStatus(v) === "CLAIMED")
          .map((v) => v.campaignId),
      );
      const usedSet = new Set(
        items
          .filter((v) => getVoucherStatus(v) === "USED")
          .map((v) => v.campaignId),
      );
      setClaimedCampaignIds(claimedSet);
      setUsedCampaignIds(usedSet);
    } catch (err) {
      console.warn("Failed to load user vouchers:", err.message);
      setMineError(err.message || "ไม่สามารถโหลดกระเป๋าคูปองได้");
    } finally {
      setLoadingMine(false);
    }
  }

  useEffect(() => {
    loadAvailable();
  }, []);

  useEffect(() => {
    if (token) {
      loadMyVouchers();
    }
  }, [token]);

  async function handleClaimVoucher(campaign) {
    if (!token) {
      router.push("/login?redirect=/campaigns");
      return;
    }

    setClaimingId(campaign.id);
    try {
      await apiFetch(`/api/products/campaigns/${campaign.id}/claim`, {
        method: "POST",
        token,
      });

      showToast(`เก็บคูปอง "${campaign.code}" เข้ากระเป๋าเรียบร้อยแล้ว!`);
      // Update claimed set immediately
      setClaimedCampaignIds((prev) => new Set([...prev, campaign.id]));
      // Reload my vouchers
      loadMyVouchers();
      // Reload available list to update usedCount
      loadAvailable();
    } catch (err) {
      console.warn("Claim voucher warning:", err.message);
      if (err.message && err.message.includes("already claimed")) {
        showToast(`คุณได้เก็บหรือใช้สิทธิ์คูปองนี้ไปแล้ว`);
        loadMyVouchers();
      } else {
        showToast(`ไม่สามารถเก็บคูปองได้: ${err.message}`);
      }
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-50/70">
      <NavBar />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl animate-in fade-in slide-in-from-bottom-5">
          <span className="material-symbols-outlined text-emerald-400 text-lg">
            verified
          </span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Header */}
      <section className="border-b border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/60 px-4 py-10 sm:py-12">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/60 bg-amber-50/80 px-3.5 py-1 text-xs font-semibold text-amber-800 shadow-xs mb-4">
            <span className="material-symbols-outlined text-[17px] text-amber-600">
              local_activity
            </span>
            <span>RE-LOOP Voucher & Campaign Center</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            ศูนย์รวมคูปองส่วนลดและโปรโมชันพิเศษ
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-600 leading-relaxed">
            กดเก็บคูปองส่วนลดสุดคุ้มเข้ากระเป๋าของคุณ แล้วนำไปใช้ลดราคาสินค้าแฟชั่นมือสองคุณภาพดี
            ประหยัดทั้งเงินและร่วมรักษาสิ่งแวดล้อมไปพร้อมกัน
          </p>

          {/* Navigation Tabs */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-2xl bg-slate-200/70 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setTab("available")}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold transition ${
                  tab === "available"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  loyalty
                </span>
                คูปองที่เก็บได้
                {availableCampaigns.length > 0 && (
                  <span className="rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-[10px] font-semibold">
                    {availableCampaigns.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setTab("mine")}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold transition ${
                  tab === "mine"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  account_balance_wallet
                </span>
                คูปองของฉัน (กระเป๋าคูปอง)
                {activeVouchers.length > 0 && (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                    {activeVouchers.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Tab 1: Available Campaigns */}
      {tab === "available" && (
        <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {loadingAvailable ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                >
                  <Skeleton className="h-6 w-1/3 rounded" />
                  <Skeleton className="h-10 w-full rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-9 w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : availableError ? (
            <ErrorState message={availableError} onRetry={loadAvailable} />
          ) : availableCampaigns.length === 0 ? (
            <EmptyState
              icon="confirmation_number"
              title="ยังไม่มีคูปองส่วนลดในขณะนี้"
              description="ติดตามโปรโมชันใหม่ๆ จากฝ่ายการตลาดได้เร็วๆ นี้ หรือเข้ามาดูอีกครั้งในภายหลัง"
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {availableCampaigns.map((camp) => {
                const isClaimed = claimedCampaignIds.has(camp.id);
                const isUsed = usedCampaignIds.has(camp.id);
                const isQuotaFull =
                  camp.usageLimit && camp.usedCount >= camp.usageLimit;
                const isClaiming = claimingId === camp.id;

                const discountBadge =
                  camp.discountType === "PERCENT"
                    ? `${camp.discountValue}%`
                    : `฿${camp.discountValue}`;

                return (
                  <div
                    key={camp.id}
                    className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition hover:shadow-md hover:border-slate-300"
                  >
                    {/* Top Ticket Header */}
                    <div className="bg-gradient-to-r from-brand-600 via-brand-700 to-indigo-700 p-4 text-white">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs tracking-wider font-bold bg-white/20 px-2 py-0.5 rounded backdrop-blur">
                          {camp.code}
                        </span>
                        <span className="text-[11px] font-semibold text-white/80">
                          หมดอายุ {formatThaiDate(camp.endsAt)}
                        </span>
                      </div>

                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="text-3xl font-black tracking-tight">
                          ลด {discountBadge}
                        </span>
                        {camp.discountType === "PERCENT" && camp.maxDiscount && (
                          <span className="text-xs text-white/90 font-medium">
                            (สูงสุด ฿{camp.maxDiscount})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cutout Ticket circles */}
                    <div className="relative flex items-center justify-between px-2 bg-white">
                      <div className="h-4 w-4 rounded-full bg-slate-50 -ml-4 border-r border-slate-200" />
                      <div className="w-full border-t border-dashed border-slate-200" />
                      <div className="h-4 w-4 rounded-full bg-slate-50 -mr-4 border-l border-slate-200" />
                    </div>

                    {/* Ticket Body Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm line-clamp-1">
                          {camp.name}
                        </h3>
                        {camp.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {camp.description}
                          </p>
                        )}

                        <div className="mt-3 space-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-slate-400">
                              shopping_bag
                            </span>
                            <span>
                              ขั้นต่ำ:{" "}
                              <strong className="text-slate-800">
                                ฿{camp.minOrderPrice || 0}
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-slate-400">
                              category
                            </span>
                            <span>
                              หมวดหมู่:{" "}
                              <strong className="text-slate-800">
                                {camp.applicableCategory || "ทุกหมวดหมู่"}
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="material-symbols-outlined text-[15px] text-slate-400">
                              schedule
                            </span>
                            <span>
                              ระยะเวลา:{" "}
                              <strong className="text-slate-700">
                                {formatThaiDateTime(camp.startsAt)} - {formatThaiDateTime(camp.endsAt)}
                              </strong>
                            </span>
                          </div>

                          {camp.usageLimit && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
                              <span className="material-symbols-outlined text-[14px] text-slate-400">
                                group
                              </span>
                              <span>
                                {isQuotaFull
                                  ? "สิทธิ์เต็มจำนวนแล้ว"
                                  : `เหลืออีก ${Math.max(0, camp.usageLimit - (camp.usedCount || 0))} สิทธิ์`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Claim Button */}
                      <div className="pt-2">
                        {isClaimed ? (
                          <button
                            disabled
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-500 border border-slate-200 cursor-default"
                          >
                            <span className="material-symbols-outlined text-emerald-600 text-[16px]">
                              check_circle
                            </span>
                            เก็บแล้ว (อยู่ในกระเป๋า)
                          </button>
                        ) : isUsed ? (
                          <button
                            disabled
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-400 border border-slate-200 cursor-default"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-[16px]">
                              task_alt
                            </span>
                            ใช้สิทธิ์แล้ว
                          </button>
                        ) : isQuotaFull ? (
                          <button
                            disabled
                            className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-400 border border-slate-200 cursor-not-allowed"
                          >
                            สิทธิ์เต็มแล้ว
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isClaiming}
                            onClick={() => handleClaimVoucher(camp)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 py-2.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.99]"
                          >
                            {isClaiming ? (
                              "กำลังเก็บ..."
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-base">
                                  bookmark_add
                                </span>
                                {token ? "เก็บคูปอง" : "เข้าสู่ระบบเพื่อเก็บคูปอง"}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: My Vouchers (Wallet) */}
      {tab === "mine" && (
        <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {!token ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-md mx-auto shadow-sm">
              <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">
                lock
              </span>
              <h2 className="text-base font-bold text-slate-800">
                กรุณาเข้าสู่ระบบ
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                เข้าสู่ระบบเพื่อตรวจสอบคูปองส่วนลดที่คุณเก็บไว้ในกระเป๋า
              </p>
              <Link
                href="/login?redirect=/campaigns?tab=mine"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
              >
                เข้าสู่ระบบตอนนี้
              </Link>
            </div>
          ) : loadingMine ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                >
                  <Skeleton className="h-6 w-1/3 rounded" />
                  <Skeleton className="h-8 w-full rounded" />
                  <Skeleton className="h-9 w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : mineError ? (
            <ErrorState message={mineError} onRetry={loadMyVouchers} />
          ) : myVouchers.length === 0 ? (
            <EmptyState
              icon="account_balance_wallet"
              title="ยังไม่มีคูปองในกระเป๋าของคุณ"
              description="คุณยังไม่ได้กดเก็บคูปองใดๆ ลองสลับไปที่แท็บ 'คูปองที่เก็บได้' เพื่อเลือกเก็บส่วนลด"
            />
          ) : (
            <div>
              {/* Sub-Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setWalletFilter("all")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    walletFilter === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span>ทั้งหมด</span>
                  <span className="rounded-full bg-slate-200/50 px-1.5 py-0.2 text-[10px]">
                    {myVouchers.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setWalletFilter("active")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    walletFilter === "active"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span>พร้อมใช้งาน</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      walletFilter === "active"
                        ? "bg-emerald-700 text-white"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {activeVouchers.length}
                  </span>
                </button>

                {lockedVouchers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setWalletFilter("locked")}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                      walletFilter === "locked"
                        ? "bg-amber-500 text-white shadow-xs"
                        : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50"
                    }`}
                  >
                    <span>กำลังใช้งานในตะกร้า</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        walletFilter === "locked"
                          ? "bg-amber-600 text-white"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {lockedVouchers.length}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setWalletFilter("used")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    walletFilter === "used"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span>ใช้แล้ว</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      walletFilter === "used"
                        ? "bg-blue-700 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {usedVouchers.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setWalletFilter("expired")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    walletFilter === "expired"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span>หมดอายุ</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      walletFilter === "expired"
                        ? "bg-rose-700 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {expiredVouchers.length}
                  </span>
                </button>
              </div>

              {filteredVouchers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-md mx-auto shadow-xs">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">
                    {walletFilter === "active"
                      ? "savings"
                      : walletFilter === "locked"
                        ? "shopping_bag"
                        : walletFilter === "used"
                          ? "task_alt"
                          : "history_toggle_off"}
                  </span>
                  <h3 className="text-sm font-bold text-slate-700">
                    {walletFilter === "active"
                      ? "ไม่มีคูปองที่พร้อมใช้งานในขณะนี้"
                      : walletFilter === "locked"
                        ? "ไม่มีคูปองที่กำลังใช้งานในตะกร้า"
                        : walletFilter === "used"
                          ? "ไม่มีประวัติการใช้คูปอง"
                          : "ไม่มีคูปองที่หมดอายุ"}
                  </h3>
                  {walletFilter === "active" && (
                    <button
                      type="button"
                      onClick={() => setTab("available")}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition"
                    >
                      <span className="material-symbols-outlined text-sm">
                        loyalty
                      </span>
                      ไปดูคูปองที่เก็บได้
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredVouchers.map((v) => {
                    const camp = v.campaign;
                    if (!camp) return null;

                    const vStatus = getVoucherStatus(v);
                    const isClaimed = vStatus === "CLAIMED";
                    const isLocked = vStatus === "LOCKED";
                    const isUsed = vStatus === "USED";
                    const isExpired = vStatus === "EXPIRED";

                    const discountBadge =
                      camp.discountType === "PERCENT"
                        ? `ลด ${camp.discountValue}%`
                        : `ลด ฿${camp.discountValue}`;

                    return (
                      <div
                        key={v.id}
                        className={`flex flex-col justify-between rounded-2xl border p-4 shadow-xs transition ${
                          isClaimed
                            ? "border-emerald-200 bg-white hover:border-emerald-300 shadow-sm"
                            : isLocked
                              ? "border-amber-300 bg-amber-50/25 hover:border-amber-400 shadow-sm"
                              : isUsed
                                ? "border-slate-200 bg-slate-50/60 opacity-75"
                                : "border-slate-200 bg-slate-50/50 opacity-65"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                              {camp.code}
                            </span>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isClaimed
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : isLocked
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : isUsed
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {isClaimed
                                ? "พร้อมใช้งาน"
                                : isLocked
                                  ? "กำลังใช้งานในตะกร้า"
                                  : isUsed
                                    ? "ใช้งานแล้ว"
                                    : "หมดอายุแล้ว"}
                            </span>
                          </div>

                          <div className="mt-3">
                            <div className="text-xl font-black text-slate-900">
                              {discountBadge}
                            </div>
                            <div className="text-xs font-semibold text-slate-700 mt-1 line-clamp-1">
                              {camp.name}
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            <div>
                              ขั้นต่ำ: <strong>฿{camp.minOrderPrice || 0}</strong>
                            </div>
                            <div>
                              หมวด:{" "}
                              <strong>
                                {camp.applicableCategory || "ทุกหมวดหมู่"}
                              </strong>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              ใช้ได้ถึง: {formatThaiDate(camp.endsAt)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100">
                          {isClaimed ? (
                            <Link
                              href={
                                camp.applicableCategory
                                  ? `/products?category=${encodeURIComponent(camp.applicableCategory)}`
                                  : "/products"
                              }
                              className="flex items-center justify-center gap-1 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-semibold text-white shadow-xs transition"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                shopping_cart
                              </span>
                              ใช้คูปองช้อปเลย
                            </Link>
                          ) : isLocked ? (
                            <Link
                              href="/cart"
                              className="flex items-center justify-center gap-1 w-full rounded-xl bg-amber-500 hover:bg-amber-600 py-2 text-xs font-semibold text-white shadow-xs transition"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                shopping_bag
                              </span>
                              ดูรายการในตะกร้า
                            </Link>
                          ) : (
                            <div
                              className={`text-center text-[11px] py-1 font-medium ${
                                isUsed ? "text-slate-400" : "text-rose-400"
                              }`}
                            >
                              {isUsed
                                ? "ใช้ในคำสั่งซื้อแล้ว"
                                : "คูปองนี้หมดอายุแล้ว"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <Footer />
    </main>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50">
          <NavBar />
          <div className="p-10 text-center text-slate-400 text-xs">
            กำลังโหลดศูนย์คูปอง...
          </div>
        </main>
      }
    >
      <CampaignsContent />
    </Suspense>
  );
}
