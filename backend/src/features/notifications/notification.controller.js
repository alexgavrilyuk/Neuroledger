// backend/src/features/notifications/notification.controller.js
const notificationService = require('./notification.service');
const logger = require('../../shared/utils/logger');

/**
 * Get all notifications for the current user
 */
const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;

    const result = await notificationService.getUserNotifications(
      userId,
      parseInt(limit),
      parseInt(skip)
    );

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error(`Error getting notifications: ${error.message}`);
    next(error);
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await notificationService.getUnreadCount(userId);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error(`Error getting unread count: ${error.message}`);
    next(error);
  }
};

/**
 * Mark notifications as read
 */
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notificationIds } = req.body;

    const result = await notificationService.markAsRead(userId, notificationIds);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error(`Error marking notifications as read: ${error.message}`);
    next(error);
  }
};

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead
};