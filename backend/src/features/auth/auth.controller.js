// backend/src/features/auth/auth.controller.js
const authService = require('./auth.service');
const logger = require('../../shared/utils/logger');

const handleSessionLogin = async (req, res, next) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1];

  if (!idToken) {
    return res.status(401).json({ status: 'error', message: 'No token provided.' });
  }

  try {
    logger.debug('Received token, attempting verification...');
    const decodedToken = await authService.verifyFirebaseToken(idToken);
    logger.debug(`Token verified for UID: ${decodedToken.uid}`);

    const user = await authService.getOrCreateUser(decodedToken);
    logger.info(`Session established for user: ${user.email} (ID: ${user._id})`);

    // Return user data needed by the frontend
    res.status(200).json({ status: 'success', data: user });

  } catch (error) {
     logger.error(`Session login failed: ${error.message}`);
     // Differentiate between token verification errors and user processing errors
     if (error.message === 'Invalid authentication token.') {
         return res.status(401).json({ status: 'error', message: error.message });
     }
     // Use the generic error handler for other issues
     next(error); // Pass to generic error handler
  }
};

module.exports = {
  handleSessionLogin,
};