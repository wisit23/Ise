"use client";
import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";

export default function VoucherPickerModal({
  order,
  vouchers,
  walletError,
  onRetry,
  busy,
  onApply,
  onClose,
}) {
  const [selected, setSelected] = useState(order.campaignId || "");
  const [error, setError] = useState("");
  async function apply() {
    setError("");
    if (selected === (order.campaignId || "")) {
      onClose();
      return;
    }
    try {
      await onApply(selected);
      onClose();
    } catch (err) {
      setError(err.message || "ใช้โค้ดส่วนลดไม่สำเร็จ");
    }
  }
  const choices = [
    { value: "", label: "ไม่ใช้โค้ดส่วนลด" },
    ...(order.campaignId
      ? [
          {
            value: order.campaignId,
            label: order.campaignCode || "โค้ดที่ใช้กับสินค้านี้",
          },
        ]
      : []),
    ...vouchers.map((voucher) => ({
      value: voucher.campaignId,
      label: voucher.campaign?.code || voucher.campaignId,
    })),
  ];
  return (
    <Modal
      open
      title={`เลือกโค้ดส่วนลดสำหรับ ${order.productTitle}`}
      description="ใช้ได้ 1 โค้ดต่อสินค้าชิ้นนี้"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={busy} onClick={apply}>
            ยืนยันใช้โค้ด
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      {walletError && (
        <div className="mb-3 text-sm text-amber-700">
          {walletError}{" "}
          <button onClick={onRetry} type="button" className="underline">
            ลองโหลดโค้ดอีกครั้ง
          </button>
        </div>
      )}
      <div className="space-y-2">
        {choices.map((choice) => (
          <label
            key={choice.value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${selected === choice.value ? "border-brand-500 bg-brand-50" : "border-line"}`}
          >
            <input
              type="radio"
              name="checkout-voucher"
              value={choice.value}
              checked={selected === choice.value}
              disabled={busy}
              onChange={() => setSelected(choice.value)}
            />
            <span className="text-sm font-semibold">{choice.label}</span>
          </label>
        ))}
      </div>
      {!vouchers.length && !order.campaignId && !walletError && (
        <p className="mt-3 text-sm text-ink-muted">
          ยังไม่มีโค้ดที่เลือกใช้ได้ในกระเป๋าของคุณ
        </p>
      )}
    </Modal>
  );
}
