"use client";

import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import Input from "../../ui/Input";

/**
 * LockedInfoRow — แสดงข้อมูลล็อคจาก Thai ID แบบ summary
 */
function LockedInfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="material-symbols-outlined text-[16px] text-ink-subtle shrink-0"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-xs text-ink-muted">{label}:</span>
      <span className="ml-auto text-xs font-semibold text-gray-900">{value}</span>
      <span
        className="material-symbols-outlined text-[14px] text-brand-400 shrink-0"
        aria-hidden="true"
        title="ล็อคโดย Thai ID"
      >
        lock
      </span>
    </div>
  );
}

/**
 * BankAccountStep — ขั้นตอนกรอกบัญชีธนาคาร (วิธีที่ 2)
 *
 * Props:
 *   thaiIdData    — ข้อมูลที่ล็อคจาก Thai ID
 *   bankAccount   — ค่าปัจจุบันของช่องบัญชีธนาคาร
 *   onChange      — callback(value) เมื่อแก้ไขบัญชีธนาคาร
 *   shopName      — ชื่อร้านค้า
 *   onShopNameChange — callback(value) แก้ไขชื่อร้าน
 *   error         — ข้อความ error
 *   submitting    — กำลัง submit
 *   onSubmit      — callback submit
 *   onBack        — callback ย้อนกลับ
 */
export default function BankAccountStep({
  thaiIdData,
  bankAccount,
  onChange,
  shopName,
  onShopNameChange,
  error,
  submitting,
  onSubmit,
  onBack,
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          ขั้นตอนที่ 2 — กรอกข้อมูลบัญชีธนาคาร
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          ข้อมูลตัวตนถูกยืนยันจาก Thai ID แล้ว
          กรุณากรอกชื่อร้านค้าและบัญชีธนาคารสำหรับรับเงิน
        </p>
      </div>

      {/* สรุปข้อมูลล็อคจาก Thai ID */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-brand-600">verified_user</span>
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
            ข้อมูลจาก Thai ID (ล็อค)
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <LockedInfoRow icon="person" label="ชื่อ-นามสกุล" value={thaiIdData?.fullName} />
          <LockedInfoRow icon="badge" label="เลขบัตรประชาชน" value={thaiIdData?.idNumber} />
          <LockedInfoRow icon="call" label="เบอร์โทร" value={thaiIdData?.phone} />
        </div>
      </div>

      {/* ชื่อร้านค้า */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">ข้อมูลร้านค้า</h3>
        <Input
          required
          label="ชื่อร้านค้า"
          placeholder="เช่น Vintage Studio"
          value={shopName}
          onChange={(e) => onShopNameChange(e.target.value)}
        />
      </div>

      {/* บัญชีธนาคาร */}
      <div className="border-t border-line pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          บัญชีธนาคาร / พร้อมเพย์{" "}
          <span className="font-normal text-ink-muted">(แก้ไขได้)</span>
        </h3>
        <Input
          label="เลขบัญชีธนาคาร / พร้อมเพย์"
          hint="เช่น กสิกรไทย 123-4-56789-0 หรือเบอร์พร้อมเพย์"
          placeholder="กสิกรไทย 123-4-56789-0"
          value={bankAccount}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
          <span className="material-symbols-outlined text-[14px]">info</span>
          บัญชีธนาคารสามารถแก้ไขได้ภายหลังในหน้าการตั้งค่า
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button
          type="button"
          variant="secondary"
          icon="arrow_back"
          onClick={onBack}
          disabled={submitting}
        >
          ย้อนกลับ
        </Button>
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          className="flex-1"
        >
          {submitting
            ? "กำลังบันทึกข้อมูลยืนยันตัวตน..."
            : "ยืนยันข้อมูลเพื่อเป็นผู้ขาย"}
        </Button>
      </div>
    </form>
  );
}
