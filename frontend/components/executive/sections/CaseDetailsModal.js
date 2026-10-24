"use client";
import { useEffect, useState } from "react";
import DetailsModal, { DetailField } from "./DetailsModal";
import Button from "../../ui/Button";
import { baht } from "../../../lib/executive";
import { formatReportedAt } from "../../../lib/executiveComplaints";
import {
  DISPUTE_TYPE_NAMES,
  PRIORITY_NAMES,
} from "../../../lib/executiveInbox";
import {
  fetchCaseDetail,
  isOverdue,
  personLabel,
} from "../../../lib/executiveCaseDetail";
import { DECISION_LABELS } from "../../../lib/disputePresentation";
import {
  DISPUTE_STATUS_LABEL,
  STAFF_ROLE_LABEL,
  TICKET_STATUS_LABEL,
} from "../../../lib/supportConstants";

const ticketStatus = (code) => TICKET_STATUS_LABEL[code] || code;

/** A staff member's team(s) as shown after their name: "Customer Service". */
function roleText(person, fallbackRole) {
  // ADMIN and TRUST_AND_SAFETY share a label, so show each label once.
  const labels = [
    ...new Set(
      (person?.roles || [])
        .map((role) => STAFF_ROLE_LABEL[role])
        .filter(Boolean),
    ),
  ];
  if (labels.length > 0) return labels.join(", ");
  return STAFF_ROLE_LABEL[fallbackRole] || null;
}

/** A person as a name, with their id underneath so they can be looked up. */
function Person({ person, namesAvailable, role }) {
  if (!person) return "-";
  return (
    <>
      {personLabel(person, namesAvailable)}
      {role && <span className="text-slate-500"> ({role})</span>}
      <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
        {person.id}
      </span>
    </>
  );
}

function DisputeDetails({ data, meta }) {
  const names = meta.namesAvailable;
  const decided = Boolean(data.decision);
  const overdue = isOverdue(data);
  return (
    <dl className="space-y-4 text-sm">
      <DetailField label="เหตุผลของข้อพิพาท">{data.reason}</DetailField>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label="ผู้เปิดข้อพิพาท">
          <Person person={data.buyer} namesAvailable={names} />
        </DetailField>
        <DetailField label="วันเวลาที่เปิด">
          {formatReportedAt(data.createdAt)}
        </DetailField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label="ร้านค้า / ผู้ขาย">
          <Person person={data.seller} namesAvailable={names} />
        </DetailField>
        <DetailField label="สินค้า">
          {!data.product
            ? "-"
            : data.product.title ||
              (meta.productAvailable === false
                ? "ไม่พร้อมใช้งาน"
                : "ไม่พบสินค้า")}
        </DetailField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label="คำสั่งซื้อ">
          <span className="font-mono text-xs">{data.order.id}</span>
          {data.order.amount != null && (
            <span className="block">{baht(data.order.amount)}</span>
          )}
        </DetailField>
        <DetailField label="ประเภท">
          {DISPUTE_TYPE_NAMES[data.disputeType] || data.disputeType}
        </DetailField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label="ความเร่งด่วน">
          {PRIORITY_NAMES[data.priority] || data.priority}
        </DetailField>
        <DetailField label="สถานะ">
          {DISPUTE_STATUS_LABEL[data.status] || data.status}
        </DetailField>
      </div>
      <DetailField label="ผู้รับเรื่อง">
        {data.assignee ? (
          <Person
            person={data.assignee}
            namesAvailable={names}
            role={roleText(data.assignee, data.assignedRole)}
          />
        ) : (
          "ยังไม่มีผู้รับเรื่อง"
        )}
      </DetailField>
      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        {decided ? (
          <>
            <DetailField label="ผู้ตัดสิน">
              <Person
                person={data.decider}
                namesAvailable={names}
                role={roleText(data.decider)}
              />
            </DetailField>
            <DetailField label="ผลการตัดสิน">
              {DECISION_LABELS[data.decision] || data.decision}
            </DetailField>
            <DetailField label="เหตุผลที่ตัดสิน">
              {data.decisionReason || "-"}
            </DetailField>
            <DetailField label="วันเวลาที่ตัดสิน">
              {data.decidedAt ? formatReportedAt(data.decidedAt) : "-"}
            </DetailField>
          </>
        ) : (
          <>
            <DetailField label="ผลการตัดสิน">ยังไม่ตัดสิน</DetailField>
            <DetailField label="กำหนดตัดสิน (SLA)">
              {data.decisionDueAt ? (
                <>
                  {formatReportedAt(data.decisionDueAt)}{" "}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      overdue
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {overdue ? "เกินกำหนด" : "ภายในกำหนด"}
                  </span>
                </>
              ) : (
                "-"
              )}
            </DetailField>
          </>
        )}
      </div>
    </dl>
  );
}

