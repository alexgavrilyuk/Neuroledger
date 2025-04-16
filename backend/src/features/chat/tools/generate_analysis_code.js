const logger = require('../../../shared/utils/logger');
const promptService = require('../prompt.service');
const datasetService = require('../../datasets/dataset.service');
const { Types } = require('mongoose');

/**
 * @typedef {object} GeneratedCodeResult
 * @property {string} code - The generated Node.js code string, cleaned of markdown fences.
 */

/**
 * Tool implementation for generating executable Node.js code to perform data analysis.
 * Takes an analysis goal and dataset context, fetches the dataset schema if necessary,
 * calls the prompt service to generate the code, cleans the output (removes markdown fences),
 * and returns the generated code string.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.analysis_goal - A detailed description of the analysis task requested by the user.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the dataset the analysis pertains to (used for schema context).
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @param {object<string, object>} [context.datasetSchemas] - Optional map of pre-fetched dataset schemas ({ [datasetId]: schemaInfo }).
 * @returns {Promise<{status: 'success'|'error', result?: GeneratedCodeResult, error?: string}>} Result object containing:
 *   - `status`: Indicates success or error.
 *   - `result`: On success, an object containing the generated `code` string.
 *   - `error`: On error, a descriptive error message (e.g., schema missing, generation failed).
 */
async function generate_analysis_code(args, context) {
    const { analysis_goal, dataset_id } = args;
    const { userId, sessionId, datasetSchemas = {} } = context;

    logger.info(`[Tool:generate_analysis_code] Called for Dataset ${dataset_id} by User ${userId} in Session ${sessionId}`);

    if (!analysis_goal) {
        return { status: 'error', error: 'Missing required argument: analysis_goal.' };
    }
    if (!dataset_id || !Types.ObjectId.isValid(dataset_id)) {
        logger.warn(`[Tool:generate_analysis_code] Invalid dataset_id provided: ${dataset_id}`);
        return { status: 'error', error: `Invalid dataset ID format: '${dataset_id}'. Please provide a valid dataset ID.` };
    }

    try {
        // 1. Get Schema Context (use pre-fetched if available, otherwise fetch)
        let schemaData = datasetSchemas[dataset_id];
        if (!schemaData) {
            logger.warn(`[Tool:generate_analysis_code] Schema for ${dataset_id} not pre-fetched. Fetching now.`);
            schemaData = await datasetService.getDatasetSchema(dataset_id, userId);
            if (!schemaData || !schemaData.schemaInfo) {
                 const datasetExists = await datasetService.findDatasetById(dataset_id, userId);
                 const errorMsg = datasetExists
                     ? `Schema information is missing or incomplete for dataset ${dataset_id}. Cannot generate analysis code without schema.`
                     : `Dataset with ID ${dataset_id} not found or not accessible.`;
                 return { status: 'error', error: errorMsg };
            }
        }

        // 2. Prepare context for prompt service
        const generationParams = {
            userId: userId,
            analysisGoal: analysis_goal,
            datasetSchema: schemaData, // Pass the full schema object (includes schemaInfo, description etc.)
        };

        // 3. Call prompt service to generate code
        const generationResult = await promptService.generateAnalysisCode(generationParams);

        if (!generationResult || !generationResult.code) {
            logger.error(`[Tool:generate_analysis_code] Prompt service failed to generate code for goal: ${analysis_goal}`);
            return { status: 'error', error: 'AI failed to generate analysis code.' };
        }

        const generatedCode = generationResult.code;

        // --- Basic Code Cleaning (Remove Markdown Fences) --- 
        let cleanedCode = generatedCode.trim();
        const codeBlockRegex = /^```(?:javascript|js)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
            logger.debug('[Tool:generate_analysis_code] Removed markdown fences from generated code.');
        } else {
             logger.debug('[Tool:generate_analysis_code] No markdown fences found in generated code.');
        }
        // --- End Cleaning ---

        // --- MODIFIED: Use broader regex to remove incorrect global.inputData access ---
        cleanedCode = cleanedCode.replace(/^.*const\s+inputData\s*=\s*global\.inputData.*$/gm, '');
        // --- END MODIFIED ---

        if (!cleanedCode) {
             logger.error('[Tool:generate_analysis_code] Generated code was empty after cleaning.');
             return { status: 'error', error: 'AI generated empty analysis code after cleaning.' };
        }

        logger.info(`[Tool:generate_analysis_code] Successfully generated analysis code for Dataset ${dataset_id}.`);
        return {
            status: 'success',
            result: { code: cleanedCode }
        };

    } catch (error) {
        logger.error(`[Tool:generate_analysis_code] Error generating code for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });
        return {
            status: 'error',
            error: `Failed to generate analysis code: ${error.message}`
        };
    }
}

module.exports = generate_analysis_code; 