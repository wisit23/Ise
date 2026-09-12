"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useToast } from "../../ui/ToastProvider";
import SupportQueueSidebar from "./live-support/SupportQueueSidebar";
import SupportMainChat from "./live-support/SupportMainChat";
import SupportCaseDetails from "./live-support/SupportCaseDetails";

export default function LiveSupportSection({ token, initialTicketId = null }) {
  const toast = useToast();

  const [scope, setScope] = useState("mine");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const [selectedTicketId, setSelectedTicketId] = useState(initialTicketId || null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    if (initialTicketId) {
      setSelectedTicketId(initialTicketId);
    }
  }, [initialTicketId]);

  const [showDetails, setShowDetails] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  // ── Fetch Tickets Queue ──
  const fetchQueue = useCallback(
    async (currentScope = scope, currentSearch = search) => {
      setLoadingQueue(true);
      try {
        const params = new URLSearchParams();
        if (currentScope) params.set("scope", currentScope);
        if (currentSearch?.trim()) params.set("q", currentSearch.trim());
        params.set("take", "50");

        const data = await apiFetch(`/api/support/tickets/queue?${params}`, {
          token,
        });
        const items = data.items || [];
        setTickets(items);

        // Auto-select initial/first ticket if current selected is not in items
        if (items.length > 0) {
          setSelectedTicketId((prev) => {
            const target = initialTicketId || prev;
            if (target && items.some((t) => t.id === target)) {
              return target;
            }
            if (!prev) return items[0].id;
            return prev;
          });
        }
      } catch (err) {
        toast.error(`โหลดคิวงานไม่สำเร็จ: ${err.message}`);
      } finally {
        setLoadingQueue(false);
      }
    },
    [scope, search, token, toast],
  );

  useEffect(() => {
    fetchQueue(scope, search);
  }, [fetchQueue, scope, search]);

  // ── Fetch Selected Ticket Details ──
  const fetchTicketDetails = useCallback(
    async (ticketId) => {
      if (!ticketId) {
        setSelectedTicket(null);
        return;
      }
      setActionError("");
      try {
        const fullTicket = await apiFetch(`/api/support/tickets/${ticketId}`, {
          token,
        });
        setSelectedTicket(fullTicket);
      } catch (err) {
        setActionError(err.message);
      }
    },
    [token],
  );

  useEffect(() => {
    if (selectedTicketId) {
      fetchTicketDetails(selectedTicketId);
    } else {
      setSelectedTicket(null);
    }
  }, [selectedTicketId, fetchTicketDetails]);

  // ── Ticket Actions ──
  async function handleAssignTicket() {
    if (!selectedTicketId) return;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/tickets/${selectedTicketId}/assign`, {
        method: "POST",
        token,
      });
      toast.success("รับงานเรียบร้อยแล้ว ตั๋วย้ายมาอยู่ในคิวของคุณ");
      await fetchTicketDetails(selectedTicketId);
      await fetchQueue(scope, search);
    } catch (err) {
      setActionError(err.message);
      toast.error(`รับงานไม่สำเร็จ: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStatusChange(newStatus, reason) {
    if (!selectedTicketId) return;
    setActionBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/tickets/${selectedTicketId}/status`, {
        method: "PATCH",
        token,
        body: { status: newStatus, reason },
      });
      const msg =
        newStatus === "CLOSED"
          ? "ปิดงานและล็อกแชทเรียบร้อยแล้ว"
          : newStatus === "RESOLVED"
            ? "แจ้งผลการแก้ไขปัญหาเรียบร้อยแล้ว"
            : `เปลี่ยนสถานะเป็น ${newStatus} สำเร็จ`;
      toast.success(msg);
      await fetchTicketDetails(selectedTicketId);
      await fetchQueue(scope, search);
    } catch (err) {
      setActionError(err.message);
      toast.error(`เปลี่ยนสถานะไม่สำเร็จ: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAddInternalNote(body) {
    if (!selectedTicketId || !body?.trim()) return;
    try {
      await apiFetch(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: "POST",
        token,
        body: { body: body.trim(), isInternal: true },
      });
      toast.success("บันทึกโน้ตภายในเรียบร้อย");
      await fetchTicketDetails(selectedTicketId);
    } catch (err) {
      toast.error(`บันทึกโน้ตไม่สำเร็จ: ${err.message}`);
      throw err;
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100">
      {/* ── Left Column: Queue Sidebar ── */}
      <SupportQueueSidebar
        tickets={tickets}
        selectedTicketId={selectedTicketId}
        onSelectTicket={(t) => setSelectedTicketId(t.id)}
        scope={scope}
        onScopeChange={(newScope) => {
          setScope(newScope);
          setSelectedTicketId(null);
        }}
        search={search}
        onSearchChange={setSearch}
        loading={loadingQueue}
        onRefresh={() => fetchQueue(scope, search)}
      />

      {/* ── Center Column: Main Chat ── */}
      <SupportMainChat
        ticket={selectedTicket}
        onAssignTicket={handleAssignTicket}
        assigning={actionBusy}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails((prev) => !prev)}
      />

      {/* ── Right Column: Case Details & Actions ── */}
      {showDetails && (
        <SupportCaseDetails
          ticket={selectedTicket}
          onAssign={handleAssignTicket}
          onStatusChange={handleStatusChange}
          onAddInternalNote={handleAddInternalNote}
          actionBusy={actionBusy}
          actionError={actionError}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}
