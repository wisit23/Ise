"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "../../../../components/NavBar";
import Footer from "../../../../components/Footer";
import ConfirmDialog from "../../../../components/ui/ConfirmDialog";
import { apiFetch } from "../../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../../lib/auth";

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

  const isAgent = user?.role === "CUSTOMER_SERVICE" || user?.role === "ADMIN";

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

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">{ticket.ticketNumber}</p>
            <h1 className="text-xl font-bold text-gray-900">
              {ticket.subject}
            </h1>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
            {STATUS_LABEL[ticket.status] || ticket.status}
          </span>
        </div>
        {ticket.description && (
          <p className="mb-4 text-sm text-gray-600">{ticket.description}</p>
        )}

        {isAgent && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
            {!ticket.assigneeId && (
              <button
                onClick={handleAssign}
                disabled={busyAction}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                รับเรื่องนี้
              </button>
            )}
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={busyAction}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                → {STATUS_LABEL[s] || s}
              </button>
            ))}
          </div>
        )}

        <ul className="mb-4 flex flex-col gap-2">
          {ticket.messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${
                m.isInternal
                  ? "border-amber-200 bg-amber-50"
                  : m.authorRole === "AGENT"
                    ? "border-sky-200 bg-sky-50"
                    : "border-gray-200 bg-white"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
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
                <span>{new Date(m.createdAt).toLocaleString("th-TH")}</span>
              </div>
              <p className="whitespace-pre-line text-gray-800">{m.body}</p>
            </li>
          ))}
          {ticket.messages.length === 0 && (
            <li className="text-sm text-gray-400">ยังไม่มีข้อความในตั๋วนี้</li>
          )}
        </ul>

        {ticket.status !== "CLOSED" && (
          <form
            onSubmit={handleReply}
            className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3"
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="พิมพ์ข้อความ..."
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
                  โน้ตภายใน (ลูกค้าจะไม่เห็น)
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
