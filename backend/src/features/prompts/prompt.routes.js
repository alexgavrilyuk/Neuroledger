// backend/src/features/prompts/prompt.routes.js
// ** UPDATED FILE - Point to new controller method **
const express = require('express');
const promptController = require('./prompt.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');

const router = express.Router();

router.use(protect);
router.use(requireActiveSubscription);

// POST /api/v1/prompts (Generate React code and execute it)
router.post('/', promptController.generateAndExecuteReport); // Use the updated controller method

module.exports = router;