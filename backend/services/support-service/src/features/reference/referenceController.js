const { customerServiceClientConfig } = require("@reloop/shared");
const referenceService = require("./referenceService");

// HTTP layer for reference data. The query lives in referenceService.js.

function clientConfig(req, res) {
  res.set("Cache-Control", "no-store");
  res.json(customerServiceClientConfig);
}

function categories(delegate) {
  return async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json({ items: await referenceService.listCategories(delegate) });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  clientConfig,
  ticketCategories: categories("ticketCategory"),
  helpCategories: categories("helpCategory"),
};
