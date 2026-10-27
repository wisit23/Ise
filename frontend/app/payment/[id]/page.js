"use client";
import ReferenceCode from "../../../components/ui/ReferenceCode";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Skeleton from "../../../components/ui/Skeleton";
import Modal from "../../../components/ui/Modal";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { apiFetch } from "../../../lib/api";
import { serverNow } from "../../../lib/serverClock";
import { getAccessToken } from "../../../lib/auth";
import {
  formatCheckoutCountdown,
  remainingSeconds,
} from "../../../lib/checkout";

export default function PaymentPage() {
  const { id } = useParams();
  const router = useRouter();
  const expiryChecked = useRef(false);
  const [session, setSession] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [now, setNow] = useState(serverNow);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const actionInFlight = useRef(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");

  async function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const data = await apiFetch(`/api/orders/checkout-sessions/${id}`, {
        token,
      });
      setSession(data);
      setNow(serverNow());
    } catch (err) {
      setError(err.message || "โหลดรายการชำระเงินไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const payload = JSON.stringify({
      merchant: "RE-LOOP",
      checkoutSessionId: session.id,
      amount: session.total,
      currency: "THB",
    });
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setError("สร้าง QR Code ไม่สำเร็จ"));
  }, [session?.id, session?.total]);

  const seconds = remainingSeconds(session?.expiresAt, now);

  useEffect(() => {
    if (
      !session ||
      session.status !== "pending" ||
      seconds > 0 ||
      expiryChecked.current
    ) {
      return;
    }
    expiryChecked.current = true;
    load();
  }, [seconds, session?.status]);

  const editable = session?.status === "pending" && seconds > 0;
  const busy = confirming || cancelling || savingAddress || addressLoading;

  async function openAddresses() {
    if (!editable || busy || actionInFlight.current) return;
    setAddressOpen(true);
    setAddressLoading(true);
    setAddressError("");
    try {
      const saved = await apiFetch("/api/auth/me/addresses", { token: getAccessToken() });
      setAddresses(saved);
      setSelectedAddressId(saved.some((address) => address.id === session.addressId) ? session.addressId : "");
    } catch (err) {
      setAddressError(err.message || "โหลดที่อยู่จัดส่งไม่สำเร็จ");
    } finally {
      setAddressLoading(false);
    }
  }

  async function saveAddress() {
    if (!editable || busy || actionInFlight.current || !selectedAddressId) return;
    actionInFlight.current = true;
    setSavingAddress(true);
    setAddressError("");
    try {
      const updated = await apiFetch(`/api/orders/checkout-sessions/${id}/address`, {
        method: "PATCH", token: getAccessToken(), body: { addressId: selectedAddressId },
      });
      setSession(updated);
      setAddressOpen(false);
    } catch (err) {
      setAddressError(err.message || "เปลี่ยนที่อยู่จัดส่งไม่สำเร็จ");
      await load();
    } finally {
      actionInFlight.current = false;
      setSavingAddress(false);
    }
  }

  async function handleCancel() {
    if (!editable || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    setCancelling(true);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/checkout-sessions/${id}/cancel`, {
        method: "POST", token: getAccessToken(),
      });
      setSession(updated);
      setCancelOpen(false);
      router.push("/");
    } catch (err) {
      setError(err.message || "ยกเลิกการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง");
      setCancelOpen(false);
      await load();
    } finally {
      actionInFlight.current = false;
      setCancelling(false);
    }
  }

  async function handlePaid() {
    if (busy || actionInFlight.current || addressOpen || cancelOpen) return;
    actionInFlight.current = true;
    setConfirming(true);
    setError("");
    try {
      const updated = await apiFetch(
        `/api/orders/checkout-sessions/${id}/confirm`,
        { method: "POST", token: getAccessToken() },
      );
      setSession(updated);
    } catch (err) {
      setError(err.message || "ยืนยันการชำระเงินไม่สำเร็จ");
      await load();
    } finally {
      actionInFlight.current = false;
      setConfirming(false);
    }
  }

  const paid = session?.status === "paid";
  const expired =
    Boolean(session) &&
    (!["pending", "processing", "paid"].includes(session.status) ||
      seconds <= 0);

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-center gap-2 text-xs font-medium text-ink-muted sm:gap-4 sm:text-sm">
          <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-700">
            1 ตะกร้า
          </span>
          <span className="material-symbols-outlined text-[18px]">
            chevron_right
          </span>
          <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-700">
            2 ยืนยันการซื้อ
          </span>
          <span className="material-symbols-outlined text-[18px]">
            chevron_right
          </span>
          <span className="rounded-full bg-brand-600 px-3 py-1 text-white">
            3 ชำระเงิน
          </span>
        </div>

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        {loading ? (
          <Skeleton className="mx-auto h-[620px] max-w-xl rounded-2xl" />
        ) : paid ? (
          <section className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-2">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <span className="material-symbols-outlined text-5xl">
                check_circle
              </span>
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">
              ชำระเงินสำเร็จ
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              ระบบรับชำระเงินแล้ว คำสั่งซื้ออยู่ระหว่างรอผู้ขายยืนยัน
            </p>
            <Button href="/orders" className="mt-6" icon="receipt_long">
              ดูคำสั่งซื้อของฉัน
            </Button>
          </section>
        ) : expired ? (
          <section className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-2">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-100 text-red-700">
              <span className="material-symbols-outlined text-5xl">
                timer_off
              </span>
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">
              {session.status === "cancelled" ? "ยกเลิกการชำระเงินแล้ว" : "หมดเวลาชำระเงิน"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              ระบบยกเลิกการจองแล้ว
              สินค้าถูกคืนเป็นสถานะพร้อมขายเพื่อให้ผู้ซื้อคนอื่นเลือกได้
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button href="/products" icon="storefront">
                เลือกสินค้าใหม่
              </Button>
              <Button href="/orders" variant="secondary">
                ดูคำสั่งซื้อ
              </Button>
            </div>
          </section>
        ) : session ? (
          <div className="grid items-start gap-5 md:grid-cols-[1fr_300px]">
            <section className="rounded-2xl border border-line bg-white p-4 text-center shadow-2 sm:p-8">
              <p className="text-sm font-medium text-brand-700">QR PAYMENT</p>
              {session.referenceCode && <ReferenceCode value={session} className="mt-2 text-xs text-ink-muted" />}
              <h1 className="mt-1 text-2xl font-bold text-gray-900">
                สแกน QR Code เพื่อชำระเงิน
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                เปิดแอปธนาคารแล้วสแกน QR Code ด้านล่าง
              </p>

              <div className="mx-auto mt-5 w-fit max-w-full rounded-2xl border-4 border-brand-100 bg-white p-2 sm:p-3 shadow-1">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code สำหรับชำระเงิน"
                    className="h-48 w-48 sm:h-64 sm:w-64 max-w-full"
                  />
                ) : (
                  <Skeleton className="h-48 w-48 sm:h-64 sm:w-64 max-w-full" />
                )}
              </div>

              <div className="mt-5">
                <p className="text-sm text-ink-muted">ยอดที่ต้องชำระ</p>
                <p className="text-3xl font-bold text-brand-700">
                  ฿{session.total.toLocaleString("th-TH")}
                </p>
              </div>

              <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full bg-amber-50 px-5 py-2 text-2xl font-bold tabular-nums text-amber-700">
                <span className="material-symbols-outlined">timer</span>
                {formatCheckoutCountdown(seconds)}
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                QR Code นี้ใช้งานได้ 10 นาที และไม่ใช้เวลาต่อจากหน้าตะกร้า
              </p>
            </section>

            <aside className="rounded-2xl border border-line bg-white p-5 shadow-1">
              <h2 className="font-bold text-gray-900">รายละเอียดการชำระ</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">สินค้า</dt>
                  <dd>{session.orders.length} รายการ</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">ยอดสินค้า</dt>
                  <dd>฿{session.subtotal.toLocaleString("th-TH")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Voucher จาก Marketing</dt>
                  <dd>
                    {session.orders
                      ?.filter((order) => order.campaignCode)
                      .map((order) => order.campaignCode)
                      .join(", ") || "ไม่ได้ใช้"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">ส่วนลด</dt>
                  <dd className="text-emerald-600">
                    -฿{session.discount.toLocaleString("th-TH")}
                  </dd>
                </div>
                <div className="border-t border-line pt-3">
                  <dt className="text-xs text-ink-muted">จัดส่งไปที่</dt>
                  <dd className="mt-1 leading-relaxed text-gray-700">
                    {session.shippingAddress.recipientName}
                    <br />
                    {session.shippingAddress.addressLine}{" "}
                    {session.shippingAddress.subdistrict}{" "}
                    {session.shippingAddress.district}{" "}
                    {session.shippingAddress.province}{" "}
                    {session.shippingAddress.postalCode}
                  </dd>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="edit_location_alt"
                    className="mt-3"
                    disabled={!editable || busy || cancelOpen || addressOpen}
                    onClick={openAddresses}
                  >
                    เปลี่ยนที่อยู่จัดส่ง
                  </Button>
                </div>
              </dl>
              <Button
                className="mt-5 w-full"
                icon="check_circle"
                loading={confirming}
                disabled={busy || cancelOpen || addressOpen}
                onClick={handlePaid}
              >
                ฉันชำระเงินแล้ว
              </Button>
              <Button
                variant="secondary"
                className="mt-3 w-full text-red-700"
                disabled={!editable || busy || cancelOpen || addressOpen}
                onClick={() => setCancelOpen(true)}
              >
                ยกเลิกการชำระเงิน
              </Button>
              <p className="mt-3 text-center text-xs text-ink-subtle">
                ระบบนี้เป็นการจำลองการชำระเงิน ยังไม่มีการตัดเงินจริง
              </p>
            </aside>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={cancelOpen && editable}
        title="ยกเลิกการชำระเงิน?"
        description="รายการทั้งหมดในรอบชำระนี้จะถูกยกเลิก และสินค้าจะกลับไปพร้อมขายให้ผู้ซื้อคนอื่น"
        confirmLabel="ยืนยันยกเลิกการชำระเงิน"
        cancelLabel="ชำระเงินต่อ"
        busy={cancelling}
        onConfirm={handleCancel}
        onCancel={() => { if (!cancelling) setCancelOpen(false); }}
      />
      <Modal
        open={addressOpen && editable}
        title="เปลี่ยนที่อยู่จัดส่ง"
        onClose={() => { if (!savingAddress) setAddressOpen(false); }}
        footer={
          <>
            <Button variant="secondary" disabled={savingAddress} onClick={() => setAddressOpen(false)}>ยกเลิก</Button>
            <Button loading={savingAddress} disabled={busy || !selectedAddressId} onClick={saveAddress}>บันทึกที่อยู่จัดส่ง</Button>
          </>
        }
      >
        {addressError && <Alert tone="error" className="mb-4">{addressError}</Alert>}
        {addressLoading ? <Skeleton className="h-32 rounded-lg" /> : (
          <div className="space-y-3">
            {!addresses.length && <p className="text-sm text-ink-muted">ยังไม่มีที่อยู่จัดส่ง กรุณาเพิ่มที่อยู่ในหน้าโปรไฟล์</p>}
            {addresses.map((address) => (
              <label key={address.id} className="flex cursor-pointer gap-3 rounded-lg border border-line p-4">
                <input type="radio" name="shipping-address" value={address.id} checked={selectedAddressId === address.id} disabled={savingAddress} onChange={() => setSelectedAddressId(address.id)} />
                <span className="text-sm">
                  <span className="block font-semibold">{address.recipientName}</span>
                  {address.phone}<br />
                  {address.addressLine} {address.subdistrict} {address.district} {address.province} {address.postalCode}
                </span>
              </label>
            ))}
          </div>
        )}
      </Modal>
      <Footer />
    </main>
  );
}
