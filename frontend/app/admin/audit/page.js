"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

export default function AdminAuditPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  function load(token, action) {
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
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
    load(token, "");
  }, [router]);

  // Menu visibility is UX only — the server enforces admin:audit:read on
  // every request regardless of what this page shows (ADM-DEC-002: no
  // Frontend guard counts as authorization).
  function handleFilterSubmit(e) {
    e.preventDefault();
    load(getAccessToken(), actionFilter);
  }

  if (user === undefined || loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-4xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (user?.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-4xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะบัญชีแอดมินเท่านั้น
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
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
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">เวลา</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Target</th>
                  <th className="px-4 py-2.5">เหตุผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 text-gray-500">
                      {new Date(a.createdAt).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {a.action}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{a.actorId}</td>
                    <td className="px-4 py-2.5 text-gray-600">{a.targetId}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {a.reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
