// backend/src/features/chat/agent/AgentRunner.js
// ENTIRE FILE - UPDATED FOR PHASES 8, 9, 11, 12

const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');
const AgentStateManager = require('./AgentStateManager');
const ToolExecutor = require('./ToolExecutor');
const { getNextActionFromLLM } = require('./LLMOrchestrator');
const AgentEventEmitter = require('./AgentEventEmitter');
const AgentContextService = require('../agentContext.service');
const PromptHistory = require('../prompt.model');
const { summarizeToolResult } = require('../agent.utils');

// Constants
const MAX_AGENT_ITERATIONS = 10;
const MAX_TOOL_RETRIES = 1;
const MAX_CODE_REFINEMENT_ATTEMPTS = 2;

class AgentRunner {
    constructor(userId, teamId, sessionId, aiMessageId, sendEventCallback, initialContext = {}) {
        this.userId = userId;
        this.teamId = teamId;
        this.sessionId = sessionId;
        this.aiMessageId = aiMessageId;
        this.traceId = uuidv4(); // PHASE 12: Generate trace ID

        this.stateManager = new AgentStateManager(initialContext);
        this.toolExecutor = new ToolExecutor();
        this.eventEmitter = new AgentEventEmitter(sendEventCallback, { userId, sessionId, messageId: aiMessageId });
        this.contextService = new AgentContextService(userId, teamId, sessionId);

        logger.debug(`[Trace:${this.traceId}] [AgentRunner ${sessionId}] Initialized for Message ${this.aiMessageId}`);
    }

    async run(userMessage, sessionDatasetIds = []) {
        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Starting run. Query: "${userMessage.substring(0, 50)}..."`);
        this.stateManager.setQuery(userMessage);

        try {
            // --- Prepare Initial Context ---
            const initialContextPromise = this.contextService.getInitialUserTeamContext();
            const datasetContextPromise = this.contextService.preloadDatasetContext(sessionDatasetIds);
            const historyPromise = this.contextService.prepareChatHistoryAndArtifacts(this.aiMessageId);
            const [initialCtxResult, datasetCtxResult, historyResultSettled] = await Promise.allSettled([
                initialContextPromise, datasetContextPromise, historyPromise
            ]);
            if (initialCtxResult.status === 'fulfilled') this.stateManager.setUserTeamContext(initialCtxResult.value.userContext, initialCtxResult.value.teamContext);
            else logger.error(`[Trace:${this.traceId}] Failed to get initial user/team context:`, initialCtxResult.reason);
            if (datasetCtxResult.status === 'fulfilled') {
                this.stateManager.setDatasetSchemas(datasetCtxResult.value.datasetSchemas);
                this.stateManager.setDatasetSamples(datasetCtxResult.value.datasetSamples);
            } else logger.error(`[Trace:${this.traceId}] Failed to preload dataset context:`, datasetCtxResult.reason);
            if (historyResultSettled.status === 'fulfilled') {
                const historyResult = historyResultSettled.value;
                this.stateManager.setChatHistory(historyResult.fullChatHistory);
                // PHASE 11: Ensure previous artifacts are correctly set in state manager
                if (this.stateManager.getIntermediateResult('analysisResult') === null && historyResult.previousAnalysisResult) {
                    this.stateManager.context.intermediateResults.analysisResult = historyResult.previousAnalysisResult;
                    logger.debug(`[Trace:${this.traceId}] Carried over previous analysis result.`);
                }
                if (this.stateManager.getIntermediateResult('generatedReportCode') === null && historyResult.previousGeneratedCode) {
                    // Use setIntermediateResult to potentially store it if needed, or just set the flag
                    this.stateManager.context.intermediateResults.generatedReportCode = historyResult.previousGeneratedCode;
                    this.stateManager.context.intermediateResults.hasPreviousGeneratedCode = true;
                    logger.debug(`[Trace:${this.traceId}] Carried over previous generated report code.`);
                }
            } else logger.error(`[Trace:${this.traceId}] Failed to prepare chat history:`, historyResultSettled.reason);
            logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Initial context prepared.`);
            // --- End Prepare Initial Context ---


            // --- Main Loop ---
            let iterations = 0;
            let nextActionToInject = null; // PHASE 8: For injecting refinement action

