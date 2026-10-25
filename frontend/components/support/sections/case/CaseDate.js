const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", day: "2-digit", month: "short", year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export default function CaseDate({ value }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return <span className="text-slate-500">—</span>;
  return <time dateTime={date.toISOString()} className="inline-flex flex-col whitespace-nowrap">
    <span className="font-medium text-slate-700">{dateFormat.format(date)}</span>
    <span className="text-xs text-slate-500">เวลา {timeFormat.format(date)} น.</span>
  </time>;
}
