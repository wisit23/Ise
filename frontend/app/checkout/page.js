"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import OrderLine from "../../components/OrderLine";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { formatCheckoutCountdown, remainingSeconds } from "../../lib/checkout";

function orderDeadline(order) {
  if (order.reservationExpiresAt) return order.reservationExpiresAt;
  if (!order.createdAt) return null;
  const ttl = order.auctionId ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
  return new Date(new Date(order.createdAt).getTime() + ttl).toISOString();
}

export default function CheckoutPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const ids = new URLSearchParams(window.location.search)
      .get("orders")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids?.length) {
      setError("ไม่พบรายการสินค้าที่ต้องการยืนยัน");
      setLoading(false);
      return;
    }

    Promise.all([
      Promise.all(ids.map((id) => apiFetch(`/api/orders/${id}`, { token }))),
      apiFetch("/api/auth/me/addresses", { token }),
    ])
      .then(([savedOrders, savedAddresses]) => {
        setOrders(savedOrders);
        setAddresses(savedAddresses);
        const defaultAddress =
          savedAddresses.find((address) => address.isDefault) ||
          savedAddresses[0];
        setSelectedAddressId(defaultAddress?.id || "");
      })
      .catch((err) =>
        setError(err.message || "โหลดข้อมูลยืนยันคำสั่งซื้อไม่สำเร็จ"),
      )
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const expiresAt = useMemo(() => {
    const deadlines = orders
      .map(orderDeadline)
      .filter(Boolean)
      .map((value) => new Date(value).getTime());
    return deadlines.length
      ? new Date(Math.min(...deadlines)).toISOString()
      : null;
  }, [orders]);
  const cartSeconds = remainingSeconds(expiresAt, now);
  const subtotal = orders.reduce((sum, order) => sum + order.price, 0);
  const discount = orders.reduce(
    (sum, order) => sum + (order.discountAmount || 0),
    0,
  );
  const total = orders.reduce(
    (sum, order) =>
      sum +
      (order.finalPrice === null || order.finalPrice === undefined
        ? order.price - (order.discountAmount || 0)
        : order.finalPrice),
    0,
  );
  const appliedVouchers = orders.filter(
    (order) => order.campaignId && order.campaignCode,
  );
  const selectedAddress = addresses.find(
    (address) => address.id === selectedAddressId,
  );

  async function handleConfirm() {
    if (!selectedAddress) {
      setError("กรุณาเลือกที่อยู่จัดส่ง");
      return;
    }
    if (cartSeconds <= 0) {
      setError("เวลาจองสินค้าในตะกร้าหมดแล้ว กรุณากลับไปเลือกสินค้าใหม่");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const session = await apiFetch("/api/orders/checkout-sessions", {
        method: "POST",
        token: getAccessToken(),
        body: {
          orderIds: orders.map((order) => order.id),
          shippingAddress: selectedAddress,
        },
      });
      router.push(`/payment/${session.id}`);
    } catch (err) {
      setError(err.message || "สร้างรายการชำระเงินไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-center gap-2 text-xs font-medium text-ink-muted sm:gap-4 sm:text-sm">
          <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-700">
            1 ตะกร้า
          </span>
          <span className="material-symbols-outlined text-[18px]">
            chevron_right
          </span>
          <span className="rounded-full bg-brand-600 px-3 py-1 text-white">
            2 ยืนยันการซื้อ
          </span>
          <span className="material-symbols-outlined text-[18px]">
            chevron_right
          </span>
          <span className="rounded-full bg-white px-3 py-1">3 ชำระเงิน</span>
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              ยืนยันการสั่งซื้อ
            </h1>
            <p className="mt-1 text-sm text-amber-800">
              หน้านี้ใช้เวลาจองต่อเนื่องจากตะกร้า กรุณาตรวจสอบข้อมูลก่อนหมดเวลา
            </p>
          </div>
          <div className="flex items-center gap-2 text-2xl font-bold tabular-nums text-amber-700">
            <span className="material-symbols-outlined">timer</span>
            {formatCheckoutCountdown(cartSeconds)}
          </div>
        </div>

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <section className="rounded-xl border border-line bg-white p-5 shadow-1">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-gray-900">ที่อยู่จัดส่ง</h2>
                    <p className="text-sm text-ink-muted">
                      เลือกที่อยู่สำหรับรับสินค้า
                    </p>
                  </div>
                  <Link
                    href="/profile"
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    จัดการที่อยู่
                  </Link>
                </div>
                {addresses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-5 text-center">
                    <p className="text-sm text-ink-muted">
                      ยังไม่มีที่อยู่จัดส่ง
                    </p>
                    <Button
                      href="/profile"
                      variant="secondary"
                      className="mt-3"
                    >
                      เพิ่มที่อยู่
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`cursor-pointer rounded-lg border p-4 transition ${
                          selectedAddressId === address.id
                            ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500"
                            : "border-line hover:border-brand-300"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="shipping-address"
                            checked={selectedAddressId === address.id}
                            onChange={() => setSelectedAddressId(address.id)}
                            className="mt-1 accent-brand-600"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-gray-900">
                              {address.recipientName}
                            </p>
                            <p className="text-ink-muted">{address.phone}</p>
                            <p className="mt-1 leading-relaxed text-gray-700">
                              {address.addressLine} {address.subdistrict}{" "}
                              {address.district} {address.province}{" "}
                              {address.postalCode}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-line bg-white p-5 shadow-1">
                <h2 className="font-bold text-gray-900">
                  Voucher จาก Marketing
                </h2>
                <p className="mb-4 text-sm text-ink-muted">
                  Voucher ถูกตรวจสอบและล็อกไว้ตอนเพิ่มสินค้าแล้ว
                </p>
                {appliedVouchers.length === 0 ? (
                  <p className="rounded-lg border border-line bg-gray-50 p-3 text-sm text-ink-muted">
                    ไม่มี Voucher ที่ใช้กับรายการนี้
                  </p>
                ) : (
                  <div className="space-y-2">
                    {appliedVouchers.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {order.productTitle}
                          </p>
                          <p className="font-mono text-xs font-bold text-emerald-700">
                            {order.campaignCode}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-emerald-700">
                          -฿
                          {(order.discountAmount || 0).toLocaleString("th-TH")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-xl border border-line bg-white shadow-1">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="font-bold text-gray-900">
                    รายการสินค้า ({orders.length})
                  </h2>
                </div>
                <div className="divide-y divide-line">
                  {orders.map((order) => (
                    <OrderLine key={order.id} order={order} />
                  ))}
                </div>
              </section>
            </div>

            <aside className="sticky top-24 rounded-xl border border-line bg-white p-5 shadow-1">
              <h2 className="mb-4 text-lg font-bold text-gray-900">
                สรุปคำสั่งซื้อ
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">ยอดรวมสินค้า</dt>
                  <dd className="font-medium">
                    ฿{subtotal.toLocaleString("th-TH")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">ส่วนลด</dt>
                  <dd className="font-medium text-emerald-600">
                    -฿{discount.toLocaleString("th-TH")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-3">
                  <dt className="font-semibold text-gray-900">
                    ยอดชำระทั้งหมด
                  </dt>
                  <dd className="text-xl font-bold text-brand-700">
                    ฿{total.toLocaleString("th-TH")}
                  </dd>
                </div>
              </dl>
              <Button
                className="mt-5 w-full"
                size="lg"
                icon="qr_code_2"
                loading={submitting}
                disabled={
                  !selectedAddress || cartSeconds <= 0 || orders.length === 0
                }
                onClick={handleConfirm}
              >
                ยืนยันและไปสแกน QR
              </Button>
              <Button href="/cart" variant="ghost" className="mt-2 w-full">
                กลับไปตะกร้า
              </Button>
              <p className="mt-3 text-center text-xs leading-relaxed text-ink-subtle">
                เมื่อไปหน้าชำระเงิน ระบบจะเริ่มเวลาใหม่ 10 นาที
              </p>
            </aside>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
