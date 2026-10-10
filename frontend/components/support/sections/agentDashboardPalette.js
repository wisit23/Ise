// Keep case identity consistent across charts, counts, and labels.
export const CASE_COLORS = Object.freeze({
  tickets: "rgb(var(--color-brand-900))",
  disputes: "rgb(var(--color-brand-400))",
});
export const CASE_TEXT_COLORS = Object.freeze({
  tickets: CASE_COLORS.tickets,
  disputes: "rgb(var(--color-brand-700))",
});
export const CASE_SERIES = [
  { key: "tickets", label: "Ticket", color: CASE_COLORS.tickets },
  {
    key: "disputes",
    label: "Dispute",
    color: CASE_COLORS.disputes,
    outline: CASE_TEXT_COLORS.disputes,
  },
];
