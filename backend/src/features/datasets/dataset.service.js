// backend/src/features/datasets/dataset.service.js
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb'); // Import GridFSBucket
const Dataset = require('./dataset.model');
const TeamMember = require('../teams/team-member.model'); // For access check
const Team = require('../teams/team.model'); // Import Team model for population
const logger = require('../../shared/utils/logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getBucket: getGCSBucket } = require('../../shared/external_apis/gcs.client');
const Papa = require('papaparse');
const XLSX = require('xlsx');

const SIGNED_URL_UPLOAD_EXPIRATION = 15 * 60 * 1000; // 15 minutes
const SIGNED_URL_READ_EXPIRATION = 5 * 60 * 1000; // 5 minutes for reads

/**
 * Generates a unique GCS path and a signed URL for uploading a file (PUT).
 */
const generateUploadUrl = async (userId, originalFilename, fileSize) => {
    if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) {
        logger.error(`Invalid fileSize provided for upload URL generation: ${fileSize}`);
        throw new Error('Valid file size is required to generate upload URL.');
    }
    const fileSizeNum = parseInt(fileSize);
    const bucket = getGCSBucket();
    const uniqueFilename = `${uuidv4()}-${originalFilename}`;
    const gcsPath = `${userId}/${uniqueFilename}`;
    try {
        const options = {
            version: 'v4', action: 'write', expires: Date.now() + SIGNED_URL_UPLOAD_EXPIRATION,
            contentLengthRange: { min: fileSizeNum, max: fileSizeNum }, method: 'PUT',
            origin: '*', responseDisposition: 'inline', responseType: 'application/json',
        };
        const [url] = await bucket.file(gcsPath).getSignedUrl(options);
        logger.info(`Generated v4 PUT signed URL for user ${userId}, path: ${gcsPath}, size: ${fileSizeNum}`);
        return { signedUrl: url, gcsPath: gcsPath };
    } catch (error) {
        logger.error(`Failed to generate PUT signed URL for ${gcsPath}:`, error);
        throw new Error('Could not generate upload URL.');
    }
};

/**
 * Generates a signed URL for reading the original file (GET).
 */
const getSignedUrlForDataset = async (gcsPath) => {
     if (!gcsPath) { logger.warn("Attempted to get signed read URL for empty GCS path."); throw new Error("Cannot generate read URL: Dataset path is missing."); }
     const bucket = getGCSBucket();
     const file = bucket.file(gcsPath);
     try {
         const [exists] = await file.exists();
         if (!exists) { logger.warn(`Attempted to get read URL for non-existent file: ${gcsPath}`); throw new Error(`Dataset file not found at path: ${gcsPath}`); }
         const options = { version: 'v4', action: 'read', expires: Date.now() + SIGNED_URL_READ_EXPIRATION };
         const [url] = await file.getSignedUrl(options);
         logger.debug(`Generated v4 READ signed URL for path: ${gcsPath}`);
         return url;
     } catch (error) {
         logger.error(`Failed to generate READ signed URL for ${gcsPath}: ${error.message}`);
         if (error.message.includes('Dataset file not found')) throw error;
         throw new Error(`Could not generate read URL for dataset: ${gcsPath}. Reason: ${error.message}`);
     }
 };

/**
 * Parses headers from a file stored in GCS.
 * Used by quality audit or potentially schema update logic.
 */
const parseHeadersFromGCS = async (gcsPath) => {
    const bucket = getGCSBucket();
    const file = bucket.file(gcsPath);
    const MAX_HEADER_READ_BYTES = 1024 * 10; // 10KB should be enough for headers
    logger.debug(`Parsing headers for gcsPath: ${gcsPath}`);
    try {
        const [exists] = await file.exists();
        if (!exists) { logger.error(`File not found for header parsing: ${gcsPath}`); throw new Error(`Dataset file not found at path: ${gcsPath}`); }
        const [buffer] = await file.download({ start: 0, end: MAX_HEADER_READ_BYTES });
        const fileContent = buffer.toString('utf8');
        const fileExtension = path.extname(gcsPath).toLowerCase();
        let headers = [];
        if (fileExtension === '.csv' || fileExtension === '.tsv') {
            const parsed = Papa.parse(fileContent, { header: true, preview: 1, skipEmptyLines: true });
            if (parsed.meta?.fields?.length > 0) headers = parsed.meta.fields;
            else if (parsed.data?.[0]?.length > 0) headers = parsed.data[0]; // Fallback if no header row detected by Papa
             logger.debug(`CSV headers parsed: ${headers.length}`);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
            const firstSheetName = workbook.SheetNames[0];
            if (firstSheetName) {
                const worksheet = workbook.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }); // Get array of arrays
                if (data?.[0]?.length > 0) headers = data[0].map(header => String(header).trim()); // First row is headers
                 logger.debug(`Excel headers parsed: ${headers.length}`);
            }
        } else { logger.warn(`Unsupported file type for header parsing: ${fileExtension}`); }
        // Filter out any empty strings or null/undefined values that might sneak in
        const validHeaders = headers.filter(h => h && typeof h === 'string' && h.trim() !== '');
        logger.info(`Found ${validHeaders.length} valid headers for ${gcsPath}`);
        return validHeaders;
    } catch (error) {
        logger.error(`Failed to parse headers for ${gcsPath}:`, error);
         if (error.message.includes('Dataset file not found')) throw error; // Propagate specific error
        return []; // Return empty on other errors
    }
};

