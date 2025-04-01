// backend/src/features/datasets/dataset.service.js
// ** UPDATED FILE - Export a helper for signed URLs needed by execution context **
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getBucket } = require('../../shared/external_apis/gcs.client');
const Dataset = require('./dataset.model');
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse');
const XLSX = require('xlsx');

const SIGNED_URL_EXPIRATION = 15 * 60 * 1000; // 15 minutes for uploads
const SIGNED_URL_READ_EXPIRATION = 60 * 60 * 1000; // 1 hour for reads (adjust as needed)

/**
 * Generates a unique GCS path and a signed URL for uploading a file (PUT).
 */
const generateUploadUrl = async (userId, originalFilename, fileSize) => {
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
        expires: Date.now() + SIGNED_URL_EXPIRATION,
        contentLengthRange: { min: fileSizeNum, max: fileSizeNum },
        method: 'PUT', // Explicitly define method
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
 * Used potentially by the execution sandbox helper.
 */
const getSignedUrlForDataset = async (gcsPath) => {
    if (!gcsPath) {
         logger.warn("Attempted to get signed read URL for empty GCS path.");
         return null; // Or throw error?
     }
     const bucket = getBucket();
     const options = {
         version: 'v4',
         action: 'read',
         expires: Date.now() + SIGNED_URL_READ_EXPIRATION,
     };

     try {
         const [url] = await bucket.file(gcsPath).getSignedUrl(options);
         logger.debug(`Generated v4 READ signed URL for path: ${gcsPath}`);
         return url;
     } catch (error) {
         // Log error but might not want to throw if caller can handle null
         logger.error(`Failed to generate READ signed URL for ${gcsPath}: ${error.message}`);
         // Check for specific errors like 'file not found'
         if (error.code === 404) {
             throw new Error(`Dataset file not found at path: ${gcsPath}`);
         }
         throw new Error(`Could not generate read URL for dataset: ${gcsPath}`);
     }
 };


/**
 * Parses headers from a file stored in GCS.
 */
const parseHeadersFromGCS = async (gcsPath) => {
    const bucket = getBucket();
    const file = bucket.file(gcsPath);
    const MAX_HEADER_READ_BYTES = 1024 * 10; // Read first 10KB

    logger.debug(`Parsing headers for gcsPath: ${gcsPath}`);

    try {
        // Check if file exists before attempting download
        const [exists] = await file.exists();
        if (!exists) {
             logger.error(`File not found for header parsing: ${gcsPath}`);
             throw new Error(`Dataset file not found at path: ${gcsPath}`);
        }

        const [buffer] = await file.download({ start: 0, end: MAX_HEADER_READ_BYTES });
        const fileContent = buffer.toString('utf8');
        const fileExtension = path.extname(gcsPath).toLowerCase();
        let headers = [];

        // --- Parsing Logic (remains the same) ---
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
        // Propagate specific errors like file not found
         if (error.message.includes('Dataset file not found')) {
             throw error;
         }
        return []; // Return empty for other parsing errors
    }
};


/**
 * Creates a new dataset record in the database after upload is complete.
 */
const createDatasetMetadata = async (userId, datasetData) => {
    const { name, gcsPath, originalFilename, fileSizeBytes } = datasetData;
    let headers = [];
    let schemaInfo = [];
    try {
        headers = await parseHeadersFromGCS(gcsPath);
        schemaInfo = headers.map(headerName => ({ name: headerName, type: 'string' }));
    } catch (parseError) {
         // Log the header parsing error but potentially allow metadata creation without schema
         logger.error(`Header parsing failed for ${gcsPath}, proceeding without schema: ${parseError.message}`);
         // Decide if failure to parse headers should prevent metadata creation entirely
         // For now, we proceed but log the error.
         // throw new Error(`Failed to process dataset file: ${parseError.message}`); // Uncomment to block creation
    }


    const dataset = new Dataset({
        name: name || originalFilename,
        gcsPath, originalFilename, fileSizeBytes, ownerId: userId, schemaInfo,
        createdAt: new Date(), lastUpdatedAt: new Date(),
    });

    try {
        const savedDataset = await dataset.save();
        logger.info(`Dataset metadata saved for user ${userId}, GCS path: ${gcsPath}, DB ID: ${savedDataset._id}`);
        return savedDataset.toObject();
    } catch (error) {
        logger.error(`Failed to save dataset metadata for ${gcsPath}:`, error);
        if (error.code === 11000) {
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
          .select('-schemaInfo -columnDescriptions'); // Exclude more details from list view

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
    parseHeadersFromGCS,
    getSignedUrlForDataset // <-- EXPORTED HELPER
};