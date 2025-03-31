// backend/src/shared/middleware/auth.middleware.js
const admin = require('../external_apis/firebase.client');
const User = require('../../features/users/user.model');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1];

  if (!idToken) {
    return res.status(401).json({ status: 'error', message: 'Not authorized, no token.' });
  }

  try {
    // Verify the token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    logger.debug(`Auth middleware: Token verified for UID ${decodedToken.uid}`);

    // Find the user in our database corresponding to the Firebase UID
    // Select only necessary fields if possible, though often the full user object is convenient
    const user = await User.findOne({ firebaseUid: decodedToken.uid }); //.select('-password'); // Example if you stored passwords

    if (!user) {
      logger.warn(`Auth middleware: User not found in DB for verified UID ${decodedToken.uid}`);
      // This case should ideally not happen if the /auth/session logic works correctly on login
      // but it's a good safeguard. Could indicate a DB issue or deleted user.
      return res.status(401).json({ status: 'error', message: 'User not found.' });
    }

    // Attach the user object (from our DB) to the request object
    req.user = user.toObject(); // Use plain object
    logger.debug(`Auth middleware: User ${req.user.email} attached to request.`);

    next(); // Proceed to the next middleware or route handler

  } catch (error) {
    logger.error('Authorization error:', error.message);
    // Handle specific Firebase token errors (expired, revoked, invalid)
    if (error.code === 'auth/id-token-expired') {
         return res.status(401).json({ status: 'error', message: 'Token expired, please log in again.', code: 'TOKEN_EXPIRED' });
    }
     if (error.code && error.code.startsWith('auth/')) {
        return res.status(401).json({ status: 'error', message: 'Invalid token.' });
    }
    // Generic error
    return res.status(401).json({ status: 'error', message: 'Not authorized.' });
  }
};

module.exports = { protect };