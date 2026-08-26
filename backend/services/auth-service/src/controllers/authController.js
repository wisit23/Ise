const authService = require("../services/authService");

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login({ ...req.body, ipAddress: req.ip });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getById(req.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const user = await authService.updateProfile(req.userId, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function submitKyc(req, res, next) {
  try {
    const result = await authService.submitKyc(req.userId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getKycStatus(req, res, next) {
  try {
    const status = await authService.getKycStatus(req.userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function publicProfile(req, res, next) {
  try {
    const profile = await authService.getPublicSellerProfile(req.params.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  updateMe,
  submitKyc,
  getKycStatus,
  publicProfile,
};