/**
 * Create dataset metadata document. Initializes status to 'not_parsed'.
 */
const createDatasetMetadata = async (userId, datasetData) => {
    const { name, gcsPath, originalFilename, fileSizeBytes, teamId } = datasetData;

    // Permission check for team uploads
    if (teamId) {
        const teamMember = await TeamMember.findOne({ teamId, userId }).lean();
        if (!teamMember) { logger.error(`User ${userId} attempted to create dataset for team ${teamId} without membership`); throw new Error('You are not a member of this team'); }
        if (teamMember.role !== 'admin') { logger.error(`User ${userId} attempted to create dataset for team ${teamId} without admin role`); throw new Error('Only team admins can upload datasets to a team'); }
    }

    const dataset = new Dataset({
        name: name || originalFilename,
        gcsPath,
        originalFilename,
        fileSizeBytes,
        ownerId: userId,
        teamId: teamId || null,
        schemaInfo: [], // Schema initially empty, populated by parser task
        columnDescriptions: {}, // Start empty
        parsedDataStatus: 'not_parsed', // Initial status
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
    });

    try {
        const savedDataset = await dataset.save();
        logger.info(`Dataset metadata saved (parsing queued) for user ${userId}${teamId ? `, team ${teamId}` : ''}, GCS path: ${gcsPath}, DB ID: ${savedDataset._id}`);
        return savedDataset.toObject(); // Return plain object
    } catch (error) {
        logger.error(`Failed to save dataset metadata for ${gcsPath}:`, error);
        if (error.code === 11000) throw new Error('Dataset with this path might already exist.'); // Handle duplicate GCS path
        throw new Error('Could not save dataset information.');
    }
};

/**
 * List datasets the user has access to (personal + team).
 */
const listDatasetsByUser = async (userId) => {
    try {
        // Get all teams the user is a member of
        const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
        const teamIds = teamMemberships.map(tm => tm.teamId);

        // Find personal datasets (no teamId)
        const personalDatasets = await Dataset.find({ ownerId: userId, teamId: null }).sort({ createdAt: -1 }).lean();

        // Find team datasets with populated team info
        const teamDatasets = await Dataset.find({ teamId: { $in: teamIds } })
            .populate('teamId', 'name') // Populate the team name
            .sort({ createdAt: -1 })
            .lean();

        // Mark team datasets and add teamName field
        const datasetsWithTeamInfo = [
            ...personalDatasets.map(ds => ({ ...ds, isTeamDataset: false, teamName: null })),
            ...teamDatasets.map(ds => ({ ...ds, isTeamDataset: true, teamName: ds.teamId ? ds.teamId.name : null })) // Extract name
        ];

        // Sort combined list by creation date (newest first)
        datasetsWithTeamInfo.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        logger.debug(`Found ${datasetsWithTeamInfo.length} datasets for user ${userId} (including team datasets)`);
        return datasetsWithTeamInfo;
    } catch (error) {
        logger.error(`Failed to list datasets for user ${userId}:`, error);
        throw new Error('Could not retrieve datasets.');
    }
};

/**
 * Get dataset schema, description, and column descriptions. Performs access check.
 */
const getDatasetSchema = async (datasetId, userId) => {
    const dataset = await Dataset.findById(datasetId).select('schemaInfo columnDescriptions description ownerId teamId').lean();
     if (!dataset) throw new Error('Dataset not found');
    // Access Check (owner or team member)
    let hasAccess = false;
    if (dataset.ownerId.toString() === userId.toString()) { hasAccess = true; }
    else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId }).lean(); if (teamMember) hasAccess = true; }
    if (!hasAccess) throw new Error('Access denied');
    // Return the relevant fields
    return {
        schemaInfo: dataset.schemaInfo || [],
        columnDescriptions: dataset.columnDescriptions || {},
        description: dataset.description || ''
    };
};

