// backend/src/routes.js
// ** UPDATED FILE **
const express = require('express');
const authRoutes = require('./features/auth/auth.routes');
const subscriptionRoutes = require('./features/subscriptions/subscription.routes');
const datasetRoutes = require('./features/datasets/dataset.routes'); // Import dataset routes
// Import other feature routes here as they are created
// const userRoutes = require('./features/users/user.routes');
// const promptRoutes = require('./features/prompts/prompt.routes');

const router = express.Router();

// Public routes
router.get('/', (req, res) => {
    res.json({ message: 'NeuroLedger API v1 is running!' });
 });

// Mount feature routers
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/datasets', datasetRoutes); // Mount dataset routes
// router.use('/users', userRoutes);
// router.use('/prompts', promptRoutes);

module.exports = router;