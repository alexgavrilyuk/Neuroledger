// backend/src/routes.js
// ** UPDATED FILE - Added chat routes, removed standalone prompt routes **
const express = require('express');
const authRoutes = require('./features/auth/auth.routes');
const subscriptionRoutes = require('./features/subscriptions/subscription.routes');
const datasetRoutes = require('./features/datasets/dataset.routes');
const userRoutes = require('./features/users/user.routes');
const teamRoutes = require('./features/teams/team.routes');
const notificationRoutes = require('./features/notifications/notification.routes');
const { router: dataQualityRoutes, internalRouter: dataQualityInternalRoutes } = require('./features/dataQuality/dataQuality.routes');
const { router: chatRoutes, internalRouter: chatInternalRoutes } = require('./features/chat/chat.routes');

const router = express.Router();

// Public routes
router.get('/', (req, res) => {
    res.json({ message: 'NeuroLedger API v1 is running!' });
 });

// Mount feature routers
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/datasets', datasetRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/notifications', notificationRoutes);
router.use('/', dataQualityRoutes); // Mount data quality routes (they include /datasets/...)
router.use('/', chatRoutes); // Mount chat routes (now includes prompts routes)
router.use('/', dataQualityInternalRoutes); // Mount internal worker routes
router.use('/', chatInternalRoutes); // Mount chat internal worker routes

module.exports = router;