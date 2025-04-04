// backend/src/routes.js
// ** UPDATED FILE - Added team and notification routes **
const express = require('express');
const authRoutes = require('./features/auth/auth.routes');
const subscriptionRoutes = require('./features/subscriptions/subscription.routes');
const datasetRoutes = require('./features/datasets/dataset.routes');
const promptRoutes = require('./features/prompts/prompt.routes');
const userRoutes = require('./features/users/user.routes');
const teamRoutes = require('./features/teams/team.routes'); // NEW: Added team routes
const notificationRoutes = require('./features/notifications/notification.routes'); // NEW: Added notification routes

const router = express.Router();

// Public routes
router.get('/', (req, res) => {
    res.json({ message: 'NeuroLedger API v1 is running!' });
 });

// Mount feature routers
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/datasets', datasetRoutes);
router.use('/prompts', promptRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes); // NEW: Mount team routes at /api/v1/teams
router.use('/notifications', notificationRoutes); // NEW: Mount notification routes at /api/v1/notifications

module.exports = router;