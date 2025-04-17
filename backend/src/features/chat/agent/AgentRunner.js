// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent/AgentRunner.js
// PURPOSE: Main orchestrator replacing AgentExecutor logic, uses other agent modules.
// MODIFIED: Pass analysisResult and datasetSchemas in executionContext to tools.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const AgentStateManager = require('./AgentStateManager');
const ToolExecutor = require('./ToolExecutor');
const { getNextActionFromLLM } = require('./LLMOrchestrator');
const AgentEventEmitter = require('./AgentEventEmitter');
const AgentContextService = require('../agentContext.service'); // From parent dir
const PromptHistory = require('../prompt.model');
const { summarizeToolResult } = require('../agent.utils'); // Keep summarize util

// Constants from old AgentExecutor
const MAX_AGENT_ITERATIONS = 10;
const MAX_TOOL_RETRIES = 1;

/**
 * Orchestrates the agent's reasoning loop for a single turn.
 * Uses AgentStateManager, ToolExecutor, LLMOrchestrator, and AgentEventEmitter.
 */
class AgentRunner {
    /**
     * Initializes the agent runner.
     * @param {string} userId - The user ID.
     * @param {string | null} teamId - The team ID (or null).
     * @param {string} sessionId - The chat session ID.
     * @param {string} aiMessageId - The MongoDB ObjectId of the PromptHistory record for this turn.
     * @param {function(string, object): void} sendEventCallback - Callback function to stream events.
     * @param {object} [initialContext={}] - Optional initial context (e.g., previous artifacts).
     * @param {any} [initialContext.previousAnalysisResult] - Analysis data from a previous turn.
     * @param {string} [initialContext.previousGeneratedCode] - Code generated in a previous turn.
     */
    constructor(userId, teamId, sessionId, aiMessageId, sendEventCallback, initialContext = {}) {
        this.userId = userId;
        this.teamId = teamId; // Added teamId property
        this.sessionId = sessionId;
        this.aiMessageId = aiMessageId; // Store for DB update

        this.stateManager = new AgentStateManager(initialContext);
        this.toolExecutor = new ToolExecutor(); // Tool definitions loaded internally
        this.eventEmitter = new AgentEventEmitter(sendEventCallback, { userId, sessionId, messageId: aiMessageId });
        this.contextService = new AgentContextService(userId, teamId, sessionId);

        logger.debug(`[AgentRunner ${sessionId}] Initialized for Message ${this.aiMessageId}`);
    }

