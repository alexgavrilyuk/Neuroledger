// ================================================================================
// FILE: backend/src/features/chat/tools/list_datasets.js
// PURPOSE: Tool logic for listing datasets.
// PHASE 2 UPDATE: Added specific error code for service failures.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const datasetService = require('../../datasets/dataset.service');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {import('../../datasets/dataset.model').DatasetDocument} DatasetDocument
 */

/**
 * @typedef {object} ListedDataset
 * @property {string} _id - The MongoDB ObjectId of the dataset.
 * @property {string} name - The name of the dataset.
 * @property {string} [description] - The description of the dataset.
 * @property {number} [rowCount] - The number of rows in the dataset.
 * @property {number} columnCount - The number of columns in the dataset.
 */

/**
 * Core logic for listing available datasets.
 *
 * @async
 * @param {object} args - Tool arguments (currently unused, but reserved for future use).
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} [context.teamId] - The ID of the team context, if applicable.
 * @returns {Promise<{status: 'success'|'error', result?: ListedDataset[], error?: string, errorCode?: string}>} Result object
 */
async function list_datasets_logic(args, context) {
    const { userId, teamId } = context; // teamId might be null

    try {
        // Use the service function that lists accessible datasets (personal + team)
        const datasets = await datasetService.listAccessibleDatasets(userId); // Assuming service handles team access internally based on userId

        if (!datasets) {
            logger.warn(`[Tool:list_datasets] No datasets found or dataset service returned null for User ${userId}.`);
            // Return success with empty array, as this isn't necessarily an error state
            return { status: 'success', result: [] };
        }

        // Select relevant fields to return to the LLM/Agent
        const formattedDatasets = datasets.map(d => ({
            _id: d._id.toString(), // Ensure IDs are strings for JSON
            name: d.name,
            description: d.description || 'No description.',
            // rowCount: d.rowCount, // Maybe omit rowCount for brevity unless crucial
            columnCount: d.schemaInfo?.length || 0,
            isTeamDataset: !!d.teamId,
            teamName: d.teamName || null, // Assuming listAccessibleDatasets provides this
        }));

        logger.info(`[Tool:list_datasets] Found ${formattedDatasets.length} accessible datasets for User ${userId}.`);
        return {
            status: 'success',
            result: formattedDatasets // Renamed from 'datasets' to 'result' for consistency? No, keep 'result' in wrapper
        };
    } catch (error) {
        logger.error(`[Tool:list_datasets] Error fetching datasets for User ${userId}: ${error.message}`, { error });
        // Provide a generic error message and code
        throw new Error(`Failed to retrieve dataset list: ${error.message}`); // Re-throw for wrapper
        // The wrapper will add errorCode: 'TOOL_EXECUTION_ERROR'
    }
}

// Export the wrapped function
module.exports = createToolWrapper('list_datasets', list_datasets_logic);