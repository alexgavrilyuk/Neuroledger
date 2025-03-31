// backend/src/features/datasets/dataset.routes.js
// ** NEW FILE **
const express = require('express');
const datasetController = require('./dataset.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard'); // Import subscription guard

const router = express.Router();

// ALL dataset routes require login AND an active subscription
router.use(protect);
router.use(requireActiveSubscription);

// GET /api/v1/datasets/upload-url?filename=myfile.csv
router.get('/upload-url', datasetController.getUploadUrl);

// POST /api/v1/datasets (Create metadata AFTER successful GCS upload)
router.post('/', datasetController.createDataset);

// GET /api/v1/datasets (List user's datasets)
router.get('/', datasetController.listDatasets);

// Add routes for GET /{id}, PUT /{id}, DELETE /{id} later

module.exports = router;