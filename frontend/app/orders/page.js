"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

const STATUS_LABEL = {
  pending: "อยู่ในตะกร้า",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const TABS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอชำระเงิน" },
  { key: "completed", label: "สำเร็จ" },
  { key: "cancelled", label: "ยกเลิก" },
];

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    apiFetch("/api/orders/mine", { token })
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const filtered =
    tab === "all" ? items : items.filter((o) => o.status === tab);

  const hasPending = items.some((o) => o.status === "pending");

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          คำสั่งซื้อของฉัน
        </h1>
        {hasPending && (
          <p className="mb-4 text-sm text-gray-500">
            มีสินค้าที่ล็อกไว้รอชำระเงิน ไปที่{" "}
            <Link href="/cart" className="text-emerald-600 hover:underline">
              ตะกร้า
            </Link>{" "}
            เพื่อชำระเงิน
          </p>
        )}

        <div className="mb-6 flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                tab === t.key
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-gray-500">กำลังโหลด...</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-gray-500">ไม่มีคำสั่งซื้อในหมวดนี้</p>
        )}

        <ul className="flex flex-col gap-3">
          {filtered.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{o.productTitle}</p>
                <p className="text-sm text-gray-500">
                  ฿{o.price.toLocaleString("th-TH")} · สั่งซื้อเมื่อ{" "}
                  {new Date(o.createdAt).toLocaleDateString("th-TH")}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  STATUS_STYLE[o.status] || "bg-gray-100 text-gray-600"
                }`}
              >
                {STATUS_LABEL[o.status] || o.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Footer />
    </main>
  );
}
