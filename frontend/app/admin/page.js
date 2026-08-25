"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { getAccessToken, getStoredUser } from "../../lib/auth";

const MENU = [
  {
    href: "/admin/kyc",
    icon: "🪪",
    title: "คิวตรวจ KYC",
    description: "อนุมัติ/ปฏิเสธใบสมัคร KYC ของผู้ขาย",
  },
  {
    href: "/admin/reports",
    icon: "🚩",
    title: "รายงาน (Reports)",
    description: "ตรวจสอบรายงาน → ระงับผู้ใช้ / ลบสินค้า / ยกเลิก",
  },
  {
    href: "/admin/audit",
    icon: "📋",
    title: "Audit Log",
    description: "ดูประวัติการตัดสินใจทั้งหมดของแอดมิน",
  },
];

export default function AdminPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [disputeOrderId, setDisputeOrderId] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  // Menu visibility is UX only — every /admin/* request is still enforced
  // server-side by requirePermission regardless of what this page shows.
  function goToDispute(e) {
    e.preventDefault();
    const id = disputeOrderId.trim();
    if (id) router.push(`/admin/disputes/${id}`);
  }

  if (user === undefined) {
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
        <h1 className="mb-1 text-xl font-bold text-gray-900">Admin Panel</h1>
        <p className="mb-6 text-sm text-gray-500">
          สวัสดี {user.firstName} — เลือกเมนูที่ต้องการด้านล่าง
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:shadow-md"
            >
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="font-semibold text-gray-900">{item.title}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}

          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
            <span className="text-2xl">⚖️</span>
            <div className="w-full">
              <p className="font-semibold text-gray-900">
                ข้อพิพาทคำสั่งซื้อ (Disputes)
              </p>
              <p className="mt-1 mb-3 text-sm text-gray-500">
                ดูหลักฐาน + ระงับ/ปล่อยเงินจำลอง — ต้องระบุ order id
                ก่อน
              </p>
              <form onSubmit={goToDispute} className="flex gap-2">
                <input
                  value={disputeOrderId}
                  onChange={(e) => setDisputeOrderId(e.target.value)}
                  placeholder="วาง order id ตรงนี้"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                >
                  ไปที่ Dispute
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
