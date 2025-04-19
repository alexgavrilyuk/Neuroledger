// backend/src/features/chat/agent/AgentRunner.js
// ENTIRE FILE - UPDATED FOR PHASE 6/7 FIX #2

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
        this.traceId = uuidv4(); // Generate trace ID for this run

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
            // Assign context results...
            if (initialCtxResult.status === 'fulfilled') this.stateManager.setUserTeamContext(initialCtxResult.value.userContext, initialCtxResult.value.teamContext);
            else logger.error(`[Trace:${this.traceId}] Failed to get initial user/team context:`, initialCtxResult.reason);

            if (datasetCtxResult.status === 'fulfilled') {
                this.stateManager.setDatasetSchemas(datasetCtxResult.value.datasetSchemas);
                this.stateManager.setDatasetSamples(datasetCtxResult.value.datasetSamples);
            } else logger.error(`[Trace:${this.traceId}] Failed to preload dataset context:`, datasetCtxResult.reason);

            if (historyResultSettled.status === 'fulfilled') {
                const historyResult = historyResultSettled.value;
                this.stateManager.setChatHistory(historyResult.fullChatHistory);
                // Carry over artifacts only if not already present
                if (this.stateManager.getIntermediateResult('analysisResult') === null && historyResult.previousAnalysisResult) {
                    this.stateManager.context.intermediateResults.analysisResult = historyResult.previousAnalysisResult;
                    logger.debug(`[Trace:${this.traceId}] Carried over previous analysis result.`);
                }
                if (this.stateManager.getIntermediateResult('generatedReportCode') === null && historyResult.previousGeneratedCode) {
                     // Ensure structure matches how it's stored by setIntermediateResult
                    this.stateManager.setIntermediateResult('generate_report_code', { react_code: historyResult.previousGeneratedCode });
                    logger.debug(`[Trace:${this.traceId}] Carried over previous generated report code.`);
                }
            } else logger.error(`[Trace:${this.traceId}] Failed to prepare chat history:`, historyResultSettled.reason);
            logger.debug(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Initial context prepared.`);
            // --- End Prepare Initial Context ---

            // --- Main Loop ---
            let iterations = 0;
            while (iterations < MAX_AGENT_ITERATIONS && !this.stateManager.isFinished()) {
                iterations++;
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Iteration ${iterations}`);

                const llmContext = this.stateManager.getContextForLLM();
                llmContext.userId = this.userId;

                const streamCallback = (type, data) => {
                    if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                    else if (type === 'finish') this.eventEmitter.emitStreamFinish(data.finishReason);
                    else if (type === 'completed') this.eventEmitter.emitStreamCompleted();
                    else if (type === 'error') this.eventEmitter.emitStreamError(data.message);
                };
                const llmAction = await getNextActionFromLLM(llmContext, streamCallback, this.toolExecutor.getKnownToolNames());
                if (llmAction.thinking) { this.eventEmitter.emitThinking(llmAction.thinking); }

                // --- Handle Final Answer ---
                if (llmAction.isFinalAnswer) {
                    logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM indicated final answer.`);
                    // Set final answer text in state manager
                    this.stateManager.setFinalAnswer(llmAction.textResponse);
                    // Add a step for this action (even if it was a fallback)
                    this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer.', attempt: 1 });

                    // ** FIX: Fetch latest state from manager BEFORE emitting final event **
                    const finalAnswerText = this.stateManager.context.finalAnswer;
                    // Retrieve code and analysis result from the state manager, not llmAction
                    const finalGeneratedCode = this.stateManager.getIntermediateResult('generatedReportCode')?.react_code; // Extract code string
                    const finalAnalysisResult = this.stateManager.getIntermediateResult('analysisResult');

                    this.eventEmitter.emitFinalAnswer(
                         finalAnswerText,
                         finalGeneratedCode, // Pass code from state
                         finalAnalysisResult // Pass analysis result from state
                     );
                    break; // Exit loop
                }
                // --- End Handle Final Answer ---

                // --- Handle Clarification ---
                if (llmAction.tool === 'ask_user_for_clarification') {
                     const question = llmAction.args.question || "I need more information to proceed. Could you please clarify?";
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Agent requested clarification: "${question}"`);
                     this.stateManager.context.status = 'awaiting_user_input';
                     this.stateManager.setFinalAnswer(question);
                     this.stateManager.setError(null);
                     this.stateManager.addStep({ tool: llmAction.tool, args: llmAction.args, resultSummary: 'Asking user for clarification.', attempt: 1 });
                     this.eventEmitter.emitNeedsClarification(question);
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Pausing turn to wait for user clarification.`);
                     break; // Exit loop
                }
                // --- End Handle Clarification ---

                // Prepare for Tool Execution
                const toolName = llmAction.tool;
                const llmToolArgs = llmAction.args;
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM requests tool: ${toolName}`);

                const executionContext = { // Context shared by most tools
                    userId: this.userId, teamId: this.teamId, sessionId: this.sessionId, traceId: this.traceId,
                    analysisResult: (toolName === 'generate_report_code') ? this.stateManager.getIntermediateResult('analysisResult') : undefined,
                    datasetSchemas: (toolName === 'generate_report_code' || toolName === 'generate_analysis_code') ? this.stateManager.getIntermediateResult('datasetSchemas') : undefined,
                    getParsedDataCallback: (toolName === 'execute_analysis_code' || toolName === 'calculate_financial_ratios') ?
                         async (id) => this.stateManager.getIntermediateResult('parsedData', id) : undefined,
                };

                let finalToolResult; // Stores the result of the last attempt

                // --- REFINEMENT LOOP for execute_analysis_code ---
                if (toolName === 'execute_analysis_code') {
                    let executionSuccess = false;
                    const refinementCounterKey = 'analysis_code_refinement';
                    this.stateManager.context.toolErrorCounts[refinementCounterKey] = 0; // Reset counter

                    for (let attempt = 1; attempt <= MAX_CODE_REFINEMENT_ATTEMPTS; attempt++) {
                        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code Execution Attempt ${attempt}/${MAX_CODE_REFINEMENT_ATTEMPTS}`);
                        const codeToExecute = this.stateManager.getIntermediateResult('generatedAnalysisCode');
                        if (!codeToExecute) {
                            finalToolResult = { status: 'error', error: 'Internal state error: No analysis code available for execution.', args: llmToolArgs, errorCode: 'INTERNAL_CODE_MISSING' };
                            logger.error(`[Trace:${this.traceId}] ${finalToolResult.error}`);
                            break; // Exit refinement loop
                        }

                        this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: `Executing code (Attempt ${attempt})...`, attempt: attempt });
                        this.eventEmitter.emitUsingTool(toolName, llmToolArgs);

                        const execResult = await this.toolExecutor.execute(
                            toolName,
                            llmToolArgs,
                            executionContext,
                            { code: codeToExecute }
                        );
                        const execResultSummary = summarizeToolResult(execResult);
                        finalToolResult = execResult;

                        if (execResult.status === 'success') {
                            logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code execution successful (Attempt ${attempt}).`);
                            this.stateManager.updateLastStep(execResultSummary, null, execResult.result, null);
                            this.eventEmitter.emitToolResult(toolName, execResultSummary, null, null);
                            this.stateManager.setIntermediateResult(toolName, execResult.result, llmToolArgs);
                            executionSuccess = true;
                            break; // Exit refinement loop on success
                        } else {
                             const isSandboxError = ['CODE_EXECUTION_FAILED', 'CODE_EXECUTION_TIMEOUT', 'CODE_EXECUTION_NO_RESULT', 'TOOL_EXECUTION_ERROR'].includes(execResult.errorCode);
                            logger.warn(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code execution failed (Attempt ${attempt}): ${execResult.error} (Code: ${execResult.errorCode})`);
                            this.stateManager.updateLastStep(`Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, null, execResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, execResult.errorCode);
                            this.stateManager.incrementToolErrorCount(refinementCounterKey);

                            if (isSandboxError && attempt < MAX_CODE_REFINEMENT_ATTEMPTS) {
                                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Attempting code regeneration (Refinement Attempt ${this.stateManager.getToolErrorCount(refinementCounterKey) + 1})`);
                                this.stateManager.addStep({ tool: 'generate_analysis_code', args: { analysis_goal: '[Refining Code]' }, resultSummary: `Regenerating code due to error (Attempt ${attempt + 1})...`, attempt: 1 });
                                this.eventEmitter.emitUsingTool('generate_analysis_code', { analysis_goal: '[Refining Code]' });

                                const originalGoal = llmContext.originalQuery;
                                const regenerationGoal = `The previous code execution failed with this error:\n\`\`\`error\n${execResult.error}\n\`\`\`\nPlease regenerate the Javascript code to achieve the original goal while fixing this error and adhering to all constraints.\nOriginal Goal: ${originalGoal}`;
                                const regenContext = { userId: this.userId, teamId: this.teamId, sessionId: this.sessionId, datasetSchemas: llmContext.datasetSchemas };
                                const regenLlmArgs = { analysis_goal: regenerationGoal, dataset_id: llmToolArgs.dataset_id, previous_error: execResult.error };

                                const regenResult = await this.toolExecutor.execute(
                                    'generate_analysis_code',
                                    regenLlmArgs,
                                    regenContext
                                );
                                const regenSummary = summarizeToolResult(regenResult);
                                this.stateManager.updateLastStep(regenSummary, regenResult.error, regenResult.result, regenResult.errorCode);
                                this.eventEmitter.emitToolResult('generate_analysis_code', regenSummary, regenResult.error, regenResult.errorCode);

                                if (regenResult.status !== 'success' || !regenResult.result?.code) {
                                     logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code regeneration failed. Aborting refinement.`);
                                     break; // Exit refinement loop
                                }
                                this.stateManager.setIntermediateResult('generate_analysis_code', regenResult.result, regenLlmArgs);
                            } else {
                                logger.warn(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Max code refinements reached or error not suitable for refinement. Aborting refinement loop.`);
                                break; // Exit refinement loop
                            }
                        }
                    } // End refinement loop

                    if (!executionSuccess) {
                         logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Code execution failed permanently after ${this.stateManager.getToolErrorCount(refinementCounterKey)} refinement attempts.`);
                         this.stateManager.setError(finalToolResult?.error || 'Code execution failed after multiple attempts.', finalToolResult?.errorCode || 'CODE_EXECUTION_FAILED');
                         this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
                         continue; // Let main loop check isFinished() and terminate
                    }
                    // If successful, continue to next LLM call

                } else {
                    // --- Execute other tools ---
                    this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: 'Executing tool...', attempt: 1 });
                    this.eventEmitter.emitUsingTool(toolName, llmToolArgs);
                    let toolResult;
                    let currentAttempt = 0;

                    do { // Simple retry loop
                        currentAttempt++;
                        if (currentAttempt > 1) logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Retrying tool ${toolName} (Attempt ${currentAttempt})`);
                        toolResult = await this.toolExecutor.execute(
                            toolName,
                            llmToolArgs,
                            executionContext
                        );
                        const resultSummary = summarizeToolResult(toolResult);

                        if (toolResult.error && currentAttempt <= MAX_TOOL_RETRIES) {
                            logger.warn(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Tool ${toolName} failed (Attempt ${currentAttempt}). Retrying. Error: ${toolResult.error} (Code: ${toolResult.errorCode})`);
                            this.stateManager.incrementToolErrorCount(toolName);
                            this.stateManager.updateLastStep(`Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, null, toolResult.errorCode);
                            this.stateManager.context.steps[this.stateManager.context.steps.length - 1].attempt = currentAttempt + 1;
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, toolResult.errorCode);
                            // Optional delay here
                        } else {
                            this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result, toolResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error, toolResult.errorCode);
                            if (!toolResult.error) {
                                this.stateManager.setIntermediateResult(toolName, toolResult.result, llmToolArgs);
                            }
                            break; // Exit retry loop
                        }
                    } while (currentAttempt <= MAX_TOOL_RETRIES);

                    if (toolResult.error) {
                        logger.warn(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Tool ${toolName} failed after all retries.`);
                        // Error observation will be passed to LLM
                    }
                }
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
        dbData.completedAt = new Date(); // Set completion timestamp
        try {
            const updatedRecord = await PromptHistory.findByIdAndUpdate(
                this.aiMessageId,
                { $set: dbData },
                { new: true }
            ).lean();
            if (!updatedRecord) {
                 logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] CRITICAL: Failed to find PromptHistory record ${this.aiMessageId} during finalize.`);
            } else {
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] PromptHistory record ${this.aiMessageId} finalized with status: ${dbData.status}`);
            }
        } catch (dbError) {
            logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Error saving final state to DB for ${this.aiMessageId}: ${dbError.message}`, { dbData });
        }
    }
}

module.exports = AgentRunner;