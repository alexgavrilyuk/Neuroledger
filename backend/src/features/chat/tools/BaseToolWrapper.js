// backend/src/features/chat/agent/BaseToolWrapper.js
// ENTIRE FILE - UPDATED FOR PHASE 6 FIX

/**
 * @fileoverview This module provides a higher-order function to standardize tool execution,
 * including common validation using Ajv, error handling, and logging patterns across all tools.
 * Handles merging LLM args with system-substituted args (like generated code) after validation.
 */

const { Types } = require('mongoose');
const logger = require('../../../shared/utils/logger');
const Ajv = require('ajv');
const toolSchemas = require('../tools/tool.schemas'); // Import the raw schemas

// Compile schemas efficiently
const ajv = new Ajv({ allErrors: true, useDefaults: true });
const compiledSchemas = {};

// Helper function to map schema names (camelCase) to tool names (snake_case)
function schemaNameToToolName(schemaName) {
    const match = schemaName.match(/^(.*)ArgsSchema$/);
    if (!match || !match[1]) return null;
    let toolName = match[1];
    toolName = toolName.replace(/([A-Z])/g, (g) => `_${g[0].toLowerCase()}`);
    if (toolName.startsWith('_') && toolName.length > 1) {
        if (!['_answerUserTool', 'ask_user_for_clarification'].includes(toolName)) { // Add other tools starting with _ if needed
            toolName = toolName.substring(1);
        }
    }
    // Specific overrides
    if (schemaName === 'answerUserToolArgsSchema') return '_answerUserTool';
    if (schemaName === 'askUserForClarificationArgsSchema') return 'ask_user_for_clarification';
    if (schemaName === 'calculateFinancialRatiosArgsSchema') return 'calculate_financial_ratios';
    return toolName;
}

for (const schemaName in toolSchemas) {
    const toolName = schemaNameToToolName(schemaName);
    if (toolName) {
        try {
            compiledSchemas[toolName] = ajv.compile(toolSchemas[schemaName]);
            logger.debug(`[BaseToolWrapper] Compiled schema for tool: ${toolName}`);
        } catch (compileError) {
            logger.error(`[BaseToolWrapper] Failed to compile schema '${schemaName}' for tool ${toolName}: ${compileError.message}`);
        }
    } else {
         logger.warn(`[BaseToolWrapper] Could not determine tool name from schema name: ${schemaName}`);
    }
}
logger.info(`[BaseToolWrapper] Ajv initialized and ${Object.keys(compiledSchemas).length} tool argument schemas compiled.`);

function formatAjvErrors(errors) {
    if (!errors) return 'Unknown validation error.';
    return errors.map(err => {
        const path = err.instancePath || (err.keyword === 'required' ? `/${err.params.missingProperty}` : '/');
        return `${path}: ${err.message}`;
    }).join('; ');
}

/**
 * Creates a standardized wrapper around tool implementation functions.
 * Validates `llmArgs` against the schema, then merges `llmArgs` with `substitutedArgs`
 * before passing the combined arguments to the `handlerFn`.
 *
 * @param {string} toolName - The name of the tool being wrapped.
 * @param {Function} handlerFn - The actual tool implementation function.
 * @returns {Function} A wrapped function: async (llmArgs, context, substitutedArgs) => result.
 */
