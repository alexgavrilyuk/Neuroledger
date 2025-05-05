// backend/src/routes.js
const express = require('express');
const authRoutes = require('./features/auth/auth.routes');
const subscriptionRoutes = require('./features/subscriptions/subscription.routes');
const { router: datasetRoutes, internalRouter: datasetInternalRoutes } = require('./features/datasets/dataset.routes'); // Import both routers
const userRoutes = require('./features/users/user.routes');
const teamRoutes = require('./features/teams/team.routes');
const notificationRoutes = require('./features/notifications/notification.routes');
const { router: dataQualityRoutes, internalRouter: dataQualityInternalRoutes } = require('./features/dataQuality/dataQuality.routes');
const { router: chatRoutes, internalRouter: chatInternalRoutes } = require('./features/chat/chat.routes');
const exportRoutes = require('./features/export/export.routes'); // Keep export routes separate

const mainApiRouter = express.Router(); // Use a more specific name

// Public health check
mainApiRouter.get('/', (req, res) => {
    res.json({ message: 'NeuroLedger API v1 is running!' });
 });

// Mount feature routers under /api/v1
mainApiRouter.use('/auth', authRoutes);
mainApiRouter.use('/subscriptions', subscriptionRoutes);
mainApiRouter.use('/datasets', datasetRoutes); // Mount public dataset routes
mainApiRouter.use('/users', userRoutes);
mainApiRouter.use('/teams', teamRoutes);
mainApiRouter.use('/notifications', notificationRoutes);
mainApiRouter.use('/', dataQualityRoutes); // Mount data quality routes (e.g., /datasets/:id/quality-audit)
mainApiRouter.use('/', chatRoutes); // Mount chat routes (e.g., /chats, /prompts)

// Mount internal worker routes (still under /api/v1 for consistency, protected by middleware)
mainApiRouter.use('/', dataQualityInternalRoutes);
mainApiRouter.use('/', chatInternalRoutes);
mainApiRouter.use('/', datasetInternalRoutes); // Mount internal dataset parser routes

// Export routes are mounted separately in app.js under /api/export

module.exports = mainApiRouter; // Export the configured router