/**
 * Retrieves and parses dataset content stored as JSON in GridFS.
 * Performs access control check.
 * @param {string} datasetId - The ID of the dataset.
 * @param {string} userId - The ID of the user requesting the data.
 * @returns {Promise<Array<object>|null>} - The parsed data array or null if not found/error.
 * @throws {Error} If access denied or other critical error.
 */
const getParsedDataFromStorage = async (datasetId, userId) => {
    logger.info(`[Service:getParsedData] Request for dataset ${datasetId} by user ${userId}`);
    const dataset = await Dataset.findById(datasetId).select('ownerId teamId parsedDataStatus parsedDataGridFSId parsedDataError').lean();

    if (!dataset) throw new Error(`Dataset ${datasetId} not found.`);

    // Access Check
    let hasAccess = false;
    if (dataset.ownerId.toString() === userId.toString()) { hasAccess = true; }
    else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId }).lean(); if (teamMember) hasAccess = true; }
    if (!hasAccess) throw new Error(`User ${userId} access denied for dataset ${datasetId}.`);

    // Status Check
    if (dataset.parsedDataStatus !== 'completed' || !dataset.parsedDataGridFSId) {
         logger.warn(`[Service:getParsedData] Parsed data not ready for ${datasetId}. Status: ${dataset.parsedDataStatus}, GridFS ID: ${dataset.parsedDataGridFSId}`);
         if(dataset.parsedDataStatus === 'error') { throw new Error(`Dataset ${datasetId} failed previous parsing attempt: ${dataset.parsedDataError || 'Unknown parsing error'}`); }
         throw new Error(`Dataset ${datasetId} parsing is not complete (Status: ${dataset.parsedDataStatus}). Please wait or check for errors.`);
    }

    // Download and Parse from GridFS
    try {
        logger.debug(`[Service:getParsedData] Downloading GridFS file ${dataset.parsedDataGridFSId} for dataset ${datasetId}`);
        const db = mongoose.connection.db;
        const bucketName = 'parsed_datasets';
        const bucket = new GridFSBucket(db, { bucketName: bucketName });
        const downloadStream = bucket.openDownloadStream(dataset.parsedDataGridFSId);

        let jsonData = '';
        for await (const chunk of downloadStream) { jsonData += chunk.toString('utf8'); }

        logger.debug(`[Service:getParsedData] Downloaded ${jsonData.length} bytes from GridFS for dataset ${datasetId}. Parsing JSON...`);
        const parsedResult = JSON.parse(jsonData);

        if (!Array.isArray(parsedResult)) { throw new Error('Parsed data from GridFS is not a valid JSON array.'); }

        logger.info(`[Service:getParsedData] Successfully retrieved and parsed ${parsedResult.length} rows for dataset ${datasetId} from GridFS.`);
        return parsedResult;

    } catch (error) {
        logger.error(`[Service:getParsedData] Failed to retrieve/parse GridFS data for dataset ${datasetId} (GridFS ID: ${dataset.parsedDataGridFSId}): ${error.message}`, error);
         // Attempt to update status to error if reading fails
         await Dataset.findByIdAndUpdate(datasetId, { parsedDataStatus: 'error', parsedDataError: `Failed to read stored parsed data: ${error.message}`});
        throw new Error(`Failed to retrieve stored parsed data for dataset ${datasetId}. It may be corrupted.`);
    }
};

/**
 * Delete a dataset and its corresponding GCS file AND GridFS parsed data file.
 */
