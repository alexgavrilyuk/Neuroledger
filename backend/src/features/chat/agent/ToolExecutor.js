// backend/src/features/chat/agent/ToolExecutor.js
// ENTIRE FILE - UPDATED FOR PHASE 12 LOGGING

const logger = require('../../../shared/utils/logger');
const path = require('path');
const fs = require('fs');

// --- Dynamic Tool Loading ---
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
            // Map filenames to tool names used in definitions/schemas
            if (toolName === 'answer_user') adjustedToolName = '_answerUserTool';
            else if (toolName === 'ask_user_for_clarification') adjustedToolName = 'ask_user_for_clarification';
            else if (toolName === 'calculate_financial_ratios') adjustedToolName = 'calculate_financial_ratios';
            else if (toolName === 'execute_analysis_code') adjustedToolName = 'execute_analysis_code';
            else if (toolName === 'generate_analysis_code') adjustedToolName = 'generate_analysis_code';
            else if (toolName === 'generate_report_code') adjustedToolName = 'generate_report_code';
            else if (toolName === 'get_dataset_schema') adjustedToolName = 'get_dataset_schema';
            else if (toolName === 'list_datasets') adjustedToolName = 'list_datasets';
            else if (toolName === 'parse_csv_data') adjustedToolName = 'parse_csv_data';
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
        const { sessionId, traceId } = executionContext; // Extract traceId for logging
        logger.debug(`[Trace:${traceId}] [ToolExecutor ${sessionId}] Attempting to execute tool: ${toolName}`);

        const toolFn = toolImplementations[toolName];

        if (!toolFn) {
            const errorMsg = `Unknown tool requested: ${toolName}`;
            logger.error(`[Trace:${traceId}] [ToolExecutor ${sessionId}] ${errorMsg}`);
            return { status: 'error', error: errorMsg, args: llmArgs, errorCode: 'UNKNOWN_TOOL' };
        }

        try {
            // PHASE 12: Add debug log before calling the wrapped function
            logger.debug(`[Trace:${traceId}] [ToolExecutor ${sessionId}] Calling wrapped function for tool: ${toolName}`);
            const result = await toolFn(llmArgs, executionContext, substitutedArgs);
            // PHASE 12: Add debug log after receiving result from wrapper
            logger.debug(`[Trace:${traceId}] [ToolExecutor ${sessionId}] Tool ${toolName} execution finished via wrapper. Status: ${result.status}`);
            return result;
        } catch (error) {
            logger.error(`[Trace:${traceId}] [ToolExecutor ${sessionId}] Unexpected error calling wrapped toolFn for ${toolName}: ${error.message}`, { stack: error.stack, llmArgs, substitutedArgs });
            return {
                status: 'error',
                error: `Unexpected failure during tool execution call: ${error.message}`,
                args: { ...llmArgs, ...substitutedArgs },
                errorCode: 'TOOL_WRAPPER_ERROR'
            };
        }
    }

    getKnownToolNames() {
        return [...knownToolNames];
    }
}

module.exports = ToolExecutor;