// backend/src/features/subscriptions/subscription.controller.js
// ** NEW FILE **
const subscriptionService = require('./subscription.service');
const logger = require('../../shared/utils/logger');

const getStatus = async (req, res, next) => {
    try {
        // req.user is attached by the 'protect' middleware
        const status = await subscriptionService.getSubscriptionStatus(req.user._id);
        res.status(200).json({ status: 'success', data: status });
    } catch (error) {
        logger.error(`Error getting subscription status for user ${req.user?._id}: ${error.message}`);
        next(error);
    }
};

const selectPlan = async (req, res, next) => {
    const { planId } = req.body; // e.g., 'trial', 'plus'

    if (!planId) {
        return res.status(400).json({ status: 'error', message: 'planId is required.' });
    }

    try {
        const updatedSubscription = await subscriptionService.selectDummyPlan(req.user._id, planId);
         // Return the updated full user object so FE context is correct
         // Fetch the user again to ensure all calculated fields (like hasActiveSubscription) might be available if needed
         const updatedUser = await require('../users/user.model').findById(req.user._id);
        res.status(200).json({ status: 'success', data: updatedUser.toObject() });
    } catch (error) {
         logger.error(`Error selecting plan ${planId} for user ${req.user?._id}: ${error.message}`);
         if (error.message === 'Invalid plan selected' || error.message === 'User not found') {
             return res.status(400).json({ status: 'error', message: error.message });
         }
        next(error);
    }
};

module.exports = {
    getStatus,
    selectPlan,
};