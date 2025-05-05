// backend/src/features/datasets/dataset.controller.js
const datasetService = require('./dataset.service');
const logger = require('../../shared/utils/logger');
const mongoose = require('mongoose');
const { createTask } = require('../../shared/services/cloudTasks.service'); // Import task creator
const config = require('../../shared/config'); // Import config
const { workerHandler: datasetParserWorkerHandler } = require('./dataset.taskHandler'); // Import the new handler

// Generates a signed URL for direct GCS upload
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
        logger.error(`[Controller:getUploadUrl] Error: ${error.message}`, error);
        next(error);
    }
};

// Creates dataset metadata after direct GCS upload and queues parsing task
const createDataset = async (req, res, next) => {
    const { name, gcsPath, originalFilename, fileSizeBytes, teamId } = req.body;
    if (!gcsPath || !originalFilename) return res.status(400).json({ status: 'error', message: 'gcsPath and originalFilename are required.' });
    let newDatasetId = null; // To store ID for potential error logging
    try {
        const userId = req.user._id;
        const datasetData = { name, gcsPath, originalFilename, fileSizeBytes, teamId };
        // Service now just creates metadata with 'not_parsed' status
        const newDataset = await datasetService.createDatasetMetadata(userId, datasetData);
        newDatasetId = newDataset?._id; // Store ID

        // --- TRIGGER PARSING TASK ---
        if (newDatasetId) {
            const payload = { datasetId: newDatasetId.toString() };
            try {
                await createTask(config.datasetParserQueueName, '/internal/datasets/parse-worker', payload);
                 // Update status to 'queued' after task creation
                 await require('./dataset.model').findByIdAndUpdate(newDatasetId, { parsedDataStatus: 'queued' });
                 logger.info(`[Controller:createDataset] Parsing task queued for dataset ${newDatasetId}`);
            } catch (taskError) {
                 logger.error(`[Controller:createDataset] Failed to queue parsing task for dataset ${newDatasetId}: ${taskError.message}`);
                 // Mark dataset as error if task queueing fails
                 await require('./dataset.model').findByIdAndUpdate(newDatasetId, { parsedDataStatus: 'error', parsedDataError: 'Failed to queue parsing task.' });
            }
        } else {
             logger.error(`[Controller:createDataset] Dataset metadata creation did not return a valid ID. Cannot queue parsing task.`);
        }
        // --- END TRIGGER ---

        res.status(201).json({ status: 'success', data: newDataset });
    } catch (error) {
         // Handle specific errors from service (like permission denied)
         if (error.message === 'You are not a member of this team' || error.message === 'Only team admins can upload datasets to a team') {
             return res.status(403).json({ status: 'error', message: error.message });
         }
         logger.error(`[Controller:createDataset] Error creating metadata for GCS path ${gcsPath}: ${error.message}`, error);
        next(error); // Pass to global error handler
    }
};

// Lists datasets accessible to the user
const listDatasets = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const datasets = await datasetService.listDatasetsByUser(userId);
        res.status(200).json({ status: 'success', data: datasets });
    } catch (error) {
        logger.error(`[Controller:listDatasets] Error listing datasets for user ${req.user?._id}: ${error.message}`, error);
        next(error);
    }
};

// Generates a signed URL for reading the original file from GCS
const getReadUrl = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        // Fetch dataset to verify ownership and get gcsPath
        const dataset = await require('./dataset.model').findOne({ _id: id, ownerId: userId }).lean(); // Simple owner check for read URL
        if (!dataset) { logger.warn(`User ${userId} attempted to get read URL for inaccessible or non-existent dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }
        if (!dataset.gcsPath) { logger.error(`Dataset ${id} found but missing gcsPath for user ${userId}.`); return res.status(500).json({ status: 'error', message: 'Dataset configuration error.' }); }
        const signedUrl = await datasetService.getSignedUrlForDataset(dataset.gcsPath);
        if (!signedUrl) { throw new Error('Failed to generate read URL.'); } // Should be caught by service, but safety check
        res.status(200).json({ status: 'success', data: { signedUrl } });
    } catch (error) {
         if (error.message.includes('Dataset file not found')) { return res.status(404).json({ status: 'error', message: error.message }); }
         logger.error(`Error generating read URL for dataset ${id}, user ${userId}: ${error.message}`);
         next(error);
    }
};

// Gets details for a single dataset (checks ownership or team membership)
const getDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        const TeamMember = require('../teams/team-member.model');
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);
        // Fetch the dataset, populating team name if it's a team dataset
        const dataset = await require('./dataset.model').findOne({ _id: id, $or: [{ ownerId: userId }, { teamId: { $in: teamIds } }] })
            .populate('teamId', 'name'); // Populate team name

        if (!dataset) { logger.warn(`User ${userId} attempted to access inaccessible dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }

        // Format the response slightly to include teamName directly if populated
        const responseData = dataset.toObject();
        if (responseData.teamId && typeof responseData.teamId === 'object') {
            responseData.teamName = responseData.teamId.name;
            responseData.teamId = responseData.teamId._id; // Keep teamId as just the ID
        } else {
            responseData.teamName = null;
        }
        responseData.isTeamDataset = !!responseData.teamId;


        res.status(200).json({ status: 'success', data: responseData });
    } catch (error) {
        logger.error(`Error fetching dataset ${id} for user ${userId}: ${error.message}`);
        next(error);
    }
};

