// backend/src/features/dataQuality/dataQuality.routes.js
const express = require('express');
const dataQualityController = require('./dataQuality.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');
const { validateCloudTaskToken } = require('../../shared/middleware/cloudTask.middleware');

const router = express.Router();

// Public routes (protected by auth and subscription middlewares)
router.post('/datasets/:datasetId/quality-audit', protect, requireActiveSubscription, dataQualityController.initiateAudit);
router.get('/datasets/:datasetId/quality-audit/status', protect, requireActiveSubscription, dataQualityController.getAuditStatus);
router.get('/datasets/:datasetId/quality-audit', protect, requireActiveSubscription, dataQualityController.getAuditReport);
router.delete('/datasets/:datasetId/quality-audit', protect, requireActiveSubscription, dataQualityController.resetAudit);

// Create a separate router for internal worker endpoint
const internalRouter = express.Router();
internalRouter.post('/internal/quality-audit-worker', validateCloudTaskToken, dataQualityController.handleWorkerRequest);

module.exports = {
  router,
  internalRouter
};