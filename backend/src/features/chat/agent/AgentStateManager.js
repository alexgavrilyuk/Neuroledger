// ================================================================================
// FILE: backend/src/features/chat/agent/AgentStateManager.js
// PURPOSE: Manages the state ('turnContext') for a single agent turn.
// CORRECTION: Modified setIntermediateResult to store parsedData.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const { toolDefinitions } = require('../tools/tool.definitions');

/**
 * Manages the state for a single turn of the agent's reasoning loop.
 * Holds intermediate results, steps taken, and final outcomes.
 */
class AgentStateManager {
    /**
     * Initializes the state manager for a turn.
     * @param {object} [initialState={}] - Optional initial state properties.
     * @param {any} [initialState.previousAnalysisResult] - Analysis data from a previous turn.
     * @param {string} [initialState.previousGeneratedCode] - Code generated in a previous turn.
     */
    constructor(initialState = {}) {
        this.context = {
            originalQuery: '',
            steps: [],
            intermediateResults: {
                datasetSchemas: {},
                datasetSamples: {},
                parsedData: {}, // Initialize as an empty object
                analysisResult: initialState.previousAnalysisResult || null,
                generatedAnalysisCode: null, // Will be set/overwritten
                generatedReportCode: initialState.previousGeneratedCode || null,
                fragments: [],
                previousAnalysisResultSummary: null,
                hasPreviousGeneratedCode: !!initialState.previousGeneratedCode,
            },
            userContext: '',
            teamContext: '',
            fullChatHistory: [],
            finalAnswer: null,
            error: null,
            errorCode: null, // Added for final error state
            toolErrorCounts: {},
        };
        logger.debug(`[AgentStateManager] Initialized with previousAnalysis: ${!!initialState.previousAnalysisResult}, previousCode: ${!!initialState.previousGeneratedCode}`);
    }

    setQuery(query) { this.context.originalQuery = query; }

    addStep(stepData) {
        const newStep = { ...stepData, attempt: stepData.attempt || 1, error: stepData.error || null, errorCode: stepData.errorCode || null };
        this.context.steps.push(newStep);
        // Only add visual step fragments for tool calls, not internal markers
        if (!stepData.tool.startsWith('_')) {
            this.context.intermediateResults.fragments.push({
                 type: 'step', tool: stepData.tool, resultSummary: stepData.resultSummary || 'Executing...',
                 error: stepData.error || null, errorCode: stepData.errorCode || null,
                 status: stepData.error ? 'error' : (stepData.resultSummary === 'Executing...' ? 'running' : 'completed')
             });
        }
    }

    updateLastStep(resultSummary, error = null, result = null, errorCode = null) {
        const lastStepIndex = this.context.steps.length - 1;
        if (lastStepIndex >= 0) {
            const step = this.context.steps[lastStepIndex];
            step.resultSummary = resultSummary;
            step.error = error;
            step.result = result; // Store raw result on step? Might be large. Consider summarizing if needed.
            step.errorCode = errorCode;

            // Find the corresponding *step fragment* to update its status/summary
            // It might not be the *absolute* last fragment if text was added after
            const relevantFragmentIndex = this.context.intermediateResults.fragments.findLastIndex(
                 f => f.type === 'step' && f.tool === step.tool
            );

            if (relevantFragmentIndex !== -1) {
                 const fragment = this.context.intermediateResults.fragments[relevantFragmentIndex];
                 fragment.resultSummary = resultSummary;
                 fragment.error = error;
                 fragment.errorCode = errorCode;
                 fragment.status = error ? 'error' : 'completed';
            } else {
                 logger.warn(`[AgentStateManager] Could not find matching step fragment to update for tool: ${step.tool}`);
            }

        } else { logger.warn('[AgentStateManager] Attempted to updateLastStep, but no steps exist.'); }
    }

    /**
     * Stores intermediate results from successful tool executions.
     * CRITICAL: Specifically handles storing parsed data for `parse_csv_data`.
     *
     * @param {string} toolName - The name of the tool that succeeded.
     * @param {object} resultData - The `result` field from the tool's output.
     * @param {object} [args={}] - The arguments originally passed to the tool.
     */
    setIntermediateResult(toolName, resultData, args = {}) {
        switch (toolName) {
            // *** CORRECTED CASE for parse_csv_data ***
            case 'parse_csv_data':
                // Expect resultData = { parsedData: Array<object>, rowCount: number, summary: string }
                if (resultData?.parsedData && Array.isArray(resultData.parsedData) && args.dataset_id) {
                    // Store the actual parsed data array, keyed by dataset ID
                    this.context.intermediateResults.parsedData[args.dataset_id] = resultData.parsedData;
                    logger.info(`[AgentStateManager] Stored parsed data for dataset ${args.dataset_id} (${resultData.rowCount} rows).`);
                } else {
                    logger.error(`[AgentStateManager] parse_csv_data result missing parsedData array or dataset_id. Cannot store intermediate data.`, { resultData, args });
                }
                break;
            // *** END CORRECTION ***

            case 'execute_analysis_code':
                // resultData here is the *inner* result from the sandbox, passed up by the tool wrapper
                // { status: 'success', result: sandboxResult, logs?, errorCode? }
                this.context.intermediateResults.analysisResult = resultData; // Store the result from sandbox
                // Clear analysis code as it was just executed (or failed execution)
                // It might be regenerated in the refinement loop.
                this.context.intermediateResults.generatedAnalysisCode = null;
                logger.info(`[AgentStateManager] Stored analysis execution result.`);
                break;
             case 'generate_analysis_code':
                 if (resultData.code) {
                     // This will correctly overwrite previous attempts during refinement
                     this.context.intermediateResults.generatedAnalysisCode = resultData.code;
                     logger.info(`[AgentStateManager] Stored/Updated generated analysis code (length: ${resultData.code.length}).`);
                 } else { logger.warn(`[AgentStateManager] generate_analysis_code success result missing code.`); }
                 break;
            case 'generate_report_code':
                if (resultData.react_code) { this.context.intermediateResults.generatedReportCode = resultData.react_code; logger.info(`[AgentStateManager] Stored generated React report code.`); }
                else { logger.warn(`[AgentStateManager] generate_report_code success result missing react_code.`); }
                break;
             case 'get_dataset_schema':
                 if (resultData && args.dataset_id) {
                     if (!this.context.intermediateResults.datasetSchemas) this.context.intermediateResults.datasetSchemas = {};
                     this.context.intermediateResults.datasetSchemas[args.dataset_id] = resultData;
                     logger.debug(`[AgentStateManager] Stored schema for dataset ${args.dataset_id}.`);
                 }
                 break;
            default: logger.debug(`[AgentStateManager] No specific intermediate storage action for tool: ${toolName}`);
        }
    }

