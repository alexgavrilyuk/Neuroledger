// backend/src/features/chat/tools/parse_csv_data.js
const logger = require('../../../shared/utils/logger');
const Dataset = require('../../datasets/dataset.model'); // Import Dataset model
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * Core logic for checking the parsing status of a dataset.
 * This tool no longer performs parsing itself.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the target dataset.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @returns {Promise<{status: 'success'|'error', result?: {summary: string}, error?: string, errorCode?: string}>} Result object
 */
async function parse_csv_data_logic(args, context) {
    const { dataset_id } = args;
    const { userId } = context; // Keep userId for potential future access checks

    try {
        // Find the dataset metadata, only selecting necessary fields
        const dataset = await Dataset.findById(dataset_id)
            .select('parsedDataStatus parsedDataError ownerId teamId') // Select status, error, and ownership fields
            .lean();

        if (!dataset) {
            return { status: 'error', error: `Dataset metadata not found for ID ${dataset_id}.`, errorCode: 'DATASET_NOT_FOUND' };
        }

        // Optional: Add access check here if needed, though subsequent tools will check anyway
        // let hasAccess = dataset.ownerId.toString() === userId.toString();
        // if (!hasAccess && dataset.teamId) { ... check team membership ... }
        // if (!hasAccess) return { status: 'error', error: `Access denied to dataset ${dataset_id}.`, errorCode: 'ACCESS_DENIED' };

        logger.info(`[Tool:parse_csv_data] Checking parsed data status for Dataset ${dataset_id}. Status: ${dataset.parsedDataStatus}`);

        switch (dataset.parsedDataStatus) {
            case 'completed':
                return { status: 'success', result: { summary: `Dataset ${dataset_id} is parsed and ready for analysis.` } };
            case 'queued':
            case 'processing':
                return { status: 'error', error: `Dataset ${dataset_id} is currently being processed. Please try again shortly.`, errorCode: 'PARSING_IN_PROGRESS' };
            case 'error':
                return { status: 'error', error: `Dataset ${dataset_id} encountered an error during parsing: ${dataset.parsedDataError || 'Unknown parsing error'}. Cannot proceed with analysis.`, errorCode: 'PARSING_FAILED' };
            case 'not_parsed':
            default:
                 logger.error(`[Tool:parse_csv_data] Dataset ${dataset_id} has unexpected status 'not_parsed' or unknown.`);
                 return { status: 'error', error: `Dataset ${dataset_id} has not been parsed yet. Parsing should happen automatically after upload. Please wait or check dataset status.`, errorCode: 'PARSING_NOT_STARTED' };
        }
    } catch (error) {
        logger.error(`[Tool:parse_csv_data] Error checking status for Dataset ${dataset_id}: ${error.message}`, { error });
         if (error.name === 'CastError') { return { status: 'error', error: `Invalid dataset ID format: ${dataset_id}`, errorCode: 'INVALID_ARGUMENT_FORMAT' }; }
        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Failed to check dataset parsing status: ${error.message}`);
    }
}

// Export the wrapped function
module.exports = createToolWrapper('parse_csv_data', parse_csv_data_logic);