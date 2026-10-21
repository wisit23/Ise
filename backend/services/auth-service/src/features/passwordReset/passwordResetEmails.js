// Email content for the forgot-password flow, in Thai and English.
// Every interpolated value goes through escapeHtml: a user's first name is
// user-controlled input and must not be able to inject markup into mail.

const BRAND = "RE-LOOP";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout({ heading, paragraphs, action, footnote }) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p}</p>`)
    .join("");
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

function resetLinkEmail({ firstName, resetUrl, expiresInMinutes }) {
  const name = greeting(firstName);
  return {
    subject: `${BRAND}: ตั้งรหัสผ่านใหม่ / Reset your password`,
    text: [
      `สวัสดีคุณ ${firstName || ""}`.trim(),
      "",
      `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${BRAND} ของคุณ เปิดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${expiresInMinutes} นาที`,
      "",
      resetUrl,
      "",
      "หากคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร รหัสผ่านเดิมของคุณยังใช้งานได้ตามปกติ",
      "",
      "---",
      "",
      `Hi ${firstName || "there"},`,
      "",
      `Someone asked to reset the password for your ${BRAND} account. Open the link above to choose a new one. It works once and expires in ${expiresInMinutes} minutes.`,
      "",
      "If you didn't ask for this, you can ignore this email; your current password still works.",
    ].join("\n"),
    html: layout({
      heading: "ตั้งรหัสผ่านใหม่ / Reset your password",
      paragraphs: [
        `สวัสดีคุณ ${name} มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${BRAND} ของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${expiresInMinutes} นาที`,
        `Hi ${name}, someone asked to reset the password for your ${BRAND} account. The link works once and expires in ${expiresInMinutes} minutes.`,
      ],
      action: { url: resetUrl, label: "ตั้งรหัสผ่านใหม่ / Reset password" },
      footnote:
        "หากคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้งานได้ตามปกติ<br>If you didn't ask for this, ignore this email; your current password still works.",
    }),
  };
}

function passwordChangedEmail({ firstName, changedAt, supportUrl }) {
  const name = greeting(firstName);
  const when = changedAt.toISOString();
  return {
    subject: `${BRAND}: รหัสผ่านของคุณถูกเปลี่ยนแล้ว / Your password was changed`,
    text: [
      `สวัสดีคุณ ${firstName || ""}`.trim(),
      "",
      `รหัสผ่านบัญชี ${BRAND} ของคุณถูกเปลี่ยนเมื่อ ${when} (UTC) และอุปกรณ์ทั้งหมดถูกออกจากระบบแล้ว`,
      `หากคุณไม่ได้เปลี่ยนเอง กรุณาติดต่อฝ่ายช่วยเหลือทันที: ${supportUrl}`,
      "",
      "---",
      "",
      `Hi ${firstName || "there"},`,
      "",
      `The password for your ${BRAND} account was changed at ${when} (UTC), and every device was signed out.`,
      `If this wasn't you, contact support right away: ${supportUrl}`,
    ].join("\n"),
    html: layout({
      heading: "รหัสผ่านถูกเปลี่ยนแล้ว / Your password was changed",
      paragraphs: [
        `สวัสดีคุณ ${name} รหัสผ่านบัญชี ${BRAND} ของคุณถูกเปลี่ยนเมื่อ ${escapeHtml(when)} (UTC) และอุปกรณ์ทั้งหมดถูกออกจากระบบแล้ว หากคุณไม่ได้เปลี่ยนเอง กรุณาติดต่อฝ่ายช่วยเหลือทันที`,
        `Hi ${name}, the password for your ${BRAND} account was changed at ${escapeHtml(when)} (UTC), and every device was signed out. If this wasn't you, contact support right away.`,
      ],
      action: { url: supportUrl, label: "ติดต่อฝ่ายช่วยเหลือ / Contact support" },
    }),
  };
}

module.exports = { resetLinkEmail, passwordChangedEmail, escapeHtml };
