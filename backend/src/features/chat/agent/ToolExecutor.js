// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent/ToolExecutor.js
// PURPOSE: Loads and executes agent tools. Assumes tools are wrapped.
// MODIFIED: Ignore BaseToolWrapper.js during dynamic loading.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const path = require('path');
const fs = require('fs');

// --- Dynamic Tool Loading ---
const toolsDirectory = path.join(__dirname, '../tools');
/** @type {Object<string, Function>} */
const toolImplementations = {};
const knownToolNames = [];

try {
    fs.readdirSync(toolsDirectory)
        // **** MODIFIED FILTER ****
        .filter(file =>
            file.endsWith('.js') &&
            file !== 'tool.definitions.js' && // Ignore definitions
            file !== 'BaseToolWrapper.js' && // Ignore the wrapper utility
            !file.startsWith('.') // Ignore hidden files
        )
        // ***********************
        .forEach(file => {
            const toolName = path.basename(file, '.js');
            // Adjust tool name if filename differs (e.g., answer_user.js -> _answerUserTool)
            const adjustedToolName = toolName === 'answer_user' ? '_answerUserTool' : toolName;
            try {
                const toolModule = require(path.join(toolsDirectory, file));
                 if (typeof toolModule === 'function') {
                    toolImplementations[adjustedToolName] = toolModule;
                    knownToolNames.push(adjustedToolName);
                    logger.info(`[ToolExecutor] Loaded tool: ${adjustedToolName} from ${file}`);
                 } else {
                     logger.warn(`[ToolExecutor] Failed to load tool ${adjustedToolName}: Module from ${file} does not export a function.`);
                 }
            } catch (error) {
                // Log the detailed error including the stack if require fails
                logger.error(`[ToolExecutor] Failed to load tool ${adjustedToolName} from ${file}: ${error.message}`, { stack: error.stack });
            }
        });
} catch (error) {
     logger.error(`[ToolExecutor] Failed to read tools directory ${toolsDirectory}: ${error.message}`, { stack: error.stack });
}
logger.info(`[ToolExecutor] Available tools: ${knownToolNames.join(', ')}`);
// --- End Tool Loading ---

/**
 * Responsible for executing agent tools based on name and arguments.
 * It uses the dynamically loaded tool implementations.
 */
class ToolExecutor {
    /**
     * Executes the specified tool with the given arguments and execution context.
     * Assumes the tool functions loaded into `toolImplementations` are already wrapped
     * by `createToolWrapper` (from Phase 2) to handle standard validation/error handling.
     *
     * @async
     * @param {string} toolName - The name of the tool to execute.
     * @param {object} args - The arguments provided by the LLM for the tool.
     * @param {object} executionContext - Context required by the tool (e.g., userId, sessionId, callbacks).
     * @param {string} executionContext.userId - The ID of the user.
     * @param {string} [executionContext.teamId] - The ID of the team context (optional).
     * @param {string} executionContext.sessionId - The ID of the chat session.
     * @param {any} [executionContext.analysisResult] - Result from previous code execution (passed conditionally).
     * @param {object} [executionContext.datasetSchemas] - Preloaded schemas (passed conditionally).
     * @param {function(string): Promise<Array<object>|null>} [executionContext.getParsedDataCallback] - Callback for tools needing parsed data.
     * @returns {Promise<object>} The result object from the executed tool (includes status, result/error, args).
     */
    async execute(toolName, args, executionContext) {
        logger.debug(`[ToolExecutor ${executionContext.sessionId}] Attempting to execute tool: ${toolName}`, { args });

        const toolFn = toolImplementations[toolName];

        if (!toolFn) {
            const errorMsg = `Unknown tool requested: ${toolName}`;
            logger.error(`[ToolExecutor ${executionContext.sessionId}] ${errorMsg}`);
            // Return structure consistent with wrapped tools
            return { status: 'error', error: errorMsg, args };
        }

        try {
            // Call the (wrapped) tool function
            const result = await toolFn(args, executionContext);
            logger.debug(`[ToolExecutor ${executionContext.sessionId}] Tool ${toolName} execution finished. Status: ${result.status}`);
            // The wrapped tool function already formats the result correctly
            return result;
        } catch (error) {
            // This catch block is a fallback for truly unexpected errors *during* the async call itself,
            // although the wrapper inside toolFn should catch most standard execution errors.
            logger.error(`[ToolExecutor ${executionContext.sessionId}] Unexpected error during toolFn call for ${toolName}: ${error.message}`, { stack: error.stack, toolArgs: args });
            return {
                status: 'error',
                error: `Unexpected failure during tool execution: ${error.message}`,
                args
            };
        }
    }

    /**
     * Returns an array of known tool names loaded by the executor.
     * @returns {string[]} Array of tool names.
     */
    getKnownToolNames() {
        return knownToolNames;
    }
}

module.exports = ToolExecutor;