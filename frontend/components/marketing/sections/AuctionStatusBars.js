"use client";

export default function AuctionStatusBars({ data = [] }) {
  const safeData = Array.isArray(data) ? data : [];
  const maxValue = Math.max(...safeData.map((item) => Number(item.value) || 0), 1);

  return (
    <div className="space-y-3" aria-label="กราฟเปรียบเทียบจำนวนรอบประมูลแยกตามสถานะ">
      {safeData.map((item) => {
        const value = Number(item.value) || 0;
        return (
          <div key={item.label} className="grid grid-cols-[minmax(7rem,1fr)_3fr_auto] items-center gap-3 text-xs">
            <span className="truncate font-medium text-slate-600">{item.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(value / maxValue) * 100}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
            <span className="min-w-6 text-right font-bold text-slate-900">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
