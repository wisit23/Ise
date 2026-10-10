"use client";

import { useEffect, useState } from "react";
import Alert from "../../../ui/Alert";
import Button from "../../../ui/Button";
import { apiFetch, fetchAuthedBlobUrl } from "../../../../lib/api";

export default function DisputeChatPanel({ dispute, token, closing, onClose }) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [unavailableReason, setUnavailableReason] = useState("");
  const [openingAttachmentId, setOpeningAttachmentId] = useState(null);

  async function openAttachment(message) {
    setOpeningAttachmentId(message.id);
    setError("");
    try {
      const objectUrl = await fetchAuthedBlobUrl(
        `/api/orders/disputes/${dispute.id}/chat-attachments/${message.id}`,
        token,
      );
      window.open(objectUrl, "_blank", "noreferrer");
    } catch (err) {
      setError(`เปิดไฟล์แนบไม่สำเร็จ: ${err.message}`);
    } finally {
      setOpeningAttachmentId(null);
    }
  }

  async function load(before) {
    before ? setLoadingOlder(true) : setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (before) params.set("before", before);
      const data = await apiFetch(
        `/api/orders/disputes/${dispute.id}/chat-history?${params}`,
        { token },
      );
      if (!data.available) {
        setUnavailableReason(data.reason || "ยังไม่มีประวัติสนทนา");
        setItems([]);
        setNextCursor(null);
        return;
      }
      const page = [...(data.items || [])].reverse();
      setItems((current) => (before ? [...page, ...current] : page));
      setNextCursor(data.nextCursor || null);
      setUnavailableReason("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setUnavailableReason("");
    load();
  }, [dispute.id, token]);

  return (
    <div
      className={`flex w-full max-w-md flex-col border-r border-slate-200 bg-white shadow-xl ${
        closing ? "animate-slide-out-left" : "animate-slide-in-left"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            ประวัติแชทผู้ซื้อ–ผู้ขาย
          </h3>
          <p className="text-xs text-slate-500">
            อ่านอย่างเดียว · บันทึก Audit ทุกหน้า
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิดประวัติแชท">
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
        {error && (
          <Alert title="โหลดประวัติแชทไม่สำเร็จ">
            <div className="flex items-center justify-between gap-2">
              <span>{error}</span>
              <Button size="sm" variant="secondary" onClick={() => load()}>
                ลองใหม่
              </Button>
            </div>
          </Alert>
        )}
        {loading && (
          <p className="text-center text-sm text-slate-500">กำลังโหลด...</p>
        )}
        {!loading && unavailableReason && (
          <Alert tone="info" title="ยังไม่มี ORDER conversation">
            {unavailableReason}
          </Alert>
        )}
        {!loading && nextCursor && (
          <div className="mb-3 text-center">
            <Button
              size="sm"
              variant="secondary"
              loading={loadingOlder}
              onClick={() => load(nextCursor)}
            >
              โหลดข้อความก่อนหน้า
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {items.map((message) => {
            const buyer = message.senderRole === "BUYER";
            return (
              <div
                key={message.id}
                className={`rounded-lg border px-3 py-2 ${
                  message.senderRole === "SYSTEM"
                    ? "border-slate-200 bg-white"
                    : buyer
                      ? "border-indigo-100 bg-indigo-50"
                      : "border-amber-100 bg-amber-50"
                }`}
              >
                <div className="mb-1 flex justify-between gap-2 text-[10px] font-semibold text-slate-500">
                  <span>
                    {message.senderRole === "SYSTEM"
                      ? "ระบบ"
                      : buyer
                        ? "ผู้ซื้อ"
                        : "ผู้ขาย"}
                  </span>
                  <span>
                    {new Date(message.createdAt).toLocaleString("th-TH")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">
                  {message.deletedAt
                    ? "[ข้อความถูกลบ]"
                    : message.body || `[${message.type}]`}
                </p>
                {(message.type === "IMAGE" || message.type === "FILE") && (
                  <button
                    type="button"
                    onClick={() => openAttachment(message)}
                    disabled={openingAttachmentId === message.id}
                    className="mt-2 text-xs font-semibold text-emerald-700 underline disabled:opacity-50"
                  >
                    {openingAttachmentId === message.id
                      ? "กำลังเปิดไฟล์..."
                      : `เปิดไฟล์แนบแบบตรวจสิทธิ์${message.payload?.filename ? ` · ${message.payload.filename}` : ""}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
