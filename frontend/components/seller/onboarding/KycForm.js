"use client";

import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import Input from "../../ui/Input";
import Textarea from "../../ui/Textarea";
import IdCardField from "./IdCardField";
import KycDocumentUpload from "./KycDocumentUpload";

export default function KycForm({
  form,
  onFormChange,
  rejected,
  rejectionReason,
  preview,
  onFileSelect,
  error,
  submitting,
  onSubmit,
}) {
  const set = (field) => (e) =>
    onFormChange({ ...form, [field]: e.target.value });

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-6 rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8"
    >
      {rejected && (
        <Alert tone="warning" title="การยืนยันตัวตนครั้งก่อนหน้าถูกปฏิเสธ">
          <p>เหตุผล: {rejectionReason || "เอกสารหรือข้อมูลไม่ถูกต้อง"}</p>
          <p className="mt-2 text-xs">
            กรุณาตรวจสอบและแก้ไขข้อมูลด้านล่างให้ถูกต้อง
            แล้วกดส่งข้อมูลใหม่อีกครั้ง
          </p>
        </Alert>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          1. ข้อมูลร้านค้า
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            required
            label="ชื่อร้านค้า"
            placeholder="เช่น Vintage Studio"
            value={form.shopName}
            onChange={set("shopName")}
          />
          <Input
            label="เลขบัญชีธนาคาร / พร้อมเพย์"
            hint="ไม่บังคับ"
            placeholder="เช่น กสิกรไทย 123-4-56789-0"
            value={form.bankAccount}
            onChange={set("bankAccount")}
          />
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          2. รหัสประจำตัวประชาชนและที่อยู่
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <IdCardField
            value={form.idCardNumber}
            onChange={(idCardNumber) => onFormChange({ ...form, idCardNumber })}
          />
          <Textarea
            required
            rows={3}
            label="ที่อยู่สำหรับติดต่อและจัดส่ง/คืนสินค้า"
            placeholder="บ้านเลขที่, หมู่, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์"
            value={form.address}
            onChange={set("address")}
          />
        </div>
      </div>

      <KycDocumentUpload preview={preview} onSelect={onFileSelect} />

      {error && <Alert>{error}</Alert>}

      <div className="border-t border-line pt-4">
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting
            ? "กำลังบันทึกข้อมูลยืนยันตัวตน..."
            : "ยืนยันข้อมูลเพื่อเป็นผู้ขาย"}
        </Button>
      </div>
    </form>
  );
}
