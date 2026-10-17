"use client";
import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Alert from "../ui/Alert";
import { apiFetch } from "../../lib/api";
import { validateAddressContact } from "../../lib/addressValidation";

const FIELDS = [
  ["recipientName", "ชื่อ-นามสกุล ผู้รับ"],
  ["phone", "เบอร์โทรศัพท์"],
  ["addressLine", "บ้านเลขที่ ถนน อาคาร"],
  ["subdistrict", "แขวง / ตำบล"],
  ["district", "เขต / อำเภอ"],
  ["province", "จังหวัด"],
  ["postalCode", "รหัสไปรษณีย์"],
];
const BLANK = {
  recipientName: "",
  phone: "",
  addressLine: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  isDefault: false,
};

export default function AddressManagerModal({
  addresses,
  selectedId,
  onChange,
  onSelect,
  onClose,
  onBusyChange,
}) {
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const close = () => {
    if (!busy) onClose();
  };

  async function mutate(path, options, selected) {
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const saved = await apiFetch(path, options);
      const updated = await apiFetch("/api/auth/me/addresses");
      onChange(updated, selected === "saved" ? saved.id : selected);
      setForm(null);
      setDeleting(null);
    } catch (err) {
      setError(err.message || "จัดการที่อยู่ไม่สำเร็จ");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  function edit(address) {
    setEditingId(address?.id || null);
    setForm(address ? { ...address } : { ...BLANK });
    setError("");
    setFieldErrors({});
  }

  function save(event) {
    event.preventDefault();
    const errors = validateAddressContact(form);
    for (const [field, label] of FIELDS) {
      if (!form[field]?.trim() && !errors[field])
        errors[field] = `กรุณากรอก${label}`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const body = Object.fromEntries(
      FIELDS.map(([field]) => [field, form[field]]),
    );
    body.isDefault = form.isDefault;
    mutate(
      editingId
        ? `/api/auth/me/addresses/${editingId}`
        : "/api/auth/me/addresses",
      { method: editingId ? "PATCH" : "POST", body },
      "saved",
    );
  }

  return (
    <Modal
      open
      title={
        form
          ? editingId
            ? "แก้ไขที่อยู่จัดส่ง"
            : "เพิ่มที่อยู่จัดส่ง"
          : "จัดการที่อยู่จัดส่ง"
      }
      onClose={close}
      size="lg"
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {form ? (
        <form noValidate onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([field, label]) => (
              <Input
                key={field}
                label={label}
                required
                value={form[field]}
                error={fieldErrors[field]}
                disabled={busy}
                type={field === "phone" ? "tel" : "text"}
                inputMode={
                  field === "phone" || field === "postalCode"
                    ? "numeric"
                    : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              disabled={busy}
              onChange={(event) =>
                setForm({ ...form, isDefault: event.target.checked })
              }
            />
            ใช้เป็นที่อยู่เริ่มต้น
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setForm(null);
                setError("");
              }}
            >
              ยกเลิก
            </Button>
            <Button type="submit" loading={busy}>
              บันทึกที่อยู่
            </Button>
          </div>
        </form>
      ) : deleting ? (
        <div className="space-y-4">
          <p className="text-sm">
            ต้องการลบที่อยู่ของ {deleting.recipientName} ใช่ไหม?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              ยกเลิก
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                mutate(`/api/auth/me/addresses/${deleting.id}`, {
                  method: "DELETE",
                })
              }
            >
              ยืนยันลบที่อยู่
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => edit(null)}
          >
            เพิ่มที่อยู่ใหม่
          </Button>
          {!addresses.length && (
            <p className="text-sm text-ink-muted">ยังไม่มีที่อยู่จัดส่ง</p>
          )}
          {addresses.map((address) => (
            <div key={address.id} className="rounded-lg border border-line p-4">
              <p className="font-semibold">
                {address.recipientName}{" "}
                {address.isDefault && (
                  <span className="text-xs text-brand-700">
                    ที่อยู่เริ่มต้น
                  </span>
                )}
              </p>
              <p className="text-sm text-ink-muted">{address.phone}</p>
              <p className="my-2 text-sm">
                {address.addressLine} {address.subdistrict} {address.district}{" "}
                {address.province} {address.postalCode}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onSelect(address.id);
                    onClose();
                  }}
                >
                  {selectedId === address.id
                    ? "ใช้ที่อยู่นี้อยู่"
                    : "ใช้ที่อยู่นี้"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => edit(address)}
                >
                  แก้ไข
                </Button>
                {!address.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      mutate(`/api/auth/me/addresses/${address.id}/default`, {
                        method: "PATCH",
                      })
                    }
                  >
                    ตั้งเป็นค่าเริ่มต้น
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(address);
                    setError("");
                  }}
                >
                  ลบ
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
