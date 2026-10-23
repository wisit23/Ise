// Email content for the forgot-password flow, in Thai and English.

const { BRAND, escapeHtml, greeting, renderEmail } = require("../../services/emailLayout");

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
    html: renderEmail({
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
    html: renderEmail({
      heading: "รหัสผ่านถูกเปลี่ยนแล้ว / Your password was changed",
      paragraphs: [
        `สวัสดีคุณ ${name} รหัสผ่านบัญชี ${BRAND} ของคุณถูกเปลี่ยนเมื่อ ${escapeHtml(when)} (UTC) และอุปกรณ์ทั้งหมดถูกออกจากระบบแล้ว หากคุณไม่ได้เปลี่ยนเอง กรุณาติดต่อฝ่ายช่วยเหลือทันที`,
        `Hi ${name}, the password for your ${BRAND} account was changed at ${escapeHtml(when)} (UTC), and every device was signed out. If this wasn't you, contact support right away.`,
      ],
      action: { url: supportUrl, label: "ติดต่อฝ่ายช่วยเหลือ / Contact support" },
    }),
  };
}

module.exports = { resetLinkEmail, passwordChangedEmail };
