// ================================================================================
// FILE: backend/src/features/chat/agent/AgentRunner.js
// PURPOSE: Main orchestrator replacing AgentExecutor logic, uses other agent modules.
// PHASE 5 UPDATE: Implemented iterative code refinement loop for execute_analysis_code.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const AgentStateManager = require('./AgentStateManager');
const ToolExecutor = require('./ToolExecutor');
const { getNextActionFromLLM } = require('./LLMOrchestrator');
const AgentEventEmitter = require('./AgentEventEmitter');
const AgentContextService = require('../agentContext.service'); // From parent dir
const PromptHistory = require('../prompt.model');
const { summarizeToolResult } = require('../agent.utils'); // Keep summarize util

// Constants
const MAX_AGENT_ITERATIONS = 10;
const MAX_TOOL_RETRIES = 1; // Retries for the *same* tool call (e.g., network hiccup)
const MAX_CODE_REFINEMENT_ATTEMPTS = 2; // PHASE 5: Max attempts for generate->execute cycle

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
        this.teamId = teamId;
        this.sessionId = sessionId;
        this.aiMessageId = aiMessageId;

        this.stateManager = new AgentStateManager(initialContext);
        this.toolExecutor = new ToolExecutor();
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

        try {
            // --- Prepare Initial Context ---
            // (Code remains the same as Phase 4)
            const initialContextPromise = this.contextService.getInitialUserTeamContext();
            const datasetContextPromise = this.contextService.preloadDatasetContext(sessionDatasetIds);
            const historyPromise = this.contextService.prepareChatHistoryAndArtifacts(this.aiMessageId);
            const [initialCtxResult, datasetCtxResult, historyResultSettled] = await Promise.allSettled([
                initialContextPromise, datasetContextPromise, historyPromise
            ]);
            if (initialCtxResult.status === 'fulfilled') this.stateManager.setUserTeamContext(initialCtxResult.value.userContext, initialCtxResult.value.teamContext);
            if (datasetCtxResult.status === 'fulfilled') { this.stateManager.setDatasetSchemas(datasetCtxResult.value.datasetSchemas); this.stateManager.setDatasetSamples(datasetCtxResult.value.datasetSamples); }
            if (historyResultSettled.status === 'fulfilled') {
                const historyResult = historyResultSettled.value;
                this.stateManager.setChatHistory(historyResult.fullChatHistory);
                if (this.stateManager.getIntermediateResult('analysisResult') === null) { this.stateManager.context.intermediateResults.analysisResult = historyResult.previousAnalysisResult; logger.debug(`[AgentRunner] Carried over previous analysis result.`); }
                if (this.stateManager.getIntermediateResult('generatedReportCode') === null) { this.stateManager.setIntermediateResult('generatedReportCode', historyResult.previousGeneratedCode); logger.debug(`[AgentRunner] Carried over previous generated report code.`); }
            }
            logger.debug(`[AgentRunner ${this.sessionId}] Initial context prepared.`);
            // --- End Prepare Initial Context ---


            // --- Main Loop ---
            let iterations = 0;
            while (iterations < MAX_AGENT_ITERATIONS && !this.stateManager.isFinished()) {
                iterations++;
                logger.info(`[AgentRunner ${this.sessionId}] Iteration ${iterations}`);

                // 1. Get context for LLM
                const llmContext = this.stateManager.getContextForLLM();
                 llmContext.userId = this.userId;

                // 2. Call LLM Orchestrator
                const streamCallback = (type, data) => { /* ... (event emitter calls, same as Phase 4) ... */
                    if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                    else if (type === 'finish') this.eventEmitter.emitStreamFinish(data.finishReason);
                    else if (type === 'completed') this.eventEmitter.emitStreamCompleted();
                    else if (type === 'error') this.eventEmitter.emitStreamError(data.message);
                };
                const llmAction = await getNextActionFromLLM(llmContext, streamCallback, this.toolExecutor.getKnownToolNames());

                // Emit thinking text if received
                if (llmAction.thinking) { this.eventEmitter.emitThinking(llmAction.thinking); }

                // 3. Process LLM Action
                if (llmAction.isFinalAnswer) {
                    logger.info(`[AgentRunner ${this.sessionId}] LLM indicated final answer.`);
                    this.stateManager.setFinalAnswer(llmAction.textResponse);
                    this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer.', attempt: 1 });
                    this.eventEmitter.emitFinalAnswer(
                         this.stateManager.context.finalAnswer,
                         this.stateManager.getIntermediateResult('generatedReportCode'),
                         this.stateManager.getIntermediateResult('analysisResult')
                     );
                    break; // Exit loop
                }

                // 4. Prepare for Tool Execution
                const toolName = llmAction.tool;
                const toolArgs = llmAction.args;
                logger.info(`[AgentRunner ${this.sessionId}] Preparing to execute tool: ${toolName}`);

                // **** PHASE 5: CODE REFINEMENT LOGIC ****
                if (toolName === 'execute_analysis_code') {
                    let executionSuccess = false;
                    let finalExecutionResult = null;

                    for (let attempt = 1; attempt <= MAX_CODE_REFINEMENT_ATTEMPTS; attempt++) {
                        logger.info(`[AgentRunner ${this.sessionId}] Attempting analysis code execution (Attempt ${attempt}/${MAX_CODE_REFINEMENT_ATTEMPTS})`);

                        // Get the latest code (might be from initial gen or refinement gen)
                        const codeToExecute = this.stateManager.getIntermediateResult('generatedAnalysisCode');
                        if (!codeToExecute) {
                            const errorMsg = 'Internal state error: No analysis code available for execution.';
                            logger.error(`[AgentRunner ${this.sessionId}] ${errorMsg}`);
                            finalExecutionResult = { status: 'error', error: errorMsg, errorCode: 'INTERNAL_CODE_MISSING' };
                            break; // Exit refinement loop, cannot proceed
                        }

                        // Add/Update step for the *execution* attempt
                        // If it's the first attempt, add a new step. If retrying, update the last step's attempt count.
                         if (attempt === 1) {
                             this.stateManager.addStep({ tool: toolName, args: { dataset_id: toolArgs.dataset_id }, resultSummary: `Executing code (Attempt ${attempt})...`, attempt: attempt }); // Log dataset_id arg
                             this.eventEmitter.emitUsingTool(toolName, { dataset_id: toolArgs.dataset_id }); // Emit with args used
                         } else {
                             // Update existing step for retry
                             const lastStepIndex = this.stateManager.context.steps.length - 1;
                             if (lastStepIndex >= 0 && this.stateManager.context.steps[lastStepIndex].tool === toolName) {
                                  this.stateManager.context.steps[lastStepIndex].attempt = attempt;
                                  this.stateManager.context.steps[lastStepIndex].resultSummary = `Executing code (Attempt ${attempt})...`;
                                  this.stateManager.context.steps[lastStepIndex].error = null; // Clear previous error for retry
                                  this.stateManager.context.steps[lastStepIndex].errorCode = null;
                                  this.eventEmitter.emitUsingTool(toolName, { dataset_id: toolArgs.dataset_id }); // Re-emit using tool for retry
                             } else {
                                logger.error(`[AgentRunner ${this.sessionId}] Could not find previous execution step to update for retry.`);
                                // Fallback: Add a new step anyway
                                this.stateManager.addStep({ tool: toolName, args: { dataset_id: toolArgs.dataset_id }, resultSummary: `Executing code (Attempt ${attempt})...`, attempt: attempt });
                                this.eventEmitter.emitUsingTool(toolName, { dataset_id: toolArgs.dataset_id });
                            }
                         }


                        const executionContext = {
                             userId: this.userId, teamId: this.teamId, sessionId: this.sessionId,
                             getParsedDataCallback: async (id) => this.stateManager.getIntermediateResult('parsedData', id)
                         };

                        const execResult = await this.toolExecutor.execute(toolName, { code: codeToExecute, dataset_id: toolArgs.dataset_id }, executionContext);
                        const execResultSummary = summarizeToolResult(execResult);
                        finalExecutionResult = execResult; // Store the latest result

                        if (execResult.status === 'success') {
                            logger.info(`[AgentRunner ${this.sessionId}] Code execution successful (Attempt ${attempt}).`);
                            this.stateManager.updateLastStep(execResultSummary, null, execResult.result, null);
                            this.eventEmitter.emitToolResult(toolName, execResultSummary, null, null);
                            this.stateManager.setIntermediateResult(toolName, execResult, { dataset_id: toolArgs.dataset_id }); // Store successful result
                            executionSuccess = true;
                            break; // Exit refinement loop on success
                        } else {
                            // Execution Failed
                            logger.warn(`[AgentRunner ${this.sessionId}] Code execution failed (Attempt ${attempt}): ${execResult.error} (Code: ${execResult.errorCode})`);
                            this.stateManager.updateLastStep(`Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, null, execResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, execResult.errorCode);

                            if (attempt < MAX_CODE_REFINEMENT_ATTEMPTS) {
                                logger.info(`[AgentRunner ${this.sessionId}] Attempting code regeneration (Attempt ${attempt + 1})`);
                                // Add a step indicating regeneration is happening
                                this.stateManager.addStep({ tool: 'generate_analysis_code', args: { analysis_goal: 'Fixing previous execution error' }, resultSummary: `Regenerating code due to error (Attempt ${attempt + 1})...`, attempt: 1 });
                                this.eventEmitter.emitUsingTool('generate_analysis_code', { analysis_goal: 'Fixing previous execution error' });

                                // Prepare goal for regeneration, including the error
                                const originalGoal = llmContext.originalQuery; // Or find the goal from previous generate_analysis_code step if possible
                                const regenerationGoal = `The previous code execution failed with this error:\n\`\`\`error\n${execResult.error}\n\`\`\`\nPlease regenerate the Javascript code to achieve the original goal while avoiding this error.\nOriginal Goal: ${originalGoal}`;

                                const regenContext = this.stateManager.getContextForLLM(); // Get current context
                                regenContext.userId = this.userId; // Ensure userId

                                // Call generate_analysis_code tool again
                                const regenResult = await this.toolExecutor.execute(
                                    'generate_analysis_code',
                                    { analysis_goal: regenerationGoal, dataset_id: toolArgs.dataset_id },
                                    { userId: this.userId, teamId: this.teamId, sessionId: this.sessionId, datasetSchemas: regenContext.datasetSchemas } // Provide necessary context
                                );
                                const regenSummary = summarizeToolResult(regenResult);
                                this.stateManager.updateLastStep(regenSummary, regenResult.error, regenResult.result, regenResult.errorCode);
                                this.eventEmitter.emitToolResult('generate_analysis_code', regenSummary, regenResult.error, regenResult.errorCode);

                                if (regenResult.status !== 'success' || !regenResult.result?.code) {
                                    logger.error(`[AgentRunner ${this.sessionId}] Code regeneration failed. Aborting refinement.`);
                                    // Set final error based on regeneration failure
                                    this.stateManager.setError(regenResult.error || 'Failed to regenerate code after execution error.', regenResult.errorCode || 'CODE_REGENERATION_FAILED');
                                    break; // Exit refinement loop
                                }
                                // Store the newly generated code (overwrites previous attempt)
                                this.stateManager.setIntermediateResult('generate_analysis_code', regenResult.result, { dataset_id: toolArgs.dataset_id });
                                // Continue to the next iteration of the refinement loop
                            } else {
                                // Max refinement attempts reached
                                logger.error(`[AgentRunner ${this.sessionId}] Max code refinement attempts (${MAX_CODE_REFINEMENT_ATTEMPTS}) reached. Execution failed.`);
                                // Final error is already set by the last failed execution attempt updateLastStep
                                this.stateManager.setError(finalExecutionResult.error, finalExecutionResult.errorCode);
                                break; // Exit refinement loop
                            }
                        }
                    } // End refinement loop for execute_analysis_code

                    // If the refinement loop ended due to an error state being set, let the main loop terminate
                    if (this.stateManager.isFinished()) {
                        logger.warn(`[AgentRunner ${this.sessionId}] Refinement loop ended with a final error state.`);
                        continue; // Let the main while loop condition handle termination
                    }
                    if (!executionSuccess) {
                         logger.error(`[AgentRunner ${this.sessionId}] Code execution failed permanently after ${MAX_CODE_REFINEMENT_ATTEMPTS} attempts.`);
                         // Set error state if not already set (e.g., if regen failed)
                         if (!this.stateManager.context.error) {
                              this.stateManager.setError(finalExecutionResult?.error || 'Code execution failed after multiple attempts.', finalExecutionResult?.errorCode || 'CODE_EXECUTION_FAILED');
                         }
                         this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
                         continue; // Let main loop terminate
                    }
                    // If execution was ultimately successful, the main loop continues normally

                } else {
                    // **** EXECUTE OTHER TOOLS (Non-code execution) ****
                    this.stateManager.addStep({ tool: toolName, args: toolArgs, resultSummary: 'Executing tool...', attempt: 1 });
                    this.eventEmitter.emitUsingTool(toolName, toolArgs);

                    let toolResult;
                    let currentAttempt = 0;
                    const executionContext = { // Prepare context for other tools
                        userId: this.userId, teamId: this.teamId, sessionId: this.sessionId,
                        analysisResult: (toolName === 'generate_report_code') ? this.stateManager.getIntermediateResult('analysisResult') : undefined,
                        datasetSchemas: (toolName === 'generate_report_code' || toolName === 'generate_analysis_code') ? this.stateManager.getIntermediateResult('datasetSchemas') : undefined,
                        getParsedDataCallback: undefined, // Not needed for non-exec tools
                    };

                    do { // Simple retry loop for non-code-exec tools
                        currentAttempt++;
                        toolResult = await this.toolExecutor.execute(toolName, toolArgs, executionContext);
                        const resultSummary = summarizeToolResult(toolResult);

                        if (toolResult.error && currentAttempt <= MAX_TOOL_RETRIES) {
                            logger.warn(`[AgentRunner ${this.sessionId}] Tool ${toolName} failed (Attempt ${currentAttempt}). Retrying. Error: ${toolResult.error} (Code: ${toolResult.errorCode})`);
                            this.stateManager.incrementToolErrorCount(toolName);
                            this.stateManager.updateLastStep(`Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, null, toolResult.errorCode);
                            this.stateManager.context.steps[this.stateManager.context.steps.length - 1].attempt = currentAttempt + 1;
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, toolResult.errorCode);
                            this.eventEmitter.emitUsingTool(toolName, toolArgs); // Re-emit
                        } else {
                            this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result, toolResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error, toolResult.errorCode);
                            if (!toolResult.error) {
                                this.stateManager.setIntermediateResult(toolName, toolResult.result, toolArgs);
                            }
                            break; // Exit retry loop
                        }
                    } while (currentAttempt <= MAX_TOOL_RETRIES);

                    // If a non-code tool failed after retries, let LLM handle it in the next iteration
                    if (toolResult.error) {
                         logger.warn(`[AgentRunner ${this.sessionId}] Tool ${toolName} failed after retries. Error will be passed to LLM.`);
                    }
                }
                // **** END PHASE 5 Logic ****

            } // End main while loop

            // --- Handle Loop Exit Conditions ---
            if (!this.stateManager.isFinished()) {
                 const maxIterError = `Agent reached maximum iterations (${MAX_AGENT_ITERATIONS}).`;
                 logger.warn(`[AgentRunner ${this.sessionId}] ${maxIterError}`);
                 this.stateManager.setError(maxIterError, 'MAX_ITERATIONS_REACHED');
                 this.stateManager.addStep({ tool: '_maxIterations', args: {}, resultSummary: 'Reached max iterations.', attempt: 1 });
                 this.eventEmitter.emitAgentError(maxIterError, 'MAX_ITERATIONS_REACHED');
            }

            // Finalize and return status
            await this._finalizeRun();
            return this.stateManager.getFinalStatusObject();

        } catch (error) {
            // Catch errors from context prep or unexpected loop errors
            logger.error(`[AgentRunner ${this.sessionId}] Unhandled error during agent run: ${error.message}`, { stack: error.stack });
            this.stateManager.setError(error.message || 'Unknown agent run error', 'AGENT_RUNNER_ERROR');
            this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
            await this._finalizeRun(); // Still try to save state
            return this.stateManager.getFinalStatusObject(); // Return error status
        } finally {
             // PHASE 4: Cleanup tokenizer
             this.contextService.cleanup();
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
                 logger.debug('[AgentRunner Finalize] DB Data:', dbData);
            }
        } catch (dbError) {
            logger.error(`[AgentRunner ${this.sessionId}] Error saving final state to DB for ${this.aiMessageId}: ${dbError.message}`, { dbData });
        }
    }
}

module.exports = AgentRunner;