"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import ConfirmDialog from "../../../../components/ui/ConfirmDialog";
import EmbeddedChat from "../../../../components/support/EmbeddedChat";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";
import { TICKET_STATUS_STYLE } from "../../../../lib/supportConstants";

const STATUS_LABEL = {
  NEW: "รอรับเรื่อง",
  ASSIGNED: "มีเจ้าหน้าที่รับเรื่องแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  PENDING_USER: "รอข้อมูลจากคุณ",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิดเรื่อง",
  ESCALATED: "ยกระดับความสำคัญ",
};

// Agent-only next steps offered from each status (see ticketState.js).
const AGENT_NEXT_STATUS = {
  NEW: ["ESCALATED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "ESCALATED", "CLOSED"],
  IN_PROGRESS: ["PENDING_USER", "RESOLVED", "ESCALATED"],
  PENDING_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  CLOSED: [],
};

export default function TicketThreadPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const isAgent =
    user?.role === "CUSTOMER_SERVICE" ||
    user?.role === "ADMIN" ||
    user?.role === "TRUST_AND_SAFETY";

  function load() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    apiFetch(`/api/support/tickets/${id}`, { token })
      .then(setTicket)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setUser(getStoredUser());
    load();
  }, [id, router]);

  async function handleReply(e) {
    e.preventDefault();
    if (!body.trim()) return;
    const token = getAccessToken();
    setSending(true);
    try {
      await apiFetch(`/api/support/tickets/${id}/messages`, {
        method: "POST",
        token,
        body: { body, isInternal },
      });
      setBody("");
      setIsInternal(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleAssign() {
    const token = getAccessToken();
    setBusyAction(true);
    try {
      await apiFetch(`/api/support/tickets/${id}/assign`, {
        method: "POST",
        token,
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleStatusChange(status, reason) {
    // Escalating asks for a note. window.prompt() froze the tab, ignored the
    // page's styling, and discarded whatever had been typed on a mis-click.
    if (status === "ESCALATED" && reason === undefined) {
      setEscalating(true);
      return;
    }
    const token = getAccessToken();
    setBusyAction(true);
    try {
      await apiFetch(`/api/support/tickets/${id}/status`, {
        method: "PATCH",
        token,
        body: { status, reason: reason || undefined },
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(false);
    }
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-2xl px-4 py-10 text-red-600">{error}</p>
      </main>
    );
  }

  if (!ticket || user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-2xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  const nextStatuses = isAgent ? AGENT_NEXT_STATUS[ticket.status] || [] : [];
  const visibleLogs = ticket.conversationId
    ? ticket.messages.filter((m) => m.isInternal || m.authorRole === "SYSTEM")
    : ticket.messages;

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <header className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-indigo-600">
                {ticket.ticketNumber}
              </p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">
                {ticket.subject}
              </h1>
              <p className="mt-2 text-xs text-slate-500">
                เปิดเมื่อ {new Date(ticket.createdAt).toLocaleString("th-TH")}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${TICKET_STATUS_STYLE[ticket.status] || "border border-slate-200 bg-slate-50 text-slate-600"}`}
            >
              {STATUS_LABEL[ticket.status] || ticket.status}
            </span>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {ticket.conversationId ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <span className="material-symbols-outlined text-[16px]">
                        chat
                      </span>
                    </span>
                    <div>
                      <h2 className="text-xs font-bold text-slate-800">
                        บทสนทนา
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        ข้อความและหลักฐานของคำร้องนี้
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    {ticket.ticketNumber}
                  </span>
                </div>
                <div className="p-2 bg-white">
                  <EmbeddedChat
                    conversationId={ticket.conversationId}
                    maxHeight="420px"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <h2 className="text-sm font-bold text-slate-800">
                  ข้อความในคำร้อง
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  ตั๋วนี้ไม่มีห้องสนทนาแบบเรียลไทม์
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20">
            {ticket.description && (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <h2 className="text-xs font-bold text-slate-700">
                  รายละเอียดที่แจ้ง
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {ticket.description}
                </p>
              </section>
            )}

            {isAgent && (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <h2 className="mb-3 text-xs font-bold text-slate-700">
                  จัดการคำร้อง
                </h2>
                <div className="flex flex-col gap-2">
                  {!ticket.assigneeId && (
                    <button
                      onClick={handleAssign}
                      disabled={busyAction}
                      className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      รับเรื่องนี้
                    </button>
                  )}
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={busyAction}
                      className="min-h-10 rounded-lg border border-slate-200 px-3 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      เปลี่ยนเป็น “{STATUS_LABEL[s] || s}”
                    </button>
                  ))}
                </div>
              </section>
            )}

            <details
              className="group rounded-xl border border-slate-200 bg-white shadow-xs"
              open={!ticket.conversationId}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-xs font-bold text-slate-700">
                <span>
                  {ticket.conversationId
                    ? "บันทึกภายในและกิจกรรม"
                    : "ประวัติข้อความ"}{" "}
                  ({visibleLogs.length})
                </span>
                <span className="material-symbols-outlined text-[18px] text-slate-400 transition group-open:rotate-180">
                  expand_more
                </span>
              </summary>
              <ul className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-100 p-3">
                {visibleLogs.map((m) => (
                  <li
                    key={m.id}
                    className={`animate-slide-up rounded-lg border p-3 text-sm ${
                      m.isInternal
                        ? "border-amber-200 bg-amber-50"
                        : m.authorRole === "AGENT"
                          ? "border-sky-200 bg-sky-50"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-600">
                        {m.authorRole === "AGENT"
                          ? "เจ้าหน้าที่"
                          : m.authorRole === "SYSTEM"
                            ? "ระบบ"
                            : "คุณ"}
                      </span>
                      {m.isInternal && (
                        <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-800">
                          โน้ตภายใน
                        </span>
                      )}
                      <span>
                        {new Date(m.createdAt).toLocaleString("th-TH")}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-gray-800">
                      {m.body}
                    </p>
                  </li>
                ))}
                {visibleLogs.length === 0 && (
                  <li className="p-3 text-center text-xs text-gray-500">
                    ยังไม่มีบันทึกในตั๋วนี้
                  </li>
                )}
              </ul>
            </details>

            {ticket.status !== "CLOSED" &&
              (isAgent || !ticket.conversationId) && (
                <form
                  onSubmit={handleReply}
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-xs"
                >
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                    placeholder={
                      isAgent
                        ? "พิมพ์บันทึกโน้ตหรือตอบกลับ..."
                        : "พิมพ์ข้อความเพิ่มเติม..."
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center justify-between">
                    {isAgent ? (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="h-3.5 w-3.5 accent-amber-500"
                        />
                        โน้ตภายใน ลูกค้าจะไม่เห็น
                      </label>
                    ) : (
                      <span />
                    )}
                    <button
                      type="submit"
                      disabled={sending || !body.trim()}
                      className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {sending ? "กำลังส่ง..." : "ส่งข้อความ"}
                    </button>
                  </div>
                </form>
              )}
          </aside>
        </div>
      </section>
      <Footer />

      <ConfirmDialog
        open={escalating}
        busy={busyAction}
        title="ส่งต่อให้ Admin?"
        description="ตั๋วจะออกจากคิวของคุณและไปอยู่ในคิวของ Admin"
        confirmLabel="ส่งต่อ"
        tone="primary"
        reason="optional"
        reasonLabel="เหตุผลที่ยกระดับ"
        onCancel={() => setEscalating(false)}
        onConfirm={(reason) => {
          setEscalating(false);
          handleStatusChange("ESCALATED", reason);
        }}
      />
    </main>
  );
}
