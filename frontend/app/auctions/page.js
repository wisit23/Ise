"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { apiFetch, mediaUrl } from "../../lib/api";

function baht(v) {
  return `฿${v.toLocaleString("th-TH")}`;
}

export default function AuctionsPage() {
  const [openAuctions, setOpenAuctions] = useState([]);
  const [scheduledAuctions, setScheduledAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/products/auctions?status=open&limit=50"),
      apiFetch("/api/products/auctions?status=scheduled&limit=50"),
    ])
      .then(([open, scheduled]) => {
        setOpenAuctions(open.items);
        setScheduledAuctions(scheduled.items);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function Card({ a }) {
    const cover = a.product?.photos?.[0]?.url;
    return (
      <Link
        href={`/auctions/${a.id}`}
        className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <div className="aspect-square w-full bg-gray-100">
          {cover && (
            <img
              src={mediaUrl(cover)}
              alt={a.product?.title || ""}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-gray-900">
            {a.product?.title || a.productId}
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-700">
            เริ่มต้น {baht(a.startingPrice)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-xl font-bold text-gray-900">ประมูลสินค้า</h1>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              กำลังประมูลอยู่
            </h2>
            {openAuctions.length === 0 ? (
              <p className="mb-8 text-sm text-gray-400">
                ยังไม่มีประมูลที่เปิดอยู่ตอนนี้
              </p>
            ) : (
              <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {openAuctions.map((a) => (
                  <Card key={a.id} a={a} />
                ))}
              </div>
            )}

            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              เร็วๆ นี้
            </h2>
            {scheduledAuctions.length === 0 ? (
              <p className="text-sm text-gray-400">
                ยังไม่มีประมูลที่กำหนดเวลาไว้
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {scheduledAuctions.map((a) => (
                  <Card key={a.id} a={a} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <Footer />
    </main>
  );
}
