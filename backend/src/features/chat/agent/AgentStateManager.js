// backend/src/features/chat/agent/AgentStateManager.js
const logger = require('../../../shared/utils/logger');
const { toolDefinitions } = require('../tools/tool.definitions');

/**
 * Manages the state for a single turn of the agent's reasoning loop.
 * Holds intermediate results, steps taken, and final outcomes.
 */
class AgentStateManager {
    constructor(initialState = {}) {
        this.context = {
            originalQuery: '',
            steps: [],
            intermediateResults: {
                datasetSchemas: {},
                datasetSamples: {},
                analysisResult: initialState.previousAnalysisResult || null,
                generatedAnalysisCode: null,
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
            errorCode: null,
            toolErrorCounts: {},
            status: 'processing',
        };
        logger.debug(`[AgentStateManager] Initialized with previousAnalysis: ${!!initialState.previousAnalysisResult}, previousCode: ${!!initialState.previousGeneratedCode}`);
    }

    setQuery(query) { this.context.originalQuery = query; }

    addStep(stepData) {
        const newStep = {
            tool: stepData.tool, args: stepData.args,
            resultSummary: stepData.resultSummary || 'Executing...',
            attempt: stepData.attempt || 1, error: stepData.error || null,
            errorCode: stepData.errorCode || null, result: null
        };
        this.context.steps.push(newStep);
        if (!stepData.tool.startsWith('_')) {
            this.context.intermediateResults.fragments.push({
                 type: 'step', tool: stepData.tool,
                 resultSummary: stepData.resultSummary || 'Executing...',
                 error: stepData.error || null, errorCode: stepData.errorCode || null,
                 status: 'running'
             });
             logger.debug(`[AgentStateManager] Added 'running' step fragment for tool: ${stepData.tool}`);
        } else { logger.debug(`[AgentStateManager] Skipping fragment creation for internal step: ${stepData.tool}`); }
    }

    updateLastStep(resultSummary, error = null, result = null, errorCode = null) {
        const lastStepIndex = this.context.steps.length - 1;
        if (lastStepIndex >= 0) {
            const step = this.context.steps[lastStepIndex];
            step.resultSummary = resultSummary; step.error = error;
            step.result = result; step.errorCode = errorCode;
            const relevantFragmentIndex = this.context.intermediateResults.fragments.findLastIndex(
                 f => f.type === 'step' && f.tool === step.tool && f.status === 'running'
            );
            if (relevantFragmentIndex !== -1) {
                 const fragment = this.context.intermediateResults.fragments[relevantFragmentIndex];
                 fragment.resultSummary = resultSummary; fragment.error = error;
                 fragment.errorCode = errorCode; fragment.status = error ? 'error' : 'completed';
                 logger.debug(`[AgentStateManager] Updated step fragment for tool ${step.tool}. Status: ${fragment.status}`);
            } else {
                 logger.warn(`[AgentStateManager] Could not find matching RUNNING step fragment to update for tool: ${step.tool}`);
                 if (!step.tool.startsWith('_')) {
                      this.context.intermediateResults.fragments.push({
                          type: 'step', tool: step.tool, resultSummary: resultSummary,
                          error: error, errorCode: errorCode, status: error ? 'error' : 'completed'
                      });
                      logger.warn(`[AgentStateManager] Added a new completed/error fragment as fallback for tool: ${step.tool}`);
                 }
            }
        } else { logger.warn('[AgentStateManager] Attempted to updateLastStep, but no steps exist.'); }
    }

    addTextFragment(text) {
        if (text && typeof text === 'string' && text.trim()) {
            this.context.intermediateResults.fragments.push({ type: 'text', content: text.trim() });
            logger.debug(`[AgentStateManager] Added text fragment.`);
        }
    }

    setIntermediateResult(toolName, resultData, args = {}) {
        switch (toolName) {
            // REMOVED 'parse_csv_data' case
            case 'execute_analysis_code':
                this.context.intermediateResults.analysisResult = resultData;
                this.context.intermediateResults.generatedAnalysisCode = null;
                logger.info(`[AgentStateManager] Stored analysis execution result.`);
                break;
             case 'generate_analysis_code':
                 if (resultData.code) { this.context.intermediateResults.generatedAnalysisCode = resultData.code; logger.info(`[AgentStateManager] Stored/Updated generated analysis code (length: ${resultData.code.length}).`); }
                 else { logger.warn(`[AgentStateManager] generate_analysis_code success result missing code.`); }
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
        // REMOVED check for 'parsedData' key
        const result = subKey ? this.context.intermediateResults[key]?.[subKey] : this.context.intermediateResults[key];
        return result;
    }

    setFinalAnswer(answer) {
        this.context.finalAnswer = answer || '';
        const fragments = this.context.intermediateResults.fragments;
        const lastFragment = fragments[fragments.length - 1];
        if (lastFragment?.type === 'text') { lastFragment.content = this.context.finalAnswer; logger.debug('[AgentStateManager] Updated last text fragment with final answer.'); }
        else { fragments.push({ type: 'text', content: this.context.finalAnswer }); logger.debug('[AgentStateManager] Added new text fragment for final answer.'); }
        this.context.status = 'completed';
    }

    setError(errorMsg, errorCode = null) {
        this.context.error = errorMsg; this.context.errorCode = errorCode;
        this.context.finalAnswer = `Error: ${errorMsg}`;
        this.context.intermediateResults.fragments.push({ type: 'error', content: errorMsg, errorCode: errorCode });
        this.context.status = 'error';
    }

    setChatHistory(history) { this.context.fullChatHistory = history; }
    setUserTeamContext(userCtx, teamCtx) { this.context.userContext = userCtx; this.context.teamContext = teamCtx; }
    setDatasetSchemas(schemas) { this.context.intermediateResults.datasetSchemas = schemas || {}; }
    setDatasetSamples(samples) { this.context.intermediateResults.datasetSamples = samples || {}; }
    getSteps() { return this.context.steps; }
    incrementToolErrorCount(toolName) { this.context.toolErrorCounts[toolName] = (this.context.toolErrorCounts[toolName] || 0) + 1; }
    getToolErrorCount(toolName) { return this.context.toolErrorCounts[toolName] || 0; }
    isFinished() { return !!this.context.finalAnswer || !!this.context.error || this.context.status === 'awaiting_user_input'; }

    getContextForLLM() {
        let previousAnalysisResultSummary = null;
        const currentAnalysisResult = this.context.intermediateResults.analysisResult;
        if (currentAnalysisResult) { try { const summary = JSON.stringify(currentAnalysisResult); previousAnalysisResultSummary = `Analysis results from this turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`; } catch { previousAnalysisResultSummary = "Analysis results from this turn are available."; } }
        else if (this.context.intermediateResults.previousAnalysisResult) { try { const summary = JSON.stringify(this.context.intermediateResults.previousAnalysisResult); previousAnalysisResultSummary = `Analysis results from a previous turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`; } catch { previousAnalysisResultSummary = "Analysis results from a previous turn are available."; } }
        return {
            originalQuery: this.context.originalQuery,
            fullChatHistory: this.context.fullChatHistory,
            currentTurnSteps: this.context.steps.map(s => ({ tool: s.tool, args: s.args, resultSummary: s.resultSummary, error: s.error, errorCode: s.errorCode, attempt: s.attempt })),
            availableTools: toolDefinitions.map(({ argsSchema, ...rest }) => rest),
            userContext: this.context.userContext, teamContext: this.context.teamContext,
            analysisResult: this.context.intermediateResults.analysisResult,
            previousAnalysisResultSummary: previousAnalysisResultSummary,
            hasPreviousGeneratedCode: !!this.context.intermediateResults.generatedReportCode,
            datasetSchemas: this.context.intermediateResults.datasetSchemas,
            datasetSamples: this.context.intermediateResults.datasetSamples,
        };
    }

    getContextForDB() {
        let finalStatus = this.context.status;
        if (finalStatus === 'processing') { finalStatus = this.context.error ? 'error' : 'completed'; }
        return {
            status: finalStatus, steps: this.context.steps,
            messageFragments: this.context.intermediateResults.fragments,
            aiResponseText: this.context.finalAnswer, errorMessage: this.context.error,
            errorCode: this.context.errorCode,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            reportAnalysisData: this.context.intermediateResults.analysisResult,
        };
    }

    getFinalStatusObject() {
        return {
            status: this.context.error ? 'error' : (this.context.status === 'awaiting_user_input' ? 'awaiting_user_input' : 'completed'),
            aiResponseText: this.context.finalAnswer,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            error: this.context.error, errorCode: this.context.errorCode
        };
    }
}

module.exports = AgentStateManager;