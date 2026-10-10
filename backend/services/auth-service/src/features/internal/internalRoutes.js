const { Router } = require("express");
const { requireInternalToken } = require("@reloop/shared");
const internalController = require("./internalController");

const router = Router();

// Service-to-service only (x-internal-token), same pattern as chat-service's
// /internal. Deliberately NOT a user-facing endpoint: if a browser could ask
// "who is this userId?", one logged-in account could walk every id in the
// system and rebuild the user directory. Instead the caller service resolves
// names for ids it has ALREADY proven the user may see (chat resolves only
// the participants of a conversation that user belongs to).
router.use(requireInternalToken);

router.post("/users/display-names", internalController.displayNames);

module.exports = router;
