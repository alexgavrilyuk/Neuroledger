// backend/src/features/notifications/notification.controller.js
const notificationService = require('./notification.service');
const logger = require('../../shared/utils/logger');
const mongoose = require('mongoose');

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

/**
 * Delete a notification
 */
const deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    // Validate notification ID format
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID format'
      });
    }

    const result = await notificationService.deleteNotificationById(userId, notificationId);

    if (!result.success) {
      return res.status(404).json({
        status: 'error',
        message: result.message || 'Notification not found or not accessible'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { success: true }
    });
  } catch (error) {
    logger.error(`Error deleting notification: ${error.message}`);
    next(error);
  }
};

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  deleteNotification
};