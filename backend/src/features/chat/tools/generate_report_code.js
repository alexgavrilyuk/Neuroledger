const logger = require('../../../shared/utils/logger');
const promptService = require('../prompt.service');
const datasetService = require('../../datasets/dataset.service'); // May need schema context
const { Types } = require('mongoose');

/**
 * @typedef {object} GeneratedReportResult
 * @property {string} react_code - The generated React component code string (JSX), cleaned of markdown fences.
 */

/**
 * Tool implementation for generating React component code (JSX) to visualize or display analysis results.
 * Takes a summary of the analysis, the actual analysis result data (from the orchestrator's context),
 * and dataset context. Calls the prompt service to generate the React code, cleans it, and returns it.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.analysis_summary - A summary of the analysis goal and key results, used to guide the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the dataset related to the analysis (provides context).
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @param {any} context.analysisResult - The actual result data from the preceding `execute_analysis_code` tool execution.
 * @param {object<string, object>} [context.datasetSchemas] - Optional map of pre-fetched dataset schemas for additional context.
 * @returns {Promise<{status: 'success'|'error', result?: GeneratedReportResult, error?: string}>} Result object containing:
 *   - `status`: Indicates success or error.
 *   - `result`: On success, an object containing the generated `react_code` string.
 *   - `error`: On error, a descriptive error message.
 */
async function generate_report_code(args, context) {
    const { analysis_summary, dataset_id } = args;
    const { userId, sessionId, analysisResult, datasetSchemas = {} } = context;

    logger.info(`[Tool:generate_report_code] Called for Dataset ${dataset_id} by User ${userId} in Session ${sessionId}`);

    if (!analysis_summary) {
        return { status: 'error', error: 'Missing required argument: analysis_summary.' };
    }
     if (!dataset_id || !Types.ObjectId.isValid(dataset_id)) {
        logger.warn(`[Tool:generate_report_code] Invalid dataset_id provided: ${dataset_id}`);
        return { status: 'error', error: `Invalid dataset ID format: '${dataset_id}'. Please provide a valid dataset ID.` };
    }
    if (analysisResult === undefined || analysisResult === null) {
        return { status: 'error', error: 'Analysis results are missing. Cannot generate report code without prior analysis results.' };
    }

    try {
        // 1. Get Schema Context (already fetched by AgentExecutor, available in context)
        // const schemaInfo = datasetSchemas[dataset_id]?.schemaInfo;
        // logger.debug(`[Tool:generate_report_code] Using schema info: ${schemaInfo ? 'Found' : 'Not Found'}`);
        
        // 2. Prepare arguments for prompt service
        // Ensure analysisResult is stringified, as expected by generateReportCode
        let dataJsonString;
        try {
            dataJsonString = JSON.stringify(analysisResult);
        } catch (stringifyError) {
            logger.error(`[Tool:generate_report_code] Failed to stringify analysisResult: ${stringifyError.message}`, { analysisResult });
            return { status: 'error', error: 'Failed to process analysis results for report generation.' };
        }

        const generationArgs = {
            userId: userId,
            analysisSummary: analysis_summary,
            dataJson: dataJsonString // Pass the stringified analysis result
        };

        // 3. Call prompt service to generate React code
        // CORRECTED: Call the existing generateReportCode function
        const generationResult = await promptService.generateReportCode(generationArgs);

        if (!generationResult || !generationResult.react_code) {
            logger.error(`[Tool:generate_report_code] Prompt service failed to generate report code or returned empty code.`);
            return { status: 'error', error: 'AI failed to generate report code.' };
        }

        const generatedCode = generationResult.react_code;

        // --- Basic Code Cleaning (Remove Markdown Fences) --- 
        let cleanedCode = generatedCode.trim();
        // Regex for ```jsx, ```javascript, ``` etc.
        const codeBlockRegex = /^```(?:jsx?|javascript)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
             logger.debug('[Tool:generate_report_code] Removed markdown fences from generated React code.');
        } else {
            logger.debug('[Tool:generate_report_code] No markdown fences found in generated React code.');
        }
         // --- End Cleaning ---

         if (!cleanedCode) {
             logger.error('[Tool:generate_report_code] Generated React code was empty after cleaning.');
             return { status: 'error', error: 'AI generated empty report code after cleaning.' };
         }

        logger.info(`[Tool:generate_report_code] Successfully generated report code for Dataset ${dataset_id}.`);
        return {
            status: 'success',
            result: { react_code: cleanedCode }
        };

    } catch (error) {
        logger.error(`[Tool:generate_report_code] Error generating report for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });
        return {
            status: 'error',
            error: `Failed to generate report code: ${error.message}`
        };
    }
}

module.exports = generate_report_code; 