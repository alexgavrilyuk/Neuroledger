// backend/src/features/subscriptions/subscription.service.js
// ** NEW FILE **
const User = require('../users/user.model');
const logger = require('../../shared/utils/logger');

// Dummy Plans (replace with DB fetch or config later)
const DUMMY_PLANS = {
    'trial': { name: 'Free Trial', durationDays: 14 },
    'plus': { name: 'Plus Plan' },
    // Add 'pro' if needed
};

/**
 * Selects a dummy plan for the user.
 * In a real scenario, this would interact with Stripe to create a subscription.
 */
const selectDummyPlan = async (userId, planId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    const plan = DUMMY_PLANS[planId];
    if (!plan) {
        throw new Error('Invalid plan selected');
    }

    logger.info(`User ${userId} selecting dummy plan: ${planId}`);

    // --- Dummy Logic ---
    if (planId === 'trial') {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + plan.durationDays);

        user.subscriptionInfo = {
            ...user.subscriptionInfo, // Keep existing Stripe IDs if any
            tier: 'trial',
            status: 'trialing',
            trialEndsAt: trialEndDate,
            subscriptionEndsAt: null, // Clear this if switching from paid
        };
    } else if (planId === 'plus') {
         // Simulate activating a paid plan immediately without payment
        user.subscriptionInfo = {
            ...user.subscriptionInfo,
            tier: 'plus',
            status: 'active',
            trialEndsAt: null, // Clear trial end if switching
             // Optionally set subscriptionEndsAt based on a dummy billing cycle
            subscriptionEndsAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Dummy 1 year
        };
    } else {
         // Handle other plans or default to inactive/free
         user.subscriptionInfo = {
             ...user.subscriptionInfo,
             tier: 'free',
             status: 'inactive', // Or 'active' if free has access
             trialEndsAt: null,
             subscriptionEndsAt: null,
         };
    }

    await user.save();
    logger.info(`User ${userId} subscription updated: ${JSON.stringify(user.subscriptionInfo)}`);
    return user.subscriptionInfo.toObject(); // Return updated info
};

/**
 * Gets the current subscription status for the user.
 */
const getSubscriptionStatus = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }
    // Re-evaluate status based on dates (important for trials)
    if (user.subscriptionInfo.status === 'trialing' && user.subscriptionInfo.trialEndsAt && user.subscriptionInfo.trialEndsAt <= new Date()) {
         logger.info(`User ${userId} trial expired, updating status to inactive.`);
         user.subscriptionInfo.status = 'inactive'; // Or 'canceled' etc.
         await user.save();
    }
    // Add similar check for subscriptionEndsAt later if needed

    return user.subscriptionInfo.toObject();
};

module.exports = {
    selectDummyPlan,
    getSubscriptionStatus,
};