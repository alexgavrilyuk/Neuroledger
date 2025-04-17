const logger = require('../../../shared/utils/logger');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {object} FinalAnswerResult
 * @property {boolean} isFinalAnswer - Always true, signals the orchestrator.
 */

/**
 * Core logic for the answer_user tool that signals a final answer.
 * 
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.textResponse - The final textual response intended for the user (as formulated by the LLM).
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @returns {Promise<{status: 'success', result: FinalAnswerResult}>} A success status object
 */
async function answer_user_logic(args, context) {
    const { textResponse } = args;
    const { userId, sessionId } = context;

    if (typeof textResponse !== 'string' || textResponse.trim() === '') {
         logger.warn(`[Tool:_answerUserTool] Invoked with empty or invalid textResponse argument by LLM.`);
         // Still signal success, as the intent is to answer. The orchestrator should have the raw response.
         return { status: 'success', result: { isFinalAnswer: true } };
    }

    // This tool doesn't need to *do* anything with the textResponse itself,
    // the orchestrator uses the LLM's invocation of this tool as the signal to stop.
    // We just return a success status to confirm the tool was correctly called.
    return {
        status: 'success',
        result: { isFinalAnswer: true } // Explicitly signal this is the final answer
    };
}

// Export the wrapped function 
// Note: For this special tool we keep the wrapper minimal as it doesn't do dataset validation
module.exports = createToolWrapper('_answerUserTool', answer_user_logic); 