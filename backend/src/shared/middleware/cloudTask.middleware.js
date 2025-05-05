// backend/src/shared/middleware/cloudTask.middleware.js
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize OAuth client for verifying tokens
const client = new OAuth2Client();

/**
 * Validates Cloud Tasks OIDC token. Includes enhanced logging.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const validateCloudTaskToken = async (req, res, next) => {
  const requestPath = req.originalUrl; // e.g., /api/v1/internal/chat-ai-worker
  logger.debug(`[CloudTask Middleware] Validating request for: ${requestPath}`); // Log entry

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    logger.error(`[CloudTask Middleware] Token missing from request for ${requestPath}`);
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Missing token' });
  }

  try {
    // Dynamically determine the expected audience based on the request path
    const baseUrl = config.serviceUrl; // Use configured URL
    if (!baseUrl) {
        logger.error('[CloudTask Middleware] SERVICE_URL environment variable is not set. Cannot determine audience.');
        return res.status(500).json({ status: 'error', message: 'Internal Server Configuration Error: Missing service URL.' });
    }

    // Ensure baseUrl doesn't have trailing slash and requestPath starts with /
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanRequestPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;

    const audience = `${cleanBaseUrl}${cleanRequestPath}`;
    logger.debug(`[CloudTask Middleware] Expected Audience: ${audience}`);

    // Verify the token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: audience // Use the dynamically constructed audience
    });

    const payload = ticket.getPayload();
    logger.debug('[CloudTask Middleware] Token payload received:', payload); // Log payload for debugging

    // Verify the token is from the expected service account
    const expectedServiceAccount = config.cloudTasksServiceAccount;
    if (!expectedServiceAccount) {
        logger.error('[CloudTask Middleware] CLOUD_TASKS_SERVICE_ACCOUNT environment variable is not set. Cannot verify issuer.');
        return res.status(500).json({ status: 'error', message: 'Internal Server Configuration Error: Missing service account email.' });
    }
    logger.debug(`[CloudTask Middleware] Expected Service Account: ${expectedServiceAccount}`);
    logger.debug(`[CloudTask Middleware] Token Payload Email: ${payload.email}`);

    if (payload.email !== expectedServiceAccount) {
      logger.error(`[CloudTask Middleware] Invalid service account email: ${payload.email}, expected: ${expectedServiceAccount}`);
      return res.status(403).json({ status: 'error', message: 'Forbidden: Invalid service account' });
    }

    // Add payload to request for potential use in route handlers
    req.cloudTaskPayload = payload;
    logger.info(`[CloudTask Middleware] Token validated successfully for ${payload.email} targeting ${requestPath}`);

    next(); // Proceed to the actual worker handler

  } catch (error) {
    logger.error(`[CloudTask Middleware] Token validation error for ${requestPath}: ${error.message}`, error);
    // Log specific details if available
    if (error.message.includes('audience')) {
         logger.error(`[CloudTask Middleware] Potential Audience Mismatch. Expected: ${config.serviceUrl}${requestPath}`);
    }
    return res.status(401).json({ status: 'error', message: `Unauthorized: Invalid token - ${error.message}` });
  }
};

module.exports = {
  validateCloudTaskToken
};