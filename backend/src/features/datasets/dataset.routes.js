// backend/src/features/datasets/dataset.routes.js
const express = require('express');
const datasetController = require('./dataset.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');
const { validateCloudTaskToken } = require('../../shared/middleware/cloudTask.middleware'); // Import task token validator
const multer = require('multer');

const router = express.Router();
const internalRouter = express.Router(); // Create separate internal router

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- Public-Facing Dataset Routes ---
// All require authentication and active subscription
router.use(protect);
router.use(requireActiveSubscription);

// GET /api/v1/datasets/upload-url?filename=myfile.csv&fileSize=12345
router.get('/upload-url', datasetController.getUploadUrl);

// POST /api/v1/datasets (Create metadata AFTER successful GCS upload, queues parsing task)
router.post('/', datasetController.createDataset);

// POST /api/v1/datasets/proxy-upload (Uploads via backend, queues parsing task)
router.post('/proxy-upload', upload.single('file'), datasetController.proxyUpload);

// GET /api/v1/datasets (List user's accessible datasets)
router.get('/', datasetController.listDatasets);

// GET /api/v1/datasets/:id/read-url (Get signed URL for original GCS file)
router.get('/:id/read-url', datasetController.getReadUrl);

// GET /api/v1/datasets/:id (Get single dataset details)
router.get('/:id', datasetController.getDataset);

// GET /api/v1/datasets/:id/schema (Get dataset schema information)
router.get('/:id/schema', datasetController.getSchema);

// PUT /api/v1/datasets/:id (Update dataset context, column descriptions, schema types)
router.put('/:id', datasetController.updateDataset);

// DELETE /api/v1/datasets/:id (Delete a dataset, its GCS file, and parsed GridFS data)
router.delete('/:id', datasetController.deleteDataset);

// --- Internal Worker Route ---
// POST /api/v1/internal/datasets/parse-worker (Triggered by Cloud Tasks)
internalRouter.post('/internal/datasets/parse-worker',
     validateCloudTaskToken, // Protect with token validation
     datasetController.handleParserWorkerRequest // Map to new controller function
);

module.exports = {
    router, // Export public router
    internalRouter // Export new internal router
};