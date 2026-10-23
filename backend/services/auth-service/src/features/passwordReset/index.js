// Production wiring for the forgot-password feature.
const prisma = require("../../models/prismaClient");
const { mailConfig, mailer } = require("../../services/mail");
const { loadPasswordResetConfig } = require("./passwordResetConfig");
const { createPasswordResetService } = require("./passwordResetService");
const { createPasswordResetRouter } = require("./passwordResetRoutes");

const config = loadPasswordResetConfig(process.env, mailConfig);
const service = createPasswordResetService({ db: prisma, mailer, config });
const router = createPasswordResetRouter({ service, config });

module.exports = { config, service, router };
