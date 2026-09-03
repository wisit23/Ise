export default function Badge({ text, style }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize ${style}`}
    >
      {text}
    </span>
  );
}
