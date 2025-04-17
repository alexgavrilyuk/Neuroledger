const logger = require('../../../shared/utils/logger');
const datasetService = require('../../datasets/dataset.service');
const Papa = require('papaparse');
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {object} ParsedDataResult
 * @property {Array<object>} parsedData - An array of objects representing the rows parsed from the CSV.
 * @property {number} rowCount - The number of rows successfully parsed.
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
 * @returns {Promise<{status: 'success'|'error', result?: ParsedDataResult, error?: string}>} Result object
 */
async function parse_csv_data_logic(args, context) {
    const { dataset_id } = args;
    const { userId, sessionId } = context;

    try {
        // 1. Fetch Raw Content
        // datasetService.getRawDatasetContent should handle access control via userId
        const rawContent = await datasetService.getRawDatasetContent(dataset_id, userId);

        if (!rawContent) {
             // Check if dataset exists at all first
             const datasetExists = await datasetService.findDatasetById(dataset_id, userId);
             if (!datasetExists) {
                logger.warn(`[Tool:parse_csv_data] Dataset ${dataset_id} not found or not accessible by User ${userId}.`);
                return { status: 'error', error: `Dataset with ID ${dataset_id} not found or not accessible.` };
             } else {
                logger.warn(`[Tool:parse_csv_data] Raw content is empty for Dataset ${dataset_id}.`);
                 // Allow parsing empty content, PapaParse handles this.
                 // return { status: 'error', error: `Raw content for dataset ${dataset_id} is empty.` };
             }
        }

        // 2. Parse CSV Content
        // Use PapaParse similar to the original implementation
        const parseConfig = {
            header: true,
            dynamicTyping: true, // Attempt to infer data types
            skipEmptyLines: true,
            transformHeader: header => header.trim(), // Clean headers
            // TODO: Consider adding error handling callback `error: (err) => { ... }`
            // TODO: Consider `preview` option if only a sample is needed initially?
        };
        const parseResult = Papa.parse(rawContent || '', parseConfig); // Pass empty string if rawContent is null/undefined

        if (parseResult.errors && parseResult.errors.length > 0) {
            logger.warn(`[Tool:parse_csv_data] PapaParse encountered errors for Dataset ${dataset_id}:`, parseResult.errors);
            // Decide if partial data is acceptable or if it's a hard error
            // For now, return error if any parsing errors occur
            const errorSummary = parseResult.errors.map(e => `(${e.type}) ${e.message} [Row: ${e.row}]`).join('; ');
            return {
                status: 'error',
                error: `Failed to parse CSV data: ${errorSummary}`
            };
        }

        const parsedData = parseResult.data || [];
        const rowCount = parsedData.length;

        // Log success
        logger.info(`[Tool:parse_csv_data] Successfully parsed ${rowCount} rows for Dataset ${dataset_id}.`);

        // Return status, parsed data, and row count
        // The orchestrator will be responsible for storing parsedData if needed for subsequent steps.
        return {
            status: 'success',
            result: {
                parsedData: parsedData,
                rowCount: rowCount
            }
        };

    } catch (error) {
        logger.error(`[Tool:parse_csv_data] Error processing Dataset ${dataset_id} for User ${userId}: ${error.message}`, { error });
        // Check if it's a validation error from Mongoose/Dataset service
        if (error.name === 'ValidationError' || error.name === 'CastError') {
             return { status: 'error', error: `Invalid dataset ID format provided: ${dataset_id}` };
        }
        // Re-throw for the wrapper to catch and format consistently
        throw error;
    }
}

// Export the wrapped function
module.exports = createToolWrapper('parse_csv_data', parse_csv_data_logic); 