// backend/src/features/prompts/prompt.controller.js
// ** CORRECTED FILE - Call the correct service function **
const promptService = require('./prompt.service');
const logger = require('../../shared/utils/logger');

// Controller name can stay the same as it handles the overall request flow
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
        // --- FIX: Call the correct service function name ---
        // Call the service function which now ONLY generates code
        const result = await promptService.generateCode(userId, promptText, selectedDatasetIds);
        // --- END FIX ---

        // Check if the service itself returned an error status
        if (result.status === 'error_generating') {
             logger.error(`Code generation failed for user ${userId}, promptId: ${result.promptId}. Error: ${result.errorMessage}`);
             // Send a specific error response back
             return res.status(500).json({
                 status: 'error',
                 message: result.errorMessage || 'Failed to generate AI code.',
                 data: { promptId: result.promptId } // Include promptId if available
             });
        }

        // If successful, send back the generated code and prompt ID
        res.status(200).json({
            status: 'success',
            data: {
                aiGeneratedCode: result.aiGeneratedCode,
                promptId: result.promptId,
                // executionStatus is no longer relevant from backend
            }
        });
    } catch (error) {
        // Catch any unexpected errors from the service layer
        logger.error(`Unexpected error in prompt controller for user ${userId}: ${error.message}`);
        // Pass error to the global handler
        next(error);
    }
};

module.exports = {
    // Export the handler
    generateAndExecuteReport,
};