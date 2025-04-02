// backend/src/features/datasets/dataset.controller.js
// ** UPDATED FILE - Add getReadUrl controller **
const datasetService = require('./dataset.service');
const logger = require('../../shared/utils/logger');
const mongoose = require('mongoose'); // Import mongoose for ID validation

// getUploadUrl (remains the same as your previous updated version)
const getUploadUrl = async (req, res, next) => {
    const { filename, fileSize } = req.query;
    if (!filename) return res.status(400).json({ status: 'error', message: 'Filename query parameter is required.' });
    if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) return res.status(400).json({ status: 'error', message: 'Valid FileSize query parameter is required.' });
    try {
        const userId = req.user._id;
        const result = await datasetService.generateUploadUrl(userId, filename, fileSize);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        if (error.message === 'Valid file size is required to generate upload URL.') return res.status(400).json({ status: 'error', message: error.message });
        next(error);
    }
};

// createDataset (remains the same as your previous updated version)
const createDataset = async (req, res, next) => {
    const { name, gcsPath, originalFilename, fileSizeBytes } = req.body;
    if (!gcsPath || !originalFilename) return res.status(400).json({ status: 'error', message: 'gcsPath and originalFilename are required.' });
    try {
        const userId = req.user._id;
        const datasetData = { name, gcsPath, originalFilename, fileSizeBytes };
        const newDataset = await datasetService.createDatasetMetadata(userId, datasetData);
        res.status(201).json({ status: 'success', data: newDataset });
    } catch (error) {
        next(error);
    }
};

// listDatasets (remains the same as your previous updated version)
const listDatasets = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const datasets = await datasetService.listDatasetsByUser(userId);
        res.status(200).json({ status: 'success', data: datasets });
    } catch (error) {
        next(error);
    }
};

// --- NEW Controller for Read URL ---
const getReadUrl = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' });
    }

    try {
        // Fetch dataset to verify ownership and get gcsPath
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId }).lean(); // Use lean for performance

        if (!dataset) {
            logger.warn(`User ${userId} attempted to get read URL for inaccessible dataset ID: ${id}`);
            return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
        }

        if (!dataset.gcsPath) {
             logger.error(`Dataset ${id} found but missing gcsPath for user ${userId}.`);
             return res.status(500).json({ status: 'error', message: 'Dataset configuration error.' });
        }

        // Call the service function to generate the signed URL
        const signedUrl = await datasetService.getSignedUrlForDataset(dataset.gcsPath);

        if (!signedUrl) {
             // Service function should throw if URL generation fails, but handle null just in case
             throw new Error('Failed to generate read URL.');
        }

        res.status(200).json({ status: 'success', data: { signedUrl } });
    } catch (error) {
         // Catch specific errors like file not found from the service
         if (error.message.includes('Dataset file not found')) {
              return res.status(404).json({ status: 'error', message: error.message });
         }
         logger.error(`Error generating read URL for dataset ${id}, user ${userId}: ${error.message}`);
         next(error); // Pass to global error handler
    }
};
// --- End NEW Controller ---

// Export the controller functions
module.exports = {
    getUploadUrl,
    createDataset,
    listDatasets,
    getReadUrl, // <-- EXPORTED NEW CONTROLLER
    // Add getDataset, updateDataset, deleteDataset controllers later
};