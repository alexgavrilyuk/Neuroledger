// backend/src/features/notifications/notification.service.js
const Notification = require('./notification.model');
const logger = require('../../shared/utils/logger');

/**
 * Create a new notification
 */
const createNotification = async (notificationData) => {
  try {
    const notification = new Notification({
      userId: notificationData.userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      data: notificationData.data || {},
    });

    await notification.save();
    logger.debug(`Created notification for user ${notificationData.userId}`);
    return notification;
  } catch (error) {
    logger.error(`Error creating notification: ${error.message}`);
    throw error;
  }
};

/**
 * Get all unread notifications for a user
 */
const getUnreadNotifications = async (userId) => {
  try {
    const notifications = await Notification.find({
      userId,
      isRead: false
    })
    .sort({ createdAt: -1 })
    .lean();

    return notifications;
  } catch (error) {
    logger.error(`Error getting unread notifications for user ${userId}: ${error.message}`);
    throw error;
  }
};

/**
 * Get all notifications for a user (with pagination)
 */
const getUserNotifications = async (userId, limit = 20, skip = 0) => {
  try {
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ userId });

    return {
      notifications,
      total,
      hasMore: total > skip + limit
    };
  } catch (error) {
    logger.error(`Error getting notifications for user ${userId}: ${error.message}`);
    throw error;
  }
};

/**
 * Mark notifications as read
 */
const markAsRead = async (userId, notificationIds) => {
  try {
    const query = { userId };

    // If specific notification IDs are provided, only mark those as read
    if (notificationIds && notificationIds.length) {
      query._id = { $in: notificationIds };
    }

    const result = await Notification.updateMany(
      query,
      { $set: { isRead: true } }
    );

    logger.debug(`Marked ${result.modifiedCount} notifications as read for user ${userId}`);
    return { modifiedCount: result.modifiedCount };
  } catch (error) {
    logger.error(`Error marking notifications as read for user ${userId}: ${error.message}`);
    throw error;
  }
};

/**
 * Delete old notifications (used for maintenance, could be scheduled)
 */
const deleteOldNotifications = async (days = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    logger.debug(`Deleted ${result.deletedCount} old notifications`);
    return { deletedCount: result.deletedCount };
  } catch (error) {
    logger.error(`Error deleting old notifications: ${error.message}`);
    throw error;
  }
};

/**
 * Get unread notification count for a user
 */
const getUnreadCount = async (userId) => {
  try {
    const count = await Notification.countDocuments({
      userId,
      isRead: false
    });

    return { count };
  } catch (error) {
    logger.error(`Error getting unread notification count for user ${userId}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  createNotification,
  getUnreadNotifications,
  getUserNotifications,
  markAsRead,
  deleteOldNotifications,
  getUnreadCount
};