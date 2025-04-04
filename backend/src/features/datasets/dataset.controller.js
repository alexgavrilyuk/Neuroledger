// backend/src/features/datasets/dataset.controller.js
// ** UPDATED FILE - Added getSchema and updateDataset endpoints **
const datasetService = require('./dataset.service');
const logger = require('../../shared/utils/logger');
const mongoose = require('mongoose'); // Import mongoose for ID validation

// getUploadUrl (remains the same)
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

// createDataset (remains the same)
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

// listDatasets (remains the same)
const listDatasets = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const datasets = await datasetService.listDatasetsByUser(userId);
        res.status(200).json({ status: 'success', data: datasets });
    } catch (error) {
        next(error);
    }
};

// getReadUrl (remains the same)
const getReadUrl = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' });
    }

    try {
        // Fetch dataset to verify ownership and get gcsPath
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId }).lean();

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

// --- NEW ENDPOINTS ---

// Get a single dataset with details
const getDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' });
    }

    try {
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId });

        if (!dataset) {
            logger.warn(`User ${userId} attempted to access inaccessible dataset ID: ${id}`);
            return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
        }

        res.status(200).json({ status: 'success', data: dataset });
    } catch (error) {
        logger.error(`Error fetching dataset ${id} for user ${userId}: ${error.message}`);
        next(error);
    }
};

// Get dataset schema information
const getSchema = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' });
    }

    try {
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId });

        if (!dataset) {
            logger.warn(`User ${userId} attempted to access schema for inaccessible dataset ID: ${id}`);
            return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
        }

        // Return schema information
        res.status(200).json({
            status: 'success',
            data: {
                schemaInfo: dataset.schemaInfo || [],
                columnDescriptions: dataset.columnDescriptions || {},
                description: dataset.description || ''
            }
        });
    } catch (error) {
        logger.error(`Error fetching schema for dataset ${id}, user ${userId}: ${error.message}`);
        next(error);
    }
};

// Update dataset information (context + column descriptions)
const updateDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    const { columnDescriptions, description } = req.body;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' });
    }

    try {
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId });

        if (!dataset) {
            logger.warn(`User ${userId} attempted to update inaccessible dataset ID: ${id}`);
            return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
        }

        // Update the dataset with new information
        if (columnDescriptions !== undefined) {
            dataset.columnDescriptions = columnDescriptions;
        }

        if (description !== undefined) {
            dataset.description = description;
        }

        // Update lastUpdatedAt timestamp
        dataset.lastUpdatedAt = new Date();

        await dataset.save();

        logger.info(`User ${userId} updated dataset ${id} with context and/or column descriptions`);
        res.status(200).json({ status: 'success', data: dataset });
    } catch (error) {
        logger.error(`Error updating dataset ${id} for user ${userId}: ${error.message}`);
        next(error);
    }
};

// Export the controller functions
module.exports = {
    getUploadUrl,
    createDataset,
    listDatasets,
    getReadUrl,
    getDataset,     // NEW: Get single dataset details
    getSchema,      // NEW: Get dataset schema information
    updateDataset,  // NEW: Update dataset context and column descriptions
};