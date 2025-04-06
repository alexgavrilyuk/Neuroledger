// backend/src/shared/middleware/cloudTask.middleware.js
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize OAuth client for verifying tokens
const client = new OAuth2Client();

/**
 * Validates Cloud Tasks OIDC token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const validateCloudTaskToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    logger.error('Cloud Tasks token missing from request');
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Missing token' });
  }

  try {
    // Get expected audience (the URL of the worker endpoint)
    const audience = `${config.serviceUrl || `https://${process.env.GOOGLE_CLOUD_PROJECT}.appspot.com`}/api/v1/internal/quality-audit-worker`;

    // Verify the token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: audience
    });

    const payload = ticket.getPayload();

    // Verify the token is from the expected service account
    const expectedServiceAccount = config.cloudTasksServiceAccount || `${process.env.GOOGLE_CLOUD_PROJECT}@appspot.gserviceaccount.com`;

    if (payload.email !== expectedServiceAccount) {
      logger.error(`Invalid service account email: ${payload.email}, expected: ${expectedServiceAccount}`);
      return res.status(403).json({ status: 'error', message: 'Forbidden: Invalid service account' });
    }

    // Add payload to request for potential use in route handlers
    req.cloudTaskPayload = payload;

    next();
  } catch (error) {
    logger.error(`Cloud Tasks token validation error: ${error.message}`);
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid token' });
  }
};

module.exports = {
  validateCloudTaskToken
};