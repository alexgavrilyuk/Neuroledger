// backend/src/features/prompts/prompt.controller.js
// ** NEW FILE **
const promptService = require('./prompt.service');
const logger = require('../../shared/utils/logger');

const generateTextResponse = async (req, res, next) => {
    const { promptText, selectedDatasetIds } = req.body;
    const userId = req.user?._id;

    if (!userId) {
        // Should be caught by 'protect' middleware, but safeguard
        return res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    }

    if (!promptText || typeof promptText !== 'string' || promptText.trim() === '') {
        return res.status(400).json({ status: 'error', message: 'promptText is required.' });
    }

    if (!selectedDatasetIds || !Array.isArray(selectedDatasetIds) || selectedDatasetIds.length === 0) {
        // For Phase 4, let's require at least one dataset selection for context
        return res.status(400).json({ status: 'error', message: 'At least one dataset must be selected.' });
    }

    try {
        const result = await promptService.createPromptResponse(userId, promptText, selectedDatasetIds);

        res.status(200).json({
            status: 'success',
            data: {
                aiResponse: result.aiResponseText,
                promptId: result.historyId, // ID of the saved history record
            }
        });
    } catch (error) {
        logger.error(`Error in generateTextResponse for user ${userId}: ${error.message}`);
        // Pass error to the global handler
        next(error);
    }
};

module.exports = {
    generateTextResponse,
};