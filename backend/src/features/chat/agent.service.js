// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent.service.js
// PURPOSE: Exports the main runAgent function, replaces AgentExecutor class.
// MODIFIED FILE
// ================================================================================

const logger = require('../../shared/utils/logger');
const AgentRunner = require('./agent/AgentRunner'); // Import the new runner
// Removed imports related to the old AgentExecutor class

/**
 * Main entry point to run the agent orchestration for a single chat turn.
 * This function instantiates and runs the AgentRunner.
 *
 * @async
 * @param {object} params - Parameters required for the agent run.
 * @param {string} params.userId - ID of the user initiating the chat turn.
 * @param {string|null} params.teamId - ID of the relevant team, if applicable.
 * @param {string} params.sessionId - ID of the current chat session.
 * @param {string} params.aiMessagePlaceholderId - MongoDB ObjectId of the PromptHistory document placeholder for the AI's response.
 * @param {function(string, object): void} params.sendEventCallback - The callback function used to stream events back (e.g., to a WebSocket handler or SSE stream).
 * @param {string} params.userMessage - The raw text of the user's message.
 * @param {Array<string>} params.sessionDatasetIds - An array of dataset IDs accessible within this session.
 * @param {any} [params.initialPreviousAnalysisData] - Optional: Analysis data result from a previous turn to provide context.
 * @param {string} [params.initialPreviousGeneratedCode] - Optional: Generated code from a previous turn to provide context.
 * @returns {Promise<{status: 'completed'|'error', aiResponseText?: string, aiGeneratedCode?: string, error?: string}>} A promise resolving to the final status object summarizing the turn's outcome.
 */
async function runAgent(params) {
    const {
        userId,
        teamId,
        sessionId,
        aiMessagePlaceholderId,
        sendEventCallback, // Pass the callback through
        userMessage,
        sessionDatasetIds,
        initialPreviousAnalysisData,
        initialPreviousGeneratedCode
    } = params;

    logger.info(`[agent.service runAgent] Initiating AgentRunner for Session: ${sessionId}, AI Message: ${aiMessagePlaceholderId}`);

    // Basic validation handled within AgentRunner constructor now

    try {
        // Instantiate the new AgentRunner
        const runner = new AgentRunner(
            userId,
            teamId,
            sessionId,
            aiMessagePlaceholderId,
            sendEventCallback, // Pass the callback
            { // Pass initial context object
                previousAnalysisResult: initialPreviousAnalysisData,
                previousGeneratedCode: initialPreviousGeneratedCode
            }
        );

        // Execute the agent loop using the runner
        const result = await runner.run(userMessage, sessionDatasetIds);

        logger.info(`[agent.service runAgent] AgentRunner finished for Session: ${sessionId}, AI Message: ${aiMessagePlaceholderId}. Status: ${result.status}`);
        return result;

    } catch (error) {
        // Catch any unexpected errors during runner instantiation or the run call itself
        logger.error(`[agent.service runAgent] Critical error running agent for Session ${sessionId}, Message ${aiMessagePlaceholderId}: ${error.message}`, { stack: error.stack });

        // Ensure an error status is returned
        return {
            status: 'error',
            error: `Agent failed unexpectedly: ${error.message}`
        };
    }
}

// Export only the runAgent function
module.exports = { runAgent };