"use client";

import { useState } from "react";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";

/**
 * Mock QR value สำหรับ Thai ID
 * ในระบบจริงจะสร้าง session token จาก backend แล้วฝังใน QR
 */
const MOCK_QR_SESSION = "THAIID-SESSION-MOCK-2026";

/**
 * ข้อมูล mock ที่จำลองว่าได้รับจาก Thai ID หลังสแกน
 */
export const MOCK_THAI_ID_DATA = {
  fullName: "Test thaiId-01",
  idNumber: "1-2345-67890-12-3",
  phone: "00000001",
  birthDate: "2000-01-01",
  address: "123 ถ.ทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000",
};

/**
 * LockedInfoRow — แสดงข้อมูลที่ล็อคจาก Thai ID
 */
function LockedInfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface-subtle px-4 py-3">
      <span
        className="material-symbols-outlined mt-0.5 text-[18px] text-ink-subtle shrink-0"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-900 break-all">
          {value}
        </p>
      </div>
      <span
        className="material-symbols-outlined ml-auto mt-0.5 shrink-0 text-[16px] text-brand-500"
        aria-hidden="true"
        title="ข้อมูลจาก Thai ID ล็อคไว้"
      >
        lock
      </span>
    </div>
  );
}

/**
 * ThaiIdQrStep — ขั้นตอนสแกน QR Thai ID
 *
 * Props:
 *   thaiIdData   — ข้อมูลที่ได้จาก Thai ID (null ถ้ายังไม่ได้สแกน)
 *   onScanned    — callback(data) เมื่อสแกนสำเร็จ
 *   onNext       — callback เมื่อกดปุ่ม "ถัดไป" หลังสแกนแล้ว
 *   onBack       — callback เมื่อกดปุ่ม "ย้อนกลับ"
 */
