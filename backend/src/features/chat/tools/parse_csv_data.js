// ================================================================================
// FILE: backend/src/features/chat/tools/parse_csv_data.js
// PURPOSE: Tool logic for parsing CSV data from GCS.
// CORRECTION: Return the actual parsedData array in the result.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const datasetService = require('../../datasets/dataset.service');
const Papa = require('papaparse');
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {object} ParsedDataResult
 * @property {Array<object>} parsedData - An array of objects representing the rows parsed from the CSV.
 * @property {number} rowCount - The number of rows successfully parsed.
 * @property {string} summary - A summary message.
 */

/**
 * Core logic for parsing the raw CSV content of a specific dataset.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the target dataset.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request (for access control).
 * @param {string} context.sessionId - The ID of the current chat session (for logging).
 * @returns {Promise<{status: 'success'|'error', result?: ParsedDataResult, error?: string, errorCode?: string}>} Result object
 */
async function parse_csv_data_logic(args, context) {
    const { dataset_id } = args;
    const { userId, sessionId } = context;

    try {
        // 1. Fetch Raw Content
        // datasetService.getRawDatasetContent handles access control via userId
        const rawContent = await datasetService.getRawDatasetContent(dataset_id, userId);

        // rawContent could be an empty string if the file exists but is empty
        if (rawContent === null || rawContent === undefined) {
            // This case should ideally be caught by getRawDatasetContent throwing an error
             logger.warn(`[Tool:parse_csv_data] Raw content fetch returned null/undefined for Dataset ${dataset_id}. Assuming not found/accessible.`);
             return { status: 'error', error: `Dataset with ID ${dataset_id} content could not be retrieved or is inaccessible.`, errorCode: 'DATA_FETCH_FAILED' };
        }

        // 2. Parse CSV Content
        const parseConfig = {
            header: true,
            dynamicTyping: true, // Attempt to infer data types
            skipEmptyLines: true,
            transformHeader: header => header.trim(), // Clean headers
        };
        const parseResult = Papa.parse(rawContent, parseConfig);

        if (parseResult.errors && parseResult.errors.length > 0) {
            logger.warn(`[Tool:parse_csv_data] PapaParse encountered errors for Dataset ${dataset_id}:`, parseResult.errors);
            const errorSummary = parseResult.errors.map(e => `(${e.type}) ${e.message} [Row: ${e.row}]`).slice(0, 5).join('; '); // Limit error summary
            return {
                status: 'error',
                error: `Failed to parse CSV data. First few errors: ${errorSummary}`,
                errorCode: 'CSV_PARSE_ERROR'
            };
        }

        const parsedData = parseResult.data || [];
        const rowCount = parsedData.length;

        // Log success
        logger.info(`[Tool:parse_csv_data] Successfully parsed ${rowCount} rows for Dataset ${dataset_id}.`);

        // Return status, parsed data, and row count
        // Orchestrator stores parsedData in intermediate state.
        return {
            status: 'success',
            // *** CORRECTED: Return parsedData array ***
            result: {
                parsedData: parsedData, // Pass the actual data array
                rowCount: rowCount,
                summary: `Successfully parsed ${rowCount} rows.` // Provide summary
            }
            // *** END CORRECTION ***
        };

    } catch (error) {
        logger.error(`[Tool:parse_csv_data] Error processing Dataset ${dataset_id} for User ${userId}: ${error.message}`, { error });

        // Check for specific error types potentially thrown by the service
        if (error.message.includes('not found') || error.message.includes('inaccessible') || error.message.includes('Access denied')) {
             return { status: 'error', error: `Dataset with ID ${dataset_id} not found or not accessible.`, errorCode: 'DATASET_NOT_FOUND' };
        }
         if (error.message.includes('Failed to retrieve dataset content')) {
             return { status: 'error', error: `Failed to retrieve content for dataset ${dataset_id}. The file might be missing or corrupted in storage.`, errorCode: 'DATA_FETCH_FAILED' };
         }
         if (error.name === 'CastError') { // Handle invalid ObjectId format if not caught by wrapper
             return { status: 'error', error: `Invalid dataset ID format: ${dataset_id}`, errorCode: 'INVALID_ARGUMENT_FORMAT' };
         }

        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Failed to parse dataset content: ${error.message}`);
        // The wrapper will add errorCode: 'TOOL_EXECUTION_ERROR'
    }
}

// Export the wrapped function
module.exports = createToolWrapper('parse_csv_data', parse_csv_data_logic);