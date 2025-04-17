/**
 * @fileoverview This module provides a higher-order function to standardize tool execution,
 * including common validation, error handling, and logging patterns across all tools.
 */

const { Types } = require('mongoose');
const logger = require('../../../shared/utils/logger');

/**
 * Creates a standardized wrapper around tool implementation functions to handle
 * common validation, error handling, and logging.
 * 
 * @param {string} toolName - The name of the tool being wrapped (for logging/identification)
 * @param {Function} handlerFn - The actual tool implementation function that contains the core logic
 * @returns {Function} A wrapped function that handles standard validation and error handling
 */
function createToolWrapper(toolName, handlerFn) {
    return async (args, context) => {
        const { userId, sessionId } = context;
        logger.info(`[ToolWrapper:${toolName}] Called by User ${userId} in Session ${sessionId} with args:`, args);

        // --- Standard Argument Validation ---
        if (args && args.hasOwnProperty('dataset_id') && (!args.dataset_id || !Types.ObjectId.isValid(args.dataset_id))) {
            const errorMsg = `Invalid or missing dataset_id argument for tool ${toolName}.`;
            logger.warn(`[ToolWrapper:${toolName}] ${errorMsg}`);
            return { status: 'error', error: errorMsg, args };
        }

        try {
            const result = await handlerFn(args, context); // Execute the specific tool logic

            // --- Standard Result Validation ---
            if (typeof result !== 'object' || !result.status) {
                logger.error(`[ToolWrapper:${toolName}] Tool returned invalid result structure:`, result);
                return { status: 'error', error: `Tool ${toolName} returned an invalid result.`, args };
            }
            
            logger.info(`[ToolWrapper:${toolName}] Execution successful. Status: ${result.status}`);
            return { ...result, args }; // Ensure args are passed back
        } catch (error) {
            logger.error(`[ToolWrapper:${toolName}] Uncaught error during execution: ${error.message}`, { stack: error.stack, toolArgs: args });
            return {
                status: 'error',
                error: `Tool execution failed unexpectedly: ${error.message}`,
                args
            };
        }
    };
}

module.exports = { createToolWrapper }; 