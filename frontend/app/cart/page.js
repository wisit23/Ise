"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import OrderLine from "../../components/OrderLine";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

export function isReservationExpired(order, now) {
  const deadline = reservationDeadline(order);
  return deadline !== null && deadline <= now;
}

export function reservationCountdown(order, now) {
  const deadline = reservationDeadline(order);
  if (deadline === null) return null;
  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function reservationDeadline(order) {
  if (order.reservationExpiresAt) {
    return new Date(order.reservationExpiresAt).getTime();
  }
  if (order.createdAt) {
    return new Date(order.createdAt).getTime() + 10 * 60 * 1000;
  }
  return null;
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
  const [now, setNow] = useState(Date.now());

  async function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(
        "/api/orders/mine?status=pending_payment&limit=100",
        { token },
      );
      setItems(data.items);
      setSelected(
        new Set(
          data.items
            .filter((order) => !isReservationExpired(order, Date.now()))
            .map((order) => order.id),
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const expiredIds = new Set(
      items
        .filter((order) => isReservationExpired(order, now))
        .map((o) => o.id),
    );
    if (expiredIds.size === 0) return;
    setItems((prev) => prev.filter((order) => !expiredIds.has(order.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      expiredIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [now]);

  function toggle(id) {
    const order = items.find((item) => item.id === id);
    if (!order || isReservationExpired(order, now)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const activeIds = items
      .filter((order) => !isReservationExpired(order, now))
      .map((order) => order.id);
    setSelected((prev) =>
      prev.size === activeIds.length ? new Set() : new Set(activeIds),
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
      setItems((prev) => prev.filter((o) => !selected.has(o.id)));
      setSelected(new Set());
    } catch (err) {
      setNotice(err.message);
      load();
    } finally {
      setPaying(false);
    }
  }

  const activeItems = items.filter(
    (order) => !isReservationExpired(order, now),
  );
  const selectedItems = activeItems.filter((o) => selected.has(o.id));
  const total = selectedItems.reduce((sum, o) => sum + o.price, 0);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 pb-28">
        <h1 className="mb-1 text-xl font-bold text-gray-900">ตะกร้าของฉัน</h1>
        <p className="mb-6 text-sm text-gray-500">
          สินค้าที่เพิ่มลงตะกร้าจะถูกล็อกไว้ให้คุณ 10 นาที
          กรุณาชำระเงินก่อนเวลาหมดหรือยกเลิกเพื่อคืนสินค้า
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}
        {notice && (
          <Alert tone="success" className="mb-4">
            {notice}
          </Alert>
        )}
        {loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <EmptyState
            icon="shopping_cart"
            title="ตะกร้าว่างเปล่า"
            description="ยังไม่มีสินค้าที่คุณจองไว้ — เลือกดูสินค้าที่ตรงสไตล์ได้เลย"
            action={
              <Button href="/products" icon="storefront">
                เลือกซื้อสินค้า
              </Button>
            }
          />
        )}

        {items.length > 0 && (
          <div className="animate-slide-up overflow-hidden rounded-md border border-line bg-white shadow-1">
            <label className="flex cursor-pointer items-center gap-3 border-b border-line bg-surface-subtle px-4 py-3 text-sm font-medium text-ink-muted">
              <input
                type="checkbox"
                checked={
                  activeItems.length > 0 && selected.size === activeItems.length
                }
                onChange={toggleAll}
                disabled={activeItems.length === 0}
                className="h-4 w-4 accent-brand-600"
              />
              เลือกทั้งหมด ({items.length} รายการ)
            </label>

            <ul className="divide-y divide-line">
              {items.map((o) => {
                const expired = isReservationExpired(o, now);
                const countdown = reservationCountdown(o, now);
                return (
                  <li
                    key={o.id}
                    className="transition-colors hover:bg-slate-50/50"
                  >
                    <OrderLine
                      order={o}
                      highlight={expired}
                      lead={
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggle(o.id)}
                          disabled={expired}
                          aria-label={`เลือก ${o.productTitle}`}
                          className="h-4 w-4 accent-brand-600"
                        />
                      }
                      note={
                        /* The hold is the only reason this page is urgent,
                           so it gets a countdown next to the item rather
                           than a grey sentence under the title. */
                        expired ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-red-700">
                            <span
                              className="material-symbols-outlined text-[15px] leading-none"
                              aria-hidden="true"
                            >
                              timer_off
                            </span>
                            หมดเวลาจองแล้ว
                          </span>
                        ) : countdown ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                            <span
                              className="material-symbols-outlined text-[15px] leading-none"
                              aria-hidden="true"
                            >
                              lock_clock
                            </span>
                            เหลือเวลาชำระเงิน {countdown} นาที
                          </span>
                        ) : (
                          <span className="text-xs text-ink-subtle">
                            ล็อกไว้ตั้งแต่{" "}
                            {new Date(o.createdAt).toLocaleString("th-TH")}
                          </span>
                        )
                      }
                      actions={
                        <button
                          onClick={() => handleCancel(o.id)}
                          disabled={busyId === o.id}
                          className="focus-ring rounded px-1 text-sm text-ink-subtle transition hover:text-danger disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      }
                    />
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
