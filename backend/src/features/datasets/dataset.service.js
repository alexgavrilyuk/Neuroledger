// backend/src/features/datasets/dataset.service.js
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getBucket } = require('../../shared/external_apis/gcs.client');
const Dataset = require('./dataset.model');
const TeamMember = require('../teams/team-member.model'); // Import TeamMember model
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse');
const XLSX = require('xlsx');

const SIGNED_URL_UPLOAD_EXPIRATION = 15 * 60 * 1000; // 15 minutes
const SIGNED_URL_READ_EXPIRATION = 5 * 60 * 1000; // ** REDUCED TO 5 minutes for reads **

/**
 * Generates a unique GCS path and a signed URL for uploading a file (PUT).
 */
const generateUploadUrl = async (userId, originalFilename, fileSize) => {
    // ... (logic remains the same as your previous version) ...
     if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) {
        logger.error(`Invalid fileSize provided for upload URL generation: ${fileSize}`);
        throw new Error('Valid file size is required to generate upload URL.');
    }
    const fileSizeNum = parseInt(fileSize);
    const bucket = getBucket();
    const uniqueFilename = `${uuidv4()}-${originalFilename}`;
    const gcsPath = `${userId}/${uniqueFilename}`;
    const options = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + SIGNED_URL_UPLOAD_EXPIRATION,
        contentLengthRange: { min: fileSizeNum, max: fileSizeNum },
        method: 'PUT',
    };
    try {
        const [url] = await bucket.file(gcsPath).getSignedUrl(options);
        logger.info(`Generated v4 PUT signed URL for user ${userId}, path: ${gcsPath}, size: ${fileSizeNum}`);
        return { signedUrl: url, gcsPath: gcsPath };
    } catch (error) {
        logger.error(`Failed to generate PUT signed URL for ${gcsPath}:`, error);
        throw new Error('Could not generate upload URL.');
    }
};

/**
 * Generates a signed URL for reading a file (GET).
 * Used by the frontend to fetch data for the Web Worker.
 */
const getSignedUrlForDataset = async (gcsPath) => {
     if (!gcsPath) {
         logger.warn("Attempted to get signed read URL for empty GCS path.");
         // Throw error here, frontend expects a URL or an error
         throw new Error("Cannot generate read URL: Dataset path is missing.");
     }
     const bucket = getBucket();
     const file = bucket.file(gcsPath); // Get file reference

     try {
         // --- IMPORTANT: Check if the file actually exists BEFORE generating URL ---
         const [exists] = await file.exists();
         if (!exists) {
             logger.warn(`Attempted to get read URL for non-existent file: ${gcsPath}`);
             throw new Error(`Dataset file not found at path: ${gcsPath}`);
         }
         // --- End Check ---

         const options = {
             version: 'v4',
             action: 'read',
             expires: Date.now() + SIGNED_URL_READ_EXPIRATION, // Shorter expiry for reads
         };

         const [url] = await file.getSignedUrl(options); // Use file reference
         logger.debug(`Generated v4 READ signed URL for path: ${gcsPath}`);
         return url;
     } catch (error) {
         logger.error(`Failed to generate READ signed URL for ${gcsPath}: ${error.message}`);
         // Rethrow specific error types if caught
         if (error.message.includes('Dataset file not found')) {
             throw error; // Propagate the not found error
         }
         // Rethrow other errors
         throw new Error(`Could not generate read URL for dataset: ${gcsPath}. Reason: ${error.message}`);
     }
 };

// parseHeadersFromGCS (remains the same)
const parseHeadersFromGCS = async (gcsPath) => {
    // ... (keep existing logic) ...
    const bucket = getBucket();
    const file = bucket.file(gcsPath);
    const MAX_HEADER_READ_BYTES = 1024 * 10;
    logger.debug(`Parsing headers for gcsPath: ${gcsPath}`);
    try {
        const [exists] = await file.exists();
        if (!exists) {
             logger.error(`File not found for header parsing: ${gcsPath}`);
             throw new Error(`Dataset file not found at path: ${gcsPath}`);
        }
        const [buffer] = await file.download({ start: 0, end: MAX_HEADER_READ_BYTES });
        const fileContent = buffer.toString('utf8');
        const fileExtension = path.extname(gcsPath).toLowerCase();
        let headers = [];
        if (fileExtension === '.csv' || fileExtension === '.tsv') {
            const parsed = Papa.parse(fileContent, { header: true, preview: 1, skipEmptyLines: true });
            if (parsed.meta?.fields?.length > 0) headers = parsed.meta.fields;
            else if (parsed.data?.[0]?.length > 0) headers = parsed.data[0];
             logger.debug(`CSV headers parsed: ${headers.length}`);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
            const firstSheetName = workbook.SheetNames[0];
            if (firstSheetName) {
                const worksheet = workbook.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                if (data?.[0]?.length > 0) headers = data[0].map(header => String(header).trim());
                 logger.debug(`Excel headers parsed: ${headers.length}`);
            }
        } else {
            logger.warn(`Unsupported file type for header parsing: ${fileExtension}`);
        }
        const validHeaders = headers.filter(h => h && typeof h === 'string' && h.trim() !== '');
        logger.info(`Found ${validHeaders.length} valid headers for ${gcsPath}`);
        return validHeaders;
    } catch (error) {
        logger.error(`Failed to parse headers for ${gcsPath}:`, error);
         if (error.message.includes('Dataset file not found')) throw error;
        return [];
    }
};

