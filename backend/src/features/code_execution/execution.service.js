// backend/src/features/code_execution/execution.service.js
// ** UPDATED FILE - Mark executeGeneratedCode as unsafe/unused **

const React = require('react'); // Keep requires for potential future use or testing
const ReactDOMServer = require('react-dom/server');
const Papa = require('papaparse');
const _ = require('lodash');
const Recharts = require('recharts');
const logger = require('../../shared/utils/logger');
const { getBucket } = require('../../shared/external_apis/gcs.client');

// --- SECURITY WARNING ---
// The execution method (`new Function`) is **NOT SECURE**.
// This function is DEPRECATED for the client-side worker flow. DO NOT CALL.
// --- END SECURITY WARNING ---
/**
 * @deprecated This function uses an insecure execution method and is replaced by client-side Web Worker execution. DO NOT USE IN PRODUCTION.
 */
const executeGeneratedCode = async (codeString, executionContext) => {
    logger.error("DEPRECATED executeGeneratedCode function was called. This indicates a potential issue in the calling service (e.g., prompt.service). Execution aborted.");
    return { status: 'error', message: 'Backend code execution is disabled. Execution should happen client-side.' };
    // --- Original insecure placeholder code REMOVED to prevent accidental use ---
};


/**
 * Fetches data from GCS. This might still be useful for other backend tasks or future changes,
 * but is NOT used by the core client-side report generation flow.
 */
const fetchDataForSandbox = async (gcsPath) => {
    logger.info(`[fetchDataForSandbox - Standalone] Attempting to fetch: ${gcsPath}`);
    if (!gcsPath) {
         logger.error("[fetchDataForSandbox - Standalone] Error: Received null or undefined gcsPath.");
         throw new Error("GCS path is missing.");
    }
    // ... (rest of the fetching logic remains the same as your previous version) ...
     try {
        const bucket = getBucket();
        const file = bucket.file(gcsPath);

        const [exists] = await file.exists();
        if (!exists) {
             logger.error(`[fetchDataForSandbox] Error: File not found at GCS path: ${gcsPath}`);
             throw new Error(`Dataset file not found: ${gcsPath}`);
        }
        logger.debug(`[fetchDataForSandbox] File exists at ${gcsPath}. Downloading...`);

        const [buffer] = await file.download();
        const content = buffer.toString('utf-8'); // Assume UTF-8

        logger.info(`[fetchDataForSandbox] Successfully fetched ${content.length} characters from ${gcsPath}`); // Log success and size
        return content; // Return the content string

    } catch (error) {
        logger.error(`[fetchDataForSandbox] Failed to fetch data from ${gcsPath}: ${error.message}`, error.stack); // Log stack
        throw new Error(`Could not load data file content for path: ${gcsPath}. Reason: ${error.message}`);
    }
};


// Export only the potentially reusable fetch function now
module.exports = {
    // executeGeneratedCode, // DO NOT EXPORT THE INSECURE FUNCTION
    fetchDataForSandbox
};