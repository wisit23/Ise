"use client";

import { formatReferenceCode } from "../../lib/referenceCodes";


import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import OrderLine from "../../components/OrderLine";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import AddressManagerModal from "../../components/checkout/AddressManagerModal";
import VoucherPickerModal from "../../components/checkout/VoucherPickerModal";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { formatCheckoutCountdown, remainingSeconds } from "../../lib/checkout";

function orderDeadline(order) {
  if (order.status === "cancelled") return null;
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
  const [vouchers, setVouchers] = useState([]);
  const [voucherError, setVoucherError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [voucherOrderId, setVoucherOrderId] = useState(null);

  async function loadVouchers() {
    try {
      setVouchers(
        await apiFetch("/api/products/campaigns/my-vouchers?status=CLAIMED"),
      );
      setVoucherError("");
    } catch {
      setVoucherError("โหลดโค้ดส่วนลดไม่ได้ชั่วคราว กรุณาลองใหม่");
    }
  }

  async function updateVoucher(order, campaignId) {
    if (cartSeconds <= 0)
      throw new Error("เวลาจองสินค้าหมดแล้ว กรุณากลับไปเลือกสินค้าใหม่");
    setUpdatingOrderId(order.id);
    setError("");
    try {
      const saved = await apiFetch(`/api/orders/${order.id}/voucher`, {
        method: "PATCH",
        body: { campaignId: campaignId || null },
      });
      setOrders((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      await loadVouchers();
    } finally {
      setUpdatingOrderId(null);
    }
  }

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    loadVouchers();

    const params = new URLSearchParams(window.location.search);
    const ids = params
      .get("orders")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const basketIds = params
      .get("items")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids?.length && !basketIds?.length) {
      setError("ไม่พบรายการสินค้าที่ต้องการยืนยัน");
      setLoading(false);
      return;
    }

    Promise.all([
      Promise.all([
        basketIds?.length
          ? apiFetch("/api/orders/cart/prepare", {
              method: "POST",
              token,
              body: { basketIds },
            }).then((data) => data.items)
          : Promise.resolve([]),
        Promise.all(
          (ids || []).map((id) => apiFetch(`/api/orders/${id}`, { token })),
        ),
      ]).then(([prepared, existing]) => [
        ...new Map(
          [...prepared, ...existing].map((order) => [order.id, order]),
        ).values(),
      ]),
      apiFetch("/api/auth/me/addresses", { token }),
    ])
      .then(([savedOrders, savedAddresses]) => {
        // Already confirmed once: the payment session is still open, so go
        // straight back to its QR page instead of asking to confirm again.
        const openSession = savedOrders.find(
          (order) =>
            ["pending", "pending_payment"].includes(order.status) &&
            order.checkoutSessionId &&
            (!order.checkoutSession?.status ||
              order.checkoutSession.status === "pending"),
        );
        if (openSession) {
          router.replace(`/payment/${openSession.checkoutSessionId}`);
          return;
        }
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
  const selectedAddress = addresses.find(
    (address) => address.id === selectedAddressId,
  );
  const voucherOrder = orders.find((order) => order.id === voucherOrderId);
  const expiredAuctionOrder = orders.find(
    (order) => order.orderType === "AUCTION" && order.status === "cancelled",
  );

  function addressesChanged(updated, selectedId) {
    setAddresses(updated);
    setSelectedAddressId((current) => {
      const preferred = selectedId || current;
      return updated.some((address) => address.id === preferred)
        ? preferred
        : (updated.find((address) => address.isDefault) || updated[0])?.id ||
            "";
    });
  }

  async function handleConfirm() {
    if (updatingOrderId || addressBusy || addressModalOpen || voucherOrderId)
      return;
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
          addressId: selectedAddress.id,
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
        ) : expiredAuctionOrder ? (
          <section className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-white p-6 text-center shadow-1">
            <span
              className="material-symbols-outlined text-5xl text-amber-600"
              aria-hidden="true"
            >
              timer_off
            </span>
            <h2 className="mt-3 text-xl font-bold text-gray-900">
              สิทธิ์ในการชำระเงินสิ้นสุดแล้ว
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              คุณไม่ได้ชำระเงินภายใน 24 ชั่วโมง คำสั่งซื้อนี้จึงถูกยกเลิก
              และระบบได้ดำเนินการตามลำดับผู้ประมูลถัดไปแล้ว
            </p>
            <p className="mt-3 font-mono text-xs text-ink-subtle">
              Order ID: #{formatReferenceCode(expiredAuctionOrder)}
            </p>
            <Button href="/orders" className="mt-5">
              ดูประวัติคำสั่งซื้อ
            </Button>
          </section>
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
                  <button
                    type="button"
                    onClick={() => setAddressModalOpen(true)}
                    aria-haspopup="dialog"
                    disabled={submitting}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    จัดการที่อยู่
                  </button>
                </div>
                {addresses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-5 text-center">
                    <p className="text-sm text-ink-muted">
                      ยังไม่มีที่อยู่จัดส่ง
                    </p>
                    <Button
                      onClick={() => setAddressModalOpen(true)}
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

              <section className="overflow-hidden rounded-xl border border-line bg-white shadow-1">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="font-bold text-gray-900">
                    รายการสินค้า ({orders.length})
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    เลือกโค้ดส่วนลดได้ 1 โค้ดต่อสินค้า 1 ชิ้น
                  </p>
                  {voucherError && (
                    <div className="mt-2 text-sm text-amber-700">
                      {voucherError}{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={loadVouchers}
                      >
                        ลองโหลดโค้ดอีกครั้ง
                      </button>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-line">
                  {orders.map((order) => (
                    <div key={order.id}>
                      <OrderLine order={order} />
                      <div className="px-5 pb-4">
                        <button
                          type="button"
                          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
                          aria-haspopup="dialog"
                          aria-label={`เลือกโค้ดส่วนลดสำหรับ ${order.productTitle}`}
                          disabled={
                            submitting ||
                            Boolean(updatingOrderId) ||
                            cartSeconds <= 0 ||
                            Boolean(order.checkoutId) ||
                            Boolean(order.auctionId)
                          }
                          onClick={() => {
                            setVoucherOrderId(order.id);
                            loadVouchers();
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-[18px]"
                          >
                            confirmation_number
                          </span>
                          {order.campaignCode
                            ? `โค้ด ${order.campaignCode} · เปลี่ยนโค้ด`
                            : "เลือกโค้ดส่วนลด"}
                        </button>
                        {updatingOrderId === order.id ? (
                          <p
                            role="status"
                            className="mt-2 text-xs text-ink-muted"
                          >
                            กำลังตรวจสอบโค้ดและคำนวณราคา…
                          </p>
                        ) : (
                          order.campaignId && (
                            <p className="mt-2 text-sm text-emerald-700">
                              ส่วนลดสินค้าชิ้นนี้ -฿
                              {(order.discountAmount || 0).toLocaleString(
                                "th-TH",
                              )}
                            </p>
                          )
                        )}
                      </div>
                    </div>
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
                  !selectedAddress ||
                  cartSeconds <= 0 ||
                  orders.length === 0 ||
                  Boolean(updatingOrderId) ||
                  addressBusy ||
                  addressModalOpen ||
                  Boolean(voucherOrderId)
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
      {addressModalOpen && (
        <AddressManagerModal
          addresses={addresses}
          selectedId={selectedAddressId}
          onChange={addressesChanged}
          onSelect={setSelectedAddressId}
          onBusyChange={setAddressBusy}
          onClose={() => setAddressModalOpen(false)}
        />
      )}
      {voucherOrder && (
        <VoucherPickerModal
          key={voucherOrder.id}
          order={voucherOrder}
          vouchers={vouchers.filter(
            (voucher) =>
              voucher.campaignId !== voucherOrder.campaignId &&
              (!voucher.usedOrderId ||
                voucher.usedOrderId === voucherOrder.id) &&
              !orders.some(
                (other) =>
                  other.id !== voucherOrder.id &&
                  other.campaignId === voucher.campaignId,
              ),
          )}
          walletError={voucherError}
          onRetry={loadVouchers}
          busy={Boolean(updatingOrderId)}
          onApply={(campaignId) => updateVoucher(voucherOrder, campaignId)}
          onClose={() => setVoucherOrderId(null)}
        />
      )}
    </main>
  );
}
