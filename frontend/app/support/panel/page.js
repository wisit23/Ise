"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Pagination from "../../../components/Pagination";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const SECTIONS = [
  { key: "tickets", label: "ตั๋วสนับสนุน", icon: "🎧" },
  { key: "disputes", label: "ข้อพิพาท", icon: "⚖️" },
  { key: "orders", label: "ค้นหาออเดอร์", icon: "🔎" },
  { key: "faq", label: "จัดการ FAQ", icon: "📚" },
];

const TICKET_STATUS_LABEL = {
  NEW: "รอรับเรื่อง",
  ASSIGNED: "รับเรื่องแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  PENDING_USER: "รอข้อมูลจากลูกค้า",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิดเรื่อง",
  ESCALATED: "เกิน SLA",
};

const TICKET_STATUS_STYLE = {
  NEW: "bg-amber-50 text-amber-700",
  ASSIGNED: "bg-sky-50 text-sky-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  PENDING_USER: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-gray-100 text-gray-500",
  ESCALATED: "bg-red-50 text-red-700",
};

const PRIORITY_STYLE = {
  URGENT: "bg-red-50 text-red-700",
  HIGH: "bg-amber-50 text-amber-700",
  NORMAL: "bg-gray-100 text-gray-600",
  LOW: "bg-gray-100 text-gray-500",
};

const DISPUTE_STATUS_LABEL = {
  OPEN: "รอตรวจสอบ",
  NEEDS_INFO: "รอข้อมูลเพิ่มเติม",
  DECIDED: "ตัดสินแล้ว",
};

const DISPUTE_STATUS_STYLE = {
  OPEN: "bg-amber-50 text-amber-700",
  NEEDS_INFO: "bg-amber-50 text-amber-700",
  DECIDED: "bg-emerald-50 text-emerald-700",
};

const ORDER_STATUS_LABEL = {
  pending: "รอชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
  disputed: "อยู่ระหว่างข้อพิพาท",
  refunded: "คืนเงินแล้ว",
};

const HELP_CATEGORIES = [
  { value: "ORDER", label: "คำสั่งซื้อ" },
  { value: "PAYMENT", label: "การชำระเงิน" },
  { value: "ACCOUNT", label: "บัญชีผู้ใช้" },
  { value: "TECHNICAL", label: "ปัญหาการใช้งาน" },
  { value: "OTHER", label: "อื่นๆ" },
];

const PAGE_SIZE = 10;

function shortId(id) {
  return id?.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function StatCard({ label, value, tone = "default" }) {
  const toneClass =
    tone === "danger" ? "border-red-200 bg-red-50" : "border-gray-200 bg-white";
  const valueClass = tone === "danger" ? "text-red-700" : "text-gray-900";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>
        {value === null ? "…" : value}
      </p>
    </div>
  );
}

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            value === o.key
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.label}
          {o.count !== undefined ? ` (${o.count})` : ""}
        </button>
      ))}
    </div>
  );
}

// --- Tickets ---------------------------------------------------------------

