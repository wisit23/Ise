"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const DECISIONS = [
  { value: "SUSPEND_USER", label: "ระงับผู้ใช้" },
  { value: "REMOVE_PRODUCT", label: "ลบสินค้า" },
  { value: "DISMISS", label: "ยกเลิกรายงาน" },
];

export default function AdminReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reasonById, setReasonById] = useState({});
  const [decisionById, setDecisionById] = useState({});
  const [busyId, setBusyId] = useState(null);

  function loadReports(token) {
    setLoading(true);
    apiFetch("/api/auth/admin/reports?status=OPEN", { token })
      .then((data) => setReports(data.items))
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
    loadReports(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Menu visibility is UX only — the server enforces admin:report:* on every
  // request regardless of what this page shows (ADM-DEC-002: no Frontend
  // guard counts as authorization).
  async function review(report) {
    const token = getAccessToken();
    setError("");
    setBusyId(report.id);
    try {
      const updated = await apiFetch(`/api/auth/admin/reports/${report.id}/review`, {
        method: "POST",
        token,
      });
      setReports((prev) => prev.map((r) => (r.id === report.id ? updated : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function act(report) {
    const token = getAccessToken();
    const decision = decisionById[report.id];
    const reason = (reasonById[report.id] || "").trim();
    if (!decision) {
      setError("กรุณาเลือกการตัดสินใจ");
      return;
    }
    if (!reason) {
      setError("กรุณาระบุเหตุผลก่อนตัดสินใจ");
      return;
    }
    setError("");
    setBusyId(report.id);
    try {
      await apiFetch(`/api/auth/admin/reports/${report.id}/action`, {
        method: "POST",
        token,
        body: { decision, reason },
      });
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
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
          คิวรายงาน (Reports)
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          เปิดอยู่ {reports.length} รายการ
        </p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {reports.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">
            ไม่มีรายงานที่เปิดอยู่
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-gray-200 bg-white p-5"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.reason}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {r.targetId && `เป้าหมาย: ผู้ใช้ ${r.targetId}`}
                      {r.productId && `เป้าหมาย: สินค้า ${r.productId}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      r.status === "OPEN"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>

                {r.status === "OPEN" ? (
                  <button
                    onClick={() => review(r)}
                    disabled={busyId === r.id}
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    เริ่มตรวจสอบ
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <select
                      value={decisionById[r.id] || ""}
                      onChange={(e) =>
                        setDecisionById({ ...decisionById, [r.id]: e.target.value })
                      }
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">เลือกการตัดสินใจ</option>
                      {DECISIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={reasonById[r.id] || ""}
                      onChange={(e) =>
                        setReasonById({ ...reasonById, [r.id]: e.target.value })
                      }
                      rows={2}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="ระบุเหตุผลของการตัดสินใจ"
                    />
                    <button
                      onClick={() => act(r)}
                      disabled={busyId === r.id}
                      className="self-start rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ยืนยันการตัดสินใจ
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Footer />
    </main>
  );
}
