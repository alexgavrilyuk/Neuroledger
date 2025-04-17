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
 * @param {string} args.code - The Node.js code string to execute.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the dataset whose parsed data should be injected as `inputData`.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @param {GetParsedDataCallback} context.getParsedDataCallback - The callback function to fetch parsed data.
 * @returns {Promise<{status: 'success'|'error', result?: any, error?: string, logs?: string[]}>} Result object
 */
async function execute_analysis_code_logic(args, context) {
    const { code, dataset_id } = args;
    const { userId, sessionId, getParsedDataCallback } = context;

    if (!code) {
        return { status: 'error', error: 'Missing required argument: code.' };
    }
    if (typeof getParsedDataCallback !== 'function') {
        logger.error(`[Tool:execute_analysis_code] Internal error: Missing or invalid getParsedDataCallback.`);
        return { status: 'error', error: 'Internal configuration error: Cannot retrieve parsed data.' };
    }

    try {
        // 1. Retrieve Parsed Data using the callback from the orchestrator
        const inputData = await getParsedDataCallback(dataset_id);

        if (!inputData) {
            logger.error(`[Tool:execute_analysis_code] Failed to retrieve parsed data for Dataset ${dataset_id} via callback.`);
            return { status: 'error', error: `Parsed data for dataset ${dataset_id} is not available. Ensure 'parse_csv_data' was successfully run first.` };
        }

        if (!Array.isArray(inputData)) {
             logger.error(`[Tool:execute_analysis_code] Retrieved parsed data for ${dataset_id} is not an array.`);
             return { status: 'error', error: `Internal data error: Parsed data for dataset ${dataset_id} is not in the expected format.` };
        }

        logger.info(`[Tool:execute_analysis_code] Retrieved ${inputData.length} rows of parsed data for Dataset ${dataset_id} to inject into sandbox.`);

        // 2. Execute Code in Sandbox
        // Pass the retrieved data to the execution service
        const executionResult = await codeExecutionService.executeSandboxedCode(code, inputData);

        // 3. Process Result
        if (executionResult.error) {
            logger.warn(`[Tool:execute_analysis_code] Code execution failed for Dataset ${dataset_id}: ${executionResult.error}`, { logs: executionResult.logs });
            return {
                status: 'error',
                error: `Code execution failed: ${executionResult.error}`,
                logs: executionResult.logs
            };
        }

        logger.info(`[Tool:execute_analysis_code] Successfully executed analysis code for Dataset ${dataset_id}.`);
        return {
            status: 'success',
            result: executionResult.result, // Return the direct result from the sandbox
            logs: executionResult.logs
        };

    } catch (error) {
        logger.error(`[Tool:execute_analysis_code] Error executing code for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });
        // Re-throw for the wrapper to catch and format consistently
        throw error;
    }
}

// Export the wrapped function
module.exports = createToolWrapper('execute_analysis_code', execute_analysis_code_logic); 