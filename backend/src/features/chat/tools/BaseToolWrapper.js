/**
 * @fileoverview This module provides a higher-order function to standardize tool execution,
 * including common validation, error handling, and logging patterns across all tools.
 * PHASE 2 UPDATE: Added Ajv validation for tool arguments.
 */

const { Types } = require('mongoose');
const logger = require('../../../shared/utils/logger');
const Ajv = require('ajv'); // PHASE 2: Import Ajv
const toolSchemas = require('./tool.schemas'); // PHASE 2: Import schemas

// PHASE 2: Instantiate Ajv and compile schemas (can be done once)
const ajv = new Ajv({ allErrors: true }); // allErrors provides more details on validation failure
const compiledSchemas = {};
for (const schemaName in toolSchemas) {
    // Convert schemaName (e.g., 'getDatasetSchemaArgsSchema') to toolName (e.g., 'get_dataset_schema')
    const toolNameMatch = schemaName.match(/^(.*)ArgsSchema$/);
    if (toolNameMatch && toolNameMatch[1]) {
        let toolName = toolNameMatch[1];
        // Convert camelCase to snake_case if needed (adjust based on your naming)
        // Example basic conversion, might need refinement:
        toolName = toolName.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (toolName.startsWith('_')) toolName = toolName.substring(1);
        // Special case for _answerUserTool
        if(schemaName === 'answerUserToolArgsSchema') toolName = '_answerUserTool';

        try {
            compiledSchemas[toolName] = ajv.compile(toolSchemas[schemaName]);
             logger.debug(`[BaseToolWrapper] Compiled schema for tool: ${toolName}`);
        } catch (compileError) {
             logger.error(`[BaseToolWrapper] Failed to compile schema for tool ${toolName} (${schemaName}): ${compileError.message}`);
        }
    }
}
logger.info(`[BaseToolWrapper] Ajv initialized and ${Object.keys(compiledSchemas).length} tool argument schemas compiled.`);

/**
 * Formats Ajv validation errors into a user-friendly string.
 * @param {Array<object>} errors - Array of Ajv error objects.
 * @returns {string} A formatted error message string.
 */
function formatAjvErrors(errors) {
    if (!errors) return 'Unknown validation error.';
    return errors.map(err => `${err.instancePath || '/'}: ${err.message}`).join('; ');
}

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
        // Sanitize args for logging (e.g., truncate long strings like code)
        const loggedArgs = { ...args };
        if (loggedArgs.code && loggedArgs.code.length > 100) {
            loggedArgs.code = loggedArgs.code.substring(0, 100) + '... [truncated]';
        }
        logger.info(`[ToolWrapper:${toolName}] Called by User ${userId} in Session ${sessionId} with args:`, loggedArgs);

        // --- PHASE 2: Argument Validation using Ajv ---
        const validate = compiledSchemas[toolName];
        if (validate) {
            const isValid = validate(args);
            if (!isValid) {
                const errorMsg = `Invalid arguments provided for tool ${toolName}.`;
                const formattedErrors = formatAjvErrors(validate.errors);
                logger.warn(`[ToolWrapper:${toolName}] ${errorMsg} Errors: ${formattedErrors}`, { providedArgs: args });
                return {
                    status: 'error',
                    error: `${errorMsg} Details: ${formattedErrors}`,
                    args,
                    errorCode: 'INVALID_ARGUMENT' // Standardized error code
                };
            }
             logger.debug(`[ToolWrapper:${toolName}] Arguments successfully validated against schema.`);
        } else {
             logger.warn(`[ToolWrapper:${toolName}] No compiled argument schema found. Skipping validation.`);
        }
        // --- End Phase 2 Validation ---

        // --- Standard MongoDB ObjectId Validation (kept as an extra check) ---
        if (args && args.hasOwnProperty('dataset_id') && (!args.dataset_id || !Types.ObjectId.isValid(args.dataset_id))) {
            const errorMsg = `Invalid or missing dataset_id argument format for tool ${toolName}.`;
            logger.warn(`[ToolWrapper:${toolName}] ${errorMsg}`);
            return { status: 'error', error: errorMsg, args, errorCode: 'INVALID_ARGUMENT_FORMAT' }; // Specific error code
        }
        // --- End Standard Validation ---

        try {
            const result = await handlerFn(args, context); // Execute the specific tool logic

            // --- Standard Result Validation ---
            if (typeof result !== 'object' || !result.status) {
                logger.error(`[ToolWrapper:${toolName}] Tool returned invalid result structure:`, result);
                return { status: 'error', error: `Tool ${toolName} returned an invalid result structure.`, args, errorCode: 'INVALID_TOOL_RESULT' };
            }

            // Log success, potentially summarizing large results
            const loggedResult = { ...result };
            if (loggedResult.result?.code && typeof loggedResult.result.code === 'string' && loggedResult.result.code.length > 100) {
                loggedResult.result = { ...loggedResult.result, code: loggedResult.result.code.substring(0,100) + '... [truncated]' };
            }
            if (loggedResult.result?.react_code && typeof loggedResult.result.react_code === 'string' && loggedResult.result.react_code.length > 100) {
                loggedResult.result = { ...loggedResult.result, react_code: loggedResult.result.react_code.substring(0,100) + '... [truncated]' };
            }
             if (loggedResult.result?.parsedData && Array.isArray(loggedResult.result.parsedData)) {
                 loggedResult.result = { ...loggedResult.result, parsedData: `[${loggedResult.result.parsedData.length} rows]` };
             }


            logger.info(`[ToolWrapper:${toolName}] Execution finished. Status: ${result.status}`, loggedResult);
            // Ensure original args are passed back along with the result
            return { ...result, args };

        } catch (error) {
            logger.error(`[ToolWrapper:${toolName}] Uncaught error during tool handler execution: ${error.message}`, { stack: error.stack, toolArgs: args });
            // Return standardized error structure
            return {
                status: 'error',
                error: `Tool execution failed unexpectedly: ${error.message}`,
                args,
                errorCode: 'TOOL_EXECUTION_ERROR' // Standardized code for unexpected failures
            };
        }
    };
}

module.exports = { createToolWrapper };