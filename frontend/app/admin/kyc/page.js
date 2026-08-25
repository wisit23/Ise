"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

export default function AdminKycQueuePage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reasonById, setReasonById] = useState({});
  const [decidingId, setDecidingId] = useState(null);

  function loadQueue(token) {
    setLoading(true);
    apiFetch("/api/auth/admin/kyc?status=PENDING", { token })
      .then((data) => setApplications(data.items))
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
    loadQueue(token);
  }, [router]);

  // Menu visibility is UX only — the server enforces admin:kyc:decide on every
  // request regardless of what this page shows (ADM-DEC-002: no Frontend guard
  // counts as authorization).
  async function decide(application, decision) {
    const token = getAccessToken();
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
                className="rounded-lg border border-gray-200 bg-white p-5"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {app.user.firstName} {app.user.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{app.user.email}</p>
                  </div>
                  <a
                    href={app.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-emerald-700 hover:underline"
                  >
                    ดูเอกสาร
                  </a>
                </div>

                <label className="mb-1 block text-sm font-medium text-gray-700">
                  เหตุผลการตัดสินใจ
                </label>
                <textarea
                  value={reasonById[app.id] || ""}
                  onChange={(e) =>
                    setReasonById({ ...reasonById, [app.id]: e.target.value })
                  }
                  rows={2}
                  className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="ระบุเหตุผล เช่น เอกสารครบถ้วนตรงกับข้อมูลที่ลงทะเบียน"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => decide(app, "VERIFIED")}
                    disabled={decidingId === app.id}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => decide(app, "REJECTED")}
                    disabled={decidingId === app.id}
                    className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Footer />
    </main>
  );
}
