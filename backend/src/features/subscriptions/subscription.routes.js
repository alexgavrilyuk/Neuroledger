// backend/src/features/subscriptions/subscription.routes.js
// ** NEW FILE **
const express = require('express');
const subscriptionController = require('./subscription.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

const router = express.Router();

// All subscription routes should be protected
router.use(protect);

// GET /api/v1/subscriptions/status
router.get('/status', subscriptionController.getStatus);

// POST /api/v1/subscriptions/select
router.post('/select', subscriptionController.selectPlan);

module.exports = router;