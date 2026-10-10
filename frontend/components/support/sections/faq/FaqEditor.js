"use client";
import { useState } from "react";
import Modal from "../../../ui/Modal";
import Button from "../../../ui/Button";
import SupportCategorySelect from "../../SupportCategorySelect";

export default function FaqEditor({
  open,
  token,
  busy,
  error,
  onClose,
  onSubmit,
  article,
}) {
  const [form, setForm] = useState({
    title: article?.title || "",
    body: article?.body || "",
    category: article?.category || "",
  });
  const field = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={article ? "แก้ไข FAQ" : "เขียนบทความใหม่ (New FAQ)"}
      size="lg"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (form.category && !busy) onSubmit(form);
        }}
      >
        <label className="block text-sm font-medium">
          หัวข้อบทความ
          <input
            required
            value={form.title}
            onChange={field("title")}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <SupportCategorySelect
          kind="help"
          token={token}
          value={form.category}
          onChange={field("category")}
        />
        <label className="block text-sm font-medium">
          เนื้อหาบทความ
          <textarea
            required
            rows={8}
            value={form.body}
            onChange={field("body")}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            ยกเลิก
          </Button>
          <Button type="submit" disabled={busy || !form.category}>
            {busy ? "กำลังบันทึก..." : "บันทึกเป็นฉบับร่าง"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