export default function ThaiIdQrStep({ thaiIdData, onScanned, onNext, onBack }) {
  const [scanning, setScanning] = useState(false);

  function handleMockScan() {
    setScanning(true);
    // จำลอง network delay เหมือนสแกนจริง
    setTimeout(() => {
      onScanned(MOCK_THAI_ID_DATA);
      setScanning(false);
    }, 1500);
  }

  const scanned = !!thaiIdData;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          ขั้นตอนที่ 1 — สแกน QR เพื่อเชื่อมกับ Thai ID
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          เปิด Thai ID App บนมือถือ แล้วสแกน QR Code ด้านล่าง
          เพื่อยืนยันตัวตนโดยอัตโนมัติ
        </p>
      </div>

      {/* QR Code Box */}
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface-subtle py-8 px-4">
        {/* QR SVG (mock) */}
        <div
          className={`relative transition-all duration-300 ${
            scanned ? "opacity-40 grayscale" : "opacity-100"
          }`}
          aria-label="QR Code สำหรับ Thai ID"
        >
          {/* Simple SVG QR placeholder */}
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="rounded-lg border border-line bg-white p-3 shadow-sm"
          >
            {/* Top-left finder pattern */}
            <rect x="10" y="10" width="42" height="42" rx="4" fill="#111827" />
            <rect x="18" y="18" width="26" height="26" rx="2" fill="white" />
            <rect x="24" y="24" width="14" height="14" rx="1" fill="#111827" />
            {/* Top-right finder pattern */}
            <rect x="108" y="10" width="42" height="42" rx="4" fill="#111827" />
            <rect x="116" y="18" width="26" height="26" rx="2" fill="white" />
            <rect x="122" y="24" width="14" height="14" rx="1" fill="#111827" />
            {/* Bottom-left finder pattern */}
            <rect x="10" y="108" width="42" height="42" rx="4" fill="#111827" />
            <rect x="18" y="116" width="26" height="26" rx="2" fill="white" />
            <rect x="24" y="122" width="14" height="14" rx="1" fill="#111827" />
            {/* Data modules — static pattern (หลีกเลี่ยง Math.random ที่ทำให้ SSR mismatch) */}
            <rect x="60" y="10" width="5" height="5" fill="#111827" />
            <rect x="72" y="10" width="5" height="5" fill="#111827" />
            <rect x="84" y="10" width="5" height="5" fill="#111827" />
            <rect x="66" y="16" width="5" height="5" fill="#111827" />
            <rect x="78" y="16" width="5" height="5" fill="#111827" />
            <rect x="96" y="16" width="5" height="5" fill="#111827" />
            <rect x="102" y="22" width="5" height="5" fill="#111827" />
            <rect x="60" y="28" width="5" height="5" fill="#111827" />
            <rect x="72" y="28" width="5" height="5" fill="#111827" />
            <rect x="90" y="28" width="5" height="5" fill="#111827" />
            <rect x="66" y="34" width="5" height="5" fill="#111827" />
            <rect x="84" y="34" width="5" height="5" fill="#111827" />
            <rect x="96" y="34" width="5" height="5" fill="#111827" />
            <rect x="60" y="40" width="5" height="5" fill="#111827" />
            <rect x="78" y="40" width="5" height="5" fill="#111827" />
            <rect x="102" y="40" width="5" height="5" fill="#111827" />
            <rect x="72" y="46" width="5" height="5" fill="#111827" />
            <rect x="90" y="46" width="5" height="5" fill="#111827" />
            <rect x="10" y="60" width="5" height="5" fill="#111827" />
            <rect x="28" y="60" width="5" height="5" fill="#111827" />
            <rect x="46" y="60" width="5" height="5" fill="#111827" />
            <rect x="64" y="60" width="5" height="5" fill="#111827" />
            <rect x="82" y="60" width="5" height="5" fill="#111827" />
            <rect x="100" y="60" width="5" height="5" fill="#111827" />
            <rect x="118" y="60" width="5" height="5" fill="#111827" />
            <rect x="136" y="60" width="5" height="5" fill="#111827" />
            <rect x="16" y="66" width="5" height="5" fill="#111827" />
            <rect x="40" y="66" width="5" height="5" fill="#111827" />
            <rect x="58" y="66" width="5" height="5" fill="#111827" />
            <rect x="76" y="66" width="5" height="5" fill="#111827" />
            <rect x="94" y="66" width="5" height="5" fill="#111827" />
            <rect x="112" y="66" width="5" height="5" fill="#111827" />
            <rect x="130" y="66" width="5" height="5" fill="#111827" />
            <rect x="10" y="72" width="5" height="5" fill="#111827" />
            <rect x="34" y="72" width="5" height="5" fill="#111827" />
            <rect x="52" y="72" width="5" height="5" fill="#111827" />
            <rect x="70" y="72" width="5" height="5" fill="#111827" />
            <rect x="88" y="72" width="5" height="5" fill="#111827" />
            <rect x="106" y="72" width="5" height="5" fill="#111827" />
            <rect x="124" y="72" width="5" height="5" fill="#111827" />
            <rect x="142" y="72" width="5" height="5" fill="#111827" />
            <rect x="22" y="78" width="5" height="5" fill="#111827" />
            <rect x="46" y="78" width="5" height="5" fill="#111827" />
            <rect x="64" y="78" width="5" height="5" fill="#111827" />
            <rect x="82" y="78" width="5" height="5" fill="#111827" />
            <rect x="100" y="78" width="5" height="5" fill="#111827" />
            <rect x="118" y="78" width="5" height="5" fill="#111827" />
            <rect x="136" y="78" width="5" height="5" fill="#111827" />
            <rect x="10" y="84" width="5" height="5" fill="#111827" />
            <rect x="28" y="84" width="5" height="5" fill="#111827" />
            <rect x="58" y="84" width="5" height="5" fill="#111827" />
            <rect x="76" y="84" width="5" height="5" fill="#111827" />
            <rect x="94" y="84" width="5" height="5" fill="#111827" />
            <rect x="112" y="84" width="5" height="5" fill="#111827" />
            <rect x="130" y="84" width="5" height="5" fill="#111827" />
            <rect x="16" y="90" width="5" height="5" fill="#111827" />
            <rect x="40" y="90" width="5" height="5" fill="#111827" />
            <rect x="70" y="90" width="5" height="5" fill="#111827" />
            <rect x="88" y="90" width="5" height="5" fill="#111827" />
            <rect x="106" y="90" width="5" height="5" fill="#111827" />
            <rect x="124" y="90" width="5" height="5" fill="#111827" />
            <rect x="142" y="90" width="5" height="5" fill="#111827" />
            <rect x="10" y="96" width="5" height="5" fill="#111827" />
            <rect x="52" y="96" width="5" height="5" fill="#111827" />
            <rect x="64" y="96" width="5" height="5" fill="#111827" />
            <rect x="82" y="96" width="5" height="5" fill="#111827" />
            <rect x="100" y="96" width="5" height="5" fill="#111827" />
            <rect x="118" y="96" width="5" height="5" fill="#111827" />
            <rect x="136" y="96" width="5" height="5" fill="#111827" />
            <rect x="22" y="102" width="5" height="5" fill="#111827" />
            <rect x="46" y="102" width="5" height="5" fill="#111827" />
            <rect x="76" y="102" width="5" height="5" fill="#111827" />
            <rect x="94" y="102" width="5" height="5" fill="#111827" />
            <rect x="112" y="102" width="5" height="5" fill="#111827" />
            <rect x="130" y="102" width="5" height="5" fill="#111827" />
            {/* Session text watermark */}
            <text x="80" y="156" textAnchor="middle" fontSize="6" fill="#9CA3AF">
              {MOCK_QR_SESSION}
            </text>
          </svg>
        </div>

        {scanned ? (
          <div className="mt-4 flex items-center gap-2 text-brand-600">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <p className="text-sm font-semibold">สแกนสำเร็จแล้ว!</p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-muted">
            QR จะหมดอายุใน 5 นาที — หากไม่มี Thai ID App ให้เลือกวิธีที่ 1
          </p>
        )}

        {/* Mock scan button — จะถูกแทนที่ด้วย webhook จริงในภายหลัง */}
        {!scanned && (
          <button
            type="button"
            onClick={handleMockScan}
            disabled={scanning}
            className="focus-ring mt-4 rounded-lg border border-dashed border-brand-400 bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
          >
            {scanning ? (
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                กำลังรับข้อมูล...
              </span>
            ) : (
              "🔬 จำลองสแกน QR สำเร็จ (Dev)"
            )}
          </button>
        )}
      </div>

      {/* ข้อมูลที่ได้จาก Thai ID (locked) */}
      {scanned && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-brand-500">verified_user</span>
            <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
              ข้อมูลที่ได้รับจาก Thai ID (ล็อค)
            </p>
          </div>
          <LockedInfoRow icon="person" label="ชื่อ-นามสกุล" value={thaiIdData.fullName} />
          <LockedInfoRow icon="badge" label="เลขประจำตัวประชาชน" value={thaiIdData.idNumber} />
          <LockedInfoRow icon="call" label="เบอร์โทรศัพท์" value={thaiIdData.phone} />
          <LockedInfoRow icon="home" label="ที่อยู่" value={thaiIdData.address} />
          <Alert tone="info" title="ข้อมูลถูกล็อคโดยอัตโนมัติ">
            ข้อมูลที่แสดงได้รับจาก Thai ID โดยตรง ไม่สามารถแก้ไขได้
            เพื่อความถูกต้องและน่าเชื่อถือ
          </Alert>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button type="button" variant="secondary" icon="arrow_back" onClick={onBack}>
          ย้อนกลับ
        </Button>
        {scanned && (
          <Button type="button" icon="arrow_forward" onClick={onNext}>
            ถัดไป — กรอกบัญชีธนาคาร
          </Button>
        )}
      </div>
    </div>
  );
}
