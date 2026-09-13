"use client";

/**
 * VerifyMethodPicker — การ์ดเลือกวิธียืนยันตัวตนผู้ขาย
 * method: 'manual' | 'thai_id'
 */
export default function VerifyMethodPicker({ method, onChange }) {
  const methods = [
    {
      id: "manual",
      icon: "badge",
      title: "วิธีที่ 1 — กรอกข้อมูลบัตรประชาชน",
      desc: "กรอกข้อมูลและอัปโหลดรูปถ่ายบัตรประชาชนด้วยตนเอง รอเจ้าหน้าที่อนุมัติ",
    },
    {
      id: "thai_id",
      icon: "qr_code_scanner",
      title: "วิธีที่ 2 — ยืนยันผ่าน Thai ID (QR)",
      desc: "สแกน QR Code เพื่อดึงข้อมูลจาก Thai ID App โดยอัตโนมัติ ปลอดภัยและรวดเร็ว",
      badge: "แนะนำ",
    },
  ];

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-gray-900">
        เลือกวิธียืนยันตัวตน
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {methods.map((m) => {
          const active = method === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`focus-ring relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                active
                  ? "border-brand-500 bg-brand-50 shadow-sm"
                  : "border-line bg-white hover:border-brand-300 hover:bg-surface-subtle"
              }`}
            >
              {m.badge && (
                <span className="absolute right-3 top-3 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {m.badge}
                </span>
              )}

              <span
                className={`material-symbols-outlined text-[28px] ${
                  active ? "text-brand-600" : "text-ink-subtle"
                }`}
                aria-hidden="true"
              >
                {m.icon}
              </span>

              <div>
                <p
                  className={`text-sm font-semibold ${
                    active ? "text-brand-700" : "text-gray-900"
                  }`}
                >
                  {m.title}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">{m.desc}</p>
              </div>

              {/* Check indicator */}
              <span
                className={`absolute right-3 bottom-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                  active
                    ? "border-brand-500 bg-brand-500"
                    : "border-gray-300 bg-white"
                }`}
                aria-hidden="true"
              >
                {active && (
                  <span className="material-symbols-outlined text-[14px] font-bold text-white">
                    check
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
