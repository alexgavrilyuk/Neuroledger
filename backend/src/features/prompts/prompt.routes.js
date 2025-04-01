// backend/src/features/prompts/prompt.routes.js
// ** NEW FILE **
const express = require('express');
const promptController = require('./prompt.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');

const router = express.Router();

// ALL prompt routes require login AND an active subscription
router.use(protect);
router.use(requireActiveSubscription);

// POST /api/v1/prompts (Generate textual analysis)
router.post('/', promptController.generateTextResponse);

module.exports = router;