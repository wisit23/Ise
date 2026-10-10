"use client";
import { useEffect } from "react";
import Select from "../ui/Select";
import useSupportCategories from "./hooks/useSupportCategories";

export default function SupportCategorySelect({
  kind = "tickets",
  token,
  value,
  onChange,
  disabled,
  ...props
}) {
  const { items, loading, error } = useSupportCategories(kind, token);
  const active = items.some((item) => item.value === value);
  useEffect(() => {
    if (!loading && !error && value && !active)
      onChange({ target: { value: "" } });
  }, [loading, error, value, active, onChange]);
  return (
    <Select
      {...props}
      label={props.label || "หมวดหมู่"}
      value={active ? value : ""}
      options={items}
      onChange={onChange}
      required
      disabled={disabled || loading || !items.length}
      placeholder={loading ? "กำลังโหลดหมวดหมู่..." : "เลือกหมวดหมู่"}
      error={
        error ||
        (!loading && !items.length
          ? "ยังไม่มีหมวดหมู่ที่เปิดใช้งาน"
          : undefined)
      }
    />
  );
}
