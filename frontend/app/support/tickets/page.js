"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Pagination from "../../../components/Pagination";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const CATEGORIES = [
  { value: "ORDER", label: "คำสั่งซื้อ" },
  { value: "PAYMENT", label: "การชำระเงิน" },
  { value: "ACCOUNT", label: "บัญชีผู้ใช้" },
  { value: "TECHNICAL", label: "ปัญหาการใช้งาน" },
  { value: "OTHER", label: "อื่นๆ" },
];

const STATUS_LABEL = {
  NEW: "รอรับเรื่อง",
  ASSIGNED: "มีเจ้าหน้าที่รับเรื่องแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  PENDING_USER: "รอข้อมูลจากคุณ",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิดเรื่อง",
  ESCALATED: "ยกระดับความสำคัญ",
};

const STATUS_STYLE = {
  NEW: "bg-amber-50 text-amber-700",
  ASSIGNED: "bg-sky-50 text-sky-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  PENDING_USER: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-gray-100 text-gray-500",
  ESCALATED: "bg-red-50 text-red-700",
};

const PAGE_SIZE = 10;

export default function MyTicketsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    category: "ORDER",
    description: "",
    orderId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [myOrders, setMyOrders] = useState([]);
  const [myId, setMyId] = useState(null);

  function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    apiFetch(`/api/support/tickets/mine?page=${page}&limit=${PAGE_SIZE}`, {
      token,
    })
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [page, router]);

  // Lets the requester optionally tie the ticket to one of their own
  // orders so Admin can identify a real counterparty later (see
  // handleCreate) instead of only ever being able to act against whoever
  // happened to file the ticket.
  useEffect(() => {
    if (!showForm) return;
    const token = getAccessToken();
    if (!token) return;
    setMyId(getStoredUser()?.id || null);
    Promise.all([
      apiFetch("/api/orders/mine?limit=20", { token }).catch(() => ({
        items: [],
      })),
      apiFetch("/api/orders/selling?limit=20", { token }).catch(() => ({
        items: [],
      })),
    ]).then(([mine, selling]) => {
      const seen = new Set();
      const combined = [...(mine.items || []), ...(selling.items || [])].filter(
        (o) => (seen.has(o.id) ? false : (seen.add(o.id), true)),
      );
      setMyOrders(combined);
    });
  }, [showForm]);

  async function handleCreate(e) {
    e.preventDefault();
    const token = getAccessToken();
    setSubmitting(true);
    setFormError("");
    try {
      const relatedOrder = myOrders.find((o) => o.id === form.orderId);
      const targetId = relatedOrder
        ? relatedOrder.buyerId === myId
          ? relatedOrder.sellerId
          : relatedOrder.buyerId
        : undefined;
      const ticket = await apiFetch("/api/support/tickets", {
        method: "POST",
        token,
        body: {
          subject: form.subject,
          category: form.category,
          description: form.description,
          orderId: form.orderId || undefined,
          targetId,
        },
      });
      router.push(`/support/tickets/${ticket.id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            ตั๋วแจ้งปัญหาของฉัน
          </h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + เปิดตั๋วใหม่
          </button>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          ค้นคำตอบด่วนได้ที่{" "}
          <Link href="/help" className="text-emerald-600 hover:underline">
            ศูนย์ช่วยเหลือ
          </Link>{" "}
          ก่อนเปิดตั๋วก็ได้
        </p>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                หัวข้อ
              </label>
              <input
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="สรุปปัญหาสั้นๆ"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                หมวดหมู่
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {myOrders.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  เกี่ยวข้องกับคำสั่งซื้อไหน (ถ้ามี)
                </label>
                <select
                  value={form.orderId}
                  onChange={(e) =>
                    setForm({ ...form, orderId: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">— ไม่เกี่ยวข้องกับคำสั่งซื้อใด —</option>
                  {myOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.productTitle} ({o.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
                {form.orderId && (
                  <p className="mt-1 text-xs text-gray-400">
                    ระบบจะแจ้งให้เจ้าหน้าที่ทราบว่าคำร้องนี้เกี่ยวข้องกับอีกฝ่ายในคำสั่งซื้อนี้ด้วย
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                รายละเอียด
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={4}
                placeholder="อธิบายปัญหาให้ละเอียดที่สุด"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "กำลังส่ง..." : "ส่งตั๋ว"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-gray-400">ยังไม่มีตั๋วแจ้งปัญหา</p>
        )}

        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/support/tickets/${t.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-emerald-400"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{t.subject}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                      STATUS_STYLE[t.status] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {t.ticketNumber} ·{" "}
                  {new Date(t.createdAt).toLocaleDateString("th-TH")}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </section>
      <Footer />
    </main>
  );
}