// Gets schema information for a dataset (checks ownership or team membership)
const getSchema = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        // Service function handles access check
        const schemaData = await datasetService.getDatasetSchema(id, userId);
        res.status(200).json({ status: 'success', data: schemaData });
    } catch (error) {
        logger.error(`Error fetching schema for dataset ${id}, user ${userId}: ${error.message}`);
        if (error.message === 'Dataset not found' || error.message === 'Access denied') {
            return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
        }
        next(error);
    }
};

// Updates dataset description, column descriptions, and schema types (checks ownership or team membership)
const updateDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    const { columnDescriptions, description, schemaInfo } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        const TeamMember = require('../teams/team-member.model');
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);
        const dataset = await require('./dataset.model').findOne({ _id: id, $or: [{ ownerId: userId }, { teamId: { $in: teamIds } }] });
        if (!dataset) { logger.warn(`User ${userId} attempted to update inaccessible dataset ID: ${id}`); return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' }); }

        let updated = false;
        if (columnDescriptions !== undefined) { dataset.columnDescriptions = columnDescriptions; updated = true; }
        if (description !== undefined) { dataset.description = description; updated = true; }
        if (schemaInfo !== undefined) {
            if (!Array.isArray(schemaInfo)) return res.status(400).json({ status: 'error', message: 'schemaInfo must be an array' });
            for (const item of schemaInfo) {
                if (!item.name || typeof item.name !== 'string') return res.status(400).json({ status: 'error', message: 'Each schema item must have a name property of type string' });
                if (!item.type || typeof item.type !== 'string') return res.status(400).json({ status: 'error', message: 'Each schema item must have a type property of type string' });
            }
            const originalColumnNames = dataset.schemaInfo.map(col => col.name);
            const newColumnNames = schemaInfo.map(col => col.name);
            const missingColumns = originalColumnNames.filter(name => !newColumnNames.includes(name));
            if (missingColumns.length > 0) return res.status(400).json({ status: 'error', message: `Cannot remove existing columns. Missing columns: ${missingColumns.join(', ')}` });
            dataset.schemaInfo = schemaInfo;
            updated = true;
        }

        if (updated) {
            dataset.lastUpdatedAt = new Date();
            await dataset.save();
            logger.info(`User ${userId} updated dataset ${id} with context, column descriptions, and/or schema info`);
        } else {
             logger.info(`User ${userId} submitted update for dataset ${id}, but no changes were detected.`);
        }

        res.status(200).json({ status: 'success', data: dataset });
    } catch (error) {
        logger.error(`Error updating dataset ${id} for user ${userId}: ${error.message}`);
        next(error);
    }
};

// Deletes a dataset (checks ownership or team admin role via service)
const deleteDataset = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ status: 'error', message: 'Invalid dataset ID format.' }); }
    try {
        await datasetService.deleteDatasetById(id, userId); // Service handles GCS/GridFS deletion and permissions
        logger.info(`User ${userId} successfully initiated deletion for dataset ${id}`);
        res.status(200).json({ status: 'success', message: 'Dataset deleted successfully' });
    } catch (error) {
        // Handle specific errors from the service
        if (error.message === 'Dataset not found or not accessible.' || error.message.includes('permission to delete')) {
            return res.status(error.message.includes('permission') ? 403 : 404).json({ status: 'error', message: error.message });
        }
        logger.error(`Error deleting dataset ${id} via controller: ${error.message}`);
        next(error); // Pass other errors to global handler
    }
};

