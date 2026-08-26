"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

function reservationCountdown(expiresAt, createdAt, now) {
  // Older pending orders may not have reservationExpiresAt persisted yet.
  // The reservation service uses a 10-minute lease, so keep those orders
  // visible with the same deadline instead of silently hiding the countdown.
  const deadline = expiresAt
    ? new Date(expiresAt).getTime()
    : new Date(createdAt).getTime() + 10 * 60 * 1000;

  const remainingMs = deadline - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "หมดเวลาแล้ว";

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} นาที`;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [paying, setPaying] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const expiredIds = new Set(
      items
        .filter(
          (o) =>
            reservationCountdown(o.reservationExpiresAt, o.createdAt, now) ===
            "หมดเวลาแล้ว",
        )
        .map((o) => o.id),
    );
    if (expiredIds.size === 0) return;

    setItems((prev) => prev.filter((o) => !expiredIds.has(o.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      expiredIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [now]);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch("/api/orders/mine?status=pending&limit=100", {
        token,
      });
      setItems(data.items);
      setSelected(new Set(data.items.map((o) => o.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((o) => o.id)),
    );
  }

  async function handleCancel(id) {
    const token = getAccessToken();
    setBusyId(id);
    setNotice("");
    try {
      await apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        token,
        body: { status: "cancelled" },
      });
      setItems((prev) => prev.filter((o) => o.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCheckout() {
    const token = getAccessToken();
    setPaying(true);
    setNotice("");
    try {
      for (const order of selectedItems) {
        await apiFetch(`/api/orders/${order.id}/pay`, {
          method: "PATCH",
          token,
        });
      }
      setNotice("ชำระเงินสำเร็จ");
      setItems((prev) =>
        prev.filter((o) => !selectedItems.some((item) => item.id === o.id)),
      );
      setSelected(new Set());
    } catch (err) {
      setNotice(err.message);
      load();
    } finally {
      setPaying(false);
    }
  }

  const selectedItems = items.filter(
    (o) =>
      selected.has(o.id) &&
      reservationCountdown(o.reservationExpiresAt, o.createdAt, now) !==
        "หมดเวลาแล้ว",
  );
  const total = selectedItems.reduce((sum, o) => sum + o.price, 0);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 pb-28">
        <h1 className="mb-1 text-xl font-bold text-gray-900">ตะกร้าของฉัน</h1>
        <p className="mb-6 text-sm text-gray-500">
          สินค้าที่เพิ่มลงตะกร้าจะถูกล็อกไว้ให้คุณคนเดียว
          จนกว่าจะชำระเงินหรือยกเลิก
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="mb-4 text-sm text-emerald-700">{notice}</p>}
        {loading && <p className="text-gray-500">กำลังโหลด...</p>}

        {!loading && items.length === 0 && (
          <p className="text-gray-500">
            ตะกร้าว่างเปล่า —{" "}
            <Link href="/products" className="text-emerald-600 hover:underline">
              เลือกซื้อสินค้า
            </Link>
          </p>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <label className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={selected.size === items.length}
                onChange={toggleAll}
                className="h-4 w-4 accent-emerald-600"
              />
              เลือกทั้งหมด ({items.length} รายการ)
            </label>
            <ul>
              {items.map((o) => {
                const countdown = reservationCountdown(
                  o.reservationExpiresAt,
                  o.createdAt,
                  now,
                );
                const expired = countdown === "หมดเวลาแล้ว";

                return (
                  <li
                    key={o.id}
                    className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                      disabled={expired}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {o.productTitle}
                      </p>
                      <p className="text-sm text-gray-500">
                        ล็อกไว้ตั้งแต่{" "}
                        {new Date(o.createdAt).toLocaleString("th-TH")}
                      </p>
                      {countdown && (
                        <p
                          className={`text-sm font-medium ${
                            expired ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          {expired
                            ? "หมดเวลาล็อกสินค้า กรุณารีเฟรชตะกร้า"
                            : `เหลือเวลาชำระเงิน ${countdown}`}
                        </p>
                      )}
                    </div>
                    <p className="font-semibold text-emerald-600">
                      ฿{o.price.toLocaleString("th-TH")}
                    </p>
                    <button
                      onClick={() => handleCancel(o.id)}
                      disabled={busyId === o.id}
                      className="text-sm text-gray-400 hover:text-red-600 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {items.length > 0 && (
        <div className="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
            <div className="text-sm text-gray-600">
              เลือกแล้ว {selectedItems.length} รายการ ·{" "}
              <span className="text-lg font-bold text-emerald-600">
                ฿{total.toLocaleString("th-TH")}
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={paying || selectedItems.length === 0}
              className="rounded-md bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {paying
                ? "กำลังชำระเงิน..."
                : `ชำระเงิน (${selectedItems.length})`}
            </button>
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}
