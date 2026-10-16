"use client";

/** Read-only view of a return checklist: what CS did for each item. */
export default function ReturnTaskResults({ tasks = [] }) {
  if (!tasks.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start gap-2 text-sm">
          <span
            aria-hidden="true"
            className={`material-symbols-outlined mt-0.5 text-[18px] ${task.done ? "text-emerald-600" : "text-slate-400"}`}
          >
            {task.done ? "check_circle" : "radio_button_unchecked"}
          </span>
          <div className="min-w-0">
            <p className={task.done ? "text-slate-900" : "text-slate-600"}>
              <span className="sr-only">{task.done ? "ทำแล้ว: " : "ยังไม่ได้ทำ: "}</span>
              {task.text}
            </p>
            {task.note && (
              <p className="mt-0.5 text-xs text-slate-500">{task.note}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
