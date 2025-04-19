// ================================================================================
// FILE: backend/src/features/chat/tools/get_dataset_schema.js
// PURPOSE: Tool logic for retrieving dataset schema.
// PHASE 2 UPDATE: Added specific error codes for different failure reasons.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const datasetService = require('../../datasets/dataset.service');
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {import('../../datasets/dataset.model').DatasetSchemaInfo} DatasetSchemaInfo
 */

/**
 * @typedef {object} SchemaResult
 * @property {string} description - The dataset description.
 * @property {object} columnDescriptions - Map of column names to their descriptions.
 * @property {DatasetSchemaInfo[]} schemaInfo - Array containing schema details for each column.
 * @property {number} [rowCount] - The total number of rows in the dataset (optional).
 */

/**
 * Core logic for retrieving the dataset schema, description, and column descriptions.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the target dataset.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request (for access control).
 * @returns {Promise<{status: 'success'|'error', result?: SchemaResult, error?: string, errorCode?: string}>} Result object
 */
async function get_dataset_schema_logic(args, context) {
    const { dataset_id } = args;
    const { userId } = context;

    try {
        // datasetService.getDatasetSchema is expected to handle access control (userId)
        // It should throw specific errors for not found or access denied.
        const schemaData = await datasetService.getDatasetSchema(dataset_id, userId);

        // Check if the service returned the expected data structure
        // The service itself should throw if not found/accessible, this is a safety net
        if (!schemaData) {
             logger.warn(`[Tool:get_dataset_schema] Dataset service returned no data for ${dataset_id}, User ${userId}. Assuming not found/accessible.`);
             return { status: 'error', error: `Dataset with ID ${dataset_id} not found or not accessible.`, errorCode: 'DATASET_NOT_FOUND' };
        }
        if (!schemaData.schemaInfo) {
            logger.warn(`[Tool:get_dataset_schema] Schema information (schemaInfo) missing for Dataset ${dataset_id}, User ${userId}.`);
            return { status: 'error', error: `Schema information is missing or incomplete for dataset ${dataset_id}.`, errorCode: 'SCHEMA_MISSING' };
        }

        logger.info(`[Tool:get_dataset_schema] Successfully retrieved schema for Dataset ${dataset_id}`);

        // Format the result for the agent
        const result = {
            description: schemaData.description || 'No dataset description provided.',
            columnDescriptions: schemaData.columnDescriptions || {}, // Ensure it's an object
            schemaInfo: schemaData.schemaInfo, // Array of { name, type }
            rowCount: schemaData.rowCount // Include if available
        };

        return {
            status: 'success',
            result: result
        };
    } catch (error) {
        logger.error(`[Tool:get_dataset_schema] Error retrieving schema for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });

        // Check for specific error types potentially thrown by the service
        if (error.message.includes('not found') || error.message.includes('not accessible') || error.message.includes('Access denied')) {
            return { status: 'error', error: `Dataset with ID ${dataset_id} not found or not accessible.`, errorCode: 'DATASET_NOT_FOUND' };
        }
        if (error.name === 'CastError') { // Handle invalid ObjectId format if not caught by wrapper
            return { status: 'error', error: `Invalid dataset ID format: ${dataset_id}`, errorCode: 'INVALID_ARGUMENT_FORMAT' };
        }

        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Failed to retrieve dataset schema: ${error.message}`);
        // The wrapper will add errorCode: 'TOOL_EXECUTION_ERROR'
    }
}

// Export the wrapped function
module.exports = createToolWrapper('get_dataset_schema', get_dataset_schema_logic);