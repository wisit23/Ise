// Email content for sign-up verification, in Thai and English.
const { BRAND, greeting, renderEmail } = require("../../services/emailLayout");

function verificationEmail({ firstName, verifyUrl, expiresInHours }) {
  const name = greeting(firstName);
  return {
    subject: `${BRAND}: ยืนยันอีเมลของคุณ / Confirm your email`,
    text: [
      `สวัสดีคุณ ${firstName || ""}`.trim(),
      "",
      `ขอบคุณที่สมัครสมาชิก ${BRAND} เปิดลิงก์ด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งานบัญชี ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${expiresInHours} ชั่วโมง`,
      "",
      verifyUrl,
      "",
      "หากคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร บัญชีจะไม่ถูกเปิดใช้งาน",
      "",
      "---",
      "",
      `Hi ${firstName || "there"},`,
      "",
      `Thanks for joining ${BRAND}. Open the link above to confirm your email and start using your account. It works once and expires in ${expiresInHours} hours.`,
      "",
      "If you didn't sign up, ignore this email; the account won't be activated.",
    ].join("\n"),
    html: renderEmail({
      heading: "ยืนยันอีเมลของคุณ / Confirm your email",
      paragraphs: [
        `สวัสดีคุณ ${name} ขอบคุณที่สมัครสมาชิก ${BRAND} กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งานบัญชี ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${expiresInHours} ชั่วโมง`,
        `Hi ${name}, thanks for joining ${BRAND}. Confirm your email to start using your account. The link works once and expires in ${expiresInHours} hours.`,
      ],
      action: { url: verifyUrl, label: "ยืนยันอีเมล / Confirm email" },
      footnote:
        "หากคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร บัญชีจะไม่ถูกเปิดใช้งาน<br>If you didn't sign up, ignore this email; the account won't be activated.",
    }),
  };
}

module.exports = { verificationEmail };