function TicketDetails({ data, meta }) {
  const names = meta.namesAvailable;
  const { assignee, handling } = data;
  return (
    <dl className="space-y-4 text-sm">
      <DetailField label="เรื่อง">
        {data.ticketNumber} · {data.subject}
      </DetailField>
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label="ผู้เปิด Ticket">
          <Person person={data.requester} namesAvailable={names} />
        </DetailField>
        <DetailField label="วันเวลาที่เปิด">
          {formatReportedAt(data.createdAt)}
        </DetailField>
      </div>
      {/* Only a ticket about an order is about a product. */}
      {data.orderId && (
        <DetailField label="สินค้า">
          {data.product?.title ||
            (meta.productAvailable === false
              ? "ไม่พร้อมใช้งาน"
              : data.product?.id || "ไม่พบสินค้า")}
          <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
            คำสั่งซื้อ {data.orderId}
          </span>
        </DetailField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField
          label={
            assignee && !assignee.current ? "ผู้รับเคสล่าสุด" : "ผู้รับเคส"
          }
        >
          {assignee ? (
            <Person
              person={assignee}
              namesAvailable={names}
              role={roleText(assignee)}
            />
          ) : (
            "ยังไม่มีผู้รับเคส"
          )}
        </DetailField>
        <DetailField label="สถานะ">
          {ticketStatus(data.status.code)}
        </DetailField>
      </div>
      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        {handling ? (
          <>
            <DetailField label="ผู้ดำเนินการ">
              <Person
                person={handling.by}
                namesAvailable={names}
                role={roleText(handling.by)}
              />
            </DetailField>
            <DetailField label="การดำเนินการ">
              {ticketStatus(handling.outcome)}
              <span className="mt-0.5 block text-xs text-slate-500">
                เมื่อ {formatReportedAt(handling.at)}
              </span>
            </DetailField>
            <DetailField label="เหตุผล">{handling.reason || "-"}</DetailField>
          </>
        ) : (
          <DetailField label="ผู้ดำเนินการ">ยังไม่ได้ดำเนินการ</DetailField>
        )}
      </div>
    </dl>
  );
}

const TITLES = {
  ticket: "รายละเอียด Ticket",
  dispute: "รายละเอียดข้อพิพาท",
};

/**
 * Details of a ticket or a dispute, loaded when the dialog opens: the list
 * carries only what a row needs, and names are looked up for this one case.
 */
export default function CaseDetailsModal({ item, token, onClose }) {
  const [state, setState] = useState({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const source = item?.source;
  const id = item?.id;

  useEffect(() => {
    if (!source || !id) return undefined;
    let cancelled = false;
    setState({ status: "loading" });
    fetchCaseDetail(source, id, token)
      .then((detail) => {
        if (!cancelled) setState({ status: "ready", ...detail });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [source, id, token, attempt]);

  return (
    <DetailsModal
      open={Boolean(item)}
      onClose={onClose}
      title={TITLES[source] || "รายละเอียด"}
    >
      {state.status === "loading" && (
        <p role="status" className="text-sm text-slate-500">
          กำลังโหลดรายละเอียด...
        </p>
      )}
      {state.status === "error" && (
        <div role="alert" className="space-y-3 text-sm text-red-700">
          <p>โหลดรายละเอียดไม่สำเร็จ</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAttempt((n) => n + 1)}
          >
            ลองใหม่
          </Button>
        </div>
      )}
      {state.status === "ready" && state.meta.namesAvailable === false && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ระบบรายชื่อผู้ใช้ไม่พร้อมใช้งานในขณะนี้ จึงแสดงเป็นรหัสแทนชื่อ
        </p>
      )}
      {state.status === "ready" && source === "dispute" && (
        <DisputeDetails data={state.data} meta={state.meta} />
      )}
      {state.status === "ready" && source === "ticket" && (
        <TicketDetails data={state.data} meta={state.meta} />
      )}
    </DetailsModal>
  );
}
