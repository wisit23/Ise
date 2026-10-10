"use client";
import config from "../../../lib/customerServiceConfig";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Alert from "../../ui/Alert";
import { STAFF_ROLE_LABEL } from "../../../lib/supportConstants";

export default function StaffReassignDialog({
  dispute,
  token,
  onClose,
  onSubmit,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], totalPages: 1 });
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      apiFetch(
        `/api/orders/disputes/${dispute.id}/eligible-staff?${new URLSearchParams({ q: search, page, limit: config.pagination.staff })}`,
        { token },
      )
        .then((data) => {
          if (active) setResult(data);
        })
        .catch((err) => {
          if (active) setError(err.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dispute.id, token, search, page, retry]);
  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="เปลี่ยนผู้รับผิดชอบ"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            disabled={busy || !target || !reason.trim()}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSubmit(target, reason.trim());
                onClose();
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            ยืนยันมอบหมาย
          </Button>
        </>
      }
    >
      <label className="block text-sm">
        ค้นหาเจ้าหน้าที่
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="mt-2 min-h-11 w-full rounded border p-2"
        />
      </label>
      {loading ? (
        <p role="status" className="py-3">
          กำลังค้นหา…
        </p>
      ) : (
        <div className="my-3 space-y-2">
          {result.items.map((person) => (
            <label
              key={person.id}
              className="flex min-h-11 items-center gap-3 rounded border p-3"
            >
              <input
                type="radio"
                name="eligible-staff"
                value={person.id}
                checked={target === person.id}
                onChange={() => setTarget(person.id)}
              />
              <span>
                {person.displayName}
                <span className="block text-xs text-slate-500">
                  {person.roles
                    .map((role) => STAFF_ROLE_LABEL[role] || "ไม่ทราบทีม")
                    .join(" · ")}{" "}
                  · {person.id}
                </span>
              </span>
            </label>
          ))}
          {!result.items.length && !error && (
            <p>ไม่พบเจ้าหน้าที่ที่รับงานนี้ได้</p>
          )}
        </div>
      )}
      {error && (
        <Alert>
          {error}
          <Button variant="secondary" onClick={() => setRetry((v) => v + 1)}>
            ลองใหม่
          </Button>
        </Alert>
      )}
      <div className="my-2 flex justify-between">
        <Button
          variant="secondary"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          ก่อนหน้า
        </Button>
        <span>
          {page} / {result.totalPages}
        </span>
        <Button
          variant="secondary"
          disabled={page >= result.totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          ถัดไป
        </Button>
      </div>
      <label className="block text-sm">
        เหตุผลในการส่งมอบ
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded border p-2"
        />
      </label>
    </Modal>
  );
}
