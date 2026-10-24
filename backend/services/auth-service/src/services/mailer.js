const nodemailer = require("nodemailer");

const SMTP_TIMEOUT_MS = 10_000;

function smtpTransport({ smtp }) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // On a STARTTLS port, refuse to send credentials or mail in the clear if
    // the server (or something in between) declines the upgrade.
    requireTLS: !smtp.secure,
    auth: smtp.auth || undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

// Local development only — passwordResetConfig refuses this transport unless
// APP_BASE_URL is localhost, because the printed text contains live links.
function logTransport() {
  return {
    async sendMail(message) {
      console.log(
        [
          "[mailer] ── email not sent (MAIL_TRANSPORT=log) ──",
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          "",
          message.text,
          "──────────────────────────────────────────────",
        ].join("\n"),
      );
      return { messageId: "logged" };
    },
  };
}

/**
 * Sends transactional email. `transport` is injectable so tests (and a
 * future provider swap) don't need a real SMTP server.
 */
function createMailer(mailConfig, { transport } = {}) {
  const delivery =
    transport ||
    (mailConfig.transport === "smtp"
      ? smtpTransport(mailConfig)
      : logTransport());

  return {
    async send({ to, subject, text, html }) {
      await delivery.sendMail({ from: mailConfig.from, to, subject, text, html });
    },
  };
}

module.exports = { createMailer };
