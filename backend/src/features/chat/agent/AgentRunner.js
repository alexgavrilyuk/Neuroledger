// backend/src/features/chat/agent/AgentRunner.js
// ENTIRE FILE - FULLY UPDATED

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
        // ** Pass sendEventCallback correctly to the emitter **
        this.eventEmitter = new AgentEventEmitter(sendEventCallback, { userId, sessionId, messageId: aiMessageId });
        this.contextService = new AgentContextService(userId, teamId, sessionId);

        logger.debug(`[Trace:${this.traceId}] [AgentRunner ${sessionId}] Initialized for Message ${this.aiMessageId}`);
    }

    async run(userMessage, sessionDatasetIds = []) {
        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Starting run. Query: "${userMessage.substring(0, 50)}..."`);
        this.stateManager.setQuery(userMessage);

        try {
            // --- Prepare Initial Context ---
            // (Same as previous version)
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
                if (this.stateManager.getIntermediateResult('analysisResult') === null && historyResult.previousAnalysisResult) {
                    this.stateManager.context.intermediateResults.analysisResult = historyResult.previousAnalysisResult;
                    logger.debug(`[Trace:${this.traceId}] Carried over previous analysis result.`);
                }
                 // Handle previous generated code storage correctly
                if (this.stateManager.getIntermediateResult('generatedReportCode') === null && historyResult.previousGeneratedCode) {
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
                llmContext.userId = this.userId; // Ensure userId is in context for provider selection

                // Define the stream callback for the Orchestrator
                 const streamCallback = (type, data) => {
                     // Pass through to the instance's event emitter
                     if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                     else if (type === 'finish') this.eventEmitter.emitStreamFinish(data.finishReason);
                     else if (type === 'completed') this.eventEmitter.emitStreamCompleted();
                     else if (type === 'error') this.eventEmitter.emitStreamError(data.message);
                     // Add other potential event types if the LLM provider stream yields them
                 };

                // Get next action from LLM (includes parsing)
                const llmAction = await getNextActionFromLLM(
                    llmContext,
                    streamCallback,
                    this.toolExecutor.getKnownToolNames()
                );

                // ** NEW: Emit user explanation if available **
                if (llmAction.userExplanation) {
                    this.eventEmitter.emitUserExplanation(llmAction.userExplanation);
                } else if (llmAction.thinking && !llmAction.isFinalAnswer) {
                     // Fallback: If no explanation but thinking exists before a tool call, emit a generic status
                     this.eventEmitter.emitUserExplanation("Okay, planning the next step...");
                }


                // --- Handle Final Answer ---
                if (llmAction.isFinalAnswer) {
                    logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM indicated final answer.`);
                    this.stateManager.setFinalAnswer(llmAction.textResponse); // Store final text
                    // Add step for _answerUserTool
                    this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer provided.', attempt: 1 });

                    // Get final state from manager
                    const finalAnswerText = this.stateManager.context.finalAnswer;
                    const finalGeneratedCode = this.stateManager.getIntermediateResult('generatedReportCode')?.react_code;
                    const finalAnalysisResult = this.stateManager.getIntermediateResult('analysisResult');

                    // Emit final answer event
                    this.eventEmitter.emitFinalAnswer(finalAnswerText, finalGeneratedCode, finalAnalysisResult);
                    break; // Exit loop
                }
                // --- End Handle Final Answer ---

                // --- Handle Clarification ---
                if (llmAction.tool === 'ask_user_for_clarification') {
                     const question = llmAction.args.question || "I need more information to proceed. Could you please clarify?";
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Agent requested clarification: "${question}"`);
                     this.stateManager.context.status = 'awaiting_user_input';
                     this.stateManager.setFinalAnswer(question); // Store question as "final" text for this turn
                     this.stateManager.setError(null);
                     // Add step for the clarification action, store question text in step args maybe?
                     this.stateManager.addStep({ tool: llmAction.tool, args: llmAction.args, resultSummary: 'Asking user for clarification.', attempt: 1 });
                     // Emit specific event for frontend
                     this.eventEmitter.emitNeedsClarification(question);
                     logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Pausing turn to wait for user clarification.`);
                     break; // Exit the agent loop for this turn
                }
                // --- End Handle Clarification ---


                // Prepare for Tool Execution
                const toolName = llmAction.tool;
                const llmToolArgs = llmAction.args;
                logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] LLM requests tool: ${toolName}`);

                // Prepare execution context with necessary callbacks/data
                const executionContext = {
                    userId: this.userId, teamId: this.teamId, sessionId: this.sessionId, traceId: this.traceId,
                    // Provide data based on tool needs
                    analysisResult: (toolName === 'generate_report_code') ? this.stateManager.getIntermediateResult('analysisResult') : undefined,
                    datasetSchemas: (toolName === 'generate_report_code' || toolName === 'generate_analysis_code') ? this.stateManager.getIntermediateResult('datasetSchemas') : undefined,
                    getParsedDataCallback: (toolName === 'execute_analysis_code' || toolName === 'calculate_financial_ratios') ?
                         async (id) => this.stateManager.getIntermediateResult('parsedData', id) : undefined,
                };

                let finalToolResult; // Stores the result of the last attempt

                 // --- REFINEMENT LOOP for execute_analysis_code (NO CHANGES NEEDED HERE for UI update) ---
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

                         // Add step for this attempt
                         this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: `Executing code (Attempt ${attempt})...`, attempt: attempt });
                         this.eventEmitter.emitUsingTool(toolName, llmToolArgs); // Emit tool usage event

                         // Execute the tool (wrapper handles substituted args)
                         const execResult = await this.toolExecutor.execute(
                             toolName,
                             llmToolArgs, // LLM args
                             executionContext,
                             { code: codeToExecute } // System substituted args
                         );
                         const execResultSummary = summarizeToolResult(execResult);
                         finalToolResult = execResult; // Store last result

                         // Process result
                         if (execResult.status === 'success') {
                             logger.info(`[Trace:${this.traceId}] Code execution successful (Attempt ${attempt}).`);
                             this.stateManager.updateLastStep(execResultSummary, null, execResult.result, null);
                             this.eventEmitter.emitToolResult(toolName, execResultSummary, null, null);
                             this.stateManager.setIntermediateResult(toolName, execResult.result, llmToolArgs); // Store successful result
                             executionSuccess = true;
                             break; // Exit refinement loop on success
                         } else {
                             // Handle execution failure
                             const isSandboxError = ['CODE_EXECUTION_FAILED', 'CODE_EXECUTION_TIMEOUT', 'CODE_EXECUTION_NO_RESULT', 'TOOL_EXECUTION_ERROR', 'CODE_GENERATION_INVALID'].includes(execResult.errorCode);
                             logger.warn(`[Trace:${this.traceId}] Code execution failed (Attempt ${attempt}): ${execResult.error} (Code: ${execResult.errorCode})`);
                             this.stateManager.updateLastStep(`Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, null, execResult.errorCode);
                             this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${attempt}): ${execResultSummary}`, execResult.error, execResult.errorCode);
                             this.stateManager.incrementToolErrorCount(refinementCounterKey);

                             // Attempt regeneration if possible
                             if (isSandboxError && attempt < MAX_CODE_REFINEMENT_ATTEMPTS) {
                                 logger.info(`[Trace:${this.traceId}] Attempting code regeneration...`);
                                 this.stateManager.addStep({ tool: 'generate_analysis_code', args: { analysis_goal: '[Refining Code]' }, resultSummary: `Regenerating code due to error (Attempt ${attempt + 1})...`, attempt: 1 });
                                 this.eventEmitter.emitUsingTool('generate_analysis_code', { analysis_goal: '[Refining Code]' }); // Emit refinement tool usage

                                 const originalGoal = llmContext.originalQuery; // Simplified goal fetch
                                 const regenerationGoal = `The previous code execution failed with this error:\n\`\`\`error\n${execResult.error}\n\`\`\`\nPlease regenerate the Javascript code to achieve the original goal while fixing this error and adhering to all constraints.\nOriginal Goal: ${originalGoal}`;
                                 const regenContext = { ...executionContext }; // Copy base context
                                 delete regenContext.getParsedDataCallback; // Not needed for code gen
                                 const regenLlmArgs = { analysis_goal: regenerationGoal, dataset_id: llmToolArgs.dataset_id, previous_error: execResult.error };

                                 // Execute generate_analysis_code tool again
                                 const regenResult = await this.toolExecutor.execute('generate_analysis_code', regenLlmArgs, regenContext);
                                 const regenSummary = summarizeToolResult(regenResult);
                                 this.stateManager.updateLastStep(regenSummary, regenResult.error, regenResult.result, regenResult.errorCode);
                                 this.eventEmitter.emitToolResult('generate_analysis_code', regenSummary, regenResult.error, regenResult.errorCode);

                                 if (regenResult.status !== 'success' || !regenResult.result?.code) {
                                      logger.error(`[Trace:${this.traceId}] Code regeneration failed. Aborting refinement.`);
                                      break; // Exit refinement loop
                                 }
                                 // Store newly generated code (overwrites previous)
                                 this.stateManager.setIntermediateResult('generate_analysis_code', regenResult.result, regenLlmArgs);
                                 // Continue to the next iteration of the refinement loop...
                             } else {
                                 logger.warn(`[Trace:${this.traceId}] Max code refinements reached or error not suitable for refinement. Aborting.`);
                                 break; // Exit refinement loop
                             }
                         }
                     } // End refinement loop

                     // Handle final status after the loop
                     if (!executionSuccess) {
                          logger.error(`[Trace:${this.traceId}] Code execution failed permanently after ${this.stateManager.getToolErrorCount(refinementCounterKey)} refinement attempts.`);
                          this.stateManager.setError(finalToolResult?.error || 'Code execution failed after multiple attempts.', finalToolResult?.errorCode || 'CODE_EXECUTION_FAILED');
                          this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
                          continue; // Let main loop check isFinished() and terminate
                     }
                     // If successful, the main loop continues to the next LLM call...

                 } else {
                    // --- Execute other tools (Simple Retry) ---
                    this.stateManager.addStep({ tool: toolName, args: llmToolArgs, resultSummary: 'Executing tool...', attempt: 1 });
                    this.eventEmitter.emitUsingTool(toolName, llmToolArgs);
                    let toolResult;
                    let currentAttempt = 0;

                    do { // Simple retry loop
                        currentAttempt++;
                        if (currentAttempt > 1) logger.info(`[Trace:${this.traceId}] Retrying tool ${toolName} (Attempt ${currentAttempt})`);
                        toolResult = await this.toolExecutor.execute(
                            toolName,
                            llmToolArgs, // LLM Args
                            executionContext // Execution context
                            // No substituted args for most tools
                        );
                        const resultSummary = summarizeToolResult(toolResult);

                        // Check for error and if retries remain
                        if (toolResult.error && currentAttempt <= MAX_TOOL_RETRIES) {
                            logger.warn(`[Trace:${this.traceId}] Tool ${toolName} failed (Attempt ${currentAttempt}). Retrying. Error: ${toolResult.error} (Code: ${toolResult.errorCode})`);
                            this.stateManager.incrementToolErrorCount(toolName); // Increment standard counter
                            this.stateManager.updateLastStep(`Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, null, toolResult.errorCode);
                            // Update attempt number on the step itself for clarity in context
                            this.stateManager.context.steps[this.stateManager.context.steps.length - 1].attempt = currentAttempt + 1;
                            this.eventEmitter.emitToolResult(toolName, `Error (Attempt ${currentAttempt}): ${resultSummary}`, toolResult.error, toolResult.errorCode);
                            // Optional delay here if needed
                        } else {
                            // Success OR max retries reached OR non-retryable error
                            this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result, toolResult.errorCode);
                            this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error, toolResult.errorCode);
                            if (!toolResult.error) {
                                // Store intermediate result ONLY on final success
                                this.stateManager.setIntermediateResult(toolName, toolResult.result, llmToolArgs);
                            }
                            break; // Exit retry loop
                        }
                    } while (currentAttempt <= MAX_TOOL_RETRIES);

                    // Log if failed after all retries
                    if (toolResult.error) {
                        logger.warn(`[Trace:${this.traceId}] Tool ${toolName} failed after all retries.`);
                        // The error observation will be passed back to the LLM in the next iteration's context.
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

            // Finalize the run (update DB)
            await this._finalizeRun();
            // Return the final status object
            return this.stateManager.getFinalStatusObject();

        } catch (error) {
            logger.error(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Unhandled error during agent run: ${error.message}`, { stack: error.stack });
            this.stateManager.setError(error.message || 'Unknown agent run error', 'AGENT_RUNNER_ERROR');
            this.eventEmitter.emitAgentError(this.stateManager.context.error, this.stateManager.context.errorCode);
            await this._finalizeRun(); // Attempt to finalize even on outer error
            return this.stateManager.getFinalStatusObject();
        } finally {
             this.contextService.cleanup(); // Clean up tokenizer resources
        }
    }

    async _finalizeRun() {
        logger.info(`[Trace:${this.traceId}] [AgentRunner ${this.sessionId}] Finalizing run for message ${this.aiMessageId}.`);
        const dbData = this.stateManager.getContextForDB();

        // Ensure awaiting_user_input status is handled correctly
        if (this.stateManager.context.status === 'awaiting_user_input') {
            dbData.status = 'awaiting_user_input';
            dbData.errorMessage = null; // Clear any potential previous error message
        }

        dbData.completedAt = new Date(); // Set completion timestamp
        dbData.isStreaming = false; // Mark as not streaming anymore

        try {
            const updatedRecord = await PromptHistory.findByIdAndUpdate(
                this.aiMessageId,
                { $set: dbData },
                { new: true } // Return the updated document
            ).lean(); // Use lean if you don't need Mongoose methods after this

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