    getIntermediateResult(key, subKey = null) {
        // Log retrieval for debugging the callback
        const result = subKey ? this.context.intermediateResults[key]?.[subKey] : this.context.intermediateResults[key];
        logger.debug(`[AgentStateManager] getIntermediateResult called for key: ${key}, subKey: ${subKey}. Result found: ${!!result}`);
        return result;
    }

    setFinalAnswer(answer) {
        this.context.finalAnswer = answer || '';
        const fragments = this.context.intermediateResults.fragments;
        const lastFragment = fragments[fragments.length - 1];
        // Append to last text fragment or add new one
        if (lastFragment?.type === 'text') {
            lastFragment.content = this.context.finalAnswer; // Overwrite/set final text
        } else {
            fragments.push({ type: 'text', content: this.context.finalAnswer });
        }
    }

    setError(errorMsg, errorCode = null) {
        this.context.error = errorMsg;
        this.context.errorCode = errorCode;
        this.context.finalAnswer = `Error: ${errorMsg}`; // Set final answer to error message
        // Add error fragment
        this.context.intermediateResults.fragments.push({ type: 'error', content: errorMsg, errorCode: errorCode });
    }

    setChatHistory(history) { this.context.fullChatHistory = history; }
    setUserTeamContext(userCtx, teamCtx) { this.context.userContext = userCtx; this.context.teamContext = teamCtx; }
    setDatasetSchemas(schemas) { this.context.intermediateResults.datasetSchemas = schemas || {}; }
    setDatasetSamples(samples) { this.context.intermediateResults.datasetSamples = samples || {}; }
    getSteps() { return this.context.steps; }
    incrementToolErrorCount(toolName) { this.context.toolErrorCounts[toolName] = (this.context.toolErrorCounts[toolName] || 0) + 1; }
    getToolErrorCount(toolName) { return this.context.toolErrorCounts[toolName] || 0; }
    isFinished() { return !!this.context.finalAnswer || !!this.context.error; }

    getContextForLLM() {
        let previousAnalysisResultSummary = null;
        const currentAnalysisResult = this.context.intermediateResults.analysisResult;
        // Previous result here refers to the result from the sandbox in *this turn*
        if (currentAnalysisResult) {
            try {
                const summary = JSON.stringify(currentAnalysisResult);
                previousAnalysisResultSummary = `Analysis results from this turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`;
            }
            catch { previousAnalysisResultSummary = "Analysis results from this turn are available."; }
        }
        // If no result from this turn, check if one was carried over
        else if (this.context.intermediateResults.previousAnalysisResult) { // From constructor
             try {
                 const summary = JSON.stringify(this.context.intermediateResults.previousAnalysisResult);
                 previousAnalysisResultSummary = `Analysis results from a previous turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`;
             }
             catch { previousAnalysisResultSummary = "Analysis results from a previous turn are available."; }
        }
        return {
            originalQuery: this.context.originalQuery,
            fullChatHistory: this.context.fullChatHistory,
            currentTurnSteps: this.context.steps.map(s => ({ tool: s.tool, args: s.args, resultSummary: s.resultSummary, error: s.error, errorCode: s.errorCode, attempt: s.attempt })),
            availableTools: toolDefinitions.map(({ argsSchema, ...rest }) => rest), // Exclude argsSchema from LLM context
            userContext: this.context.userContext,
            teamContext: this.context.teamContext,
            analysisResult: this.context.intermediateResults.analysisResult, // Pass the actual result data if available for reasoning
            previousAnalysisResultSummary: previousAnalysisResultSummary, // Pass the summary string
            hasPreviousGeneratedCode: !!this.context.intermediateResults.generatedReportCode,
            datasetSchemas: this.context.intermediateResults.datasetSchemas,
            datasetSamples: this.context.intermediateResults.datasetSamples,
        };
    }

    getContextForDB() {
        const finalStatus = this.context.error ? 'error' : 'completed';
        return {
            status: finalStatus,
            // completedAt: new Date(), // completedAt should be set when finalizing run
            steps: this.context.steps,
            messageFragments: this.context.intermediateResults.fragments,
            aiResponseText: this.context.finalAnswer,
            errorMessage: this.context.error,
            errorCode: this.context.errorCode,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            reportAnalysisData: this.context.intermediateResults.analysisResult,
        };
    }

    getFinalStatusObject() {
        return {
            status: this.context.error ? 'error' : 'completed',
            aiResponseText: this.context.finalAnswer,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            error: this.context.error,
            errorCode: this.context.errorCode
        };
    }
}

module.exports = AgentStateManager;