"use client";

import { useCallback, useState } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Modal from "../ui/Modal";

export default function PreferencePicker({
  label,
  values,
  selected,
  disabled,
  onChange,
  customSizeGroup,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [customValues, setCustomValues] = useState([]);
  const [sizeInput, setSizeInput] = useState("");
  const [error, setError] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const choices = [...new Set([...values, ...selected, ...customValues])];

  function start() {
    setDraft([...selected]);
    setCustomValues([]);
    setSizeInput("");
    setError("");
    setOpen(true);
  }

  function toggle(value) {
    setDraft((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function addSize() {
    const value = sizeInput.trim();
    if (!value || value.length > 100 || /\p{Cc}/u.test(value)) {
      setError("กรอกไซซ์ 1–100 ตัวอักษร โดยไม่มีอักขระควบคุม");
      return;
    }
    if (draft.includes(value)) {
      setError("เลือกไซซ์นี้ไว้แล้ว");
      return;
    }
    setCustomValues((current) => [...new Set([...current, value])]);
    setDraft((current) => [...current, value]);
    setSizeInput("");
    setError("");
  }

  return (
    <>
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <legend className="break-words text-sm font-semibold text-gray-800">
          {label}
        </legend>
        {selected.length ? (
          <div className="flex flex-wrap gap-2">
            {selected.map((value) => (
              <span
                key={value}
                className="max-w-full break-words rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800"
              >
                {value}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">ยังไม่ได้เลือก</p>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          aria-label={`เพิ่ม / แก้ไข ${label}`}
          onClick={start}
        >
          เพิ่ม / แก้ไข
        </Button>
      </fieldset>
      <Modal
        open={open}
        onClose={close}
        title={`เลือก${label}`}
        description="เลือกได้หลายรายการ กดยืนยันเพื่อเปลี่ยนรายการบนหน้า แล้วกดบันทึกความสนใจเพื่อบันทึกข้อมูล"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              ยกเลิก
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                onChange([...draft]);
                close();
              }}
            >
              ยืนยัน
            </Button>
          </>
        }
      >
        <fieldset disabled={disabled} className="min-w-0 space-y-4">
          <legend className="sr-only">ตัวเลือก{label}</legend>
          <div className="flex flex-wrap gap-2">
            {choices.map((value) => (
              <label
                key={value}
                className={`flex max-w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${draft.includes(value) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-gray-700"}`}
              >
                <input
                  type="checkbox"
                  checked={draft.includes(value)}
                  onChange={() => toggle(value)}
                  className="shrink-0 accent-emerald-600"
                />
                <span className="min-w-0 break-words">{value}</span>
              </label>
            ))}
          </div>
          {!choices.length && (
            <p className="text-sm text-ink-muted">
              ยังไม่มีตัวเลือกจากสินค้าที่เปิดขาย เว้นว่างได้
            </p>
          )}
          {customSizeGroup && (
            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <div className="min-w-[160px] flex-1">
                <Input
                  label={`เพิ่มไซซ์ในกลุ่ม ${customSizeGroup}`}
                  value={sizeInput}
                  maxLength={100}
                  disabled={disabled}
                  error={error}
                  placeholder="เช่น 4XL หรือ 42.5"
                  onChange={(event) => {
                    setSizeInput(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (!disabled) addSize();
                    }
                  }}
                />
              </div>
              <Button
                variant="secondary"
                disabled={disabled}
                aria-label={`เพิ่มไซซ์ ${customSizeGroup}`}
                onClick={addSize}
              >
                เพิ่มไซซ์
              </Button>
            </div>
          )}
        </fieldset>
      </Modal>
    </>
  );
}
