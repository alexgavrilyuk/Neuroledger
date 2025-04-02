// backend/src/features/datasets/dataset.routes.js
// ** UPDATED FILE - Add read URL route **
const express = require('express');
const datasetController = require('./dataset.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');

const router = express.Router();

router.use(protect);
router.use(requireActiveSubscription);

// GET /api/v1/datasets/upload-url?filename=myfile.csv&fileSize=12345
router.get('/upload-url', datasetController.getUploadUrl);

// POST /api/v1/datasets (Create metadata AFTER successful GCS upload)
router.post('/', datasetController.createDataset);

// GET /api/v1/datasets (List user's datasets)
router.get('/', datasetController.listDatasets);

// --- NEW ROUTE for reading dataset content via signed URL ---
// GET /api/v1/datasets/:id/read-url
router.get('/:id/read-url', datasetController.getReadUrl);
// --- End NEW ROUTE ---


// Add routes for GET /{id}, PUT /{id}, DELETE /{id} later

module.exports = router;