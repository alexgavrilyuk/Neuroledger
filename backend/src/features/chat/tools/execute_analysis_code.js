// ================================================================================
// FILE: backend/src/features/chat/tools/execute_analysis_code.js
// PURPOSE: Tool logic for executing sandboxed analysis code.
// PHASE 2 UPDATE: Added specific error codes for data fetch/execution failures.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const codeExecutionService = require('../../../shared/services/codeExecution.service');
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @callback GetParsedDataCallback
 * @description A function provided by the AgentExecutor to retrieve previously parsed data for a given dataset ID.
 * @param {string} datasetId - The MongoDB ObjectId of the dataset.
 * @returns {Promise<Array<object>|null>} A promise that resolves to the parsed data array or null if not found.
 */

/**
 * Core logic for executing Node.js analysis code in a secure sandbox.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.code - The Node.js code string to execute. (Can be omitted if substituted by runner)
 * @param {string} args.dataset_id - The MongoDB ObjectId of the dataset whose parsed data should be injected as `inputData`.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @param {GetParsedDataCallback} context.getParsedDataCallback - The callback function to fetch parsed data.
 * @returns {Promise<{status: 'success'|'error', result?: any, error?: string, errorCode?: string, logs?: string[]}>} Result object
 */
async function execute_analysis_code_logic(args, context) {
    // Code might be passed directly OR substituted by the AgentRunner
    const { code, dataset_id } = args;
    const { userId, sessionId, getParsedDataCallback } = context;

    // Code is now technically optional in args if substituted, but the service needs it.
    // The AgentRunner handles substituting the code before calling the tool executor.
    // If code is STILL missing here, it's an internal error.
    if (!code) {
        logger.error(`[Tool:execute_analysis_code] Internal Error: Code was not provided or substituted correctly for execution.`);
        return { status: 'error', error: 'Internal error: Analysis code is missing.', errorCode: 'INTERNAL_CODE_MISSING' };
    }
    if (typeof getParsedDataCallback !== 'function') {
        logger.error(`[Tool:execute_analysis_code] Internal error: Missing or invalid getParsedDataCallback.`);
        return { status: 'error', error: 'Internal configuration error: Cannot retrieve parsed data.', errorCode: 'INTERNAL_CALLBACK_MISSING' };
    }

    try {
        // 1. Retrieve Parsed Data using the callback from the orchestrator
        const inputData = await getParsedDataCallback(dataset_id);

        if (!inputData) {
            logger.error(`[Tool:execute_analysis_code] Failed to retrieve parsed data for Dataset ${dataset_id} via callback.`);
            // This indicates a state inconsistency - parse should have run first.
            return { status: 'error', error: `Parsed data for dataset ${dataset_id} is not available. Ensure 'parse_csv_data' was successfully run first.`, errorCode: 'PARSED_DATA_MISSING' };
        }

        if (!Array.isArray(inputData)) {
             logger.error(`[Tool:execute_analysis_code] Retrieved parsed data for ${dataset_id} is not an array.`);
             return { status: 'error', error: `Internal data error: Parsed data for dataset ${dataset_id} is not in the expected array format.`, errorCode: 'PARSED_DATA_INVALID' };
        }

        logger.info(`[Tool:execute_analysis_code] Retrieved ${inputData.length} rows of parsed data for Dataset ${dataset_id} to inject into sandbox.`);

        // 2. Execute Code in Sandbox
        // Pass the retrieved data to the execution service
        const executionResult = await codeExecutionService.executeSandboxedCode(code, inputData);

        // 3. Process Result
        if (executionResult.error) {
            logger.warn(`[Tool:execute_analysis_code] Code execution failed for Dataset ${dataset_id}: ${executionResult.error}`);
            // Provide a more specific error code based on common sandbox failures
            let errorCode = 'CODE_EXECUTION_FAILED';
            if (executionResult.error.includes('timed out')) {
                errorCode = 'CODE_EXECUTION_TIMEOUT';
            } else if (executionResult.error.includes('failed to produce a result') || executionResult.error.includes('sendResult')) {
                errorCode = 'CODE_EXECUTION_NO_RESULT';
            }
            return {
                status: 'error',
                error: `Code execution failed: ${executionResult.error}`,
                errorCode: errorCode,
                logs: executionResult.logs // Pass logs if available
            };
        }

        logger.info(`[Tool:execute_analysis_code] Successfully executed analysis code for Dataset ${dataset_id}.`);
        return {
            status: 'success',
            result: executionResult.result, // Return the direct result from the sandbox
            logs: executionResult.logs
        };

    } catch (error) {
        // Catch errors from the parsed data callback or the execution service itself
        logger.error(`[Tool:execute_analysis_code] Unexpected error executing code for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });
        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Unexpected error during code execution: ${error.message}`);
         // The wrapper will add errorCode: 'TOOL_EXECUTION_ERROR'
    }
}

// Export the wrapped function
module.exports = createToolWrapper('execute_analysis_code', execute_analysis_code_logic);