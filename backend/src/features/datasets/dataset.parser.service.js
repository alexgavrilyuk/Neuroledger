// backend/src/features/datasets/dataset.parser.service.js
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb'); // Use driver's GridFSBucket
const Dataset = require('./dataset.model');
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const path = require('path');
const { Readable } = require('stream');
const { getBucket: getGCSBucket } = require('../../shared/external_apis/gcs.client'); // GCS bucket

// Helper to create a readable stream from JSON array for GridFS upload
function jsonArrayStream(dataArray) {
    let index = 0;
    const readable = new Readable({
        read() {
            if (index === 0) this.push('['); // Start JSON array
            if (index < dataArray.length) {
                const obj = dataArray[index];
                // Attempt to stringify, handle potential circular references gracefully
                let jsonString;
                try {
                    jsonString = JSON.stringify(obj);
                } catch (stringifyError) {
                    logger.warn(`[jsonArrayStream] Skipping object at index ${index} due to stringify error: ${stringifyError.message}`);
                    // Push a placeholder or skip? Let's push null for now.
                    jsonString = 'null';
                }
                this.push(index === 0 ? jsonString : `,${jsonString}`);
                index++;
            } else {
                this.push(']'); // End JSON array
                this.push(null); // Signal end of stream
            }
        }
    });
    return readable;
}

/**
 * Downloads, parses, and stores dataset content as JSON in GridFS.
 * Updates the Dataset document status and GridFS ID reference.
 * @param {string} datasetId - The ID of the dataset document.
 */
