"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

export default function AdminDisputeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [user, setUser] = useState(undefined);
  const [order, setOrder] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function load(token) {
    setLoading(true);
    apiFetch(`/api/orders/admin/${params.id}`, { token })
      .then((data) => {
        setOrder(data.order);
        setEvidence(data.evidence);
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
    load(token);
  }, [params.id, router]);

  // Menu visibility is UX only — the server enforces admin:dispute:hold /
  // admin:dispute:release on every request regardless of what this page shows
  // (ADM-DEC-002: no Frontend guard counts as authorization).
  async function submit(action) {
    const token = getAccessToken();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("กรุณาระบุเหตุผลก่อนดำเนินการ");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const updated = await apiFetch(
        `/api/orders/admin/${params.id}/${action}`,
        {
          method: "POST",
          token,
          body: { reason: trimmedReason, version: order.version },
        },
      );
      setOrder(updated);
      setReason("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined || loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-3xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (user?.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-3xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะบัญชีแอดมินเท่านั้น
        </p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-3xl px-4 py-10 text-red-600">
          {error || "ไม่พบคำสั่งซื้อนี้"}
        </p>
      </main>
    );
  }

  const onHold = order.paymentSimulationStatus === "ON_HOLD";

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          ข้อพิพาทคำสั่งซื้อ
        </h1>
        <p className="mb-6 text-sm text-gray-500">{order.productTitle}</p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-5 sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">ราคา</p>
            <p className="font-medium text-gray-900">{baht(order.price)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">สถานะคำสั่งซื้อ</p>
            <p className="font-medium text-gray-900">{order.status}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">สถานะเงิน (จำลอง)</p>
            <p
              className={`font-medium ${onHold ? "text-amber-600" : "text-emerald-600"}`}
            >
              {onHold ? "ถูกระงับ (ON_HOLD)" : "ปกติ (RELEASE_PENDING)"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">version</p>
            <p className="font-medium text-gray-900">{order.version}</p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            หลักฐาน ({evidence.length})
          </h2>
          {evidence.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีหลักฐานแนบมา</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {evidence.map((e) => (
                <li key={e.id} className="py-2.5 text-sm">
                  <a
                    href={e.evidenceRef}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {e.evidenceRef}
                  </a>
                  {e.note && <p className="mt-1 text-gray-600">{e.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            การตัดสินใจ
          </h2>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="ระบุเหตุผล เช่น รอหลักฐานเพิ่มเติมจากผู้ขาย"
          />
          <div className="flex gap-2">
            <button
              onClick={() => submit("hold")}
              disabled={busy || onHold}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              ระงับเงิน (Hold)
            </button>
            <button
              onClick={() => submit("release")}
              disabled={busy || !onHold}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              ปล่อยเงิน (Release)
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
