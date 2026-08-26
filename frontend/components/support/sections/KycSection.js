"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";

export default function KycSection({ token }) {
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reasonById, setReasonById] = useState({});
  const [decidingId, setDecidingId] = useState(null);
  const [documentUrlById, setDocumentUrlById] = useState({});
  // Mirrors documentUrlById so the unmount cleanup below always sees the
  // latest set of object URLs, not whatever was current when the effect
  // first ran (a plain closure over state would go stale with `[]` deps).
  const documentUrlByIdRef = useRef({});
  documentUrlByIdRef.current = documentUrlById;

  function loadQueue() {
    setLoading(true);
    apiFetch("/api/auth/admin/kyc?status=PENDING", { token })
      .then((data) => setApplications(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadQueue();
    return () => {
      // Revoke every object URL created for a document preview so the
      // browser doesn't leak memory across queue reloads/unmounts.
      Object.values(documentUrlByIdRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
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
    }
  }

  async function decide(application, decision) {
    const reason = (reasonById[application.id] || "").trim();
    if (!reason) {
      setError("กรุณาระบุเหตุผลก่อนตัดสินใจ");
      return;
    }
    setError("");
    setDecidingId(application.id);
    try {
      await apiFetch(`/api/auth/admin/kyc/${application.id}/decision`, {
        method: "POST",
        token,
        body: { decision, reason, version: application.version },
      });
      setApplications((prev) => prev.filter((a) => a.id !== application.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDecidingId(null);
    }
  }

  if (loading) {
    return <p className="py-10 text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div className="animate-fade-in-up flex flex-col min-h-full">
      <h1 className="mb-1 text-xl font-bold text-gray-900">
        คิวตรวจยืนยันตัวตนผู้ขาย (KYC)
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        รอตรวจสอบ {applications.length} รายการ
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {applications.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">
          ไม่มีใบสมัคร KYC ที่รอตัดสินใจ
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {applications.map((app) => (
            <li
              key={app.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between border-b border-gray-100 pb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {app.user?.firstName} {app.user?.lastName} ({app.user?.email})
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    ยื่นเมื่อ: {new Date(app.submittedAt).toLocaleString("th-TH")}
                  </p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
                  <dl className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">ชื่อร้านค้า</dt>
                      <dd className="font-medium text-gray-900">
                        {app.user?.sellerProfile?.shopName ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">เลขบัตรประชาชน</dt>
                      <dd className="font-mono">
                        {app.user?.sellerProfile?.idCardNumber ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">ที่อยู่</dt>
                      <dd className="max-w-[60%] text-right">
                        {app.user?.sellerProfile?.address ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-400">บัญชีธนาคาร</dt>
                      <dd>{app.user?.sellerProfile?.bankAccount ?? "—"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-col items-center justify-center rounded bg-gray-50 p-3">
                  {documentUrlById[app.id] ? (
                    <img
                      src={documentUrlById[app.id]}
                      alt="รูปถ่ายบัตรประชาชน"
                      className="max-h-40 rounded border border-gray-200 object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => loadDocument(app.id)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      แสดงรูปถ่ายบัตรประชาชน
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="เหตุผลประกอบการตัดสินใจ"
                  value={reasonById[app.id] || ""}
                  onChange={(e) =>
                    setReasonById((prev) => ({
                      ...prev,
                      [app.id]: e.target.value,
                    }))
                  }
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <button
                  disabled={decidingId === app.id}
                  onClick={() => decide(app, "VERIFIED")}
                  className="shrink-0 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  อนุมัติ (VERIFY)
                </button>
                <button
                  disabled={decidingId === app.id}
                  onClick={() => decide(app, "REJECTED")}
                  className="shrink-0 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  ปฏิเสธ (REJECT)
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
