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

/**
 * Update the current user's settings
 */
const updateUserSettings = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { currency, dateFormat, aiContext } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      logger.warn(`User with ID ${userId} not found when updating settings`);
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Initialize settings object if it doesn't exist
    if (!user.settings) {
      user.settings = {};
    }

    // Update only the provided settings
    if (currency !== undefined) user.settings.currency = currency;
    if (dateFormat !== undefined) user.settings.dateFormat = dateFormat;
    if (aiContext !== undefined) user.settings.aiContext = aiContext;

    // Save the updates
    await user.save();

    logger.info(`User ${userId} updated their settings`);
    res.status(200).json({ status: 'success', data: user });
  } catch (error) {
    logger.error(`Error updating user settings: ${error.message}`);
    next(error);
  }
};

module.exports = {
  getCurrentUser,
  updateUserSettings
};