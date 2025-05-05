// backend/src/features/datasets/dataset.taskHandler.js
const { parseAndStoreDataset } = require('./dataset.parser.service');
const logger = require('../../shared/utils/logger');

/**
 * Handles the worker request from Cloud Tasks for dataset parsing.
 * @param {Object} payload - Task payload containing datasetId.
 */
const workerHandler = async (payload) => {
    const { datasetId } = payload || {};
    logger.info(`[Dataset Task Handler START] Parser worker started with payload: ${JSON.stringify(payload)}`);

    if (!datasetId) {
        logger.error('[Dataset Task Handler ERROR] Invalid payload: missing datasetId.');
        return; // Acknowledge task, do nothing
    }

    try {
        // Call the main parsing and storage logic
        await parseAndStoreDataset(datasetId);
        // Success/error logging and DB updates are handled within parseAndStoreDataset
    } catch (error) {
        // Log the error, but DO NOT re-throw. The service handles DB status update.
        logger.error(`[Dataset Task Handler ERROR] parseAndStoreDataset threw an error for dataset ${datasetId}. Error: ${error.message}. Status should be updated in DB.`);
    } finally {
        logger.info(`[Dataset Task Handler END] Finished processing task for dataset ${datasetId}`);
    }
};

module.exports = { workerHandler };