"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch, mediaUrl } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const KYC_STATUS_LABEL = {
  PENDING: "รอตรวจสอบ",
  VERIFIED: "อนุมัติแล้ว",
  REJECTED: "ถูกปฏิเสธ",
};

const KYC_STATUS_BADGE = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  VERIFIED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-50 text-red-800 border-red-200",
};

export default function AdminKycPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(undefined);
  const [tab, setTab] = useState("PENDING");
  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  // Modals state
  const [previewImage, setPreviewImage] = useState(null);
  const [rejectingUser, setRejectingUser] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login?next=/admin/kyc");
      return;
    }
    const user = getStoredUser();
    setCurrentUser(user);
    if (user?.role !== "ADMIN") {
      setLoading(false);
      return;
    }

    loadApplications(tab);
  }, [tab, router]);

  async function loadApplications(statusTab) {
    const token = getAccessToken();
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const query = statusTab === "ALL" ? "" : `?status=${statusTab}`;
      const data = await apiFetch(`/api/auth/admin/kyc${query}`, { token });
      setApplications(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(userId, userName) {
    if (!window.confirm(`ยืนยันการอนุมัติสิทธิ์ผู้ขายให้กับ "${userName}" หรือไม่?`)) {
      return;
    }

    const token = getAccessToken();
    setSubmittingAction(true);
    setActionNotice("");
    try {
      await apiFetch(`/api/auth/admin/kyc/${userId}/approve`, {
        method: "POST",
        token,
      });
      setActionNotice(`อนุมัติสิทธิ์ผู้ขายให้ ${userName} เรียบร้อยแล้ว`);
      loadApplications(tab);
    } catch (err) {
      alert(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleConfirmReject(e) {
    e.preventDefault();
    if (!rejectingUser) return;

    const token = getAccessToken();
    setSubmittingAction(true);
    try {
      await apiFetch(`/api/auth/admin/kyc/${rejectingUser.userId}/reject`, {
        method: "POST",
        token,
        body: { reason: rejectReason },
      });
      setActionNotice(`ปฏิเสธคำขอของ ${rejectingUser.firstName} เรียบร้อยแล้ว`);
      setRejectingUser(null);
      setRejectReason("");
      loadApplications(tab);
    } catch (err) {
      alert(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  }

  if (currentUser === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-5xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (currentUser?.role !== "ADMIN") {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <NavBar />
        <section className="mx-auto w-full max-w-lg flex-1 px-4 py-16 text-center">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8">
            <span className="text-4xl">🚫</span>
            <h1 className="mt-3 text-lg font-bold text-red-900">
              ไม่มีสิทธิ์เข้าถึงหน้านี้
            </h1>
            <p className="mt-2 text-sm text-red-700">
              หน้านี้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น บัญชีของคุณคือ{" "}
              <span className="font-semibold">{currentUser?.role || "GUEST"}</span>
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              กลับหน้าแรก
            </Link>
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Link href="/" className="hover:text-emerald-600">
                หน้าแรก
              </Link>
              <span>/</span>
              <span className="text-gray-800">แผงควบคุมแอดมิน</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              🛡️ ตรวจสอบการยืนยันตัวตนผู้ขาย (KYC Verification)
            </h1>
            <p className="text-sm text-gray-500">
              ตรวจสอบข้อมูลบัตรประชาชน ที่อยู่ และอนุมัติ/ปฏิเสธสิทธิ์การเป็นผู้ขาย
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-white p-1 border border-gray-200 shadow-sm text-xs font-medium">
            <button
              onClick={() => setTab("PENDING")}
              className={`rounded-md px-3 py-1.5 transition ${
                tab === "PENDING"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              รอตรวจสอบ
            </button>
            <button
              onClick={() => setTab("VERIFIED")}
              className={`rounded-md px-3 py-1.5 transition ${
                tab === "VERIFIED"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              อนุมัติแล้ว
            </button>
            <button
              onClick={() => setTab("REJECTED")}
              className={`rounded-md px-3 py-1.5 transition ${
                tab === "REJECTED"
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              ถูกปฏิเสธ
            </button>
            <button
              onClick={() => setTab("ALL")}
              className={`rounded-md px-3 py-1.5 transition ${
                tab === "ALL"
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              ทั้งหมด
            </button>
          </div>
        </div>

        {actionNotice && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            ✓ {actionNotice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
            กำลังโหลดรายการคำขอ...
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
            ไม่มีรายการคำขอในหมวดหมู่นี้
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">ผู้ยื่นคำขอ</th>
                    <th className="px-4 py-3">ชื่อร้านค้า / ที่อยู่</th>
                    <th className="px-4 py-3">รหัสบัตรประชาชน</th>
                    <th className="px-4 py-3">รูปบัตรประชาชน</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {applications.map((app) => (
                    <tr key={app.userId} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">
                          {app.firstName} {app.lastName}
                        </p>
                        <p className="text-xs text-gray-500">{app.email}</p>
                        <p className="text-xs text-gray-500">📞 {app.phone || "-"}</p>
                      </td>

                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-gray-800">
                          🏪 {app.shopName || "-"}
                        </p>
                        <p className="text-xs text-gray-500 truncate" title={app.address}>
                          📍 {app.address || "-"}
                        </p>
                        {app.bankAccount && (
                          <p className="text-[11px] text-gray-400">
                            🏦 {app.bankAccount}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">
                        {app.idCardNumber || "-"}
                      </td>

                      <td className="px-4 py-3">
                        {app.kycDocumentUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                url: mediaUrl(app.kycDocumentUrl),
                                name: `${app.firstName} ${app.lastName}`,
                                idCard: app.idCardNumber,
                              })
                            }
                            className="group relative h-12 w-20 overflow-hidden rounded-md border border-gray-300 bg-gray-100 hover:border-emerald-500 transition"
                          >
                            <img
                              src={mediaUrl(app.kycDocumentUrl)}
                              alt="รูปถ่ายบัตรประชาชน"
                              className="h-full w-full object-cover group-hover:scale-105 transition"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition">
                              ดูรูปเต็ม
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">ไม่มีรูป</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            KYC_STATUS_BADGE[app.kycStatus] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {KYC_STATUS_LABEL[app.kycStatus] || app.kycStatus}
                        </span>
                        {app.rejectionReason && (
                          <p className="mt-1 text-[11px] text-red-600 max-w-xs">
                            เหตุผล: {app.rejectionReason}
                          </p>
                        )}
                        {app.verifiedAt && (
                          <p className="mt-0.5 text-[10px] text-gray-400">
                            อนุมัติเมื่อ: {new Date(app.verifiedAt).toLocaleDateString("th-TH")}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {app.kycStatus !== "VERIFIED" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleApprove(app.userId, `${app.firstName} ${app.lastName}`)
                              }
                              disabled={submittingAction}
                              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                            >
                              ✓ อนุมัติ
                            </button>
                          )}
                          {app.kycStatus !== "REJECTED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingUser(app);
                                setRejectReason("");
                              }}
                              disabled={submittingAction}
                              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                            >
                              ✕ ปฏิเสธ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Preview Full ID Card Photo */}
        {previewImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="relative max-w-2xl w-full rounded-xl bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    รูปถ่ายบัตรประชาชน: {previewImage.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">
                    รหัสบัตรประชาชน: {previewImage.idCard || "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center max-h-[70vh]">
                <img
                  src={previewImage.url}
                  alt="รูปถ่ายบัตรประชาชนขยายใหญ่"
                  className="max-h-[68vh] w-auto object-contain"
                />
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="rounded-lg bg-gray-800 px-5 py-2 text-xs font-medium text-white hover:bg-gray-900"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Reject Reason */}
        {rejectingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <form
              onSubmit={handleConfirmReject}
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
            >
              <h3 className="text-base font-bold text-gray-900">
                ปฏิเสธคำขอยืนยันตัวตน
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                ผู้ยื่นคำขอ: {rejectingUser.firstName} {rejectingUser.lastName}
              </p>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  เลือกเหตุผลที่ปฏิเสธ หรือระบุข้อความ <span className="text-red-500">*</span>
                </label>

                <div className="mb-2 flex flex-wrap gap-1.5">
                  {[
                    "รูปถ่ายบัตรประชาชนไม่ชัดเจน / มัว",
                    "ชื่อ-นามสกุลไม่ตรงกับบัตรประชาชน",
                    "เลขประจำตัวประชาชน 13 หลักไม่ถูกต้อง",
                    "ข้อมูลที่อยู่ไม่ครบถ้วนสมบูรณ์",
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRejectReason(r)}
                      className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700 hover:border-emerald-500 hover:bg-emerald-50"
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <textarea
                  required
                  rows={3}
                  placeholder="ระบุเหตุผลเพื่อให้ผู้ใช้ทราบและแก้ไข..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-md border border-gray-300 p-2.5 text-xs outline-none focus:border-red-500"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingUser(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submittingAction ? "กำลังบันทึก..." : "ยืนยันการปฏิเสธ"}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
