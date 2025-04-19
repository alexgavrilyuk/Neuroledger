// ================================================================================
// FILE: backend/src/features/chat/tools/answer_user.js
// PURPOSE: Tool logic for signaling a final answer.
// PHASE 2 UPDATE: No specific error codes needed, validation handled by wrapper.
// ================================================================================

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

    // Argument validation (presence of textResponse) is handled by the BaseToolWrapper via schema

    logger.info(`[Tool:_answerUserTool] Signaling final answer for Session ${sessionId}.`);

    // This tool's primary purpose is to signal the end state.
    // The orchestrator/runner uses the fact that this tool was called.
    // The actual text response is usually taken from the LLM's output that triggered this tool call.
    return {
        status: 'success',
        result: { isFinalAnswer: true } // Explicitly signal this is the final answer
    };
}

// Export the wrapped function
// The wrapper handles basic validation (like ensuring textResponse exists).
module.exports = createToolWrapper('_answerUserTool', answer_user_logic);