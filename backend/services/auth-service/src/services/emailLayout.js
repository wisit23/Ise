// Shared HTML shell for auth-service's transactional email, plus escaping.
// Every interpolated value goes through escapeHtml: names are user input and
// must not be able to inject markup into mail. `paragraphs` and `footnote`
// are trusted HTML built by the caller from already-escaped parts.

const BRAND = "RE-LOOP";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The reference code the requesting page showed, set apart so the user can
// compare the two at a glance.
function referenceBlock(code) {
  return `<div style="margin:0 0 20px;padding:12px 16px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc">
<div style="font-size:12px;color:#64748b">รหัสอ้างอิง / Reference</div>
<div style="font-size:22px;font-weight:700;letter-spacing:3px;font-family:Consolas,Menlo,monospace">${escapeHtml(code)}</div>
<div style="font-size:12px;color:#64748b">ต้องตรงกับรหัสบนหน้าเว็บ ${BRAND} / Should match the code on the ${BRAND} page</div>
</div>`;
}

function renderEmail({ heading, paragraphs, reference, action, footnote }) {
  const body =
    paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p}</p>`).join("") +
    (reference ? referenceBlock(reference) : "");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.6">If the button doesn't work, copy this link into your browser / หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<h1 style="margin:0 0 24px;font-size:20px">${escapeHtml(heading)}</h1>
${body}${button}${footnote ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.6">${footnote}</p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">${BRAND}</p>
</div></body></html>`;
}

function greeting(firstName) {
  return firstName ? escapeHtml(firstName) : "there";
}

module.exports = { BRAND, escapeHtml, greeting, renderEmail };
