"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";
import Pagination from "../../Pagination";
import Badge from "../../panel/ui/Badge";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "รอตรวจสอบ (PENDING)" },
  { value: "VERIFIED", label: "อนุมัติแล้ว (VERIFIED)" },
  { value: "REJECTED", label: "ปฏิเสธแล้ว (REJECTED)" },
  { value: "", label: "ทั้งหมด (ALL)" },
];

const STATUS_BADGE = {
  PENDING: {
    text: "รอตรวจสอบ",
    style: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  VERIFIED: {
    text: "อนุมัติแล้ว",
    style: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  REJECTED: {
    text: "ปฏิเสธแล้ว",
    style: "bg-red-50 text-red-600 border border-red-200",
  },
};

const PAGE_SIZE = 10;

export default function KycSection({ token }) {
  const toast = useToast();

  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [reasonById, setReasonById] = useState({});
  const [decidingId, setDecidingId] = useState(null);
  const [documentUrlById, setDocumentUrlById] = useState({});
  const [pendingDecision, setPendingDecision] = useState(null);

  const documentUrlByIdRef = useRef({});
  documentUrlByIdRef.current = documentUrlById;

  function loadQueue() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    apiFetch(`/api/auth/admin/kyc?${params}`, { token })
      .then((data) => {
        setApplications(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => {
        setError(err.message);
        setApplications([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadQueue();
  }, [page, statusFilter]);

  useEffect(() => {
    return () => {
      Object.values(documentUrlByIdRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  async function loadDocument(applicationId) {
    if (documentUrlById[applicationId]) return;
    try {
      const url = await fetchAuthedBlobUrl(
        `/api/auth/kyc/${applicationId}/document`,
        token,
      );
      setDocumentUrlById((prev) => ({ ...prev, [applicationId]: url }));
    } catch (err) {
      setError(err.message);
      toast.error(`เปิดเอกสารไม่สำเร็จ: ${err.message}`);
    }
  }

  function handleInitiateDecision(application, decision) {
    setPendingDecision({
      application,
      decision,
    });
  }

  async function confirmDecision(reason) {
    if (!pendingDecision) return;
    const { application, decision } = pendingDecision;
    const finalReason = (
      reason ||
      reasonById[application.id] ||
      ""
    ).trim();

    if (!finalReason) {
      toast.error("กรุณาระบุเหตุผลในการตัดสินใจ");
      return;
    }

    setPendingDecision(null);
    setDecidingId(application.id);
    setError("");
    try {
      await apiFetch(`/api/auth/admin/kyc/${application.id}/decision`, {
        method: "POST",
        token,
        body: { decision, reason: finalReason, version: application.version },
      });

      const applicantName =
        `${application.user?.firstName || ""} ${application.user?.lastName || ""}`.trim() ||
        application.user?.email ||
        "ผู้ขาย";

      toast.success(
        decision === "VERIFIED"
          ? `อนุมัติ KYC ของ "${applicantName}" สำเร็จ`
          : `ปฏิเสธ KYC ของ "${applicantName}" เรียบร้อย`,
      );

      loadQueue();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setDecidingId(null);
    }
  }

  const confirmCopy = pendingDecision
    ? pendingDecision.decision === "VERIFIED"
      ? {
          title: `อนุมัติ KYC ผู้ขาย (${pendingDecision.application.user?.sellerProfile?.shopName || pendingDecision.application.user?.email})?`,
          description:
            "เมื่ออนุมัติแล้ว ผู้ใช้งานจะได้รับสิทธิ์ผู้ขาย (SELLER) และสามารถลงรายการขายสินค้าบนแพลตฟอร์มได้ทันที",
          confirmLabel: "ยืนยันอนุมัติ (VERIFY)",
          tone: "primary",
          reason: "optional",
          reasonLabel: "เหตุผลหรือบันทึกเพิ่มเติม",
        }
      : {
          title: `ปฏิเสธ KYC (${pendingDecision.application.user?.sellerProfile?.shopName || pendingDecision.application.user?.email})?`,
          description:
            "ใบสมัครจะถูกปฏิเสธและผู้ใช้จะต้องยื่นเอกสารใหม่ เหตุผลจะถูกบันทึกไว้ใน Audit Log",
          confirmLabel: "ยืนยันปฏิเสธ (REJECT)",
          tone: "danger",
          reason: "required",
          reasonLabel: "ระบุเหตุผลในการปฏิเสธ",
        }
    : {};

  return (
    <div className="animate-fade-in-up flex flex-col min-h-full">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            คิวตรวจยืนยันตัวตนผู้ขาย (KYC)
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {statusFilter === "PENDING"
              ? `รอตรวจสอบ ${total} รายการ`
              : `พบทั้งหมด ${total} รายการ`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DropdownFilter
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
            align="right"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <p className="text-sm font-medium text-slate-500">กำลังโหลดรายการ...</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <span className="material-symbols-outlined text-[48px] text-slate-400 mb-2">
            how_to_reg
          </span>
          <p className="text-sm font-semibold text-slate-700">
            {statusFilter === "PENDING"
              ? "ไม่มีใบสมัคร KYC ที่รอตัดสินใจ"
              : "ไม่พบใบสมัคร KYC ในสถานะที่เลือก"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {statusFilter !== "" && "ลองเปลี่ยนตัวกรองสถานะเป็น 'ทั้งหมด'"}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {applications.map((app) => {
            const badgeInfo = STATUS_BADGE[app.status] || {
              text: app.status,
              style: "bg-slate-100 text-slate-600",
            };
            const isPending = app.status === "PENDING";

            return (
              <li
                key={app.id}
                className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {app.user?.firstName} {app.user?.lastName}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({app.user?.email})
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      ยื่นคำขอเมื่อ:{" "}
                      {new Date(app.submittedAt).toLocaleString("th-TH")}
                      {app.reviewedAt && (
                        <span className="ml-2 text-slate-400">
                          · ตรวจแล้วเมื่อ:{" "}
                          {new Date(app.reviewedAt).toLocaleString("th-TH")}
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge text={badgeInfo.text} style={badgeInfo.style} />
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
                    <dl className="flex flex-col gap-2">
                      <div className="flex justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                        <dt className="font-medium text-slate-500">ชื่อร้านค้า</dt>
                        <dd className="font-bold text-slate-900">
                          {app.user?.sellerProfile?.shopName ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                        <dt className="font-medium text-slate-500">
                          เลขบัตรประชาชน
                        </dt>
                        <dd className="font-mono font-semibold text-slate-800">
                          {app.user?.sellerProfile?.idCardNumber ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                        <dt className="font-medium text-slate-500">ที่อยู่</dt>
                        <dd className="max-w-[65%] text-right font-medium text-slate-800">
                          {app.user?.sellerProfile?.address ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="font-medium text-slate-500">บัญชีธนาคาร</dt>
                        <dd className="font-mono text-slate-800">
                          {app.user?.sellerProfile?.bankAccount ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50/50 p-4">
                    {documentUrlById[app.id] ? (
                      <img
                        src={documentUrlById[app.id]}
                        alt="รูปถ่ายบัตรประชาชน"
                        className="max-h-48 rounded-lg border border-slate-200 bg-white object-contain shadow-sm"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => loadDocument(app.id)}
                        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        <span className="material-symbols-outlined text-[18px] text-slate-500">
                          visibility
                        </span>
                        แสดงรูปถ่ายบัตรประชาชน
                      </button>
                    )}
                  </div>
                </div>

                {isPending ? (
                  <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-100 pt-3 sm:flex-row">
                    <input
                      type="text"
                      placeholder="เหตุผลหรือหมายเหตุประกอบการตัดสินใจ..."
                      value={reasonById[app.id] || ""}
                      onChange={(e) =>
                        setReasonById((prev) => ({
                          ...prev,
                          [app.id]: e.target.value,
                        }))
                      }
                      className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={decidingId === app.id}
                        onClick={() => handleInitiateDecision(app, "VERIFIED")}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          check
                        </span>
                        อนุมัติ (VERIFY)
                      </button>
                      <button
                        disabled={decidingId === app.id}
                        onClick={() => handleInitiateDecision(app, "REJECTED")}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          close
                        </span>
                        ปฏิเสธ (REJECT)
                      </button>
                    </div>
                  </div>
                ) : (
                  app.rejectionReason && (
                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50/50 px-4 py-2 text-xs text-red-700">
                      <span className="font-bold">เหตุผลที่ปฏิเสธ:</span>{" "}
                      {app.rejectionReason}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        busy={decidingId === pendingDecision?.application?.id}
        onCancel={() => setPendingDecision(null)}
        onConfirm={confirmDecision}
        {...confirmCopy}
      />
    </div>
  );
}
