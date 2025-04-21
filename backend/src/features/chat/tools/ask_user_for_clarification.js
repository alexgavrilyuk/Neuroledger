// backend/src/features/chat/tools/ask_user_for_clarification.js
// ENTIRE FILE - NEW FOR PHASE 9

const logger = require('../../../shared/utils/logger');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * Core logic for the ask_user_for_clarification tool.
 * This tool doesn't perform an action itself, but signals the AgentRunner
 * to pause the current turn and wait for user input.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.question - The specific question to ask the user.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @returns {Promise<{status: 'success', result: { clarification_requested: boolean, question: string }}>} Result object indicating success and the question asked.
 */
async function ask_user_for_clarification_logic(args, context) {
    const { question } = args;
    const { sessionId } = context;

    // Basic validation of question done by wrapper schema
    logger.info(`[Tool:ask_user_for_clarification] Agent requesting clarification for Session ${sessionId}: "${question}"`);

    // The main effect (pausing) is handled by AgentRunner based on this tool being called.
    // Return success with the question text for potential use in the AgentRunner.
    return {
        status: 'success',
        result: { clarification_requested: true, question: question }
    };
}

// Export the wrapped function
module.exports = createToolWrapper('ask_user_for_clarification', ask_user_for_clarification_logic);