// backend/src/features/datasets/dataset.routes.js
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

// GET /api/v1/datasets/:id/read-url
router.get('/:id/read-url', datasetController.getReadUrl);

// GET /api/v1/datasets/:id (Get single dataset details)
router.get('/:id', datasetController.getDataset);

// GET /api/v1/datasets/:id/schema (Get dataset schema information)
router.get('/:id/schema', datasetController.getSchema);

// PUT /api/v1/datasets/:id (Update dataset context and column descriptions)
router.put('/:id', datasetController.updateDataset);

// DELETE /api/v1/datasets/:id (Delete a dataset and its GCS file)
router.delete('/:id', datasetController.deleteDataset);

module.exports = router;