"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useToast } from "../../ui/ToastProvider";
import SupportQueueSidebar from "./live-support/SupportQueueSidebar";
import SupportMainChat from "./live-support/SupportMainChat";
import SupportCaseDetails from "./live-support/SupportCaseDetails";

import motion from "./supportMotion.module.css";

export default function LiveSupportSection({
  token,
  initialTicketId = null,
  queueToolbar,
}) {
  const toast = useToast();
  const queueRequest = useRef(0);
  const detailRequest = useRef(0);
  const closingTimer = useRef(null);
  const [detailsClosing, setDetailsClosing] = useState(false);
  const [queueDirection, setQueueDirection] = useState(1);
  function closeDetails() {
    if (closingTimer.current) return;
    setDetailsClosing(true);
    closingTimer.current = setTimeout(
      () => {
        setShowDetails(false);
        setDetailsClosing(false);
        closingTimer.current = null;
      },
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
  }
  useEffect(
    () => () => {
      clearTimeout(closingTimer.current);
      queueRequest.current++;
      detailRequest.current++;
    },
    [],
  );

  const [scope, setScope] = useState("mine");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState("");

  const [selectedTicketId, setSelectedTicketId] = useState(
    initialTicketId || null,
  );
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingTicket, setLoadingTicket] = useState(false);

  useEffect(() => {
    if (initialTicketId) {
      setSelectedTicketId(initialTicketId);
    }
  }, [initialTicketId]);

  const [showDetails, setShowDetails] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  // ── Fetch Tickets Queue ──
  const fetchQueue = useCallback(
    async (currentScope = scope, currentSearch = search) => {
      const request = ++queueRequest.current;
      setLoadingQueue(true);
      setQueueError("");
      try {
        const params = new URLSearchParams();
        if (currentScope) params.set("scope", currentScope);
        if (currentSearch?.trim()) params.set("q", currentSearch.trim());
        params.set("take", "50");

        const data = await apiFetch(`/api/support/tickets/queue?${params}`, {
          token,
        });
        if (request !== queueRequest.current) return;
        const items = data.items || [];
        setTickets(items);

        setSelectedTicketId((prev) => {
          if (prev === initialTicketId) return prev;
          return prev && items.some((ticket) => ticket.id === prev)
            ? prev
            : null;
        });
      } catch (err) {
        if (request !== queueRequest.current) return;
        setQueueError(err.message);
        toast.error(`โหลดคิวงานไม่สำเร็จ: ${err.message}`);
      } finally {
        if (request === queueRequest.current) setLoadingQueue(false);
      }
    },
    [scope, search, token, toast, initialTicketId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => fetchQueue(scope, search), 300);
    return () => {
      window.clearTimeout(timer);
      queueRequest.current++;
    };
  }, [fetchQueue, scope, search]);

  // ── Fetch Selected Ticket Details ──
  const fetchTicketDetails = useCallback(
    async (ticketId) => {
      const request = ++detailRequest.current;
      if (!ticketId) {
        setSelectedTicket(null);
        setLoadingTicket(false);
        return;
      }
      setActionError("");
      setLoadingTicket(true);
      try {
        const fullTicket = await apiFetch(`/api/support/tickets/${ticketId}`, {
          token,
        });
        if (request !== detailRequest.current) return;
        setSelectedTicket(fullTicket);
      } catch (err) {
        if (request !== detailRequest.current) return;
        setActionError(err.message);
        setSelectedTicket(null);
        setSelectedTicketId(null);
        toast.error(`โหลดรายละเอียดตั๋วไม่สำเร็จ: ${err.message}`);
      } finally {
        if (request === detailRequest.current) setLoadingTicket(false);
      }
    },
    [token, toast],
  );

  useEffect(() => {
    if (selectedTicketId) {
      fetchTicketDetails(selectedTicketId);
    } else {
      setSelectedTicket(null);
      setLoadingTicket(false);
    }
    return () => {
      detailRequest.current++;
    };
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
    <div className="relative flex h-full w-full overflow-hidden bg-slate-100">
      {/* ── Left Column: Queue Sidebar ── */}
      <SupportQueueSidebar
        toolbar={queueToolbar}
        direction={queueDirection}
        tickets={tickets}
        selectedTicketId={selectedTicketId}
        onSelectTicket={(t) => {
          if (selectedTicketId === t.id) return;
          detailRequest.current++;
          setShowDetails(false);
          setSelectedTicket(null);
          setLoadingTicket(true);
          setSelectedTicketId(t.id);
        }}
        scope={scope}
        onScopeChange={(newScope) => {
          if (newScope === scope) return;
          const scopes = ["mine", "unassigned", "all"];
          setQueueDirection(
            scopes.indexOf(newScope) > scopes.indexOf(scope) ? 1 : -1,
          );
          queueRequest.current++;
          detailRequest.current++;
          setTickets([]);
          setLoadingQueue(true);
          setShowDetails(false);
          setScope(newScope);
          setSelectedTicketId(null);
        }}
        search={search}
        onSearchChange={setSearch}
        loading={loadingQueue}
        error={queueError}
        onRefresh={() => fetchQueue(scope, search)}
        className={selectedTicketId ? "hidden md:flex" : "flex"}
      />

      {/* ── Center Column: Main Chat ── */}
      <SupportMainChat
        key={selectedTicketId || "empty"}
        ticket={selectedTicket}
        loadingTicket={loadingTicket}
        onAssignTicket={handleAssignTicket}
        assigning={actionBusy}
        showDetails={showDetails}
        onToggleDetails={() =>
          showDetails ? closeDetails() : setShowDetails(true)
        }
        onBackToQueue={() => {
          setShowDetails(false);
          setSelectedTicketId(null);
          setSelectedTicket(null);
        }}
      />

      {/* ── Right Column: Case Details & Actions ── */}
      {showDetails && (
        <div
          className="absolute inset-0 z-30 flex justify-end"
          role="presentation"
        >
          <button
            type="button"
            className={`absolute inset-0 bg-slate-950/30 backdrop-blur-[1px] ${detailsClosing ? motion.backdropClosing : motion.backdrop}`}
            onClick={closeDetails}
            aria-label="ปิดรายละเอียดคำร้อง"
          />
          <SupportCaseDetails
            className={detailsClosing ? motion.drawerClosing : motion.drawer}
            ticket={selectedTicket}
            onAssign={handleAssignTicket}
            onStatusChange={handleStatusChange}
            onAddInternalNote={handleAddInternalNote}
            actionBusy={actionBusy}
            actionError={actionError}
            onClose={closeDetails}
          />
        </div>
      )}
    </div>
  );
}