/**
 * Create dataset metadata - UPDATED to support team datasets
 */
const createDatasetMetadata = async (userId, datasetData) => {
    const { name, gcsPath, originalFilename, fileSizeBytes, teamId } = datasetData;
    let headers = [];
    let schemaInfo = [];
    try {
        headers = await parseHeadersFromGCS(gcsPath);
        schemaInfo = headers.map(headerName => ({ name: headerName, type: 'string' }));
    } catch (parseError) {
         logger.error(`Header parsing failed for ${gcsPath}, proceeding without schema: ${parseError.message}`);
    }

    // If teamId is provided, verify user is a member of the team
    if (teamId) {
        const teamMember = await TeamMember.findOne({ teamId, userId }).lean();
        if (!teamMember) {
            logger.error(`User ${userId} attempted to create dataset for team ${teamId} without membership`);
            throw new Error('You are not a member of this team');
        }
    }

    const dataset = new Dataset({
        name: name || originalFilename,
        gcsPath,
        originalFilename,
        fileSizeBytes,
        ownerId: userId,
        teamId, // Add teamId (null if not provided)
        schemaInfo,
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
    });

    try {
        const savedDataset = await dataset.save();
        logger.info(`Dataset metadata saved for user ${userId}${teamId ? `, team ${teamId}` : ''}, GCS path: ${gcsPath}, DB ID: ${savedDataset._id}`);
        return savedDataset.toObject();
    } catch (error) {
        logger.error(`Failed to save dataset metadata for ${gcsPath}:`, error);
        if (error.code === 11000) throw new Error('Dataset with this path might already exist.');
        throw new Error('Could not save dataset information.');
    }
};

/**
 * List datasets the user has access to - UPDATED to include team datasets
 */
const listDatasetsByUser = async (userId) => {
    try {
        // Get all teams the user is a member of
        const teamMemberships = await TeamMember.find({ userId })
            .select('teamId')
            .lean();

        const teamIds = teamMemberships.map(tm => tm.teamId);

        // Find both personal datasets and team datasets the user has access to
        const query = {
            $or: [
                { ownerId: userId, teamId: null }, // Personal datasets
                { teamId: { $in: teamIds } }      // Team datasets
            ]
        };

        const datasets = await Dataset.find(query)
          .sort({ createdAt: -1 })
          .lean();

        // Add isTeamDataset flag for frontend use
        const datasetsWithFlag = datasets.map(ds => ({
            ...ds,
            isTeamDataset: ds.teamId !== null
        }));

        logger.debug(`Found ${datasetsWithFlag.length} datasets for user ${userId} (including team datasets)`);
        return datasetsWithFlag;
    } catch (error) {
        logger.error(`Failed to list datasets for user ${userId}:`, error);
        throw new Error('Could not retrieve datasets.');
    }
};

/**
 * Delete a dataset and its corresponding GCS file
 */
const deleteDatasetById = async (datasetId, userId) => {
    try {
        // Find the dataset
        const dataset = await Dataset.findById(datasetId);

        if (!dataset) {
            throw new Error('Dataset not found or not accessible.');
        }

        // Check if user has permissions to delete
        // If it's a personal dataset, verify ownerId
        // If it's a team dataset, verify user is a team admin
        if (dataset.ownerId.toString() !== userId.toString()) {
            if (dataset.teamId) {
                // Check if user is admin of the team
                const teamMember = await TeamMember.findOne({
                    teamId: dataset.teamId,
                    userId,
                    role: 'admin'
                });

                if (!teamMember) {
                    throw new Error('You do not have permission to delete this team dataset.');
                }
            } else {
                throw new Error('Dataset not found or not accessible.');
            }
        }

        // Get the bucket and file reference
        const bucket = getBucket();
        const file = bucket.file(dataset.gcsPath);

        // Check if the file exists in GCS
        const [exists] = await file.exists();

        // Delete the file from GCS if it exists
        if (exists) {
            try {
                await file.delete();
                logger.info(`GCS file deleted: ${dataset.gcsPath}`);
            } catch (gcsError) {
                logger.error(`Error deleting GCS file ${dataset.gcsPath}:`, gcsError);
                // Continue with DB deletion even if GCS deletion fails
            }
        } else {
            logger.warn(`GCS file not found during deletion: ${dataset.gcsPath}`);
        }

        // Delete the dataset from MongoDB
        await Dataset.findByIdAndDelete(datasetId);

        logger.info(`Dataset ${datasetId} deleted by user ${userId}`);
        return true;
    } catch (error) {
        logger.error(`Failed to delete dataset ${datasetId} by user ${userId}:`, error);
        throw error;
    }
};

module.exports = {
    generateUploadUrl,
    createDatasetMetadata,
    listDatasetsByUser,
    parseHeadersFromGCS,
    getSignedUrlForDataset,
    deleteDatasetById
};