function TicketsSection({ token, userId }) {
  const [scope, setScope] = useState("unassigned");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total: null,
    unassigned: null,
    mine: null,
    escalated: null,
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE, scope });
    if (q) params.set("q", q);
    apiFetch(`/api/support/tickets/queue?${params}`, { token })
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, scope, q, token]);

  useEffect(() => {
    // Cheap parallel counts (limit=1, only .total is read) to fill the stat row.
    const fetchCount = (params) =>
      apiFetch(`/api/support/tickets/queue?${params}&limit=1`, { token })
        .then((d) => d.total)
        .catch(() => null);
    fetchCount("scope=all").then((v) => setStats((s) => ({ ...s, total: v })));
    fetchCount("scope=unassigned").then((v) =>
      setStats((s) => ({ ...s, unassigned: v })),
    );
    fetchCount("scope=mine").then((v) => setStats((s) => ({ ...s, mine: v })));
    fetchCount("scope=all&status=ESCALATED").then((v) =>
      setStats((s) => ({ ...s, escalated: v })),
    );
  }, [token]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="ทั้งหมด" value={stats.total} />
        <StatCard label="รอรับเรื่อง" value={stats.unassigned} />
        <StatCard label="ที่ฉันรับผิดชอบ" value={stats.mine} />
        <StatCard label="เกิน SLA" value={stats.escalated} tone="danger" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          value={scope}
          onChange={(v) => {
            setScope(v);
            setPage(1);
          }}
          options={[
            { key: "unassigned", label: "รอรับเรื่อง" },
            { key: "mine", label: "ที่ฉันรับผิดชอบ" },
            { key: "all", label: "ทั้งหมด" },
          ]}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="ค้นหาเรื่อง หรือเลขตั๋ว..."
            className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ค้นหา
          </button>
        </form>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <th className="p-3 font-medium">ตั๋ว</th>
              <th className="p-3 font-medium">เรื่อง</th>
              <th className="p-3 font-medium">ความสำคัญ</th>
              <th className="p-3 font-medium">สถานะ</th>
              <th className="p-3 font-medium">ครบกำหนด SLA</th>
              <th className="p-3 font-medium text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  ไม่มีตั๋วในหมวดนี้
                </td>
              </tr>
            )}
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="p-3 font-mono text-xs text-gray-500">
                  {t.ticketNumber}
                </td>
                <td className="max-w-[220px] truncate p-3 text-gray-900">
                  {t.subject}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      PRIORITY_STYLE[t.priority] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      TICKET_STATUS_STYLE[t.status] ||
                      "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {TICKET_STATUS_LABEL[t.status] || t.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {new Date(t.slaDueAt).toLocaleString("th-TH")}
                </td>
                <td className="p-3 text-right">
                  <Link
                    href={`/support/tickets/${t.id}`}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {t.assigneeId === userId
                      ? "เปิดตั๋ว"
                      : t.assigneeId
                        ? "ดูรายละเอียด"
                        : "รับเรื่อง"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

// --- Disputes ----------------------------------------------------------------

function DisputesSection({ token }) {
  const [status, setStatus] = useState("OPEN");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total: null,
    open: null,
    decided: null,
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    apiFetch(`/api/orders/disputes/queue?${params}`, { token })
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, status, q, token]);

  useEffect(() => {
    const fetchCount = (params) =>
      apiFetch(`/api/orders/disputes/queue?${params}&limit=1`, { token })
        .then((d) => d.total)
        .catch(() => null);
    fetchCount("").then((v) => setStats((s) => ({ ...s, total: v })));
    fetchCount("status=OPEN").then((v) => setStats((s) => ({ ...s, open: v })));
    fetchCount("status=DECIDED").then((v) =>
      setStats((s) => ({ ...s, decided: v })),
    );
  }, [token]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="ทั้งหมด" value={stats.total} />
        <StatCard label="รอตรวจสอบ" value={stats.open} tone="danger" />
        <StatCard label="ตัดสินแล้ว" value={stats.decided} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { key: "OPEN", label: "รอตรวจสอบ" },
            { key: "DECIDED", label: "ตัดสินแล้ว" },
            { key: "", label: "ทั้งหมด" },
          ]}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="ค้นหาเหตุผล หรือ Order ID..."
            className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ค้นหา
          </button>
        </form>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <th className="p-3 font-medium">สินค้า / Order</th>
              <th className="p-3 font-medium">เหตุผล</th>
              <th className="p-3 font-medium text-right">ยอดเงิน</th>
              <th className="p-3 font-medium">สถานะ</th>
              <th className="p-3 font-medium">เปิดเมื่อ</th>
              <th className="p-3 font-medium text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  ไม่มีข้อพิพาทในหมวดนี้
                </td>
              </tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="p-3">
                  <p className="max-w-[180px] truncate text-gray-900">
                    {d.order?.productTitle || shortId(d.orderId)}
                  </p>
                  <p className="font-mono text-[11px] text-gray-400">
                    {shortId(d.orderId)}
                  </p>
                </td>
                <td className="max-w-[220px] truncate p-3 text-gray-600">
                  {d.reason}
                </td>
                <td className="p-3 text-right font-medium text-gray-900">
                  {d.order?.price
                    ? `฿${d.order.price.toLocaleString("th-TH")}`
                    : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      DISPUTE_STATUS_STYLE[d.status] ||
                      "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {DISPUTE_STATUS_LABEL[d.status] || d.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {new Date(d.createdAt).toLocaleDateString("th-TH")}
                </td>
                <td className="p-3 text-right">
                  <Link
                    href={`/support/cases/${d.orderId}`}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {d.status === "DECIDED" ? "ดูรายละเอียด" : "ตรวจสอบ"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

// --- Order search --------------------------------------------------------

function OrdersSection({ token }) {
  const [orderId, setOrderId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [items, setItems] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (orderId) params.set("orderId", orderId);
      if (buyerId) params.set("buyerId", buyerId);
      if (sellerId) params.set("sellerId", sellerId);
      const data = await apiFetch(`/api/orders/support/search?${params}`, {
        token,
      });
      setItems(data.items);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        ค้นด้วยรหัสคำสั่งซื้อ รหัสผู้ซื้อ หรือรหัสผู้ขาย
        เพื่อดูรายละเอียดออเดอร์ที่ไม่มีในคิวข้อพิพาท (เช่น ยังไม่ได้เปิดเคส)
      </p>

      <form
        onSubmit={handleSearch}
        className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-3"
      >
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Order ID"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <input
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          placeholder="Buyer ID"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <input
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          placeholder="Seller ID"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading || (!orderId && !buyerId && !sellerId)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-3"
        >
          {loading ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {searched && !loading && items.length === 0 && !error && (
        <p className="text-sm text-gray-400">ไม่พบคำสั่งซื้อที่ตรงเงื่อนไข</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((o) => (
          <li
            key={o.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-900">{o.productTitle}</p>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                {ORDER_STATUS_LABEL[o.status] || o.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Order {o.id} · ฿{o.price.toLocaleString("th-TH")} · ผู้ซื้อ{" "}
              {o.buyerId} · ผู้ขาย {o.sellerId}
            </p>
            {o.status === "disputed" && (
              <Link
                href={`/support/cases/${o.id}`}
                className="mt-2 inline-block text-sm font-medium text-emerald-600 hover:underline"
              >
                ดูข้อพิพาท →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- FAQ management --------------------------------------------------------

function FaqSection({ token }) {
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "OTHER" });
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: 50 });
    if (status) params.set("status", status);
    apiFetch(`/api/support/help/manage?${params}`, { token })
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [status, token]);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/support/help", {
        method: "POST",
        token,
        body: form,
      });
      setForm({ title: "", body: "", category: "OTHER" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id) {
    setPublishingId(id);
    try {
      await apiFetch(`/api/support/help/${id}/publish`, {
        method: "PATCH",
        token,
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          value={status}
          onChange={setStatus}
          options={[
            { key: "", label: "ทั้งหมด" },
            { key: "DRAFT", label: "ฉบับร่าง" },
            { key: "PUBLISHED", label: "เผยแพร่แล้ว" },
          ]}
        />
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + เขียนบทความใหม่
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5"
        >
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="หัวข้อบทความ"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            {HELP_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            required
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={4}
            placeholder="เนื้อหาบทความ"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึกเป็นฉบับร่าง"}
          </button>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400">ยังไม่มีบทความในหมวดนี้</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="mb-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                  {a.category}
                </span>
                <p className="font-medium text-gray-900">{a.title}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                  a.status === "PUBLISHED"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {a.status === "PUBLISHED" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-gray-600">{a.body}</p>
            {a.status !== "PUBLISHED" && (
              <button
                onClick={() => handlePublish(a.id)}
                disabled={publishingId === a.id}
                className="mt-2 text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50"
              >
                {publishingId === a.id ? "กำลังเผยแพร่..." : "เผยแพร่บทความนี้"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Panel shell -------------------------------------------------------------

export default function SupportPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [section, setSection] = useState("tickets");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  if (user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (user?.role !== "SUPPORT" && user?.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะเจ้าหน้าที่ซัพพอร์ตเท่านั้น
        </p>
      </main>
    );
  }

  const token = getAccessToken();
  const activeSection = SECTIONS.find((s) => s.key === section);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
        <aside className="w-48 shrink-0">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            แผงควบคุมซัพพอร์ต
          </p>
          <nav className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                  section === s.key
                    ? "bg-emerald-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span aria-hidden="true">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <h1 className="mb-1 text-xl font-bold text-gray-900">
            {activeSection.label}
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            {section === "tickets" &&
              "ดูตั๋วที่รอรับเรื่อง ที่คุณรับผิดชอบ หรือค้นหาตั๋วทั้งหมด"}
            {section === "disputes" &&
              "ตรวจสอบและตัดสินคำร้องขอคืนเงิน/คืนสินค้า"}
            {section === "orders" && "ค้นหารายละเอียดคำสั่งซื้อด้วยรหัส"}
            {section === "faq" && "เขียนและเผยแพร่บทความช่วยเหลือ"}
          </p>

          {section === "tickets" && (
            <TicketsSection token={token} userId={user.id} />
          )}
          {section === "disputes" && <DisputesSection token={token} />}
          {section === "orders" && <OrdersSection token={token} />}
          {section === "faq" && <FaqSection token={token} />}
        </section>
      </div>
      <Footer />
    </main>
  );
}
