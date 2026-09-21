"use client";

import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

export default function EditShopModal({
  open,
  onClose,
  currentShopName = "",
  onSuccess,
}) {
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [comment, setComment] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);

  useEffect(() => {
    if (!open) return;

    setError("");
    setSuccess(false);
    setComment("");
    setLoading(true);

    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Load current profile and recent change requests
    Promise.all([
      apiFetch("/api/auth/shop/profile", { token }).catch(() => null),
      apiFetch("/api/auth/shop/change-requests", { token }).catch(() => null),
    ])
      .then(([prof, reqs]) => {
        if (prof) {
          setShopName(prof.shopName || currentShopName || "");
          setAddress(prof.address || "");
          setBankAccount(prof.bankAccount || "");
        } else {
          setShopName(currentShopName || "");
        }

        const pending = (reqs?.items || []).find((r) => r.status === "PENDING");
        setPendingRequest(pending || null);
      })
      .finally(() => setLoading(false));
  }, [open, currentShopName]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!comment.trim()) {
      setError(
        "กรุณากรอกเหตุผลว่าต้องการเปลี่ยนอะไรและเพราะอะไร เพื่อให้แอดมินตรวจสอบ",
      );
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError("กรุณาเข้าสู่ระบบก่อนดำเนินการ");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        shopName: shopName.trim() || undefined,
        address: address.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
        comment: comment.trim(),
      };

      await apiFetch("/api/auth/shop/change-request", {
        method: "POST",
        token,
        body: payload,
      });

      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการส่งคำขอ");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setError("");
    setSuccess(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="แก้ไขข้อมูลร้านค้า"
      description="ส่งคำขอเปลี่ยนแปลงข้อมูลร้านค้าเพื่อให้แอดมินตรวจสอบและอนุมัติ"
      size="md"
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          กำลังโหลดข้อมูลร้านค้า...
        </div>
      ) : success ? (
        <div className="py-6 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <span className="material-symbols-outlined text-2xl">check</span>
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            ส่งคำขอสำเร็จเรียบร้อย
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            คำขอของคุณถูกส่งไปยังแอดมินแล้ว พร้อมความคิดเห็นประกอบการพิจารณา
            ระบบจะอัปเดตข้อมูลร้านทันทีที่ได้รับการอนุมัติ
          </p>
          <div className="pt-2">
            <Button onClick={handleClose} variant="primary">
              เข้าใจแล้ว
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {pendingRequest && (
            <Alert tone="warning">
              <div className="text-xs space-y-1">
                <p className="font-semibold">
                  คุณมีคำขอแก้ไขข้อมูลที่อยู่ระหว่างรอการตรวจสอบจากแอดมิน
                </p>
                <p className="text-amber-800">
                  ยื่นเมื่อ:{" "}
                  {new Date(pendingRequest.createdAt).toLocaleString("th-TH")}
                </p>
                <p className="italic text-amber-700">
                  เหตุผลที่ระบุ: &quot;{pendingRequest.comment}&quot;
                </p>
              </div>
            </Alert>
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ชื่อร้านค้า
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              disabled={submitting || Boolean(pendingRequest)}
              placeholder="ระบุชื่อร้านค้าของคุณ"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ที่อยู่ร้านค้า / สถานที่จัดส่ง
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={submitting || Boolean(pendingRequest)}
              placeholder="ระบุที่อยู่ของร้านค้าหรือที่อยู่สำหรับจัดส่งสินค้าคืน"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              เลขบัญชีธนาคาร
            </label>
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              disabled={submitting || Boolean(pendingRequest)}
              placeholder="เช่น กสิกรไทย 123-4-56789-0"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 font-mono"
            />
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              ความคิดเห็นถึงแอดมิน (เปลี่ยนอะไร เพราะอะไร){" "}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting || Boolean(pendingRequest)}
              placeholder="กรุณาระบุรายละเอียดให้แอดมินทราบ เช่น: ขอเปลี่ยนชื่อร้านเนื่องจากเปลี่ยนแบรนด์เป็น... และอัปเดตที่อยู่จัดส่งใหม่"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 resize-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              ทุกครั้งที่ขอเปลี่ยนข้อมูล แอดมินต้องตรวจสอบและอนุมัติก่อน
              ข้อมูลจึงจะเปลี่ยน
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                submitting || Boolean(pendingRequest) || !comment.trim()
              }
            >
              {submitting ? "กำลังส่งคำขอ..." : "ส่งให้แอดมินตรวจสอบ"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
