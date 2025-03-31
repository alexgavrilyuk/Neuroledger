// backend/src/features/datasets/dataset.controller.js
// ** FULLY UPDATED FILE **
const datasetService = require('./dataset.service');
const logger = require('../../shared/utils/logger');

const getUploadUrl = async (req, res, next) => {
    // Get filename AND file size from query params
    const { filename, fileSize } = req.query;

    if (!filename) {
        return res.status(400).json({ status: 'error', message: 'Filename query parameter is required.' });
    }
    // FileSize is now mandatory for generating the signed URL correctly
    if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) {
        return res.status(400).json({ status: 'error', message: 'Valid FileSize query parameter is required.' });
    }

    try {
        const userId = req.user._id; // From 'protect' middleware
        // Pass fileSize to the service
        const result = await datasetService.generateUploadUrl(userId, filename, fileSize);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        // Catch specific error from service if needed
        if (error.message === 'Valid file size is required to generate upload URL.') {
             return res.status(400).json({ status: 'error', message: error.message });
        }
        // Pass other errors to the global error handler
        next(error);
    }
};

const createDataset = async (req, res, next) => {
    // Extract expected fields from request body
    const { name, gcsPath, originalFilename, fileSizeBytes } = req.body;

    // Validate required fields for metadata creation
    if (!gcsPath || !originalFilename) {
        return res.status(400).json({ status: 'error', message: 'gcsPath and originalFilename are required.' });
    }
    // fileSizeBytes is useful but let's not make it strictly required here
    // name is optional (defaults to originalFilename)

    try {
        const userId = req.user._id; // From 'protect' middleware
        const datasetData = { name, gcsPath, originalFilename, fileSizeBytes };
        const newDataset = await datasetService.createDatasetMetadata(userId, datasetData);
        res.status(201).json({ status: 'success', data: newDataset }); // Use 201 Created status
    } catch (error) {
        // Pass errors to the global error handler
        next(error);
    }
};

const listDatasets = async (req, res, next) => {
    try {
        const userId = req.user._id; // From 'protect' middleware
        const datasets = await datasetService.listDatasetsByUser(userId);
        res.status(200).json({ status: 'success', data: datasets });
    } catch (error) {
        // Pass errors to the global error handler
        next(error);
    }
};

// Export the controller functions
module.exports = {
    getUploadUrl,
    createDataset,
    listDatasets,
    // Add getDataset, updateDataset, deleteDataset controllers later
};