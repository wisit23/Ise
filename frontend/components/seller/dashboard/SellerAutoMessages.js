"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { getAccessToken } from "../../../lib/auth";
import ConfirmDialog from "../../ui/ConfirmDialog";

const DEFAULT_SUGGESTIONS = [
  "สินค้ายังอยู่ไหมครับ?",
  "ลดราคาได้ไหมครับ?",
  "ขอดูรูปสินค้าเพิ่มเติมหน่อยครับ",
  "สภาพสินค้ากี่ % ครับ?",
  "สะดวกจัดส่งวันไหนครับ?",
  "มีตำหนิตรงไหนเพิ่มเติมไหมครับ?",
];

export default function SellerAutoMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const token = getAccessToken();

  async function loadMessages() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/auth/shop/auto-messages", { token });
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "ไม่สามารถโหลดข้อมูลคำถามอัตโนมัติได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, []);

  async function handleCreate(textToAdd) {
    const text = (textToAdd || newText).trim();
    if (!text) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const created = await apiFetch("/api/auth/shop/auto-messages", {
        method: "POST",
        token,
        body: { messageText: text, isActive: true },
      });
      setMessages((prev) => [...prev, created]);
      setNewText("");
      setSuccess("เพิ่มคำถามอัตโนมัติเรียบร้อยแล้ว");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการสร้างคำถาม");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id, currentActive) {
    try {
      const updated = await apiFetch(`/api/auth/shop/auto-messages/${id}`, {
        method: "PATCH",
        token,
        body: { isActive: !currentActive },
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isActive: updated.isActive } : m)),
      );
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการเปลี่ยนสถานะ");
    }
  }

  async function handleUpdate(id) {
    const text = editText.trim();
    if (!text) return;
    try {
      const updated = await apiFetch(`/api/auth/shop/auto-messages/${id}`, {
        method: "PATCH",
        token,
        body: { messageText: text },
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, messageText: updated.messageText } : m,
        ),
      );
      setEditingId(null);
      setEditText("");
      setSuccess("บันทึกการแก้ไขเรียบร้อยแล้ว");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการแก้ไข");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch(`/api/auth/shop/auto-messages/${deleteTarget.id}`, {
        method: "DELETE",
        token,
      });
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setSuccess("ลบคำถามเรียบร้อยแล้ว");
      setTimeout(() => setSuccess(""), 3000);
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการลบคำถาม");
    } finally {
      setDeleting(false);
    }
  }

  const activeMessages = messages.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 sm:text-lg">
            คำถามอัตโนมัติในแชท (Chat Quick Questions)
          </h2>
          <p className="text-xs text-slate-500">
            สร้างและตั้งค่าคำถามด่วนที่ผู้ซื้อสามารถกดส่งได้ทันทีเมื่อเปิดแชทกับร้านค้าของคุณ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            เปิดใช้งานอยู่ {activeMessages.length} / {messages.length} ข้อ
          </span>
        </div>
      </div>

      {/* ── Status Alerts ── */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800 border border-emerald-200 animate-fade-in">
          {success}
        </div>
      )}

      {/* ── Section: Add Question & Quick Suggestions ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-emerald-600">
            add_circle
          </span>
          สร้างคำถามอัตโนมัติใหม่
        </h3>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="พิมพ์คำถามที่ต้องการให้ผู้ซื้อกดถาม เช่น 'สินค้ามีพร้อมส่งไหมครับ?'"
            className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            maxLength={100}
          />
          <button
            type="submit"
            disabled={submitting || !newText.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>{submitting ? "กำลังเพิ่ม..." : "เพิ่มคำถาม"}</span>
          </button>
        </form>

        {/* Suggestion Chips */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 mb-2">
            คำถามแนะนำยอดนิยม (คลิกเพื่อเพิ่มด่วน):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_SUGGESTIONS.map((sug) => {
              const alreadyExists = messages.some((m) => m.messageText === sug);
              return (
                <button
                  key={sug}
                  type="button"
                  disabled={alreadyExists}
                  onClick={() => handleCreate(sug)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition ${
                    alreadyExists
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      : "bg-slate-50 text-slate-700 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {alreadyExists ? "check" : "add"}
                  </span>
                  <span>{sug}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Left Column: Questions List ── */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-emerald-600">
                  list_alt
                </span>
                รายการคำถามอัตโนมัติของร้าน
              </h3>
              <span className="text-xs text-slate-500">
                ทั้งหมด {messages.length} รายการ
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                กำลังโหลดข้อมูล...
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <span className="material-symbols-outlined text-[36px] text-slate-300 mb-2">
                  chat_bubble_outline
                </span>
                <p className="text-xs font-semibold text-slate-600">
                  ยังไม่มีคำถามอัตโนมัติ
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                  เพิ่มคำถามจากกล่องด้านบน เพื่อให้ผู้ซื้อสามารถเลือกกดส่งคำถามได้ทันทีเมื่อเปิดแชทกับคุณ
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {messages.map((item, idx) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div
                      key={item.id}
                      data-testid={`auto-message-${item.id}`}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border p-3 transition ${
                        item.isActive
                          ? "border-slate-200 bg-white hover:border-emerald-300"
                          : "border-slate-200/60 bg-slate-50/60 opacity-70"
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="flex-1 rounded border border-emerald-500 px-2 py-1 text-xs text-slate-800 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdate(item.id)}
                            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            บันทึก
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditText("");
                            }}
                            className="rounded bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-medium text-slate-800 truncate">
                              {item.messageText}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                            {/* Toggle active button */}
                            <button
                              type="button"
                              onClick={() => handleToggle(item.id, item.isActive)}
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition ${
                                item.isActive
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                              }`}
                            >
                              {item.isActive ? "✓ เปิดใช้งาน" : "✕ ปิดใช้งาน"}
                            </button>

                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(item.id);
                                setEditText(item.messageText);
                              }}
                              className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                              title="แก้ไขข้อความ"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                edit
                              </span>
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="ลบคำถามนี้"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                delete
                              </span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Live Buyer Preview ── */}
        <div className="lg:col-span-5">
          <div className="sticky top-20 rounded-xl border border-slate-200/80 bg-slate-50 p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-emerald-600">
                preview
              </span>
              <h3 className="text-sm font-bold text-slate-800">
                ตัวอย่างมุมมองของผู้ซื้อ (Buyer Preview)
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">
              นี่คือสิ่งที่ผู้ซื้อจะมองเห็นเมื่อเปิดหน้าต่างแชทกับร้านค้าของคุณเป็นฝ่ายแรก:
            </p>

            {/* Simulated Chat Mockup */}
            <div className="rounded-xl border border-slate-300/80 bg-white shadow-sm overflow-hidden flex flex-col h-[340px]">
              {/* Header */}
              <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/80 px-3.5 py-2.5">
                <div className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                  S
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    ร้านค้าของคุณ
                  </p>
                  <p className="text-[10px] text-emerald-600 font-medium">
                    ออนไลน์
                  </p>
                </div>
              </div>

              {/* Chat Body */}
              <div className="flex-1 p-3.5 overflow-y-auto flex flex-col items-center justify-center text-center bg-radial from-slate-50/50 to-white">
                <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 shadow-2xs">
                  <span className="material-symbols-outlined text-[20px]">
                    chat_bubble
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  เริ่มคุยกับผู้ขาย
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 mb-3">
                  เลือกคำถามด่วนด้านล่างเพื่อเริ่มการสนทนาได้ทันที
                </p>

                {/* Question Chips Preview */}
                <div className="w-full flex flex-wrap justify-center gap-1.5 max-w-[280px]">
                  {activeMessages.length > 0 ? (
                    activeMessages.map((m) => (
                      <span
                        key={m.id}
                        className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-[11px] font-medium text-emerald-700 shadow-2xs transition hover:bg-emerald-50 cursor-pointer"
                      >
                        {m.messageText}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">
                      (ไม่มีคำถามที่เปิดใช้งานอยู่ - ระบบจะใช้คำถามเริ่มต้น)
                    </span>
                  )}
                </div>
              </div>

              {/* Composer mockup */}
              <div className="border-t border-slate-100 bg-slate-50/60 p-2.5 flex items-center gap-1.5">
                <div className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-400">
                  พิมพ์ข้อความ...
                </div>
                <div className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                  <span className="material-symbols-outlined text-[14px]">
                    send
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal for Deletion ── */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="ยืนยันการลบคำถามอัตโนมัติ"
        description={
          deleteTarget
            ? `คุณแน่ใจว่าต้องการลบคำถาม "${deleteTarget.messageText}" ใช่หรือไม่? เมื่อลบแล้วคำถามนี้จะไม่แสดงให้ผู้ซื้อเห็นอีก`
            : ""
        }
        confirmLabel="ยืนยันการลบ"
        cancelLabel="ยกเลิก"
        tone="danger"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
