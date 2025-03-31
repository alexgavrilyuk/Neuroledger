// backend/src/features/datasets/dataset.service.js
// ** FULLY UPDATED FILE **
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getBucket } = require('../../shared/external_apis/gcs.client');
const Dataset = require('./dataset.model');
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse'); // For CSV parsing
const XLSX = require('xlsx'); // For Excel parsing

const SIGNED_URL_EXPIRATION = 15 * 60 * 1000; // 15 minutes

/**
 * Generates a unique GCS path and a signed URL for uploading a file.
 * Requires the exact file size for v4 PUT signing.
 */
const generateUploadUrl = async (userId, originalFilename, fileSize) => {
    // Validate fileSize
    if (!fileSize || isNaN(parseInt(fileSize)) || parseInt(fileSize) <= 0) {
        logger.error(`Invalid fileSize provided for upload URL generation: ${fileSize}`);
        throw new Error('Valid file size is required to generate upload URL.');
    }
    const fileSizeNum = parseInt(fileSize);

    const bucket = getBucket();
    const uniqueFilename = `${uuidv4()}-${originalFilename}`;
    // Organize uploads by user ID
    const gcsPath = `${userId}/${uniqueFilename}`;

    const options = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + SIGNED_URL_EXPIRATION,
        // --- Include Content-Length Range for v4 PUT ---
        contentLengthRange: { min: fileSizeNum, max: fileSizeNum },
        // We specify the method in the call below instead of here
    };

    try {
        // Explicitly specify PUT method for clarity
        const [url] = await bucket.file(gcsPath).getSignedUrl({...options, method: 'PUT'});
        logger.info(`Generated v4 PUT signed URL for user ${userId}, path: ${gcsPath}, size: ${fileSizeNum}`);
        return { signedUrl: url, gcsPath: gcsPath };
    } catch (error) {
        logger.error(`Failed to generate signed URL for ${gcsPath} (size: ${fileSizeNum}):`, error);
        throw new Error('Could not generate upload URL.');
    }
};


/**
 * Parses headers from a file stored in GCS.
 * Reads the beginning of the file to determine headers.
 */
const parseHeadersFromGCS = async (gcsPath) => {
    const bucket = getBucket();
    const file = bucket.file(gcsPath);
    const MAX_HEADER_READ_BYTES = 1024 * 10; // Read first 10KB

    logger.debug(`Parsing headers for gcsPath: ${gcsPath}`);

    try {
        const [buffer] = await file.download({ start: 0, end: MAX_HEADER_READ_BYTES });
        const fileContent = buffer.toString('utf8'); // Assume UTF8
        const fileExtension = path.extname(gcsPath).toLowerCase();

        let headers = [];

        if (fileExtension === '.csv' || fileExtension === '.tsv') {
            const parsed = Papa.parse(fileContent, {
                header: true,
                preview: 1,
                skipEmptyLines: true,
            });
            if (parsed.meta && parsed.meta.fields && parsed.meta.fields.length > 0) {
                headers = parsed.meta.fields;
            } else if (parsed.data && parsed.data.length > 0 && Array.isArray(parsed.data[0])){
                 headers = parsed.data[0]; // Fallback: use first row
            }
             logger.debug(`CSV headers parsed: ${headers.length}`);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
            const firstSheetName = workbook.SheetNames[0];
            if (firstSheetName) {
                const worksheet = workbook.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                if (data && data.length > 0 && Array.isArray(data[0])) {
                    headers = data[0].map(header => String(header).trim());
                }
                 logger.debug(`Excel headers parsed: ${headers.length}`);
            }
        } else {
            logger.warn(`Unsupported file type for header parsing: ${fileExtension}`);
        }

        // Filter out empty headers
        const validHeaders = headers.filter(h => h && typeof h === 'string' && h.trim() !== '');
        logger.info(`Found ${validHeaders.length} valid headers for ${gcsPath}`);
        return validHeaders;

    } catch (error) {
        logger.error(`Failed to parse headers for ${gcsPath}:`, error);
        return []; // Return empty on error, don't block metadata creation
    }
};


/**
 * Creates a new dataset record in the database after upload is complete.
 */
const createDatasetMetadata = async (userId, datasetData) => {
    const { name, gcsPath, originalFilename, fileSizeBytes } = datasetData;

    // 1. Parse Headers from the uploaded file in GCS
    const headers = await parseHeadersFromGCS(gcsPath);
    const schemaInfo = headers.map(headerName => ({
        name: headerName,
        type: 'string' // Default type
    }));

    // 2. Create Dataset document
    const dataset = new Dataset({
        name: name || originalFilename,
        gcsPath,
        originalFilename,
        fileSizeBytes,
        ownerId: userId,
        schemaInfo,
        createdAt: new Date(), // Set creation explicitly
        lastUpdatedAt: new Date(), // Set update explicitly
    });

    try {
        const savedDataset = await dataset.save();
        logger.info(`Dataset metadata saved for user ${userId}, GCS path: ${gcsPath}, DB ID: ${savedDataset._id}`);
        return savedDataset.toObject();
    } catch (error) {
        logger.error(`Failed to save dataset metadata for ${gcsPath}:`, error);
        // Attempt to clean up GCS file if DB save fails? Could be complex.
        // Example: Check for duplicate key error (e.g., MongoError code 11000)
        if (error.code === 11000) { // Example duplicate key error code
             logger.warn(`Potential duplicate dataset entry for gcsPath: ${gcsPath}. Consider cleanup.`);
             throw new Error('Dataset with this path might already exist.');
        }
        throw new Error('Could not save dataset information.');
    }
};

/**
 * Lists datasets accessible by the user (owned only in Phase 3).
 */
const listDatasetsByUser = async (userId) => {
    try {
        const datasets = await Dataset.find({ ownerId: userId })
          .sort({ createdAt: -1 })
          .select('-schemaInfo'); // Exclude schema from list

        logger.debug(`Found ${datasets.length} datasets for user ${userId}`);
        return datasets.map(d => d.toObject());
    } catch (error) {
        logger.error(`Failed to list datasets for user ${userId}:`, error);
        throw new Error('Could not retrieve datasets.');
    }
};


module.exports = {
    generateUploadUrl,
    createDatasetMetadata,
    listDatasetsByUser,
    parseHeadersFromGCS // Exporting in case needed elsewhere, though not used by controller directly
    // Add getDatasetById, updateDataset, deleteDataset later
};