const logger = require('../../../shared/utils/logger');
const datasetService = require('../../datasets/dataset.service');

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
 * Tool implementation for listing available datasets.
 * Fetches datasets accessible by the user/team.
 *
 * @async
 * @param {object} args - Tool arguments (currently unused, but reserved for future use).
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} [context.teamId] - The ID of the team context, if applicable.
 * @returns {Promise<{status: 'success'|'error', result?: ListedDataset[], error?: string}>} Result object containing:
 *   - `status`: Indicates success or error.
 *   - `result`: On success, an array of dataset objects with selected fields (_id, name, description, rowCount, columnCount).
 *   - `error`: On error, a descriptive error message.
 */
async function list_datasets(args, context) {
    const { userId, teamId } = context;
    logger.info(`[Tool:list_datasets] Called by User ${userId} (Team: ${teamId || 'N/A'})`);
    try {
        // Adapt datasetService.listDatasets to accept userId/teamId if needed,
        // or use a method that finds datasets based on ownership/sharing.
        // Assuming datasetService.listAccessibleDatasets exists or similar:
        const datasets = await datasetService.listAccessibleDatasets(userId, teamId);

        if (!datasets) {
            logger.warn(`[Tool:list_datasets] No datasets found for User ${userId}.`);
            return { status: 'success', result: [] };
        }

        // Select relevant fields to return
        const formattedDatasets = datasets.map(d => ({
            _id: d._id,
            name: d.name,
            description: d.description,
            rowCount: d.rowCount, // Assuming these fields exist on the model
            columnCount: d.schemaInfo?.length || 0
        }));

        logger.info(`[Tool:list_datasets] Found ${formattedDatasets.length} datasets for User ${userId}.`);
        return {
            status: 'success',
            result: formattedDatasets
        };
    } catch (error) {
        logger.error(`[Tool:list_datasets] Error for User ${userId}: ${error.message}`, { error });
        return {
            status: 'error',
            error: `Failed to list datasets: ${error.message}`
        };
    }
}

module.exports = list_datasets; 