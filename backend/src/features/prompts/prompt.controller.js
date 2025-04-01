// backend/src/features/prompts/prompt.controller.js
// ** UPDATED FILE - Renamed handler for clarity **
const promptService = require('./prompt.service');
const logger = require('../../shared/utils/logger');

// Renamed to reflect the new core purpose
const generateAndExecuteReport = async (req, res, next) => {
    const { promptText, selectedDatasetIds } = req.body;
    const userId = req.user?._id;

    // Basic validation remains the same
    if (!userId) {
        return res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    }
    if (!promptText || typeof promptText !== 'string' || promptText.trim() === '') {
        return res.status(400).json({ status: 'error', message: 'promptText is required.' });
    }
    if (!selectedDatasetIds || !Array.isArray(selectedDatasetIds) || selectedDatasetIds.length === 0) {
        return res.status(400).json({ status: 'error', message: 'At least one dataset must be selected.' });
    }

    try {
        // Call the updated service function which now handles code gen + execution
        const result = await promptService.generateCodeAndExecute(userId, promptText, selectedDatasetIds);

        res.status(200).json({
            status: 'success',
            data: {
                // Send back the result from the execution service
                executionOutput: result.executionOutput, // e.g., HTML string or error message
                executionStatus: result.status, // 'completed' or 'error_executing'
                promptId: result.historyId,
            }
        });
    } catch (error) {
        // Log errors from the service layer (e.g., context assembly, Claude call)
        logger.error(`Error in generateAndExecuteReport for user ${userId}: ${error.message}`);
        // Pass error to the global handler (might send 500 or a specific error if handled)
        next(error);
    }
};

module.exports = {
    // Export the renamed handler
    generateAndExecuteReport,
};