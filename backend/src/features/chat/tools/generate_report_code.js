// backend/src/features/chat/tools/generate_report_code.js
// ENTIRE FILE - UPDATED FOR PHASE 10

const logger = require('../../../shared/utils/logger');
const promptService = require('../prompt.service');
const datasetService = require('../../datasets/dataset.service'); // Keep for potential schema context
const { Types } = require('mongoose');
const { createToolWrapper } = require('./BaseToolWrapper');

/**
 * @typedef {object} GeneratedReportResult
 * @property {string} react_code - The generated React component code string (JSX), cleaned of markdown fences.
 */

/**
 * Core logic for generating React component code (JSX) to visualize or display analysis results.
 *
 * @async
 * @param {object} args - Tool arguments provided by the LLM.
 * @param {string} args.analysis_summary - A summary of the analysis goal and key results, used to guide the LLM.
 * @param {string} args.dataset_id - The MongoDB ObjectId of the dataset related to the analysis (provides context).
 * @param {string} [args.title] - Optional title for the report.
 * @param {string} [args.chart_type] - Optional preferred chart type.
 * @param {Array<string>} [args.columns_to_visualize] - Optional specific columns to focus on.
 * @param {object} context - Additional context provided by the orchestrator.
 * @param {string} context.userId - The ID of the user making the request.
 * @param {string} context.sessionId - The ID of the current chat session.
 * @param {any} context.analysisResult - The actual result data from the preceding `execute_analysis_code` tool execution. MUST be passed by AgentRunner.
 * @param {object<string, object>} [context.datasetSchemas] - Optional map of pre-fetched dataset schemas for additional context.
 * @returns {Promise<{status: 'success'|'error', result?: GeneratedReportResult, error?: string, errorCode?: string}>} Result object
 */
async function generate_report_code_logic(args, context) {
    // Destructure new optional args for Phase 10
    const { analysis_summary, dataset_id, title, chart_type, columns_to_visualize } = args;
    const { userId, sessionId, analysisResult, datasetSchemas = {} } = context;

    // Argument validation handled by wrapper schema

    // CRITICAL: Check if analysisResult was passed correctly from context
    if (analysisResult === undefined || analysisResult === null) {
        logger.error(`[Tool:generate_report_code] Analysis results are missing from context. Cannot generate report code.`);
        return { status: 'error', error: 'Analysis results are missing. Cannot generate report code without prior successful analysis execution.', errorCode: 'MISSING_ANALYSIS_DATA' };
    }

    try {
        // Schema context is optional but potentially useful for the LLM
        // const schemaInfo = datasetSchemas[dataset_id]?.schemaInfo;
        // logger.debug(`[Tool:generate_report_code] Using schema info: ${schemaInfo ? 'Found' : 'Not Found'}`);

        // 2. Prepare arguments for prompt service
        let dataJsonString;
        try {
            // The prompt service expects analysisResult as a JSON string
            dataJsonString = JSON.stringify(analysisResult);
        } catch (stringifyError) {
            logger.error(`[Tool:generate_report_code] Failed to stringify analysisResult: ${stringifyError.message}`, { analysisResult });
            return { status: 'error', error: 'Failed to process analysis results for report generation.', errorCode: 'INVALID_ANALYSIS_DATA' };
        }

        const generationArgs = {
            userId: userId,
            analysisSummary: analysis_summary,
            dataJson: dataJsonString, // Pass the stringified analysis result
            // --- PHASE 10: Pass new args ---
            title: title,
            chart_type: chart_type,
            columns_to_visualize: columns_to_visualize
            // Pass schema if needed by prompt template (currently prompt service doesn't use it directly for report gen)
            // datasetSchema: schemaData,
        };

        // 3. Call prompt service to generate React code
        const generationResult = await promptService.generateReportCode(generationArgs);

        // Prompt service should throw on error, this is a fallback
        if (!generationResult || !generationResult.react_code) {
            logger.error(`[Tool:generate_report_code] Prompt service failed to generate report code or returned empty code.`);
            return { status: 'error', error: 'AI failed to generate report code.', errorCode: 'CODE_GENERATION_FAILED' };
        }

        const generatedCode = generationResult.react_code;

        // Cleaning (remains the same)
        let cleanedCode = generatedCode.trim();
        const codeBlockRegex = /^```(?:jsx?|javascript)?\s*([\s\S]*?)\s*```$/m;
        const match = cleanedCode.match(codeBlockRegex);
        if (match && match[1]) {
            cleanedCode = match[1].trim();
             logger.debug('[Tool:generate_report_code] Removed markdown fences from generated React code.');
        } else {
            logger.debug('[Tool:generate_report_code] No markdown fences found in generated React code.');
        }
        // Remove imports/exports aggressively
        cleanedCode = cleanedCode.replace(/^import\s+.*\s+from\s+['"].*['"];?/gm, '');
        cleanedCode = cleanedCode.replace(/^export\s+default\s+\w+;?/gm, '');
        cleanedCode = cleanedCode.replace(/^export\s+(const|function)\s+/gm, '$1 ');


         if (!cleanedCode) {
             logger.error('[Tool:generate_report_code] Generated React code was empty after cleaning.');
             return { status: 'error', error: 'AI generated empty report code after cleaning.', errorCode: 'CODE_GENERATION_EMPTY' };
         }
          if (!cleanedCode.includes('function ReportComponent')) {
              logger.warn('[Tool:generate_report_code] Generated report code missing "function ReportComponent".');
              // Decide if this is an error or just a warning
              // return { status: 'error', error: 'Generated report code is missing the required "ReportComponent" function definition.', errorCode: 'CODE_GENERATION_INVALID' };
         }
          if (cleanedCode.includes('import ') || cleanedCode.includes('export ')) {
             logger.error('[Tool:generate_report_code] Generated code contains disallowed import/export after cleaning!');
             return { status: 'error', error: 'Generated code included disallowed import/export statements.', errorCode: 'CODE_GENERATION_INVALID' };
         }

        logger.info(`[Tool:generate_report_code] Successfully generated report code for Dataset ${dataset_id}.`);
        return {
            status: 'success',
            result: { react_code: cleanedCode }
        };

    } catch (error) {
        logger.error(`[Tool:generate_report_code] Error generating report for Dataset ${dataset_id}, User ${userId}: ${error.message}`, { error });

        if (error.message.includes('AI assistant failed')) {
            return { status: 'error', error: error.message, errorCode: 'CODE_GENERATION_FAILED' };
        }
        // Re-throw for the wrapper to catch general execution errors
        throw new Error(`Failed to generate report code: ${error.message}`);
         // The wrapper will add errorCode: 'TOOL_EXECUTION_ERROR'
    }
}

// Export the wrapped function
module.exports = createToolWrapper('generate_report_code', generate_report_code_logic);