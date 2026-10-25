// Same wording whether or not the email belongs to an unverified account.
const RESEND_ACCEPTED_MESSAGE =
  "If that email belongs to an account waiting for confirmation, a new link is on its way. Check your inbox and spam folder.";

function createEmailVerificationController(service) {
  return {
    async resend(req, res, next) {
      try {
        const reference = await service.resend({ email: req.body?.email, ipAddress: req.ip });
        res.status(202).json({ message: RESEND_ACCEPTED_MESSAGE, reference });
      } catch (err) {
        next(err);
      }
    },

    async verify(req, res, next) {
      try {
        await service.verify(req.body?.token);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = { createEmailVerificationController, RESEND_ACCEPTED_MESSAGE };
