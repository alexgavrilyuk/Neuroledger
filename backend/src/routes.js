// backend/src/routes.js
// ** UPDATED FILE **
const express = require('express');
const authRoutes = require('./features/auth/auth.routes');
const subscriptionRoutes = require('./features/subscriptions/subscription.routes'); // Import subscription routes
// Import other feature routes here as they are created
// const userRoutes = require('./features/users/user.routes');
// const datasetRoutes = require('./features/datasets/dataset.routes');
// const promptRoutes = require('./features/prompts/prompt.routes'); // For Phase 4

const router = express.Router();

// Public routes
router.get('/', (req, res) => {
    res.json({ message: 'NeuroLedger API v1 is running!' });
 });

// Mount feature routers
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes); // Mount subscription routes
// router.use('/users', userRoutes);
// router.use('/datasets', datasetRoutes);
// router.use('/prompts', promptRoutes); // Will be protected by subscription guard later

module.exports = router;