/** Escapes one CSV field per RFC 4180: wrap in quotes when it contains a
 * comma, quote or newline, and double any embedded quote. */
function escapeField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeField(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(","),
  );
  return [header, ...body].join("\r\n");
}

// U+FEFF byte-order mark, written as an escape so it stays visible in review
// (a literal BOM here is invisible and trips no-irregular-whitespace).
const BOM = String.fromCharCode(0xfeff);

/**
 * Triggers a client-side download of `content`.
 *
 * The BOM is prepended because the report headers/labels are Thai: Excel on
 * Windows still opens a BOM-less UTF-8 CSV as ANSI and renders Thai as mojibake.
 */
export function downloadCsv(filename, content) {
  const blob = new Blob([BOM + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
