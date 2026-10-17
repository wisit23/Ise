/** The "ดูเพิ่มเติม" / "ดูน้อยลง" button in a card's header. */
export default function MoreToggle({ open, onToggle }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      {open ? "ดูน้อยลง" : "ดูเพิ่มเติม"}
    </button>
  );
}