const parseAndStoreDataset = async (datasetId) => {
    logger.info(`[Parser Service START] Processing Dataset ${datasetId}`);
    let dataset; // Define dataset in outer scope for final error update
    let gridFsFileId = null; // To store the ID for cleanup on error

    try {
        dataset = await Dataset.findById(datasetId);
        if (!dataset || !dataset.gcsPath) {
            logger.error(`[Parser Service ERROR] Dataset ${datasetId} metadata not found or missing GCS path.`);
            throw new Error(`Dataset ${datasetId} metadata not found or missing GCS path.`);
        }
        logger.debug(`[Parser Service] Dataset ${datasetId} current status: ${dataset.parsedDataStatus}`);

        // Allow retrying if status is 'error' or 'not_parsed' or 'queued'
        if (dataset.parsedDataStatus === 'completed') {
            logger.warn(`[Parser Service] Dataset ${datasetId} status is already 'completed', skipping parsing.`);
            return;
        }
         if (dataset.parsedDataStatus === 'processing') {
             logger.warn(`[Parser Service] Dataset ${datasetId} status is already 'processing', skipping duplicate task.`);
             return;
         }

        // Mark as processing
        dataset.parsedDataStatus = 'processing';
        dataset.parsedDataError = null;
        dataset.parsedDataGridFSId = null;
        logger.debug(`[Parser Service] Updating Dataset ${datasetId} status to 'processing'.`);
        await dataset.save(); // Save immediately to reflect processing state

        let parsedData = null;
        let headers = [];
        const gcsPath = dataset.gcsPath;
        const fileExtension = path.extname(gcsPath).toLowerCase();

        // 1. Download from GCS
        logger.debug(`[Parser Service] Downloading ${gcsPath} from GCS for Dataset ${datasetId}`);
        const bucket = getGCSBucket();
        const file = bucket.file(gcsPath);
        const [exists] = await file.exists();
        if (!exists) { throw new Error(`GCS file not found at path: ${gcsPath}`); }
        const [buffer] = await file.download();
        logger.debug(`[Parser Service] Downloaded ${buffer.length} bytes for Dataset ${datasetId}`);

        // 2. Parse based on extension
        if (fileExtension === '.csv' || fileExtension === '.tsv') {
            const fileContent = buffer.toString('utf8');
            logger.debug(`[Parser Service] CSV content snippet for ${datasetId}: ${fileContent.substring(0, 200)}...`);
            const result = Papa.parse(fileContent, {
                header: true, dynamicTyping: true, skipEmptyLines: true,
                transformHeader: header => header.trim()
            });
            if (result.errors.length > 0) {
                 logger.error(`[Parser Service] CSV parsing errors for ${datasetId}:`, result.errors);
                 throw new Error(`CSV parsing errors: ${result.errors.map(e => e.message).join(', ')}`);
            }
            parsedData = result.data;
            headers = result.meta?.fields || [];
            logger.debug(`[Parser Service] Parsed CSV for Dataset ${datasetId}, Rows: ${parsedData?.length}, Headers: ${headers.join(', ')}`);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) throw new Error('Excel file contains no sheets.');
            const worksheet = workbook.Sheets[firstSheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
            if (!rawData || rawData.length < 1) throw new Error('Excel sheet is empty or unreadable.');
            headers = rawData[0].map(h => String(h || '').trim());
            const jsonData = rawData.slice(1).map(row => {
                const obj = {};
                headers.forEach((header, index) => { if (header) { obj[header] = row[index] !== undefined ? row[index] : null; } });
                return obj;
            });
             parsedData = jsonData;
            logger.debug(`[Parser Service] Parsed Excel for Dataset ${datasetId}, Rows: ${parsedData?.length}, Headers: ${headers.join(', ')}`);
        } else { throw new Error(`Unsupported file type for parsing: ${fileExtension}`); }

        if (!parsedData || !Array.isArray(parsedData)) { throw new Error('Parsing resulted in invalid data structure.'); }
        if (headers.length === 0 && parsedData.length > 0) { headers = Object.keys(parsedData[0]); logger.warn(`[Parser Service] Headers were empty, inferred from first data row: ${headers.join(', ')}`); }
        if (headers.length === 0) { logger.warn(`[Parser Service] No headers found or inferred for dataset ${datasetId}. Schema will be empty.`); }

        // 3. Stream parsed data to GridFS
        logger.debug(`[Parser Service] Uploading parsed JSON (${parsedData.length} rows) to GridFS for Dataset ${datasetId}`);
        const db = mongoose.connection.db;
        const bucketName = 'parsed_datasets';
        const gridfsBucket = new GridFSBucket(db, { bucketName: bucketName });
        const filename = `${datasetId}.json`;

        const existingFiles = await gridfsBucket.find({ filename: filename }).toArray();
        for (const existingFile of existingFiles) { logger.warn(`[Parser Service] Deleting existing GridFS file ${existingFile._id} for ${filename}`); await gridfsBucket.delete(existingFile._id); }

        const sourceStream = jsonArrayStream(parsedData);
        const uploadStream = gridfsBucket.openUploadStream(filename, {
            contentType: 'application/json',
            metadata: { datasetId: datasetId.toString(), originalGcsPath: gcsPath }
        });
        gridFsFileId = uploadStream.id; // Store ID immediately

        await new Promise((resolve, reject) => {
            sourceStream.pipe(uploadStream)
                .on('error', (err) => { logger.error(`[Parser Service] GridFS upload stream error for ${filename}: ${err.message}`); reject(new Error(`GridFS upload failed: ${err.message}`)); })
                .on('finish', () => { logger.info(`[Parser Service] GridFS upload finished for ${filename}, ID: ${uploadStream.id}`); resolve(); });
        });

        // 4. Update Dataset Document
        dataset.parsedDataStatus = 'completed';
        dataset.parsedDataGridFSId = gridFsFileId;
        dataset.parsedDataError = null;
        // Update schemaInfo based on parsed headers
        dataset.schemaInfo = headers.map(headerName => ({
            name: headerName,
            type: dataset.schemaInfo?.find(col => col.name === headerName)?.type || 'string' // Keep existing type if possible
        }));
        logger.debug(`[Parser Service] Updating schemaInfo for ${datasetId} with ${dataset.schemaInfo.length} columns.`);
        await dataset.save();
        logger.info(`[Parser Service] Dataset ${datasetId} marked as parsing completed. GridFS ID: ${gridFsFileId}`);

    } catch (error) {
        logger.error(`[Parser Service ERROR] Failed during parse/store for Dataset ${datasetId}: ${error.message}`, error);
        if (gridFsFileId) {
            try {
                const db = mongoose.connection.db;
                const bucket = new GridFSBucket(db, { bucketName: 'parsed_datasets' });
                await bucket.delete(gridFsFileId);
                logger.info(`[Parser Service] Cleaned up GridFS file ${gridFsFileId} after error.`);
            } catch (cleanupError) {
                logger.error(`[Parser Service] Failed to cleanup GridFS file ${gridFsFileId} after error: ${cleanupError.message}`);
            }
        }
        if (dataset) { // Ensure dataset object exists before trying to update
            try {
                await Dataset.findByIdAndUpdate(datasetId, {
                    $set: {
                        parsedDataStatus: 'error',
                        parsedDataError: error.message,
                        parsedDataGridFSId: null,
                        schemaInfo: [] // Clear schema on error
                    }
                });
                 logger.info(`[Parser Service] Updated dataset ${datasetId} status to 'error' in DB.`);
            } catch (dbError) {
                logger.error(`[Parser Service] CRITICAL: Failed to update dataset ${datasetId} with parsing error: ${dbError.message}`);
            }
        } else {
             logger.error(`[Parser Service] CRITICAL: Cannot update dataset status for ${datasetId} because metadata was not found initially.`);
        }
        // Do NOT re-throw the error here, let the task handler finish gracefully.
    } finally {
         logger.info(`[Parser Service END] Finished processing Dataset ${datasetId}`);
    }
};

module.exports = { parseAndStoreDataset };