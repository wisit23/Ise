"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function AuditSection({ token }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  function load(action) {
    setLoading(true);
    const query = action ? `?action=${encodeURIComponent(action)}` : "";
    apiFetch(`/api/auth/admin/audit${query}`, { token })
      .then((data) => {
        setEntries(data.items);
        setTotal(data.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load("");
  }, []);

  function handleFilterSubmit(e) {
    e.preventDefault();
    load(actionFilter);
  }

  if (loading) {
    return <p className="py-10 text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div className="animate-fade-in-up flex flex-col min-h-full">
      <h1 className="mb-1 text-xl font-bold text-gray-900">
        Audit Log ของแอดมิน
      </h1>
      <p className="mb-6 text-sm text-gray-500">ทั้งหมด {total} รายการ</p>

      <form onSubmit={handleFilterSubmit} className="mb-4 flex gap-2">
        <input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="กรองตาม action เช่น USER_SUSPENDED"
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          กรอง
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {entries.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">
          ไม่มี audit log ที่ตรงกับเงื่อนไข
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm text-gray-700">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-4 font-semibold">เวลา</th>
                <th className="p-4 font-semibold">Admin ID</th>
                <th className="p-4 font-semibold">Action</th>
                <th className="p-4 font-semibold">Target User</th>
                <th className="p-4 font-semibold">Target Product</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-4 font-mono text-xs">{log.adminId}</td>
                  <td className="p-4 font-semibold text-emerald-700">
                    {log.action}
                  </td>
                  <td className="p-4 font-mono text-xs">
                    {log.targetUserId || "-"}
                  </td>
                  <td className="p-4 font-mono text-xs">
                    {log.targetProductId || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
