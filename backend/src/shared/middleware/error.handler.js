// backend/src/shared/middleware/error.handler.js
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Error:', err);

  // Default error response
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode; // If status code hasn't been set, default to 500
  res.status(statusCode);

  res.json({
    status: 'error',
    message: err.message || 'An unexpected error occurred.',
    // Provide stack trace only in development environment for security
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = errorHandler;