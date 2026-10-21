// Same wording whether or not the email belongs to an account.
const REQUEST_ACCEPTED_MESSAGE =
  "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.";

function requestContext(req) {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") || null };
}

function createPasswordResetController(service) {
  return {
    async forgot(req, res, next) {
      try {
        await service.requestReset({ email: req.body?.email, ...requestContext(req) });
        res.status(202).json({ message: REQUEST_ACCEPTED_MESSAGE });
      } catch (err) {
        next(err);
      }
    },

    async verify(req, res, next) {
      try {
        res.json(await service.verifyToken(req.body?.token));
      } catch (err) {
        next(err);
      }
    },

    async reset(req, res, next) {
      try {
        await service.resetPassword({
          token: req.body?.token,
          password: req.body?.password,
          ipAddress: req.ip,
        });
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = { createPasswordResetController, REQUEST_ACCEPTED_MESSAGE };
