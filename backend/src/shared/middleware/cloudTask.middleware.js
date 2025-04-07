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
    // Dynamically determine the expected audience based on the request path
    const requestPath = req.originalUrl; // e.g., /api/v1/internal/chat-ai-worker
    const baseUrl = config.serviceUrl || `http://localhost:${config.port}`; // Use configured URL or localhost for dev
    
    // Ensure baseUrl doesn't have trailing slash
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    const audience = `${cleanBaseUrl}${requestPath}`;
    logger.debug(`Validating Cloud Task token for audience: ${audience}`);

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