const deleteDatasetById = async (datasetId, userId) => {
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) { throw new Error('Dataset not found or not accessible.'); }

    // Permission Check (Owner or Team Admin)
     let hasPermission = false;
     if (dataset.ownerId.toString() === userId.toString()) { hasPermission = true; }
     else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId, role: 'admin' }); if (teamMember) hasPermission = true; }
     if (!hasPermission) { throw new Error('You do not have permission to delete this dataset.'); }

    // Delete Parsed Data from GridFS (if exists)
    if (dataset.parsedDataGridFSId) {
        logger.info(`[Service:deleteDataset] Attempting to delete parsed data GridFS file ${dataset.parsedDataGridFSId} for dataset ${datasetId}`);
        try {
            const db = mongoose.connection.db;
            const bucketName = 'parsed_datasets';
            const bucket = new GridFSBucket(db, { bucketName: bucketName });
            await bucket.delete(dataset.parsedDataGridFSId);
            logger.info(`[Service:deleteDataset] Successfully deleted parsed data GridFS file ${dataset.parsedDataGridFSId}`);
        } catch (gridfsError) {
            if (gridfsError.code === 'ENOENT' || gridfsError.message?.includes('File not found')) { logger.warn(`[Service:deleteDataset] Parsed data GridFS file ${dataset.parsedDataGridFSId} not found during deletion attempt.`); }
            else { logger.error(`[Service:deleteDataset] Error deleting parsed data GridFS file ${dataset.parsedDataGridFSId}: ${gridfsError.message}`, gridfsError); }
        }
    }

    // Delete Original File from GCS (existing logic)
    if (dataset.gcsPath) {
        logger.info(`[Service:deleteDataset] Attempting to delete original GCS file ${dataset.gcsPath} for dataset ${datasetId}`);
        const gcsBucket = getGCSBucket();
        const file = gcsBucket.file(dataset.gcsPath);
        try {
            const [exists] = await file.exists();
            if (exists) { await file.delete(); logger.info(`[Service:deleteDataset] GCS file deleted: ${dataset.gcsPath}`); }
            else { logger.warn(`[Service:deleteDataset] Original GCS file not found during deletion: ${dataset.gcsPath}`); }
        } catch (gcsError) { logger.error(`[Service:deleteDataset] Error deleting GCS file ${dataset.gcsPath}:`, gcsError); }
    }

    // Delete Dataset Document from MongoDB
    try {
         logger.info(`[Service:deleteDataset] Deleting Dataset document ${datasetId}`);
         await Dataset.findByIdAndDelete(datasetId);
         logger.info(`[Service:deleteDataset] Dataset document ${datasetId} deleted by user ${userId}`);
         return true;
    } catch (dbError) {
         logger.error(`[Service:deleteDataset] Error deleting Dataset document ${datasetId}:`, dbError);
         throw new Error(`Failed to delete dataset metadata: ${dbError.message}`);
    }
};

// Keep getRawDatasetContent if used elsewhere (e.g., quality audit)
const getRawDatasetContent = async (datasetId, userId) => {
    logger.debug(`Attempting to fetch raw content for dataset ${datasetId} by user ${userId}`);
    const dataset = await Dataset.findById(datasetId).lean();
    if (!dataset) { logger.warn(`Dataset not found: ${datasetId}`); throw new Error('Dataset not found.'); }
    let hasAccess = false;
    if (dataset.ownerId.toString() === userId.toString()) { hasAccess = true; }
    else if (dataset.teamId) { const teamMember = await TeamMember.findOne({ teamId: dataset.teamId, userId }).lean(); if (teamMember) hasAccess = true; }
    if (!hasAccess) { logger.warn(`User ${userId} access denied for dataset ${datasetId}.`); throw new Error('Access denied to this dataset.'); }
    if (!dataset.gcsPath) { logger.error(`Dataset ${datasetId} is missing GCS path.`); throw new Error('Dataset file path is missing.'); }
    try {
        const bucket = getGCSBucket();
        const file = bucket.file(dataset.gcsPath);
        const [exists] = await file.exists();
        if (!exists) { logger.error(`GCS file not found for dataset ${datasetId} at path: ${dataset.gcsPath}`); throw new Error(`Dataset file not found at path: ${dataset.gcsPath}`); }
        const [buffer] = await file.download();
        const content = buffer.toString('utf8');
        logger.info(`Successfully fetched raw content for dataset ${datasetId} (Size: ${Buffer.byteLength(content, 'utf8')} bytes)`);
        return content;
    } catch (fetchErr) {
        logger.error(`Failed to fetch GCS content for dataset ${datasetId} (Path: ${dataset.gcsPath}): ${fetchErr.message}`, { fetchErr });
        throw new Error(`Failed to retrieve dataset content: ${fetchErr.message}`);
    }
};

module.exports = {
    generateUploadUrl,
    createDatasetMetadata,
    listDatasetsByUser,
    getDatasetSchema,
    parseHeadersFromGCS, // Export if needed elsewhere
    getSignedUrlForDataset,
    deleteDatasetById,
    getRawDatasetContent, // Export if needed elsewhere
    getParsedDataFromStorage, // Export new function
};