class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(message = 'Not found') {
  return new AppError(404, message);
}

function badRequest(message = 'Bad request') {
  return new AppError(400, message);
}

function forbidden(message = 'Forbidden') {
  return new AppError(403, message);
}

function conflict(message = 'Conflict') {
  return new AppError(409, message);
}

/** Express error-handling middleware. Mount last in each app.js. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = { AppError, notFound, badRequest, forbidden, conflict, errorHandler };
