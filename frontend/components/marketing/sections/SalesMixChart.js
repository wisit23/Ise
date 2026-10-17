"use client";

const SALES_TYPES = [
  { key: "standard", label: "ยอดขายทั่วไป", color: "bg-sky-500" },
  { key: "campaign", label: "ยอดขายจากแคมเปญ", color: "bg-violet-500" },
  { key: "auction", label: "ยอดขายจากประมูล", color: "bg-emerald-500" },
];

function formatMoney(value) {
  return `฿${Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })}`;
}

export default function SalesMixChart({ byType = {}, total = 0 }) {
  const safeTotal = Number(total) || 0;
  const maxValue = Math.max(
    ...SALES_TYPES.map((item) => Number(byType[item.key]?.sales || 0)),
    1,
  );

  return (
    <div className="space-y-4" aria-label="กราฟเปรียบเทียบยอดขายตามประเภท">
      {SALES_TYPES.map((item) => {
        const value = Number(byType[item.key]?.sales || 0);
        const share = safeTotal > 0 ? (value / safeTotal) * 100 : 0;
        return (
          <div key={item.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-700">{item.label}</span>
              <span className="text-right font-bold text-slate-900">
                {formatMoney(value)}
                <span className="ml-2 font-medium text-slate-400">
                  {share.toFixed(1)}%
                </span>
              </span>
            </div>
            <div
              className="h-3 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label={`${item.label} ${formatMoney(value)} คิดเป็น ${share.toFixed(1)} เปอร์เซ็นต์`}
              aria-valuenow={Math.round(share)}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                className={`h-full min-w-0 rounded-full ${item.color}`}
                style={{ width: `${(value / maxValue) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400">
        เปอร์เซ็นต์คำนวณจากยอดขายสุทธิรวมในช่วงเวลาที่เลือก
      </p>
    </div>
  );
}

export { formatMoney };
