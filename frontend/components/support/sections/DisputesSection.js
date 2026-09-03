"use client";

import { useEffect, useState } from "react";

import Alert from "../../ui/Alert";
import { useToast } from "../../ui/ToastProvider";
import DisputeChatPanel from "./disputes/DisputeChatPanel";
import DisputeDetailPanel from "./disputes/DisputeDetailPanel";
import DisputesTable from "./disputes/DisputesTable";
import { PAGE_SIZE } from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";

const PANEL_EXIT_MS = 280;
const CHAT_EXIT_MS = 250;

/* Dispute queue for CS and Admin. Owns the data and the decision actions; the
   table, the detail slide-over and the chat placeholder live in ./disputes. */
export default function DisputesSection({
  token,
  userRole,
  status,
  setStatus,
}) {
  const toast = useToast();

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total: null,
    open: null,
    decided: null,
  });

  const [selectedDispute, setSelectedDispute] = useState(null);
  const [closingDispute, setClosingDispute] = useState(false);
  const [showDisputeChat, setShowDisputeChat] = useState(false);
  const [closingChat, setClosingChat] = useState(false);
  const [disputeDetails, setDisputeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState(null);

  function closeDispute() {
    // With the chat open, the two panels have to leave in order: the chat
    // slides out to the left first, then the dispute panel to the right.
    if (showDisputeChat) {
      setClosingChat(true);
      setTimeout(() => {
        setShowDisputeChat(false);
        setClosingChat(false);
        setClosingDispute(true);
        setTimeout(() => {
          setSelectedDispute(null);
          setClosingDispute(false);
        }, PANEL_EXIT_MS);
      }, 200);
    } else {
      setClosingDispute(true);
      setTimeout(() => {
        setSelectedDispute(null);
        setClosingDispute(false);
      }, PANEL_EXIT_MS);
    }
  }

  function closeDisputeChat() {
    setClosingChat(true);
    setTimeout(() => {
      setShowDisputeChat(false);
      setClosingChat(false);
    }, CHAT_EXIT_MS);
  }

  async function loadDisputeDetails(orderId) {
    setDetailsLoading(true);
    try {
      const data = await apiFetch(`/api/orders/disputes/by-order/${orderId}`, {
        token,
      });
      setDisputeDetails(data);
    } catch (err) {
      // The panel still shows the queue row's summary; only evidence and the
      // decision form depend on this call, so surface it without wiping the
      // slide-over the agent just opened.
      console.error("Failed to load dispute details:", err);
      toast.error(`โหลดรายละเอียดข้อพิพาทไม่สำเร็จ: ${err.message}`);
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleOpenDispute(d) {
    setSelectedDispute(d);
    setDisputeDetails(null);
    setDecisionReason("");
    setShowDisputeChat(false);
    setClosingChat(false);
    loadDisputeDetails(d.orderId);
  }

  async function handleViewEvidence(ev) {
    setOpeningEvidenceId(ev.id);
    try {
      const objectUrl = await fetchAuthedBlobUrl(
        `/api/orders/disputes/${disputeDetails.id}/evidence/${ev.id}`,
      );
      window.open(objectUrl, "_blank", "noreferrer");
    } catch (err) {
      toast.error(`เปิดไฟล์หลักฐานไม่สำเร็จ: ${err.message}`);
    } finally {
      setOpeningEvidenceId(null);
    }
  }

  async function handleDecision(decision) {
    if (!decisionReason.trim()) return;
    setDeciding(true);
    try {
      await apiFetch(`/api/orders/disputes/${disputeDetails.id}/decision`, {
        method: "POST",
        token,
        body: { decision, reason: decisionReason },
      });
      toast.success(
        decision === "APPROVE_REFUND"
          ? "อนุมัติคืนเงินเรียบร้อย"
          : "ปฏิเสธคำร้องเรียบร้อย",
      );
      loadDisputeDetails(selectedDispute.orderId);
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/orders/disputes/queue?${params}`, {
        token,
      });
      setItems(data.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeciding(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    apiFetch(`/api/orders/disputes/queue?${params}`, { token })
      .then((data) => {
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, status, q, token]);

  useEffect(() => {
    const fc = (p) =>
      apiFetch(`/api/orders/disputes/queue?${p}&limit=1`, { token })
        .then((d) => d.total)
        .catch(() => null);
    fc("").then((v) => setStats((s) => ({ ...s, total: v })));
    fc("status=OPEN").then((v) => setStats((s) => ({ ...s, open: v })));
    fc("status=DECIDED").then((v) => setStats((s) => ({ ...s, decided: v })));
  }, [token]);

  return (
    <>
      <div className="animate-fade-in-up flex min-h-full flex-col">
        {error && <Alert className="mb-3">{error}</Alert>}

        <DisputesTable
          items={items}
          loading={loading}
          stats={stats}
          qInput={qInput}
          onQInputChange={setQInput}
          onSearch={() => {
            setQ(qInput);
            setPage(1);
          }}
          status={status}
          onStatusChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onOpenDispute={handleOpenDispute}
        />
      </div>

      {selectedDispute && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeDispute()}
          onKeyDown={(e) => e.key === "Escape" && closeDispute()}
          role="presentation"
          className={`fixed inset-0 z-drawer flex justify-end bg-slate-900/50 backdrop-blur-sm ${
            closingDispute ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          {(showDisputeChat || closingChat) && (
            <DisputeChatPanel
              dispute={selectedDispute}
              closing={closingChat}
              onClose={closeDisputeChat}
            />
          )}

          <DisputeDetailPanel
            dispute={selectedDispute}
            details={disputeDetails}
            detailsLoading={detailsLoading}
            userRole={userRole}
            closing={closingDispute}
            decisionReason={decisionReason}
            onDecisionReasonChange={setDecisionReason}
            deciding={deciding}
            openingEvidenceId={openingEvidenceId}
            onViewEvidence={handleViewEvidence}
            onDecide={handleDecision}
            onOpenChat={() => {
              setShowDisputeChat(true);
              setClosingChat(false);
            }}
            onClose={closeDispute}
          />
        </div>
      )}
    </>
  );
}