    /**
     * Runs the main agent loop for the turn.
     * @param {string} userMessage - The user's query for this turn.
     * @param {Array<string>} sessionDatasetIds - Dataset IDs available in the session.
     * @returns {Promise<object>} The final status object from AgentStateManager.
     */
    async run(userMessage, sessionDatasetIds = []) {
        logger.info(`[AgentRunner ${this.sessionId}] Starting run for Message ${this.aiMessageId}. Query: "${userMessage.substring(0, 50)}..."`);
        this.stateManager.setQuery(userMessage);
        this.eventEmitter.emitThinking();

        try {
            // --- Prepare Initial Context ---
            const initialContextPromise = this.contextService.getInitialUserTeamContext();
            const datasetContextPromise = this.contextService.preloadDatasetContext(sessionDatasetIds);
            const historyPromise = this.contextService.prepareChatHistoryAndArtifacts(this.aiMessageId);

            // Settle promises and update state manager
            const [initialCtxResult, datasetCtxResult, historyResultSettled] = await Promise.allSettled([
                initialContextPromise, datasetContextPromise, historyPromise
            ]);

            if (initialCtxResult.status === 'fulfilled') {
                 this.stateManager.setUserTeamContext(initialCtxResult.value.userContext, initialCtxResult.value.teamContext);
            } // Log errors handled by contextService

            if (datasetCtxResult.status === 'fulfilled') {
                 this.stateManager.setDatasetSchemas(datasetCtxResult.value.datasetSchemas);
                 this.stateManager.setDatasetSamples(datasetCtxResult.value.datasetSamples);
            } // Log errors handled by contextService

             if (historyResultSettled.status === 'fulfilled') {
                const historyResult = historyResultSettled.value;
                this.stateManager.setChatHistory(historyResult.fullChatHistory);
                // Carry over previous artifacts if not already set by constructor
                if (this.stateManager.getIntermediateResult('analysisResult') === null) { // Check analysisResult key
                    this.stateManager.setIntermediateResult('_previousAnalysisResult', historyResult.previousAnalysisResult); // Use internal key? Or directly set analysisResult? Let's set analysisResult
                     this.stateManager.context.intermediateResults.analysisResult = historyResult.previousAnalysisResult;
                     logger.debug(`[AgentRunner] Carried over previous analysis result.`);
                }
                 if (this.stateManager.getIntermediateResult('generatedReportCode') === null) { // Check report code key
                    this.stateManager.setIntermediateResult('generatedReportCode', historyResult.previousGeneratedCode);
                     logger.debug(`[AgentRunner] Carried over previous generated report code.`);
                 }
            } // Log errors handled by contextService

            logger.debug(`[AgentRunner ${this.sessionId}] Initial context prepared.`);

            // --- Main Loop ---
            let iterations = 0;
            while (iterations < MAX_AGENT_ITERATIONS && !this.stateManager.isFinished()) {
                iterations++;
                logger.info(`[AgentRunner ${this.sessionId}] Iteration ${iterations}`);

                // 1. Get context for LLM
                const llmContext = this.stateManager.getContextForLLM();
                 llmContext.userId = this.userId; // Ensure userId is passed

                // 2. Call LLM Orchestrator (Handles streaming and parsing)
                const streamCallback = (type, data) => {
                    // Forward stream events using the EventEmitter
                    if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                    else if (type === 'finish') this.eventEmitter.emitStreamFinish(data.finishReason);
                    else if (type === 'completed') this.eventEmitter.emitStreamCompleted();
                    else if (type === 'error') this.eventEmitter.emitStreamError(data.message);
                    // Add other potential event types if needed (e.g., tool_call from Claude)
                };

                const llmAction = await getNextActionFromLLM(llmContext, streamCallback, this.toolExecutor.getKnownToolNames());

                // 3. Process LLM Action
                if (llmAction.isFinalAnswer) {
                    logger.info(`[AgentRunner ${this.sessionId}] LLM indicated final answer.`);
                    this.stateManager.setFinalAnswer(llmAction.textResponse);
                    this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer.', attempt: 1 });
                    this.eventEmitter.emitFinalAnswer(
                         this.stateManager.context.finalAnswer,
                         this.stateManager.getIntermediateResult('generatedReportCode'),
                         this.stateManager.getIntermediateResult('analysisResult') // Pass analysis result
                     );
                    break; // Exit loop
                }

                // 4. Prepare for Tool Execution
                const toolName = llmAction.tool;
                const toolArgs = llmAction.args;

                 // --- Substitute generated code if needed ---
                 let finalToolArgs = { ...toolArgs };
                 if (toolName === 'execute_analysis_code') {
                      const generatedCode = this.stateManager.getIntermediateResult('generatedAnalysisCode');
                     if (generatedCode) {
                         logger.info(`[AgentRunner ${this.sessionId}] Substituting generated analysis code into execute_analysis_code arguments.`);
                         finalToolArgs.code = generatedCode;
                     } else if (!finalToolArgs.code) { // If LLM didn't provide placeholder code either
                         logger.error(`[AgentRunner ${this.sessionId}] execute_analysis_code requested, but no code found in context or args! Skipping tool.`);
                         // Create an error step and continue loop (let LLM try again)
                         this.stateManager.addStep({ tool: toolName, args: finalToolArgs, resultSummary: 'Error: Missing analysis code.', error: 'Missing analysis code.', attempt: 1 });
                         this.eventEmitter.emitToolResult(toolName, 'Error: Missing analysis code.', 'Missing analysis code.');
                         continue; // Skip execution, try next iteration
                     } else {
                          logger.warn(`[AgentRunner ${this.sessionId}] execute_analysis_code using code provided directly in LLM args (might be placeholder).`);
                     }
                 }
                 // --- End Code Substitution ---

                logger.info(`[AgentRunner ${this.sessionId}] Preparing to execute tool: ${toolName}`);
                this.eventEmitter.emitUsingTool(toolName, finalToolArgs);
                this.stateManager.addStep({ tool: toolName, args: finalToolArgs, resultSummary: 'Executing tool...', attempt: 1 });

                // 5. Execute Tool
                let toolResult;
                let currentAttempt = 0;

                // **** MODIFICATION START ****
                // Prepare the executionContext, now including analysisResult and schemas
                const executionContext = {
                     userId: this.userId,
                     teamId: this.teamId, // Pass teamId
                     sessionId: this.sessionId,
                     // Pass analysis results IF the tool needs it (e.g., report generation)
                     analysisResult: (toolName === 'generate_report_code')
                         ? this.stateManager.getIntermediateResult('analysisResult')
                         : undefined,
                     // Pass schemas if needed (e.g., for context in some tools, maybe report gen)
                     datasetSchemas: (toolName === 'generate_report_code') // Example: only pass for report gen
                         ? this.stateManager.getIntermediateResult('datasetSchemas')
                         : undefined,
                     // Callback for tools needing parsed data (like code execution)
                     getParsedDataCallback: (toolName === 'execute_analysis_code')
                         ? async (datasetId) => { // Make callback async
                            const data = this.stateManager.getIntermediateResult('parsedData', datasetId);
                            if (!data) logger.warn(`[getParsedDataCallback] Parsed data for dataset ${datasetId} not found in state.`);
                            return data;
                           }
                         : undefined,
                 };
                 logger.debug(`[AgentRunner ${this.sessionId}] Tool Execution Context Prepared:`, {
                     userId: executionContext.userId,
                     sessionId: executionContext.sessionId,
                     hasAnalysisResult: !!executionContext.analysisResult, // Log if analysis result is included
                     hasSchemas: !!executionContext.datasetSchemas, // Log if schemas are included
                     hasCallback: !!executionContext.getParsedDataCallback
                 });
                 // **** MODIFICATION END ****


                do {
                    currentAttempt++;
                    // Pass the FULL executionContext
                    toolResult = await this.toolExecutor.execute(toolName, finalToolArgs, executionContext);
                    const resultSummary = summarizeToolResult(toolResult);

                    if (toolResult.error && currentAttempt <= MAX_TOOL_RETRIES) {
                        logger.warn(`[AgentRunner ${this.sessionId}] Tool ${toolName} failed (Attempt ${currentAttempt}). Retrying. Error: ${toolResult.error}`);
                         this.stateManager.incrementToolErrorCount(toolName);
                        this.stateManager.updateLastStep(`Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error);
                         this.stateManager.context.steps[this.stateManager.context.steps.length - 1].attempt = currentAttempt + 1; // Update attempt count on step
                        this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error);
                        this.eventEmitter.emitUsingTool(toolName, finalToolArgs); // Re-emit using_tool for retry
                    } else {
                         this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result); // Update step with final attempt result
                         this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error);
                         break; // Exit retry loop on success or max retries reached
                    }
                } while (currentAttempt <= MAX_TOOL_RETRIES);

                // 6. Process Tool Result
                if (!toolResult.error) {
                    this.stateManager.setIntermediateResult(toolName, toolResult.result, finalToolArgs);
                } else {
                    // Handle critical tool errors (like code execution failure after retries)
                    if (toolName === 'execute_analysis_code') {
                        const criticalErrorMsg = `Code Execution Failed after ${currentAttempt} attempt(s): ${summarizeToolResult(toolResult)}`;
                        logger.error(`[AgentRunner ${this.sessionId}] CRITICAL ERROR: ${criticalErrorMsg}`);
                         this.stateManager.setError(criticalErrorMsg); // Set final error state
                         this.eventEmitter.emitAgentError(criticalErrorMsg); // Emit specific agent error
                         // Loop will terminate in the next check
                    }
                    // For non-critical errors, the loop continues, LLM sees the error summary
                }
            } // End while loop

            // --- Handle Loop Exit Conditions ---
            if (!this.stateManager.isFinished()) {
                 // Means max iterations were reached
                 const maxIterError = `Agent reached maximum iterations (${MAX_AGENT_ITERATIONS}).`;
                 logger.warn(`[AgentRunner ${this.sessionId}] ${maxIterError}`);
                 this.stateManager.setError(maxIterError);
                 this.stateManager.addStep({ tool: '_maxIterations', args: {}, resultSummary: 'Reached max iterations.', attempt: 1 });
                 this.eventEmitter.emitAgentError(maxIterError);
            }

            // Finalize and return status
            await this._finalizeRun();
            return this.stateManager.getFinalStatusObject();

        } catch (error) {
            // Catch errors from context prep or unexpected loop errors
            logger.error(`[AgentRunner ${this.sessionId}] Unhandled error during agent run: ${error.message}`, { stack: error.stack });
            this.stateManager.setError(error.message || 'Unknown agent run error');
            this.eventEmitter.emitAgentError(this.stateManager.context.error);
            await this._finalizeRun(); // Still try to save state
            return this.stateManager.getFinalStatusObject(); // Return error status
        }
    }

    /** Saves the final state to the database. */
    async _finalizeRun() {
        logger.info(`[AgentRunner ${this.sessionId}] Finalizing run for message ${this.aiMessageId}.`);
        const dbData = this.stateManager.getContextForDB();
        try {
            const updatedRecord = await PromptHistory.findByIdAndUpdate(
                this.aiMessageId,
                { $set: dbData },
                { new: true }
            );
            if (!updatedRecord) {
                 logger.error(`[AgentRunner ${this.sessionId}] CRITICAL: Failed to find PromptHistory record ${this.aiMessageId} during finalize.`);
            } else {
                logger.info(`[AgentRunner ${this.sessionId}] PromptHistory record ${this.aiMessageId} finalized with status: ${dbData.status}`);
                 // ---- ADD DEBUG LOG ----
                 logger.debug('[AgentRunner Finalize] DB Data:', dbData);
                 // ---- END DEBUG LOG ----
            }
        } catch (dbError) {
            logger.error(`[AgentRunner ${this.sessionId}] Error saving final state to DB for ${this.aiMessageId}: ${dbError.message}`, { dbData });
            // Continue without throwing, but log the failure
        }
    }
}

module.exports = AgentRunner;