const logger = require('../../../shared/utils/logger');
const datasetService = require('../../datasets/dataset.service');
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {import('../../datasets/dataset.model').DatasetSchemaInfo} DatasetSchemaInfo
 */

/**
 * @typedef {object} SchemaResult
 * @property {DatasetSchemaInfo[]} schemaInfo - Array containing schema details for each column.
 * @property {number} rowCount - The total number of rows in the dataset.
 */

/**
 * Core logic for retrieving the dataset schema.
 * 
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the target dataset.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request (for access control).
 * @returns {Promise<{status: 'success'|'error', result?: SchemaResult, error?: string}>} Result object
 */
async function get_dataset_schema_logic(args, context) {
    const { dataset_id } = args;
    const { userId } = context;

    try {
        // datasetService.getDatasetSchema is expected to handle access control (userId)
        const schemaData = await datasetService.getDatasetSchema(dataset_id, userId);

        if (!schemaData || !schemaData.schemaInfo) {
            logger.warn(`[Tool:get_dataset_schema] Schema not found or invalid for Dataset ${dataset_id}, User ${userId}.`);
            // Try fetching the dataset directly to see if it exists but lacks schema
            const dataset = await datasetService.findDatasetById(dataset_id, userId);
            if (!dataset) {
                return { status: 'error', error: `Dataset with ID ${dataset_id} not found or not accessible.` };
            } else {
                 return { status: 'error', error: `Schema information is missing or incomplete for dataset ${dataset_id}. It might need to be re-uploaded or processed.` };
            }
        }

        logger.info(`[Tool:get_dataset_schema] Successfully retrieved schema for Dataset ${dataset_id}`);
        return {
            status: 'success',
            result: {
                schemaInfo: schemaData.schemaInfo, 
                rowCount: schemaData.rowCount // Pass rowCount along if available
            }
        };
    } catch (error) {
        logger.error(`[Tool:get_dataset_schema] Error for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });
        // Re-throw for the wrapper to catch and format consistently
        throw error;
    }
}

// Export the wrapped function
module.exports = createToolWrapper('get_dataset_schema', get_dataset_schema_logic); 