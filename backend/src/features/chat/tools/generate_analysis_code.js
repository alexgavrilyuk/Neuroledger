// ================================================================================
// FILE: backend/src/features/chat/tools/generate_analysis_code.js
// PURPOSE: Tool logic for generating analysis code using the prompt service.
// PHASE 2 UPDATE: Added specific error codes for schema/service failures.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const promptService = require('../prompt.service');
const datasetService = require('../../datasets/dataset.service');
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {object} GeneratedCodeResult
 * @property {string} code - The generated Node.js code string, cleaned of markdown fences.
 */

/**
 * Core logic for generating executable Node.js code to perform data analysis.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.analysis_goal - A detailed description of the analysis task requested by the user.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the dataset the analysis pertains to (used for schema context).
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @param {object<string, object>} [context.datasetSchemas] - Optional map of pre-fetched dataset schemas ({ [datasetId]: schemaInfo }).
 * @returns {Promise<{status: 'success'|'error', result?: GeneratedCodeResult, error?: string, errorCode?: string}>} Result object
 */
async function generate_analysis_code_logic(args, context) {
    const { analysis_goal, dataset_id } = args;
    const { userId, sessionId, datasetSchemas = {} } = context;

    // Argument validation for analysis_goal is handled by the wrapper via schema now

    try {
        // 1. Get Schema Context (use pre-fetched if available, otherwise fetch)
        let schemaData = datasetSchemas[dataset_id];
        if (!schemaData) {
            logger.warn(`[Tool:generate_analysis_code] Schema for ${dataset_id} not pre-fetched. Fetching now.`);
            try {
                schemaData = await datasetService.getDatasetSchema(dataset_id, userId);
            } catch (schemaError) {
                 logger.error(`[Tool:generate_analysis_code] Failed to fetch schema for ${dataset_id}: ${schemaError.message}`);
                 if (schemaError.message.includes('not found') || schemaError.message.includes('not accessible')) {
                     return { status: 'error', error: `Dataset with ID ${dataset_id} not found or not accessible. Cannot generate code without schema.`, errorCode: 'SCHEMA_FETCH_FAILED_NOT_FOUND' };
                 }
                 return { status: 'error', error: `Failed to fetch schema for dataset ${dataset_id}: ${schemaError.message}`, errorCode: 'SCHEMA_FETCH_FAILED' };
            }

            if (!schemaData || !schemaData.schemaInfo) {
                 return { status: 'error', error: `Schema information is missing or incomplete for dataset ${dataset_id}. Cannot generate analysis code without schema.`, errorCode: 'SCHEMA_MISSING' };
            }
             // Store fetched schema back into context? Maybe not needed for this tool's scope.
        }

        // 2. Prepare context for prompt service
        const generationParams = {
            userId: userId,
            analysisGoal: analysis_goal,
            datasetSchema: schemaData, // Pass the full schema object
        };

        // 3. Call prompt service to generate code
        const generationResult = await promptService.generateAnalysisCode(generationParams);

        // The prompt service itself should throw an error if generation fails
        // This check is a fallback
        if (!generationResult || !generationResult.code) {
            logger.error(`[Tool:generate_analysis_code] Prompt service failed to generate code for goal: ${analysis_goal}`);
            return { status: 'error', error: 'AI failed to generate analysis code.', errorCode: 'CODE_GENERATION_FAILED' };
        }

        const generatedCode = generationResult.code;

        // Cleaning (remains the same)
        let cleanedCode = generatedCode.trim();
        const codeBlockRegex = /^```(?:javascript|js)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
            logger.debug('[Tool:generate_analysis_code] Removed markdown fences from generated code.');
        } else {
             logger.debug('[Tool:generate_analysis_code] No markdown fences found in generated code.');
        }
        cleanedCode = cleanedCode.replace(/^.*const\s+inputData\s*=\s*global\.inputData.*$/gm, '');


        if (!cleanedCode) {
             logger.error('[Tool:generate_analysis_code] Generated code was empty after cleaning.');
             return { status: 'error', error: 'AI generated empty analysis code after cleaning.', errorCode: 'CODE_GENERATION_EMPTY' };
        }
         if (!cleanedCode.includes('sendResult(')) {
             logger.warn('[Tool:generate_analysis_code] Generated code is missing the required sendResult() call.');
              // Allow it for now, execution will likely fail, but add specific error code
              return { status: 'error', error: 'Generated code is missing the required sendResult() call.', errorCode: 'CODE_GENERATION_INVALID' };
         }
         if (cleanedCode.includes('require(')) {
             logger.error('[Tool:generate_analysis_code] Generated code contains disallowed require() call.');
              return { status: 'error', error: 'Generated code included disallowed require() statements.', errorCode: 'CODE_GENERATION_INVALID' };
         }


        logger.info(`[Tool:generate_analysis_code] Successfully generated analysis code for Dataset ${dataset_id}.`);
        return {
            status: 'success',
            result: { code: cleanedCode }
        };

    } catch (error) {
        // Catch errors from schema fetching or code generation service
        logger.error(`[Tool:generate_analysis_code] Error generating code for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });

         if (error.message.includes('AI assistant failed')) {
             return { status: 'error', error: error.message, errorCode: 'CODE_GENERATION_FAILED' };
         }
         if (error.message.includes('dataset schema')) {
             return { status: 'error', error: error.message, errorCode: 'SCHEMA_FETCH_FAILED' };
         }

        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Failed to generate analysis code: ${error.message}`);
        // The wrapper will add errorCode: 'TOOL_EXECUTION_ERROR'
    }
}

// Export the wrapped function
module.exports = createToolWrapper('generate_analysis_code', generate_analysis_code_logic);