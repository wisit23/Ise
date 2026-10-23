// Email content for confirming an address, in Thai and English.
const { BRAND, escapeHtml, greeting, renderEmail } = require("../../services/emailLayout");

const COPY = {
  SIGNUP: {
    subject: "ยืนยันอีเมลของคุณ / Confirm your email",
    heading: "ยืนยันอีเมลของคุณ / Confirm your email",
    th: `ขอบคุณที่สมัครสมาชิก ${BRAND} เปิดลิงก์เพื่อยืนยันอีเมลและเริ่มใช้งานบัญชี`,
    en: `Thanks for joining ${BRAND}. Open the link to confirm your email and start using your account.`,
    ignoreTh: "หากคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร บัญชีจะไม่ถูกเปิดใช้งาน",
    ignoreEn: "If you didn't sign up, ignore this email; the account won't be activated.",
    action: "ยืนยันอีเมล / Confirm email",
  },
  EMAIL_CHANGE: {
    subject: "ยืนยันอีเมลใหม่ของคุณ / Confirm your new email",
    heading: "ยืนยันอีเมลใหม่ / Confirm your new email",
    th: `มีคำขอเปลี่ยนอีเมลของบัญชี ${BRAND} มาเป็นอีเมลนี้ เปิดลิงก์เพื่อยืนยัน อีเมลของบัญชีจะเปลี่ยนหลังยืนยันเท่านั้น`,
    en: `Someone asked to switch a ${BRAND} account's email to this address. Open the link to confirm; the account's email only changes once you do.`,
    ignoreTh: "หากคุณไม่ได้ขอเปลี่ยนอีเมล ไม่ต้องทำอะไร จะไม่มีอะไรเปลี่ยนแปลง",
    ignoreEn: "If you didn't ask for this, ignore this email; nothing will change.",
    action: "ยืนยันอีเมลใหม่ / Confirm new email",
  },
};

function verificationEmail({ purpose = "SIGNUP", firstName, verifyUrl, expiresInHours, referenceCode }) {
  const copy = COPY[purpose];
  if (!copy) throw new Error(`no email copy for purpose ${purpose}`);
  const name = greeting(firstName);
  const lifetimeTh = `ลิงก์นี้ใช้ได้ครั้งเดียวและจะหมดอายุใน ${expiresInHours} ชั่วโมง`;
  const lifetimeEn = `It works once and expires in ${expiresInHours} hours.`;
  const referenceTh = `รหัสอ้างอิง: ${referenceCode} (ตรวจสอบให้ตรงกับรหัสที่แสดงบนหน้าเว็บ ${BRAND})`;
  const referenceEn = `Reference: ${referenceCode} (it should match the code shown on the ${BRAND} page)`;

  return {
    subject: `${BRAND}: ${copy.subject} [${referenceCode}]`,
    text: [
      `สวัสดีคุณ ${firstName || ""}`.trim(),
      "",
      `${copy.th} ${lifetimeTh}`,
      referenceTh,
      "",
      verifyUrl,
      "",
      copy.ignoreTh,
      "",
      "---",
      "",
      `Hi ${firstName || "there"},`,
      "",
      `${copy.en} ${lifetimeEn}`,
      referenceEn,
      "",
      copy.ignoreEn,
    ].join("\n"),
    html: renderEmail({
      heading: copy.heading,
      paragraphs: [
        `สวัสดีคุณ ${name} ${escapeHtml(copy.th)} ${escapeHtml(lifetimeTh)}`,
        `Hi ${name}, ${escapeHtml(copy.en)} ${escapeHtml(lifetimeEn)}`,
      ],
      reference: referenceCode,
      action: { url: verifyUrl, label: copy.action },
      footnote: `${escapeHtml(copy.ignoreTh)}<br>${escapeHtml(copy.ignoreEn)}`,
    }),
  };
}

module.exports = { verificationEmail };
