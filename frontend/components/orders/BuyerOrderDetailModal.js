"use client";

import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

// Mirrors shippingService.ADDRESS_EDITABLE_STATUSES: once the seller marks the
// parcel ready, the address is printed on it and the backend refuses changes.
export const ADDRESS_EDITABLE_STATUSES = ["paid", "confirmed"];

function formatAddress(a) {
  return [a.addressLine, a.subdistrict, a.district, a.province, a.postalCode]
    .filter(Boolean)
    .join(" ");
}

function AddressBlock({ address }) {
  return (
    <div className="text-sm">
      <p className="font-semibold text-gray-900">{address.recipientName}</p>
      <p className="text-ink-muted">{address.phone}</p>
      <p className="mt-1 leading-relaxed text-gray-700">
        {formatAddress(address)}
      </p>
    </div>
  );
}

/**
 * Buyer-side order detail. Shows the delivery address and, while the seller
 * has not yet prepared the parcel, lets the buyer pick another saved address.
 */
export default function BuyerOrderDetailModal({
  order: initialOrder,
  statusLabel,
  onClose,
  onOrderChange,
}) {
  const [order, setOrder] = useState(initialOrder);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // The list row may be stale (and may lack the address / version).
  async function reload() {
    const fresh = await apiFetch(`/api/orders/${initialOrder.id}`, {
      token: getAccessToken(),
    });
    setOrder(fresh);
    onOrderChange?.(fresh);
    return fresh;
  }

  useEffect(() => {
    reload().catch((err) =>
      setLoadError(err.message || "โหลดรายละเอียดคำสั่งซื้อไม่สำเร็จ"),
    );
  }, [initialOrder.id]);

  const address = order.shippingAddress;
  const canChange = ADDRESS_EDITABLE_STATUSES.includes(order.status);

  async function startEditing() {
    setError("");
    setSuccess("");
    try {
      const saved = await apiFetch("/api/auth/me/addresses", {
        token: getAccessToken(),
      });
      setAddresses(saved);
      setSelectedId(
        saved.find((a) => a.id === order.shipping?.addressId)?.id ||
          saved.find((a) => a.isDefault)?.id ||
          saved[0]?.id ||
          "",
      );
      setEditing(true);
    } catch (err) {
      setError(err.message || "โหลดที่อยู่ไม่สำเร็จ");
    }
  }

  async function save() {
    if (!selectedId || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch(
        `/api/orders/${order.id}/shipping-address`,
        {
          method: "PATCH",
          token: getAccessToken(),
          body: { addressId: selectedId, version: order.version },
        },
      );
      setOrder(updated);
      onOrderChange?.(updated);
      setEditing(false);
      setSuccess("เปลี่ยนที่อยู่จัดส่งเรียบร้อยแล้ว");
    } catch (err) {
      setError(err.message || "เปลี่ยนที่อยู่ไม่สำเร็จ");
      // A conflict usually means the seller moved the order forward; show the
      // current state so the buyer sees why the change is no longer allowed.
      try {
        await reload();
        setEditing(false);
      } catch {
        // Keep the original error message; the reload is best-effort.
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="รายละเอียดคำสั่งซื้อ" onClose={onClose} size="lg">
      <div className="space-y-4">
        {loadError && <Alert tone="error">{loadError}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">สินค้า</dt>
          <dd className="text-gray-900">{order.productTitle || "-"}</dd>
          <dt className="text-ink-muted">ราคา</dt>
          <dd className="text-gray-900">
            ฿{Number(order.finalPrice ?? order.price).toLocaleString("th-TH")}
          </dd>
          <dt className="text-ink-muted">สถานะ</dt>
          <dd className="text-gray-900">{statusLabel}</dd>
          <dt className="text-ink-muted">สั่งซื้อเมื่อ</dt>
          <dd className="text-gray-900">
            {new Date(order.createdAt).toLocaleDateString("th-TH")}
          </dd>
        </dl>

        <section className="rounded-lg border border-line p-4">
          <h3 className="mb-2 font-bold text-gray-900">ที่อยู่จัดส่ง</h3>
          {editing ? (
            <div className="space-y-3">
              {addresses.length === 0 && (
                <p className="text-sm text-ink-muted">
                  ยังไม่มีที่อยู่ที่บันทึกไว้ เพิ่มที่อยู่ได้ในหน้าชำระเงิน
                </p>
              )}
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    selectedId === a.id
                      ? "border-brand-500 bg-brand-50/50"
                      : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="order-address"
                    checked={selectedId === a.id}
                    onChange={() => setSelectedId(a.id)}
                    className="mt-1 accent-brand-600"
                  />
                  <AddressBlock address={a} />
                </label>
              ))}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  ยกเลิก
                </Button>
                <Button loading={saving} disabled={!selectedId} onClick={save}>
                  บันทึกที่อยู่
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {address ? (
                <AddressBlock address={address} />
              ) : (
                <p className="text-sm text-ink-muted">ไม่พบที่อยู่จัดส่ง</p>
              )}
              {canChange ? (
                <Button variant="secondary" size="sm" onClick={startEditing}>
                  เปลี่ยนที่อยู่
                </Button>
              ) : (
                address &&
                ["ready_to_ship", "shipped", "delivered", "completed"].includes(
                  order.status,
                ) && (
                  <p className="text-xs text-ink-subtle">
                    ผู้ขายเตรียมสินค้าแล้ว จึงเปลี่ยนที่อยู่ไม่ได้
                  </p>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
