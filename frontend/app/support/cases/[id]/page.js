"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import { apiFetch, fetchAuthedBlobUrl } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";

// `id` in this route is the order id (see disputeService.getByOrderId) —
// the CSS-002 search page only has order ids, not dispute ids, to link from.
export default function DisputeCasePage() {
  const { id: orderId } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [dispute, setDispute] = useState(null);
  const [error, setError] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState(null);

  const isAgent = user?.role === "SUPPORT" || user?.role === "ADMIN";

  function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    apiFetch(`/api/orders/disputes/by-order/${orderId}`, { token })
      .then(setDispute)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setUser(getStoredUser());
    load();
  }, [orderId, router]);

  async function handleViewEvidence(ev) {
    setOpeningEvidenceId(ev.id);
    setError("");
    try {
      const objectUrl = await fetchAuthedBlobUrl(
        `/api/orders/disputes/${dispute.id}/evidence/${ev.id}`,
      );
      window.open(objectUrl, "_blank", "noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningEvidenceId(null);
    }
  }

  async function handleDecision(decision) {
    if (!decisionReason.trim()) {
      setError("กรุณากรอกเหตุผลก่อนตัดสินเคส");
      return;
    }
    const token = getAccessToken();
    setDeciding(true);
    setError("");
    try {
      await apiFetch(`/api/orders/disputes/${dispute.id}/decision`, {
        method: "POST",
        token,
        body: { decision, reason: decisionReason },
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeciding(false);
    }
  }

  if (error && !dispute) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-2xl px-4 py-10 text-red-600">{error}</p>
      </main>
    );
  }

  if (!dispute || user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-2xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            ข้อพิพาทคำสั่งซื้อ
          </h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              dispute.status === "DECIDED"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {dispute.status}
          </span>
        </div>
        <p className="mb-4 text-xs text-gray-400">Order {dispute.orderId}</p>

        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            เหตุผลที่เปิดเคส
          </h2>
          <p className="text-sm text-gray-700">{dispute.reason}</p>
        </div>

        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            หลักฐานประกอบ ({dispute.evidence.length})
          </h2>
          {dispute.evidence.length === 0 && (
            <p className="text-sm text-gray-400">ยังไม่มีหลักฐานแนบมา</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {dispute.evidence.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => handleViewEvidence(ev)}
                disabled={openingEvidenceId === ev.id}
                className="block aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100 text-center text-xs text-gray-500 hover:border-emerald-400 disabled:opacity-50"
              >
                <span className="flex h-full items-center justify-center">
                  {openingEvidenceId === ev.id
                    ? "กำลังเปิด..."
                    : ev.fileType.startsWith("video/")
                      ? "🎬 วิดีโอ"
                      : "🖼️ รูปภาพ"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {dispute.status === "DECIDED" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">
              ผลการตัดสิน: {dispute.decision}
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              {dispute.decisionReason}
            </p>
          </div>
        ) : isAgent ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">
              บันทึกผลการพิจารณา
            </h2>
            <textarea
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              rows={3}
              placeholder="เหตุผลประกอบการตัดสิน (บังคับกรอก)"
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleDecision("APPROVE_REFUND")}
                disabled={deciding}
                className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                อนุมัติคืนเงิน
              </button>
              <button
                onClick={() => handleDecision("REJECT")}
                disabled={deciding}
                className="flex-1 rounded-md border border-red-300 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                ปฏิเสธคำร้อง
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            รอเจ้าหน้าที่ตรวจสอบและตัดสินเคส
          </p>
        )}
      </section>
      <Footer />
    </main>
  );
}
