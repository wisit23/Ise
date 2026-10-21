// Production wiring for the forgot-password feature. Loading the config here
// means a bad MAIL_TRANSPORT / SMTP / APP_BASE_URL setup stops auth-service
// at boot, not on the first reset request.
const prisma = require("../../models/prismaClient");
const { createMailer } = require("../../services/mailer");
const { loadPasswordResetConfig } = require("./passwordResetConfig");
const { createPasswordResetService } = require("./passwordResetService");
const { createPasswordResetRouter } = require("./passwordResetRoutes");

const config = loadPasswordResetConfig();
const service = createPasswordResetService({
  db: prisma,
  mailer: config.enabled ? createMailer(config.mail) : null,
  config,
});
const router = createPasswordResetRouter({ service, config });

module.exports = { config, service, router };
