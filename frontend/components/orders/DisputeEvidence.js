"use client";
import { useEffect, useRef, useState } from "react";
import { fetchAuthedBlobUrl, uploadDisputeEvidence } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { caseDate, evidenceError } from "../../lib/disputePresentation";
import config from "../../lib/customerServiceConfig";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Modal from "../ui/Modal";
import styles from "./disputeCase.module.css";

function EvidenceCard({ file, disputeId, party, index }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const video = file.fileType?.startsWith("video/");
  useEffect(() => {
    let active = true,
      objectUrl;
    setError("");
    setUrl(null);
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
  const label = `หลักฐาน${party} ${index + 1}`;
  const extension =
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
    }[file.fileType] || "bin";
  return (
    <article className={styles.evidenceCard}>
      {error ? (
        <div className={styles.fileError}>
          <p role="alert">เปิดไฟล์ไม่ได้</p>
          <Button
            variant="ghost"
            onClick={() => setRetry((value) => value + 1)}
          >
            ลองใหม่
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.thumbnail}
          disabled={!url}
          onClick={() => setOpen(true)}
          aria-label={`เปิดดู${label}`}
        >
          {!url ? (
            <span role="status">กำลังโหลดไฟล์…</span>
          ) : video ? (
            <>
              <video src={url} preload="metadata" muted aria-hidden="true" />
              <span className={styles.play}>▶</span>
            </>
          ) : (
            <img src={url} alt={label} />
          )}
        </button>
      )}
      <div className={styles.evidenceMeta}>
        <strong>
          {party} · {video ? "วิดีโอ" : "รูปภาพ"}
        </strong>
        <time>{caseDate(file.createdAt)}</time>
        {file.evidenceDeadline && (
          <p className={styles.deadline}>
            กำหนดส่งหลักฐาน: {caseDate(file.evidenceDeadline)}
          </p>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={`ส่งเมื่อ ${caseDate(file.createdAt)}`}
        size="xl"
      >
        {video ? (
          <video src={url} controls className={styles.preview} />
        ) : (
          <img src={url} alt={label} className={styles.preview} />
        )}
        <a
          href={url || undefined}
          download={`evidence-${file.id}.${extension}`}
          className={styles.download}
        >
          ดาวน์โหลดไฟล์ต้นฉบับ
        </a>
      </Modal>
    </article>
  );
}

export function EvidenceUpload({ disputeId, onUploaded, disabled = false }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const input = useRef(null);
  function choose(event) {
    const selected = Array.from(event.target.files || []);
    const message = evidenceError(selected);
    setError(message);
    setNotice("");
    setFiles(message ? [] : selected);
    if (message) event.target.value = "";
  }
  async function upload(event) {
    event.preventDefault();
    if (!files.length || busy || disabled) return;
    setBusy(true);
    setError("");
    setNotice("");
    let successful = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`กำลังส่งไฟล์ ${index + 1}/${files.length}`);
        await uploadDisputeEvidence(disputeId, file, getAccessToken());
        successful++;
        setFiles((pending) => pending.filter((item) => item !== file));
      }
      setNotice(`ส่งหลักฐาน ${successful} ไฟล์เรียบร้อยแล้ว`);
      if (input.current) input.current.value = "";
    } catch (err) {
      setError(
        `${successful ? `ส่งสำเร็จแล้ว ${successful} ไฟล์ ` : ""}${err.message} ไฟล์ที่เหลือยังอยู่ คุณลองส่งอีกครั้งได้`,
      );
    } finally {
      if (successful) await onUploaded();
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <form onSubmit={upload} className={styles.upload}>
      <label className={styles.filePicker}>
        <span className="material-symbols-outlined" aria-hidden="true">
          add_photo_alternate
        </span>
        <strong>เพิ่มภาพหรือวิดีโอประกอบ</strong>
        <span>
          ครั้งละไม่เกิน {config.evidence.maxFiles} ไฟล์ · ไฟล์ละ{" "}
          {config.evidence.maxFileBytes / 1024 / 1024} MB
        </span>
        <span className={styles.chooseFile}>เลือกไฟล์จากอุปกรณ์</span>
        <input
          ref={input}
          aria-label="เลือกหลักฐานเพิ่มเติม"
          type="file"
          multiple
          accept={config.evidence.mimeTypes.join(",")}
          disabled={busy || disabled}
          onChange={choose}
        />
      </label>
      {files.length > 0 && (
        <ul className={styles.fileQueue}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <button
                type="button"
                disabled={busy}
                aria-label={`นำ ${file.name} ออก`}
                onClick={() =>
                  setFiles((old) => old.filter((_, i) => i !== index))
                }
              >
                นำออก
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {files.length > 0 && (
        <Button type="submit" loading={busy} disabled={disabled} icon="upload">
          {progress || `ส่งหลักฐาน ${files.length} ไฟล์`}
        </Button>
      )}
    </form>
  );
}
export default function DisputeEvidence({ dispute, userId, onUploaded }) {
  const files = dispute.evidence || [];
  const groups = [
    [dispute.order?.buyerId, "ผู้ซื้อ"],
    [dispute.order?.sellerId, "ผู้ขาย"],
    [null, "เจ้าหน้าที่"],
  ];
  return (
    <section className={styles.card} aria-labelledby="evidence-heading">
      <div className={styles.cardHeading}>
        <div>
          <span className={styles.eyebrow}>ข้อมูลประกอบการพิจารณา</span>
          <h2 id="evidence-heading">หลักฐานของทั้งสองฝ่าย</h2>
        </div>
        <span className={styles.count}>{files.length} ไฟล์</span>
      </div>
      <p className={styles.muted}>
        แนบภาพสภาพสินค้า ตำหนิ หรือคลิปตรวจรับ
        เจ้าหน้าที่จะพิจารณาจากข้อมูลที่คุณส่ง
      </p>
      {!files.length ? (
        <div className={styles.empty}>ยังไม่มีหลักฐานแนบในคำร้องนี้</div>
      ) : (
        groups.map(([party, label]) => {
          const matching = files.filter((file) =>
            party
              ? file.uploaderId === party
              : ![dispute.order?.buyerId, dispute.order?.sellerId].includes(
                  file.uploaderId,
                ),
          );
          if (!matching.length) return null;
          return (
            <div className={styles.evidenceGroup} key={label}>
              <h3>
                {label}
                {party === userId ? " (คุณ)" : ""}
              </h3>
              <div className={styles.evidenceGrid}>
                {matching.map((file, index) => (
                  <EvidenceCard
                    key={file.id}
                    file={file}
                    disputeId={dispute.id}
                    party={label}
                    index={index}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
      {dispute.status === "DECIDED" ? (
        <p className={styles.closedNote}>
          คำร้องนี้พิจารณาเสร็จแล้ว คุณยังเปิดดูและดาวน์โหลดหลักฐานได้
        </p>
      ) : (
        <>
          <p className={styles.deadlineHelp}>
            กำหนดส่งหลักฐานจะระบุเมื่อเจ้าหน้าที่กำหนดให้ หากยังไม่ระบุ
            คุณส่งข้อมูลเพิ่มเติมได้
          </p>
          <EvidenceUpload disputeId={dispute.id} onUploaded={onUploaded} />
        </>
      )}
    </section>
  );
}
