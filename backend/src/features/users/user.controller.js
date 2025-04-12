// backend/src/features/users/user.controller.js
// ** NEW FILE - Add endpoints for user profile and settings management **
const User = require('./user.model');
const logger = require('../../shared/utils/logger');

/**
 * Get the current user's profile
 */
const getCurrentUser = async (req, res, next) => {
  try {
    // req.user is already attached by the protect middleware
    // But it might be missing some fields or be outdated, so fetch the full user
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      logger.warn(`User with ID ${userId} not found when fetching profile`);
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    res.status(200).json({ status: 'success', data: user });
  } catch (error) {
    logger.error(`Error fetching user profile: ${error.message}`);
    next(error);
  }
};

// --- Controller to Update User Settings (currency, dateFormat, aiContext, preferredAiModel) ---
// This is the correct version that handles preferredAiModel and has logging
const updateUserSettings = async (req, res) => {
    const userId = req.user?._id;
    const { currency, dateFormat, aiContext, preferredAiModel } = req.body;

    // --- DEBUG LOG: Incoming request body ---
    logger.debug(`[updateUserSettings] Received request for user ${userId}. Body:`, req.body);

    if (!userId) {
        logger.error(`[updateUserSettings] Failed to extract userId from req.user._id`);
        return res.status(401).json({ status: 'error', message: 'Unauthorized - User ID missing' });
    }

    // Validate preferredAiModel if provided
    if (preferredAiModel && !['claude', 'gemini'].includes(preferredAiModel)) {
        logger.warn(`[updateUserSettings] Invalid preferredAiModel value received: ${preferredAiModel}`);
        return res.status(400).json({ status: 'error', message: 'Invalid preferred AI model specified.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        // --- DEBUG LOG: Settings before update ---
        logger.debug(`[updateUserSettings] User ${userId} settings BEFORE update:`, user.settings);

        // Update settings object conditionally
        let updated = false;
        if (currency !== undefined && user.settings.currency !== currency) {
            user.settings.currency = currency;
            updated = true;
        }
        if (dateFormat !== undefined && user.settings.dateFormat !== dateFormat) {
            user.settings.dateFormat = dateFormat;
            updated = true;
        }
        if (aiContext !== undefined && user.settings.aiContext !== aiContext) {
            user.settings.aiContext = aiContext;
            updated = true;
        }
        if (preferredAiModel !== undefined && user.settings.preferredAiModel !== preferredAiModel) {
            user.settings.preferredAiModel = preferredAiModel;
            logger.info(`[updateUserSettings] Updating preferredAiModel for user ${userId} to: ${preferredAiModel}`);
            updated = true;
        }

        if (updated) {
            await user.save();
             // --- DEBUG LOG: Settings AFTER save ---
            logger.debug(`[updateUserSettings] User ${userId} settings AFTER save:`, user.settings);
            logger.info(`User settings updated successfully for user ID: ${userId}`);
        } else {
            logger.info(`[updateUserSettings] No settings changes detected for user ID: ${userId}`);
        }

        res.status(200).json({ status: 'success', data: user });

    } catch (error) {
        logger.error(`Error updating user settings for user ID ${userId}: ${error.message}`);
        res.status(500).json({ status: 'error', message: 'Error updating settings' });
    }
};

// --- Get User Settings (If needed separately, otherwise /users/me is used) ---
// exports.getUserSettings = async (req, res) => { ... }; // Keep commented unless separate endpoint is truly needed

module.exports = {
  getCurrentUser,
  updateUserSettings
  // getUserSettings // Keep commented
};