// Handles proxied file uploads and queues parsing task
const proxyUpload = async (req, res, next) => {
    try {
        if (!req.file) { return res.status(400).json({ status: 'error', message: 'No file provided' }); }
        const userId = req.user._id;
        const { teamId } = req.body;
        const file = req.file;
        const { v4: uuidv4 } = require('uuid');
        const uniqueFilename = `${uuidv4()}-${file.originalname}`;
        const gcsPath = `${userId}/${uniqueFilename}`;
        const { getBucket } = require('../../shared/external_apis/gcs.client');
        const bucket = getBucket();
        const blob = bucket.file(gcsPath);
        const blobStream = blob.createWriteStream({ resumable: false, contentType: file.mimetype });

        let responseSent = false; // Flag to prevent double response

        blobStream.on('error', (error) => {
            logger.error(`Error uploading to GCS via proxy for ${gcsPath}: ${error}`);
            if (!responseSent) {
                 res.status(500).json({ status: 'error', message: 'Error uploading file to storage' });
                 responseSent = true;
            }
        });

        blobStream.on('finish', async () => {
            logger.info(`GCS upload finished via proxy for ${gcsPath}`);
            if (responseSent) return; // Don't proceed if error already sent

            try {
                const datasetData = {
                    name: file.originalname, gcsPath, originalFilename: file.originalname,
                    fileSizeBytes: file.size, teamId: teamId || null
                };
                // Service creates metadata with 'not_parsed' status
                const newDataset = await datasetService.createDatasetMetadata(userId, datasetData);

                 // --- TRIGGER PARSING TASK ---
                 if (newDataset?._id) {
                    const payload = { datasetId: newDataset._id.toString() };
                    try {
                        await createTask(config.datasetParserQueueName, '/internal/datasets/parse-worker', payload);
                         await require('./dataset.model').findByIdAndUpdate(newDataset._id, { parsedDataStatus: 'queued' });
                         logger.info(`[Controller:proxyUpload] Parsing task queued for dataset ${newDataset._id}`);
                    } catch (taskError) {
                         logger.error(`[Controller:proxyUpload] Failed to queue parsing task for dataset ${newDataset._id}: ${taskError.message}`);
                         await require('./dataset.model').findByIdAndUpdate(newDataset._id, { parsedDataStatus: 'error', parsedDataError: 'Failed to queue parsing task.' });
                    }
                 } else {
                      logger.error(`[Controller:proxyUpload] Dataset metadata creation did not return a valid ID. Cannot queue parsing task.`);
                 }
                 // --- END TRIGGER ---

                 if (!responseSent) {
                     res.status(201).json({ status: 'success', data: newDataset });
                     responseSent = true;
                 }

            } catch (err) {
                 if (!responseSent) {
                     if (err.message === 'You are not a member of this team' || err.message === 'Only team admins can upload datasets to a team') {
                         res.status(403).json({ status: 'error', message: err.message });
                     } else {
                         logger.error(`Error creating dataset metadata after proxy upload for ${gcsPath}: ${err}`);
                         res.status(500).json({ status: 'error', message: err.message || 'Error creating dataset metadata' });
                     }
                     responseSent = true;
                 }
             }
        });
        blobStream.end(req.file.buffer);
    } catch (error) {
        logger.error(`Error in proxy upload controller: ${error}`);
        next(error);
    }
};

// Handles internal worker requests for dataset parsing
const handleParserWorkerRequest = async (req, res, next) => {
     try {
         // Acknowledge Cloud Task immediately
         res.status(200).json({ status: 'success', message: 'Task received for parsing.' });
         // Process asynchronously
         setImmediate(async () => {
             try {
                 await datasetParserWorkerHandler(req.body);
             } catch (workerError) {
                 // Log error, but task handler itself should manage DB state
                 logger.error(`[Controller:handleParserWorkerRequest] Async worker handler failed: ${workerError.message}`);
             }
         });
     } catch (error) {
          logger.error(`[Controller:handleParserWorkerRequest] Error handling worker request: ${error.message}`);
          // Even if this fails, send 200 to task queue if possible, worker logic handles DB state
          if (!res.headersSent) {
              res.status(200).json({ status: 'error', message: 'Error receiving task, but acknowledged.' });
          }
     }
};

module.exports = {
    getUploadUrl,
    createDataset,
    listDatasets,
    getReadUrl,
    getDataset,
    getSchema,
    updateDataset,
    deleteDataset,
    proxyUpload,
    handleParserWorkerRequest, // Export new handler
};