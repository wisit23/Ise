"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Pagination from "../../components/Pagination";
import { apiFetch } from "../../lib/api";

const PAGE_SIZE = 10;

export default function HelpCenterPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (q) params.set("q", q);
    apiFetch(`/api/support/help?${params}`)
      .then((data) => {
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, page]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-bold text-gray-900">ศูนย์ช่วยเหลือ</h1>
        <p className="mb-6 text-sm text-gray-500">
          ค้นหาคำตอบด่วนก่อนติดต่อทีมซัพพอร์ต หรือ{" "}
          <Link
            href="/support/tickets"
            className="text-emerald-600 hover:underline"
          >
            เปิดตั๋วแจ้งปัญหา
          </Link>
        </p>

        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา เช่น คืนเงิน, ติดตามพัสดุ, สมัครขาย..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            ค้นหา
          </button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-gray-400">ไม่พบบทความที่ตรงกับคำค้นหา</p>
        )}

        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <span className="mb-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                {a.category}
              </span>
              <h2 className="font-medium text-gray-900">{a.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-600">
                {a.body}
              </p>
            </li>
          ))}
        </ul>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </section>
      <Footer />
    </main>
  );
}