function createToolWrapper(toolName, handlerFn) {
    // The returned function now accepts an optional substitutedArgs
    return async (llmArgs, context, substitutedArgs = {}) => {
        const { userId, sessionId } = context;
        // Log sanitized LLM args and substituted args separately
        const loggedLlmArgs = { ...llmArgs };
        // Sanitize sensitive info if needed before logging
        logger.info(`[ToolWrapper:${toolName}] Called by User ${userId} in Session ${sessionId}. LLM Args:`, loggedLlmArgs);
        if (Object.keys(substitutedArgs).length > 0) {
            const loggedSubstituted = { ...substitutedArgs };
             if (loggedSubstituted.code) loggedSubstituted.code = '[code omitted]';
            logger.info(`[ToolWrapper:${toolName}] System Substituted Args:`, loggedSubstituted);
        }

        // --- Argument Validation using Compiled Schemas (on llmArgs ONLY) ---
        const validate = compiledSchemas[toolName];
        if (validate) {
            const argsToValidate = (llmArgs && typeof llmArgs === 'object') ? llmArgs : {};
            const isValid = validate(argsToValidate);
            if (!isValid) {
                const errorMsg = `Invalid arguments provided by LLM for tool ${toolName}.`;
                const formattedErrors = formatAjvErrors(validate.errors);
                logger.warn(`[ToolWrapper:${toolName}] Validation Failed. ${errorMsg} Errors: ${formattedErrors}`, { providedArgs: llmArgs });
                return {
                    status: 'error',
                    error: `${errorMsg} Details: ${formattedErrors}`,
                    args: argsToValidate, // Return the args that failed validation
                    errorCode: 'INVALID_ARGUMENT'
                };
            }
            logger.debug(`[ToolWrapper:${toolName}] LLM arguments successfully validated against schema.`);
        } else {
            logger.warn(`[ToolWrapper:${toolName}] No compiled argument schema found. Skipping validation.`);
        }
        // --- End Argument Validation ---

        // --- Standard MongoDB ObjectId Check (keep for dataset_id in llmArgs) ---
         if (llmArgs && llmArgs.hasOwnProperty('dataset_id') && llmArgs.dataset_id && !Types.ObjectId.isValid(llmArgs.dataset_id)) {
            const errorMsg = `Invalid format for dataset_id argument provided to tool ${toolName}. Expected 24-hex ObjectId.`;
            logger.warn(`[ToolWrapper:${toolName}] ${errorMsg}`, { providedId: llmArgs.dataset_id });
            return { status: 'error', error: errorMsg, args: llmArgs, errorCode: 'INVALID_ARGUMENT_FORMAT' };
        }
         // --- End Standard ObjectId Check ---

        // --- Merge LLM args and Substituted args ---
        // Substituted args (like 'code') will overwrite LLM args if keys conflict
        const finalArgs = { ...(llmArgs || {}), ...substitutedArgs };
         logger.debug(`[ToolWrapper:${toolName}] Final merged args for handler:`, Object.keys(finalArgs)); // Log only keys for brevity


        try {
            // Execute the specific tool logic with the FINAL merged arguments
            const result = await handlerFn(finalArgs, context);

            // --- Standard Result Validation ---
            if (typeof result !== 'object' || result === null || !result.status) {
                logger.error(`[ToolWrapper:${toolName}] Tool returned invalid result structure:`, result);
                return { status: 'error', error: `Tool ${toolName} returned an invalid result structure.`, args: finalArgs, errorCode: 'INVALID_TOOL_RESULT' };
            }

            // Log success, summarizing large results
            const loggedResult = { ...result };
            if (loggedResult.result?.code) loggedResult.result = { ...loggedResult.result, code: '[code omitted]' };
            if (loggedResult.result?.react_code) loggedResult.result = { ...loggedResult.result, react_code: '[code omitted]' };
            if (loggedResult.result?.parsedData && Array.isArray(loggedResult.result.parsedData)) {
                 loggedResult.result = { ...loggedResult.result, parsedData: `[${loggedResult.result.parsedData.length} rows]` };
            }

            logger.info(`[ToolWrapper:${toolName}] Execution finished. Status: ${result.status}`, loggedResult);
            // Return the complete result from the tool, plus the FINAL args used
            return { ...result, args: finalArgs };

        } catch (error) {
            logger.error(`[ToolWrapper:${toolName}] Uncaught error during tool handler execution: ${error.message}`, { stack: error.stack, finalArgs: finalArgs });
            return {
                status: 'error',
                error: `Tool execution failed unexpectedly: ${error.message}`,
                args: finalArgs,
                errorCode: 'TOOL_EXECUTION_ERROR'
            };
        }
    };
}

module.exports = { createToolWrapper };