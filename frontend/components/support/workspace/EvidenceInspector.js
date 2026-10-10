"use client";
import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl } from "../../../lib/api";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Alert from "../../ui/Alert";

function PrivateFile({ disputeId, file }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      objectUrl;
    setUrl(null);
    setError("");
    fetchAuthedBlobUrl(`/api/orders/disputes/${disputeId}/evidence/${file.id}`)
      .then((value) => {
        objectUrl = value;
        if (active) setUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [disputeId, file.id, retry]);
  if (error)
    return (
      <Alert>
        {error}
        <Button variant="secondary" onClick={() => setRetry((v) => v + 1)}>
          ลองใหม่
        </Button>
      </Alert>
    );
  if (!url) return <p role="status">กำลังโหลดหลักฐาน…</p>;
  const type = file.fileType || "";
  return (
    <div>
      <p className="mb-2 break-words text-sm">
        {file.fileName || file.originalName || `หลักฐาน ${file.id.slice(0, 8)}`}
      </p>
      {type.startsWith("image/") ? (
        <img
          src={url}
          alt="หลักฐานที่ผู้ใช้แนบในเคส"
          className="max-h-[60vh] w-full object-contain"
        />
      ) : type.startsWith("video/") ? (
        <video src={url} controls className="max-h-[60vh] w-full" />
      ) : (
        <a
          href={url}
          download={file.fileName || "evidence"}
          className="underline"
        >
          ดาวน์โหลดไฟล์หลักฐาน
        </a>
      )}
    </div>
  );
}
export default function EvidenceInspector({ dispute }) {
  const [selected, setSelected] = useState([]);
  const files = dispute.evidence || [];
  const groups = [
    [dispute.order?.buyerId, "หลักฐานผู้ซื้อ"],
    [dispute.order?.sellerId, "หลักฐานร้านค้า"],
    [null, "หลักฐานอื่น"],
  ];
  return (
    <>
      <div className="space-y-4">
        {groups.map(([party, label]) => {
          const matching = files.filter((file) =>
            party
              ? file.uploaderId === party
              : ![dispute.order?.buyerId, dispute.order?.sellerId].includes(
                  file.uploaderId,
                ),
          );
          if (!matching.length && !party) return null;
          return (
            <section key={label}>
              <h3 className="mb-2 font-semibold">{label}</h3>
              {!matching.length ? (
                <p className="text-sm text-slate-500">ยังไม่มีหลักฐาน</p>
              ) : (
                matching.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelected([file])}
                    className="mb-2 flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg border p-3 text-left hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined">
                      {file.fileType?.startsWith("video/") ? "movie" : "image"}
                    </span>
                    <span className="min-w-0 flex-1 break-all text-sm">
                      {file.fileName ||
                        file.originalName ||
                        `ไฟล์ #${file.id.slice(0, 8)}`}
                    </span>
                    <span className="text-xs text-slate-500">
                      {file.createdAt
                        ? new Date(file.createdAt).toLocaleString("th-TH")
                        : "เปิดหลักฐาน"}
                    </span>
                  </button>
                ))
              )}
            </section>
          );
        })}
      </div>
      {files.some((f) => f.uploaderId === dispute.order?.buyerId) &&
        files.some((f) => f.uploaderId === dispute.order?.sellerId) && (
          <Button
            variant="secondary"
            onClick={() =>
              setSelected([
                files.find((f) => f.uploaderId === dispute.order.buyerId),
                files.find((f) => f.uploaderId === dispute.order.sellerId),
              ])
            }
          >
            เปรียบเทียบสองฝ่าย
          </Button>
        )}
      <Modal
        open={selected.length > 0}
        onClose={() => setSelected([])}
        title="ตรวจสอบหลักฐาน"
        size="xl"
      >
        <div
          className={`grid gap-5 ${selected.length > 1 ? "md:grid-cols-2" : ""}`}
        >
          {selected.map((file, index) => (
            <section key={index}>
              {selected.length > 1 && (
                <label className="mb-3 block text-sm">
                  {index === 0 ? "หลักฐานผู้ซื้อ" : "หลักฐานร้านค้า"}
                  <select
                    aria-label={
                      index === 0
                        ? "เลือกหลักฐานผู้ซื้อ"
                        : "เลือกหลักฐานร้านค้า"
                    }
                    value={file.id}
                    onChange={(e) =>
                      setSelected((old) =>
                        old.map((item, i) =>
                          i === index
                            ? files.find(
                                (candidate) => candidate.id === e.target.value,
                              )
                            : item,
                        ),
                      )
                    }
                    className="mt-2 min-h-11 w-full rounded border px-2"
                  >
                    {files
                      .filter(
                        (candidate) => candidate.uploaderId === file.uploaderId,
                      )
                      .map((candidate, i) => (
                        <option key={candidate.id} value={candidate.id}>
                          ไฟล์ {i + 1} · {candidate.fileType || "ไม่ระบุประเภท"}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <PrivateFile key={file.id} disputeId={dispute.id} file={file} />
            </section>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <Button
              key={file.id}
              size="sm"
              variant="secondary"
              onClick={() => setSelected([file])}
            >
              ไฟล์ {index + 1}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