            while (iterations < MAX_AGENT_ITERATIONS && !this.stateManager.isFinished()) {
                iterations++;
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Iteration ${iterations}`);

                let llmAction;

                // PHASE 8: Check if an action needs to be injected (code refinement)
                if (nextActionToInject) {
                    llmAction = nextActionToInject;
                    nextActionToInject = null; // Clear injected action
                    logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Using injected action: ${llmAction.tool}`);
                } else {
                    // Normal flow: Get action from LLM
                    const llmContext = this.stateManager.getContextForLLM();
                    llmContext.userId = this.userId; // Ensure userId is in context for provider selection

                    // PHASE 12: Define the stream callback for the Orchestrator
                    const streamCallback = (type, data) => {
                        if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                        else if (type === 'finish') this.eventEmitter.emitStreamFinish(data.finishReason);
                        else if (type === 'completed') this.eventEmitter.emitStreamCompleted();
                        else if (type === 'error') this.eventEmitter.emitStreamError(data.message);
                    };

                    logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Calling LLM Orchestrator...`);
                    llmAction = await getNextActionFromLLM(
                        llmContext,
                        streamCallback,
                        this.toolExecutor.getKnownToolNames()
                    );
                    logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM Action received: Tool='${llmAction.tool}', Final=${llmAction.isFinalAnswer}`);
                }

                // PHASE 12: Emit user explanation if available
                if (llmAction.userExplanation) {
                    this.eventEmitter.emitUserExplanation(llmAction.userExplanation);
                } else if (llmAction.thinking && !llmAction.isFinalAnswer && !llmAction.tool?.startsWith('_')) {
                     // Fallback: If no explanation but thinking exists before a non-internal tool call
                     this.eventEmitter.emitUserExplanation("Okay, planning the next step...");
                }

                // --- Handle Final Answer ---
                if (llmAction.isFinalAnswer) {
                    logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM indicated final answer.`);
                    this.stateManager.setFinalAnswer(llmAction.textResponse);
                    this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer provided.', attempt: 1 });
                    const finalAnswerText = this.stateManager.context.finalAnswer;
                    const finalGeneratedCode = this.stateManager.getIntermediateResult('generatedReportCode'); // Get code directly
                    const finalAnalysisResult = this.stateManager.getIntermediateResult('analysisResult');
                    this.eventEmitter.emitFinalAnswer(finalAnswerText, finalGeneratedCode, finalAnalysisResult);
                    break; // Exit loop
                }
                // --- End Handle Final Answer ---

                // --- PHASE 9: Handle Clarification ---
                if (llmAction.tool === 'ask_user_for_clarification') {
                     const question = llmAction.args.question || "I need more information to proceed. Could you please clarify?";
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Agent requested clarification: "${question}"`);
                     this.stateManager.context.status = 'awaiting_user_input';
                     this.stateManager.setFinalAnswer(question);
                     this.stateManager.setError(null);
                     this.stateManager.addStep({ tool: llmAction.tool, args: llmAction.args, resultSummary: 'Asking user for clarification.', attempt: 1 });
                     this.eventEmitter.emitNeedsClarification(question);
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Pausing turn to wait for user clarification.`);
                     break; // Exit the agent loop for this turn
                }
                // --- End PHASE 9 ---

                // Prepare for Tool Execution
                const toolName = llmAction.tool;
                const llmToolArgs = llmAction.args;
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM requests tool: ${toolName}`);

                // PHASE 11: Ensure correct context is passed for report generation
                const executionContext = {
                    userId: this.userId, teamId: this.teamId, sessionId: this.sessionId, traceId: this.traceId,
                    analysisResult: (toolName === 'generate_report_code') ? this.stateManager.getIntermediateResult('analysisResult') : undefined,
                    datasetSchemas: (toolName === 'generate_report_code' || toolName === 'generate_analysis_code') ? this.stateManager.getIntermediateResult('datasetSchemas') : undefined,
                    getParsedDataCallback: (toolName === 'execute_analysis_code' || toolName === 'calculate_financial_ratios') ?
                         async (id) => this.stateManager.getIntermediateResult('parsedData', id) : undefined,
                };

                let finalToolResult; // Stores the result of the last attempt

                 // --- PHASE 8: REFINEMENT LOOP for execute_analysis_code ---
                 if (toolName === 'execute_analysis_code') {
                     let executionSuccess = false;
                     const refinementCounterKey = 'analysis_code_refinement';
                     this.stateManager.context.toolErrorCounts[refinementCounterKey] = 0;

                     for (let attempt = 1; attempt <= MAX_CODE_REFINEMENT_ATTEMPTS; attempt++) {
                         logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code Execution Attempt ${attempt}/${MAX_CODE_REFINEMENT_ATTEMPTS}`);
                         const codeToExecute = this.stateManager.getIntermediateResult('generatedAnalysisCode');
                         if (!codeToExecute) {
                             finalToolResult = { status: 'error', error: 'Internal state error: No analysis code available for execution.', args: llmToolArgs, errorCode: 'INTERNAL_CODE_MISSING' };
                             logger.error(`[Trace:${this.traceId}] ${finalToolResult.error}`);
                             break;
                         }

                         this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: `Executing code (Attempt ${attempt})...`, attempt: attempt });
                         this.eventEmitter.emitUsingTool(toolName, llmToolArgs);

                         const execResult = await this.toolExecutor.execute(
                             toolName, llmToolArgs, executionContext, { code: codeToExecute }
                         );
                         const execResultSummary = summarizeToolResult(execResult);
                         finalToolResult = execResult;

                         if (execResult.status === 'success') {
                             logger.info(`[Trace:${this.traceId}] Code execution successful (Attempt ${attempt}).`);
                             this.stateManager.updateLastStep(execResultSummary, null, execResult.result, null);
                             this.eventEmitter.emitToolResult(toolName, execResultSummary, null, null);
                             this.stateManager.setIntermediateResult(toolName, execResult.result, llmToolArgs);
                             executionSuccess = true;
                             break;
                         } else {
                             const isSandboxError = ['CODE_EXECUTION_FAILED', 'CODE_EXECUTION_TIMEOUT', 'CODE_EXECUTION_NO_RESULT', 'TOOL_EXECUTION_ERROR', 'CODE_GENERATION_INVALID'].includes(execResult.errorCode);
                             logger.warn(`[Trace:${this.traceId}] Code execution failed (Attempt ${attempt}): ${execResult.error} (Code: ${execResult.errorCode})`);
                             this.stateManager.updateLastStep(`Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, null, execResult.errorCode);
                             this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, execResult.errorCode);
                             this.stateManager.incrementToolErrorCount(refinementCounterKey);

                             if (isSandboxError && attempt < MAX_CODE_REFINEMENT_ATTEMPTS) {
                                 logger.info(`[Trace:${this.traceId}] Attempting code regeneration...`);
                                 this.stateManager.addStep({ tool: '_refiningCode', args: { failedTool: toolName }, resultSummary: 'Attempting to fix code...', attempt: attempt + 1 });
                                 this.eventEmitter.emitUserExplanation("There was an issue running the analysis code. I'll try to fix it automatically."); // PHASE 12: User explanation for refinement

                                 const originalGoal = this.stateManager.context.originalQuery;
                                 const regenLlmArgs = {
                                     analysis_goal: originalGoal,
                                     dataset_id: llmToolArgs.dataset_id,
                                     previous_error: execResult.error
                                 };
                                 // Inject the action for the next loop iteration
                                 nextActionToInject = { tool: 'generate_analysis_code', args: regenLlmArgs, isFinalAnswer: false, textResponse: null, thinking: "Regenerating analysis code due to execution error.", userExplanation: "Attempting to fix the analysis code..." };
                                 logger.debug(`[Trace:${this.traceId}] Injecting action for refinement:`, nextActionToInject);
                                 break; // Break refinement loop to inject action in main loop
                             } else {
                                 logger.warn(`[Trace:${this.traceId}] Max code refinements reached or error not suitable for refinement. Aborting.`);
                                 break;
                             }
                         }
                     } // End refinement loop

                     // If action was injected, continue to next main loop iteration
                     if (nextActionToInject) {
                         continue;
                     }

                     // Handle final status after the loop if no action was injected
                     if (!executionSuccess) {
                          logger.error(`[Trace:${this.traceId}] Code execution failed permanently after ${this.stateManager.getToolErrorCount(refinementCounterKey)} refinement attempts.`);
                          this.stateManager.setError(finalToolResult?.error || 'Code execution failed after multiple attempts.', finalToolResult?.errorCode || 'CODE_EXECUTION_FAILED');
                          this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
                          continue;
                     }
                 } else {
                    // --- Execute other tools (Simple Retry) ---
                    this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: 'Executing tool...', attempt: 1 });
                    this.eventEmitter.emitUsingTool(toolName, llmToolArgs);
                    let toolResult;
                    let currentAttempt = 0;

                    do {
                        currentAttempt++;
                        if (currentAttempt > 1) logger.info(`[Trace:${this.traceId}] Retrying tool ${toolName} (Attempt ${currentAttempt})`);
                        toolResult = await this.toolExecutor.execute(toolName, llmToolArgs, executionContext);
                        const resultSummary = summarizeToolResult(toolResult);

                        if (toolResult.error && currentAttempt <= MAX_TOOL_RETRIES) {
                            logger.warn(`[Trace:${this.traceId}] Tool ${toolName} failed (Attempt ${currentAttempt}). Retrying. Error: ${toolResult.error} (Code: ${toolResult.errorCode})`);
                            this.stateManager.incrementToolErrorCount(toolName);
                            this.stateManager.updateLastStep(`Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, null, toolResult.errorCode);
                            this.stateManager.context.steps[this.stateManager.context.steps.length - 1].attempt = currentAttempt + 1;
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, toolResult.errorCode);
                        } else {
                            this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result, toolResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error, toolResult.errorCode);
                            if (!toolResult.error) {
                                this.stateManager.setIntermediateResult(toolName, toolResult.result, llmToolArgs);
                            }
                            break;
                        }
                    } while (currentAttempt <= MAX_TOOL_RETRIES);

                    if (toolResult.error) {
                        logger.warn(`[Trace:${this.traceId}] Tool ${toolName} failed after all retries.`);
                    }
                 } // --- End Tool Execution ---

            } // End main while loop

            // --- Handle Loop Exit Conditions ---
            if (!this.stateManager.isFinished()) {
                 const maxIterError = `Agent reached maximum iterations (${MAX_AGENT_ITERATIONS}).`;
                 logger.warn(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] ${maxIterError}`);
                 this.stateManager.setError(maxIterError, 'MAX_ITERATIONS_REACHED');
                 this.stateManager.addStep({ tool: '_maxIterations', args: {}, resultSummary: 'Reached max iterations.', attempt: 1 });
                 this.eventEmitter.emitAgentError(maxIterError, 'MAX_ITERATIONS_REACHED');
            }

            await this._finalizeRun();
            return this.stateManager.getFinalStatusObject();

        } catch (error) {
            logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Unhandled error during agent run: ${error.message}`, { stack: error.stack });
            this.stateManager.setError(error.message || 'Unknown agent run error', 'AGENT_RUNNER_ERROR');
            this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
            await this._finalizeRun();
            return this.stateManager.getFinalStatusObject();
        } finally {
             this.contextService.cleanup();
        }
    }

    async _finalizeRun() {
        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Finalizing run for message ${this.aiMessageId}.`);
        const dbData = this.stateManager.getContextForDB();

        if (this.stateManager.context.status === 'awaiting_user_input') {
            dbData.status = 'awaiting_user_input';
            dbData.errorMessage = null;
        }

        dbData.completedAt = new Date();
        dbData.isStreaming = false;

        try {
            const updatedRecord = await PromptHistory.findByIdAndUpdate(
                this.aiMessageId,
                { $set: dbData },
                { new: true }
            ).lean();

            if (!updatedRecord) {
                 logger.error(`[Trace:${this.traceId}] CRITICAL: Failed to find PromptHistory record ${this.aiMessageId} during finalize.`);
            } else {
                logger.info(`[Trace:${this.traceId}] PromptHistory record ${this.aiMessageId} finalized with status: ${dbData.status}`);
            }
        } catch (dbError) {
            logger.error(`[Trace:${this.traceId}] Error saving final state to DB for ${this.aiMessageId}: ${dbError.message}`, { dbData });
        }
    }
}

module.exports = AgentRunner;