"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";

const STATUS_LABEL = {
  PENDING: "รอตรวจสอบ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ปฏิเสธ",
};

const STATUS_STYLE = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-600",
};

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Section 4: Shop Settings ─────────────────────────────────────────────────
export default function SellerShopSettings() {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasPending, setHasPending] = useState(false);

  // Form state
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [comment, setComment] = useState("");

  const token = getAccessToken();

  function loadProfile() {
    setLoadingProfile(true);
    apiFetch("/api/auth/shop/profile", { token })
      .then((data) => {
        setProfile(data);
        // Pre-fill form with current values
        setShopName(data.shopName || "");
        setAddress(data.address || "");
        setBankAccount(data.bankAccount || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingProfile(false));
  }

  function loadHistory() {
    setLoadingHistory(true);
    apiFetch("/api/auth/shop/change-requests", { token })
      .then((data) => {
        setHistory(data.items);
        setHasPending(data.items.some((r) => r.status === "PENDING"));
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }

  useEffect(() => {
    loadProfile();
    loadHistory();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!comment.trim()) {
      setError("กรุณาระบุเหตุผลในช่อง 'อธิบายการเปลี่ยนแปลง'");
      return;
    }

    // Only send fields that actually differ from current profile
    const patch = {};
    if (shopName.trim() && shopName.trim() !== profile?.shopName) patch.shopName = shopName.trim();
    if (address.trim() !== (profile?.address || "")) patch.address = address.trim();
    if (bankAccount.trim() !== (profile?.bankAccount || "")) patch.bankAccount = bankAccount.trim();

    if (Object.keys(patch).length === 0) {
      setError("ไม่มีข้อมูลที่เปลี่ยนแปลง กรุณาแก้ไขอย่างน้อย 1 ช่อง");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/shop/change-request", {
        method: "POST",
        token,
        body: { ...patch, comment: comment.trim() },
      });
      setSuccess("ส่งคำขอเรียบร้อย — รอ Admin ตรวจสอบ");
      setComment("");
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in-up space-y-8 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-slate-800">ข้อมูลร้านค้าปัจจุบัน</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          หากต้องการเปลี่ยนแปลง ให้แก้ไขและส่งคำขอด้านล่าง — Admin จะตรวจสอบก่อนมีผล
        </p>
      </div>

      {loadingProfile ? (
        <p className="text-sm text-slate-400">กำลังโหลดข้อมูลร้านค้า...</p>
      ) : (
        <>
          {/* Current profile display */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-5 text-sm text-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">ชื่อร้าน</p>
              <p className="font-medium">{profile?.shopName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">ที่อยู่ / จัดส่ง</p>
              <p className="font-medium whitespace-pre-line">{profile?.address || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">เลขบัญชีธนาคาร</p>
              <p className="font-mono font-medium">{profile?.bankAccount || "—"}</p>
            </div>
          </div>

          {/* Pending warning */}
          {hasPending && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">pending</span>
              <span>คุณมีคำขอที่รอตรวจสอบอยู่แล้ว ไม่สามารถส่งคำขอใหม่ได้จนกว่า Admin จะตัดสินใจ</span>
            </div>
          )}

          {/* Edit form */}
          <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200/70 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-sm font-semibold text-slate-800">ส่งคำขอแก้ไขข้อมูลร้านค้า</h3>

            <Field label="ชื่อร้านค้า">
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                disabled={hasPending}
                placeholder={profile?.shopName || "ชื่อร้าน"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </Field>

            <Field label="ที่อยู่ / ที่จัดส่ง">
              <textarea
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={hasPending}
                placeholder={profile?.address || "ที่อยู่สำหรับรับ-ส่งสินค้า"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
              />
            </Field>

            <Field label="เลขบัญชีธนาคาร">
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                disabled={hasPending}
                placeholder={profile?.bankAccount || "000-0-00000-0"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </Field>

            <Field label="อธิบายการเปลี่ยนแปลง (required)">
              <textarea
                rows={3}
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={hasPending}
                placeholder="เช่น: เปลี่ยนชื่อร้านเพราะ rebranding จาก '...' เป็น '...' / อัปเดตที่อยู่เนื่องจากย้ายที่ตั้ง"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
              />
              <p className="mt-1 text-xs text-slate-400">
                Admin จะเห็น comment นี้ก่อนอนุมัติ — ระบุให้ชัดเจนที่สุด
              </p>
            </Field>

            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-600">
                <span className="material-symbols-outlined text-[15px]">error</span>
                {error}
              </p>
            )}
            {success && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || hasPending}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "กำลังส่ง..." : "ส่งคำขอให้ Admin ตรวจสอบ"}
            </button>
          </form>
        </>
      )}

      {/* History */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">ประวัติคำขอ</h3>
        {loadingHistory ? (
          <p className="text-sm text-slate-400">กำลังโหลด...</p>
        ) : history.length === 0 ? (
          <p className="rounded-xl border border-slate-100 bg-slate-50 py-6 text-center text-sm text-slate-400">
            ยังไม่มีประวัติคำขอ
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((req) => (
              <li
                key={req.id}
                className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs text-slate-400">
                    {new Date(req.createdAt).toLocaleString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[req.status] || "bg-slate-100 text-slate-600"}`}
                  >
                    {STATUS_LABEL[req.status] || req.status}
                  </span>
                </div>

                {/* Changed fields */}
                <dl className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3 text-sm">
                  {req.shopName && (
                    <div>
                      <dt className="text-xs text-slate-400">ชื่อร้านใหม่</dt>
                      <dd className="font-medium text-slate-700">{req.shopName}</dd>
                    </div>
                  )}
                  {req.address && (
                    <div>
                      <dt className="text-xs text-slate-400">ที่อยู่ใหม่</dt>
                      <dd className="font-medium text-slate-700 whitespace-pre-line">{req.address}</dd>
                    </div>
                  )}
                  {req.bankAccount && (
                    <div>
                      <dt className="text-xs text-slate-400">เลขบัญชีใหม่</dt>
                      <dd className="font-mono font-medium text-slate-700">{req.bankAccount}</dd>
                    </div>
                  )}
                </dl>

                {/* Comment */}
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-500">เหตุผล: </span>
                  {req.comment}
                </div>

                {/* Admin note */}
                {req.adminNote && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">หมายเหตุ Admin: </span>
                    {req.adminNote}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
