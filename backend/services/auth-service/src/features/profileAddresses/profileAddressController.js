const profileAddressService = require("./profileAddressService");

async function list(req, res, next) {
  try {
    res.json(await profileAddressService.list(req.userId));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const address = await profileAddressService.create(req.userId, req.body);
    res.status(201).json(address);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const address = await profileAddressService.update(
      req.userId,
      req.params.id,
      req.body,
    );
    res.json(address);
  } catch (err) {
    next(err);
  }
}

async function setDefault(req, res, next) {
  try {
    const address = await profileAddressService.setDefault(
      req.userId,
      req.params.id,
    );
    res.json(address);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await profileAddressService.remove(req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, setDefault, remove };
