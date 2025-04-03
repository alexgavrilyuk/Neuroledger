// ================================================================================
// FILE: NeuroLedger/backend/src/features/prompts/prompt.controller.js
// ================================================================================
// backend/src/features/prompts/prompt.controller.js
// ** CORRECT VERSION FOR IFRAME: Returns aiGeneratedCode **
const promptService = require('./prompt.service');
const logger = require('../../shared/utils/logger');

const generateAndExecuteReport = async (req, res, next) => {
    const { promptText, selectedDatasetIds } = req.body;
    const userId = req.user?._id;

    if (!userId) { return res.status(401).json({ status: 'error', message: 'User not authenticated.' }); }
    if (!promptText || typeof promptText !== 'string' || promptText.trim() === '') { return res.status(400).json({ status: 'error', message: 'promptText is required.' });}
    if (!selectedDatasetIds || !Array.isArray(selectedDatasetIds) || selectedDatasetIds.length === 0) { return res.status(400).json({ status: 'error', message: 'At least one dataset must be selected.' }); }

    try {
        // Call the service function which now generates CODE
        const result = await promptService.generateCode(userId, promptText, selectedDatasetIds);

        // Check if the service itself returned an error status
        if (result.status === 'error_generating') {
             logger.error(`Code generation failed for user ${userId}, promptId: ${result.promptId}. Error: ${result.errorMessage}`);
             return res.status(500).json({
                 status: 'error',
                 message: result.errorMessage || 'Failed to generate AI code.',
                 data: { promptId: result.promptId }
             });
        }

        // --- Return aiGeneratedCode ---
        res.status(200).json({
            status: 'success',
            data: {
                aiGeneratedCode: result.aiGeneratedCode, // Send the CODE string
                promptId: result.promptId
            }
        });
        // --- END ---

    } catch (error) {
        logger.error(`Unexpected error in prompt controller for user ${userId}: ${error.message}`);
        next(error);
    }
};

module.exports = {
    generateAndExecuteReport,
};