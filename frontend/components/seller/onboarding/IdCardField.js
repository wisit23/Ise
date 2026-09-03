"use client";

import Input from "../../ui/Input";

export const ID_CARD_DIGITS = 13;

/* Thai national ID cards are printed as x-xxxx-xxxxx-xx-x. Showing the
   grouping while typing lets someone check their entry against the card in
   their hand; the value kept in state stays digits-only. */
export function formatIdCardDisplay(val) {
  const clean = (val || "").replace(/\D/g, "");
  if (clean.length <= 1) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 1)}-${clean.slice(1)}`;
  if (clean.length <= 10)
    return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5)}`;
  if (clean.length <= 12)
    return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10)}`;
  return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12, 13)}`;
}

export function isCompleteIdCard(val) {
  return (val || "").replace(/\D/g, "").length === ID_CARD_DIGITS;
}

export default function IdCardField({ value, onChange, error }) {
  const digits = (value || "").replace(/\D/g, "");
  const remaining = ID_CARD_DIGITS - digits.length;

  return (
    <Input
      required
      label="รหัสประจำตัวประชาชน 13 หลัก"
      inputMode="numeric"
      // 13 digits plus the four separators.
      maxLength={17}
      placeholder="x-xxxx-xxxxx-xx-x"
      className="font-mono"
      value={formatIdCardDisplay(value)}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, "").slice(0, ID_CARD_DIGITS))
      }
      error={error}
      // Counting down as they type beats discovering on submit that the
      // number was a digit short.
      hint={
        digits.length === 0
          ? undefined
          : remaining > 0
            ? `อีก ${remaining} หลัก`
            : "ครบ 13 หลักแล้ว"
      }
    />
  );
}
