// backend/src/features/users/user.routes.js
// ** NEW FILE - Define routes for user profile and settings **
const express = require('express');
const userController = require('./user.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

const router = express.Router();

// All user routes should be protected
router.use(protect);

// GET /api/v1/users/me - Get current user profile
router.get('/me', userController.getCurrentUser);

// PUT /api/v1/users/me/settings - Update user settings
router.put('/me/settings', userController.updateUserSettings);

module.exports = router;