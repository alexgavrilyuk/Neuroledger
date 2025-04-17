// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent/AgentStateManager.js
// PURPOSE: Manages the state ('turnContext') for a single agent turn.
// MODIFIED: Added import for toolDefinitions
// ================================================================================

const logger = require('../../../shared/utils/logger');
// **** ADD THIS IMPORT ****
const { toolDefinitions } = require('../tools/tool.definitions'); 
// ************************

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
        /** @type {import('../agent.service').TurnContext} */ // Note: TurnContext type definition might need creation or update
        this.context = {
            originalQuery: '',
            steps: [],
            intermediateResults: {
                datasetSchemas: {},
                datasetSamples: {},
                parsedData: {},
                analysisResult: initialState.previousAnalysisResult || null, // Carry over analysis result
                generatedAnalysisCode: null, // Code generated *this* turn
                generatedReportCode: initialState.previousGeneratedCode || null, // Carry over report code
                fragments: [],
                // Carry over flags from constructor if needed
                previousAnalysisResultSummary: null, // Will be set during context prep if analysisResult exists
                hasPreviousGeneratedCode: !!initialState.previousGeneratedCode,
            },
            userContext: '',
            teamContext: '',
            fullChatHistory: [],
            finalAnswer: null,
            error: null,
            toolErrorCounts: {},
        };
        logger.debug(`[AgentStateManager] Initialized with previousAnalysis: ${!!initialState.previousAnalysisResult}, previousCode: ${!!initialState.previousGeneratedCode}`);
    }

    /** Sets the user's original query for this turn. */
    setQuery(query) {
        this.context.originalQuery = query;
    }

    /** Adds a step taken by the agent (tool call). */
    addStep(stepData) {
        this.context.steps.push({ ...stepData, attempt: stepData.attempt || 1 });
        // Add step fragment for UI, but only if it's not the final answer tool
        if (stepData.tool !== '_answerUserTool' && stepData.tool !== '_maxIterations' && stepData.tool !== '_unknown') {
            this.context.intermediateResults.fragments.push({
                 type: 'step',
                 tool: stepData.tool,
                 resultSummary: stepData.resultSummary || 'Executing...', // Initial summary
                 error: stepData.error || null,
                 status: stepData.error ? 'error' : (stepData.resultSummary === 'Executing tool...' ? 'running' : 'completed')
             });
        }
    }

    /** Updates the most recently added step with its final result/error summary. */
    updateLastStep(resultSummary, error = null, result = null) {
        const lastStepIndex = this.context.steps.length - 1;
        if (lastStepIndex >= 0) {
            this.context.steps[lastStepIndex].resultSummary = resultSummary;
            this.context.steps[lastStepIndex].error = error;
            // Store the actual result on the step if needed elsewhere, but primarily use intermediateResults
             this.context.steps[lastStepIndex].result = result; 

            // Update corresponding fragment if it exists
            const lastFragmentIndex = this.context.intermediateResults.fragments.length - 1;
            if (lastFragmentIndex >= 0 && this.context.intermediateResults.fragments[lastFragmentIndex].type === 'step' && this.context.intermediateResults.fragments[lastFragmentIndex].tool === this.context.steps[lastStepIndex].tool) {
                 this.context.intermediateResults.fragments[lastFragmentIndex].resultSummary = resultSummary;
                 this.context.intermediateResults.fragments[lastFragmentIndex].error = error;
                 this.context.intermediateResults.fragments[lastFragmentIndex].status = error ? 'error' : 'completed';
            }
        } else {
             logger.warn('[AgentStateManager] Attempted to updateLastStep, but no steps exist.');
        }
    }

    /** Stores intermediate results based on the tool that produced them. */
    setIntermediateResult(toolName, resultData, args = {}) {
        // Logic moved from AgentExecutor._storeIntermediateResult
        switch (toolName) {
            case 'parse_csv_data':
                if (resultData.parsedData && args.dataset_id) {
                    this.context.intermediateResults.parsedData[args.dataset_id] = resultData.parsedData;
                    logger.debug(`[AgentStateManager] Stored parsed data for dataset ${args.dataset_id} (${resultData.rowCount} rows).`);
                } else {
                    logger.warn(`[AgentStateManager] parse_csv_data success result missing parsedData or dataset_id.`);
                }
                break;
            case 'execute_analysis_code':
                this.context.intermediateResults.analysisResult = resultData;
                // Clear previous generated code as analysis was re-run
                this.context.intermediateResults.generatedAnalysisCode = null; 
                logger.info(`[AgentStateManager] Stored analysis execution result.`);
                break;
             case 'generate_analysis_code':
                 if (resultData.code) {
                     this.context.intermediateResults.generatedAnalysisCode = resultData.code;
                     logger.info(`[AgentStateManager] Stored generated analysis code (length: ${resultData.code.length}).`);
                 } else {
                     logger.warn(`[AgentStateManager] generate_analysis_code success result missing code.`);
                 }
                 break;
            case 'generate_report_code':
                if (resultData.react_code) {
                    this.context.intermediateResults.generatedReportCode = resultData.react_code;
                    logger.info(`[AgentStateManager] Stored generated React report code.`);
                } else {
                    logger.warn(`[AgentStateManager] generate_report_code success result missing react_code.`);
                }
                break;
             // Add other cases if needed
            default:
                logger.debug(`[AgentStateManager] No specific intermediate storage action for tool: ${toolName}`);
        }
    }

    /** Retrieves specific intermediate data. */
    getIntermediateResult(key, subKey = null) {
         if (subKey) {
             return this.context.intermediateResults[key]?.[subKey];
         }
         return this.context.intermediateResults[key];
     }

    /** Sets the final answer text and adds a final text fragment. */
    setFinalAnswer(answer) {
        this.context.finalAnswer = answer || ''; // Ensure it's a string
        // Ensure final answer is the last text fragment
        const fragments = this.context.intermediateResults.fragments;
        const lastFragment = fragments[fragments.length - 1];
        if (lastFragment && lastFragment.type === 'text') {
            lastFragment.content = this.context.finalAnswer; // Overwrite last text
        } else {
            fragments.push({ type: 'text', content: this.context.finalAnswer }); // Add new
        }
    }

    /** Sets the final error state for the turn. */
    setError(errorMsg) {
        this.context.error = errorMsg;
        this.context.finalAnswer = errorMsg; // Set final answer to error message for display
        // Optionally add an error fragment
         // this.context.intermediateResults.fragments.push({ type: 'error', content: errorMsg });
    }

    /** Updates the chat history array. */
    setChatHistory(history) {
        this.context.fullChatHistory = history;
    }

    /** Updates user/team context strings. */
    setUserTeamContext(userCtx, teamCtx) {
        this.context.userContext = userCtx;
        this.context.teamContext = teamCtx;
    }

    /** Updates preloaded dataset schemas. */
    setDatasetSchemas(schemas) {
        this.context.intermediateResults.datasetSchemas = schemas || {};
    }
    
    /** Updates preloaded dataset samples. */
    setDatasetSamples(samples) {
        this.context.intermediateResults.datasetSamples = samples || {};
    }

    /** Gets the current steps taken. */
    getSteps() {
        return this.context.steps;
    }

    /** Increments the error count for a specific tool. */
    incrementToolErrorCount(toolName) {
        this.context.toolErrorCounts[toolName] = (this.context.toolErrorCounts[toolName] || 0) + 1;
    }

    /** Gets the current error count for a specific tool. */
    getToolErrorCount(toolName) {
        return this.context.toolErrorCounts[toolName] || 0;
    }

    /** Checks if the turn has reached a final state (answer or error). */
    isFinished() {
        return !!this.context.finalAnswer || !!this.context.error;
    }

    /**
     * Prepares the context object specifically for the LLM reasoning call.
     * Selects and formats relevant state information for the prompt service.
     */
    getContextForLLM() {
        // Summarize previous analysis result if available
        let previousAnalysisResultSummary = null;
        if (this.context.intermediateResults.previousAnalysisResult) {
            try {
                // Provide a concise summary, avoiding large data structures
                const summary = JSON.stringify(this.context.intermediateResults.previousAnalysisResult);
                previousAnalysisResultSummary = `Analysis results from a previous turn are available: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`;
            } catch {
                previousAnalysisResultSummary = "Analysis results from a previous turn are available.";
            }
        }
        
        return {
            originalQuery: this.context.originalQuery,
            fullChatHistory: this.context.fullChatHistory, // Pass the formatted history
            currentTurnSteps: this.context.steps.map(s => ({ // Summary of steps *this turn*
                 tool: s.tool,
                 args: s.args, // Keep args for context
                 resultSummary: s.resultSummary,
                 error: s.error,
                 attempt: s.attempt
            })),
            // **** USE THE IMPORTED toolDefinitions ****
            availableTools: toolDefinitions, 
            // *****************************************
            userContext: this.context.userContext,
            teamContext: this.context.teamContext,
            // Pass artifacts/context for the prompt template
            analysisResult: this.context.intermediateResults.analysisResult, // Result from *this* turn's code exec
            previousAnalysisResultSummary: previousAnalysisResultSummary,
            hasPreviousGeneratedCode: !!this.context.intermediateResults.generatedReportCode, // Check report code carried over
            datasetSchemas: this.context.intermediateResults.datasetSchemas,
            datasetSamples: this.context.intermediateResults.datasetSamples,
        };
    }

    /**
     * Prepares the context object for saving to the PromptHistory database record.
     * Selects the final state and artifacts to be persisted.
     */
    getContextForDB() {
        const finalStatus = this.context.error ? 'error' : 'completed';
        return {
            status: finalStatus,
            completedAt: new Date(),
            steps: this.context.steps, // Save all steps taken
            messageFragments: this.context.intermediateResults.fragments, // Save all fragments
            aiResponseText: this.context.finalAnswer, // Save the final text
            errorMessage: this.context.error,
            // Save final artifacts associated with this AI response
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            reportAnalysisData: this.context.intermediateResults.analysisResult,
            // Consider clearing/not saving intermediate parsedData, schemas, samples unless needed for debugging
        };
    }

    /** Gets the final status object summarizing the turn's outcome. */
    getFinalStatusObject() {
        return {
            status: this.context.error ? 'error' : 'completed',
            aiResponseText: this.context.finalAnswer,
            aiGeneratedCode: this.context.intermediateResults.generatedReportCode,
            error: this.context.error,
        };
    }
}

module.exports = AgentStateManager;