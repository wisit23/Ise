"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function KycSection({ token }) {
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reasonById, setReasonById] = useState({});
  const [decidingId, setDecidingId] = useState(null);

  function loadQueue() {
    setLoading(true);
    apiFetch("/api/auth/admin/kyc?status=PENDING", { token })
      .then((data) => setApplications(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadQueue();
  }, []);

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
        คิวตรวจ KYC (Synthetic)
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
              <div className="mb-3 border-b border-gray-100 pb-3">
                <p className="text-sm font-semibold text-gray-900">
                  User ID: {app.userId}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  ยื่นเมื่อ: {new Date(app.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="mb-4 rounded bg-gray-50 p-3 text-sm text-gray-700">
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {JSON.stringify(app.payload, null, 2)}
                </pre>
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
                  onClick={() => decide(app, "APPROVED")}
                  className="shrink-0 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  อนุมัติ (APPROVE)
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
