// backend/src/features/chat/agent/ToolExecutor.js
// ENTIRE FILE - UPDATED FOR PHASE 6 FIX

const logger = require('../../../shared/utils/logger');
const path = require('path');
const fs = require('fs');

// --- Dynamic Tool Loading (No changes here) ---
const toolsDirectory = path.join(__dirname, '../tools');
const toolImplementations = {};
const knownToolNames = [];

try {
    fs.readdirSync(toolsDirectory)
        .filter(file =>
            file.endsWith('.js') &&
            file !== 'tool.definitions.js' &&
            file !== 'BaseToolWrapper.js' &&
            file !== 'tool.schemas.js' &&
            !file.startsWith('.')
        )
        .forEach(file => {
            const toolName = path.basename(file, '.js');
            let adjustedToolName = toolName;
            if (toolName === 'answer_user') adjustedToolName = '_answerUserTool';
            if (toolName === 'ask_user_for_clarification') adjustedToolName = 'ask_user_for_clarification';
            if (toolName === 'calculate_financial_ratios') adjustedToolName = 'calculate_financial_ratios';
            // Add more mappings if needed

            try {
                const toolModule = require(path.join(toolsDirectory, file));
                 if (typeof toolModule === 'function') {
                    toolImplementations[adjustedToolName] = toolModule; // Assumes exported function is wrapped
                    knownToolNames.push(adjustedToolName);
                    logger.info(`[ToolExecutor] Loaded tool: ${adjustedToolName} from ${file}`);
                 } else {
                     logger.warn(`[ToolExecutor] Failed to load tool ${adjustedToolName}: Module from ${file} does not export a function.`);
                 }
            } catch (error) {
                logger.error(`[ToolExecutor] Failed to load tool ${adjustedToolName} from ${file}: ${error.message}`, { stack: error.stack });
            }
        });
} catch (error) {
     logger.error(`[ToolExecutor] Failed to read tools directory ${toolsDirectory}: ${error.message}`, { stack: error.stack });
}
logger.info(`[ToolExecutor] Available tools: ${knownToolNames.join(', ')}`);
// --- End Tool Loading ---

class ToolExecutor {
    /**
     * Executes the specified tool.
     * Validates llmArgs using BaseToolWrapper, then merges with substitutedArgs before calling handler.
     *
     * @async
     * @param {string} toolName - The name of the tool to execute.
     * @param {object} llmArgs - The arguments provided BY THE LLM for the tool (e.g., { dataset_id: '...' }).
     * @param {object} executionContext - Context required by the tool (userId, sessionId, callbacks, etc.).
     * @param {object} [substitutedArgs={}] - Optional arguments substituted by the system (e.g., { code: '...' }).
     * @returns {Promise<object>} The result object from the executed tool.
     */
    async execute(toolName, llmArgs, executionContext, substitutedArgs = {}) {
        const { sessionId } = executionContext; // Extract sessionId for logging
        logger.debug(`[ToolExecutor ${sessionId}] Attempting to execute tool: ${toolName}`);

        const toolFn = toolImplementations[toolName];

        if (!toolFn) {
            const errorMsg = `Unknown tool requested: ${toolName}`;
            logger.error(`[ToolExecutor ${sessionId}] ${errorMsg}`);
            return { status: 'error', error: errorMsg, args: llmArgs, errorCode: 'UNKNOWN_TOOL' };
        }

        try {
            // Call the (wrapped) tool function, passing llmArgs and substitutedArgs separately
            const result = await toolFn(llmArgs, executionContext, substitutedArgs);
            logger.debug(`[ToolExecutor ${sessionId}] Tool ${toolName} execution finished via wrapper. Status: ${result.status}`);
            // The wrapped function handles merging, execution, and result formatting
            return result;
        } catch (error) {
            // This catch is a final fallback for errors during the async call to the wrapper itself
            logger.error(`[ToolExecutor ${sessionId}] Unexpected error calling wrapped toolFn for ${toolName}: ${error.message}`, { stack: error.stack, llmArgs, substitutedArgs });
            return {
                status: 'error',
                error: `Unexpected failure during tool execution call: ${error.message}`,
                args: { ...llmArgs, ...substitutedArgs }, // Report combined args on error
                errorCode: 'TOOL_WRAPPER_ERROR'
            };
        }
    }

    getKnownToolNames() {
        return [...knownToolNames];
    }
}

module.exports = ToolExecutor;