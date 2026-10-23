// The process-wide mail settings and mailer, shared by every feature that
// emails users. Loading here means a bad MAIL_*/SMTP_*/APP_BASE_URL setup
// stops auth-service at boot rather than on the first email.
const { loadMailConfig } = require("../config/mailConfig");
const { createMailer } = require("./mailer");

const mailConfig = loadMailConfig();
const mailer = mailConfig.enabled ? createMailer(mailConfig) : null;

module.exports = { mailConfig, mailer };
