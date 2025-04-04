// backend/src/features/notifications/notification.routes.js
const express = require('express');
const notificationController = require('./notification.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

const router = express.Router();

// Protect all notification routes
router.use(protect);

// GET /api/v1/notifications - Get all notifications for the user
router.get('/', notificationController.getUserNotifications);

// GET /api/v1/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', notificationController.getUnreadCount);

// PUT /api/v1/notifications/mark-read - Mark notifications as read
router.put('/mark-read', notificationController.markAsRead);

module.exports = router;