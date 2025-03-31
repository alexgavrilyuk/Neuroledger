// backend/src/shared/middleware/subscription.guard.js
// ** NEW FILE **
const logger = require('../utils/logger');

/**
 * Middleware to check if the user has an active subscription status.
 * Assumes the 'protect' middleware has already run and attached `req.user`.
 */
const requireActiveSubscription = (req, res, next) => {
  if (!req.user) {
    // Should not happen if 'protect' runs first, but good safeguard
    logger.warn('Subscription guard ran without req.user present.');
    return res.status(401).json({ status: 'error', message: 'Not authorized.' });
  }

  // Use the mongoose method defined on the user model if available, otherwise check manually
  const userHasActiveSubscription = typeof req.user.hasActiveSubscription === 'function'
        ? req.user.hasActiveSubscription()
        : ['active', 'trialing'].includes(req.user.subscriptionInfo?.status); // Manual check as fallback


  if (userHasActiveSubscription) {
      // Add extra check for trial expiry if possible (though service check is better)
      if (req.user.subscriptionInfo?.status === 'trialing') {
           if (req.user.subscriptionInfo.trialEndsAt && new Date(req.user.subscriptionInfo.trialEndsAt) <= new Date()) {
                logger.warn(`User ${req.user._id} accessed protected route with expired trial.`);
                return res.status(403).json({ status: 'error', message: 'Your trial has expired.', code: 'TRIAL_EXPIRED' });
           }
      }
       logger.debug(`User ${req.user._id} has active subscription (Status: ${req.user.subscriptionInfo?.status}). Allowing access.`);
      next(); // User has an active or trialing subscription
  } else {
    logger.warn(`User ${req.user._id} blocked by subscription guard (Status: ${req.user.subscriptionInfo?.status}).`);
    return res.status(403).json({
      status: 'error',
      message: 'An active subscription is required to access this feature.',
      code: 'SUBSCRIPTION_INACTIVE', // Code for frontend to potentially trigger upgrade flow
    });
  }
};

module.exports = { requireActiveSubscription };