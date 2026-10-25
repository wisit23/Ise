const supportMessageService = require("./supportMessageService");

// HTTP layer only — the rules live in supportMessageService.js.

async function reply(req, res, next) {
  try {
    const { message, created } = await supportMessageService.reply(req.params.id, req.body);
    res.status(created ? 201 : 200).json(message);
  } catch (error) { next(error); }
}

async function importMessage(req, res, next) {
  try {
    const { message, created } = await supportMessageService.importMessage(req.params.id, req.body);
    res.status(created ? 201 : 200).json(message);
  } catch (error) { next(error); }
}

// keyedId stays importable from here for existing callers (migration tests).
module.exports = { reply, importMessage, keyedId: supportMessageService.keyedId };
