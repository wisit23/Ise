// Production wiring for sign-up email verification.
const prisma = require("../../models/prismaClient");
const { mailConfig, mailer } = require("../../services/mail");
const { loadEmailVerificationConfig } = require("./emailVerificationConfig");
const { createEmailVerificationService } = require("./emailVerificationService");
const { createEmailVerificationRouter } = require("./emailVerificationRoutes");

const config = loadEmailVerificationConfig(process.env, mailConfig);
const service = createEmailVerificationService({ db: prisma, mailer, config });
const router = createEmailVerificationRouter({ service, config });

module.exports = { config, service, router };
