"use client";

import { useEffect, useState } from "react";

import Alert from "../../ui/Alert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { useToast } from "../../ui/ToastProvider";
import CaseDrawer from "./case/CaseDrawer";
import TicketCasePanel from "./case/TicketCasePanel";
import TicketsTable from "./tickets/TicketsTable";
import { PAGE_SIZE } from "../../../lib/supportConstants";
import { apiFetch } from "../../../lib/api";

const DRAWER_EXIT_MS = 280;

/* The CS agent's ticket queue. Shares the drawer shell and the ticket panel
   with the Admin inbox (./case) — this view simply passes no warn/ban
   handlers, because those are Admin-only powers. */
export default function TicketsSection({
  token,
  statusFilter,
  setStatusFilter,
}) {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [escalating, setEscalating] = useState(false);

  function closeTicket() {
    setClosingTicket(true);
    setTimeout(() => {
      setSelectedTicket(null);
      setClosingTicket(false);
      setActionError("");
    }, DRAWER_EXIT_MS);
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      scope: "all",
    });
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    apiFetch(`/api/support/tickets/queue?${params}`, { token })
      .then((data) => {
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, q, statusFilter, priorityFilter, token, refreshKey]);

  function refreshAfterAction() {
    setRefreshKey((k) => k + 1);
    if (selectedTicket) {
      apiFetch(`/api/support/tickets/${selectedTicket.id}`, { token })
        .then(setSelectedTicket)
        .catch((err) => setActionError(err.message));
    }
  }

  async function runAction(fn, successMessage) {
    setActionBusy(true);
    setActionError("");
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      refreshAfterAction();
    } catch (err) {
      setActionError(err.message);
      toast.error(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  function handleAssign() {
    if (!selectedTicket) return;
    return runAction(
      () =>
        apiFetch(`/api/support/tickets/${selectedTicket.id}/assign`, {
          method: "POST",
          token,
        }),
      "รับงานเรียบร้อย",
    );
  }

  function handleStatusChange(status, reason) {
    if (!selectedTicket) return;
    // Escalating asks for a note. It used to do that through window.prompt,
    // which froze the tab and threw away what you had typed if you mis-clicked.
    if (status === "ESCALATED" && reason === undefined) {
      setEscalating(true);
      return;
    }
    return runAction(
      () =>
        apiFetch(`/api/support/tickets/${selectedTicket.id}/status`, {
          method: "PATCH",
          token,
          body: { status, reason: reason || undefined },
        }),
      status === "CLOSED" ? "ปิดงานเรียบร้อย" : "ส่งต่อให้ Admin เรียบร้อย",
    );
  }

  return (
    <>
      <div className="animate-fade-in-up flex min-h-full flex-col">
        {error && <Alert className="mb-3">{error}</Alert>}

        <TicketsTable
          items={items}
          loading={loading}
          qInput={qInput}
          onQInputChange={setQInput}
          onSearch={() => {
            setQ(qInput);
            setPage(1);
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={(v) => {
            setPriorityFilter(v);
            setPage(1);
          }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onSelectTicket={setSelectedTicket}
        />
      </div>

      <CaseDrawer
        ticket={selectedTicket}
        closing={closingTicket}
        onClose={closeTicket}
      >
        {selectedTicket && (
          <TicketCasePanel
            ticket={selectedTicket}
            actionBusy={actionBusy}
            actionError={actionError}
            onAssign={handleAssign}
            onStatusChange={handleStatusChange}
          />
        )}
      </CaseDrawer>

      <ConfirmDialog
        open={escalating}
        busy={actionBusy}
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
    </>
  );
}
