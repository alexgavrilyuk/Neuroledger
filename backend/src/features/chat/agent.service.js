const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const promptService = require('./prompt.service');
const PromptHistory = require('./prompt.model');
const { getIO } = require('../../socket'); // Corrected path
const { assembleContext } = require('./prompt.service'); // Import assembleContext
const codeExecutionService = require('../../shared/services/codeExecution.service'); // Import Code Execution Service
const Papa = require('papaparse'); // Import papaparse
const User = require('../users/user.model');

const MAX_AGENT_ITERATIONS = 10; // Increased iterations slightly for multi-step tasks
const MAX_TOOL_RETRIES = 1; // Allow one retry for potentially transient tool errors
const HISTORY_SUMMARIZATION_THRESHOLD = 10; // Summarize if more than 10 messages
const HISTORY_FETCH_LIMIT = 20; // Max messages to fetch for context/summarization

/**
 * Orchestrates the agent's reasoning loop to fulfill user requests.
 */
class AgentOrchestrator {
    constructor(userId, teamId, sessionId, aiMessagePlaceholderId, previousAnalysisData = null, previousGeneratedCode = null) {
        this.userId = userId;
        this.teamId = teamId; // May be null for personal context
        this.sessionId = sessionId;
        this.aiMessagePlaceholderId = aiMessagePlaceholderId;
        this.turnContext = {
            originalQuery: '',
            chatHistoryForSummarization: [], // Store raw history for summarizer
            steps: [], // Track tools used and results this turn
            intermediateResults: {
                lastSchema: null, 
                parsedDataRef: null,
                generatedAnalysisCode: null,
                analysisResult: null,
                analysisError: null,
                previousAnalysisData: previousAnalysisData,
                previousGeneratedCode: previousGeneratedCode,
            },
            userContext: '', // User settings context
            teamContext: '', // Team settings context
            generatedReportCode: null, // NEW: Store generated React code this turn
            finalAnswer: null,
            error: null,
            // Track tool errors/retries within a turn
            toolErrorCounts: {}, // { [toolName]: count }
        };
        this.io = getIO(); // Get socket instance
    }

    /**
     * Emits WebSocket events to update the frontend on agent status.
     * Targets the specific user associated with this agent instance.
     * @param {string} eventName - The name of the event (e.g., 'agent:thinking').
     * @param {object} payload - The data payload for the event.
     */
    _emitAgentStatus(eventName, payload) {
        if (this.io && this.sessionId && this.userId) {
            const eventPayload = {
                messageId: this.aiMessagePlaceholderId,
                sessionId: this.sessionId,
                ...payload,
            };
            // Emit specifically to the user's room
            const userRoom = `user:${this.userId}`;
            this.io.to(userRoom).emit(eventName, eventPayload);
            logger.debug(`Agent Event Emitted to room ${userRoom}: ${eventName}`, eventPayload);
        } else {
            logger.warn('Socket.io instance, session ID, or user ID missing, cannot emit agent status.', {
                 hasIo: !!this.io, sessionId: this.sessionId, userId: this.userId
            });
        }
    }

    /**
     * Runs the main agent loop: Reason -> Act -> Observe.
     * @param {string} userMessage - The user's current message/query.
     * @returns {Promise<{status: string, aiResponseText?: string, error?: string}>} - Final status and result.
     */
    async runAgentLoop(userMessage) {
        logger.info(`[Agent Loop ${this.sessionId}] Starting for user ${this.userId}, message: "${userMessage.substring(0, 50)}..."`);
        this.turnContext.originalQuery = userMessage;
        this.turnContext.toolErrorCounts = {}; // Reset error counts for the turn
        let iterations = 0;

        try {
            // 0. Set initial state & emit thinking
            this._emitAgentStatus('agent:thinking', {});

            // Fetch initial user/team context settings
            const initialContext = await assembleContext(this.userId, []); // No datasets needed here
            this.turnContext.userContext = initialContext.userContext;
            this.turnContext.teamContext = initialContext.teamContext;

            await this._prepareChatHistory(); // Prepare history context

            while (iterations < MAX_AGENT_ITERATIONS) {
                iterations++;
                logger.info(`[Agent Loop ${this.sessionId}] Iteration ${iterations}`);
                
                let action;
                let forceAction = null; // null | 'execute_parser' | 'generate_analysis' | 'execute_analysis'
                let codeToExecute = null;
                let datasetIdForExecution = null; // Still needed for parsing
                let parsedDataRefForExecution = null;
                let analysisGoalForGeneration = null;

                // --- Determine if an action should be forced based on previous step --- 
                if (this.turnContext.steps.length > 0) {
                    const lastStep = this.turnContext.steps[this.turnContext.steps.length - 1];
                    const lastTool = lastStep.tool;
                    const lastResultSummary = lastStep.resultSummary || '';
                    const lastArgs = lastStep.args || {};

                    // Case 1: Generation of PARSER code succeeded -> Force execution of parser code
                    if (lastTool === 'generate_data_extraction_code' && !lastResultSummary.startsWith('Error') && this.turnContext.intermediateResults.generatedParserCode) {
                        forceAction = 'execute_parser';
                        let rawGeneratedCode = this.turnContext.intermediateResults.generatedParserCode;
                        const codeBlockRegex = /^```(?:javascript|js)?\s*([\s\S]*?)\s*```$|^([\s\S]*)$/m;
                        const match = rawGeneratedCode.match(codeBlockRegex);
                        codeToExecute = match && (match[1] || match[2]) ? (match[1] || match[2]).trim() : rawGeneratedCode.trim();
                        datasetIdForExecution = lastArgs.dataset_id;
                        // Store original goal for the *next* generation step
                        this.turnContext.intermediateResults.originalAnalysisGoal = lastArgs.analysis_goal;
                        logger.info(`[Agent Loop ${this.sessionId}] Stage 1 Complete: Parser code generated. Forcing execution.`);
                    }
                    // Case 2: Execution of PARSER code succeeded -> Force generation of ANALYSIS code
                    else if (lastTool === 'execute_backend_code' && !lastResultSummary.startsWith('Error') && this.turnContext.intermediateResults.parserExecutionResult) {
                        forceAction = 'generate_analysis';
                        // --- OVERRIDE GOAL FOR DEBUGGING --- 
                        // analysisGoalForGeneration = this.turnContext.intermediateResults.originalAnalysisGoal;
                        analysisGoalForGeneration = "Calculate the total number of rows in the inputData array and return it as { rowCount: number }.";
                        logger.info(`[Agent Loop ${this.sessionId}] Stage 2 Complete: Parser code executed. Forcing SIMPLE analysis code generation.`);
                        // --- END OVERRIDE --- 
                    }
                    // Case 3: Generation of ANALYSIS code succeeded -> Force execution of analysis code
                    else if (lastTool === 'generate_analysis_code' && !lastResultSummary.startsWith('Error') && this.turnContext.intermediateResults.generatedAnalysisCode) {
                        forceAction = 'execute_analysis';
                        // Use the already cleaned code stored from the generation step
                        codeToExecute = this.turnContext.intermediateResults.generatedAnalysisCode;
                        parsedDataRefForExecution = this.turnContext.intermediateResults.parsedDataRef;
                        logger.info(`[Agent Loop ${this.sessionId}] Stage 3 Complete: Analysis code generated. Forcing execution.`);
                    }
                }

                // --- Determine Action --- 
                if (forceAction === 'execute_parser') {
                    if (!codeToExecute) {
                        logger.error('[Agent Loop] Cannot force PARSER execution, cleaned code is empty.');
                        action = null; // Let LLM try to recover
                    } else {
                        action = {
                            tool: 'execute_backend_code', // Still uses the old executor name for now
                            args: { code: codeToExecute, dataset_id: datasetIdForExecution }
                        };
                    }
                    this.turnContext.intermediateResults.generatedParserCode = null; // Clear intermediate
                } else if (forceAction === 'generate_analysis') {
                     if (!analysisGoalForGeneration) {
                         logger.error('[Agent Loop] Cannot force ANALYSIS generation, original goal not found.');
                         action = null;
                     } else {
                        action = {
                            tool: 'generate_analysis_code',
                            args: { analysis_goal: analysisGoalForGeneration }
                        };
                     }
                } else if (forceAction === 'execute_analysis') {
                     const rawGeneratedCode = this.turnContext.intermediateResults.generatedAnalysisCode;
                     parsedDataRefForExecution = this.turnContext.intermediateResults.parsedDataRef;

                     // --- Ensure code fences are removed RIGHT BEFORE execution ---
                     let codeToExecute = rawGeneratedCode; // Default to raw code
                     if (rawGeneratedCode && typeof rawGeneratedCode === 'string') {
                         const codeFenceRegex = /^```(?:javascript|js)?\s*([\s\S]*?)\s*```$|^([\s\S]*)$/m;
                         const match = rawGeneratedCode.match(codeFenceRegex);
                         if (match && (match[1] || match[2])) {
                             codeToExecute = (match[1] || match[2]).trim(); // Use cleaned code
                             logger.debug('[Agent Loop] Cleaned analysis code before execution.');
                         } else {
                              codeToExecute = rawGeneratedCode.trim(); // Trim anyway
                         }
                     }
                     // --- End cleaning ---

                     if (!codeToExecute) {
                         logger.error('[Agent Loop] Cannot force ANALYSIS execution, cleaned code is empty.');
                         action = null;
                     } else if (!parsedDataRefForExecution) {
                         logger.error('[Agent Loop] Cannot force ANALYSIS execution, parsed data reference is missing.');
                         action = null;
                     } else {
                         action = {
                             tool: 'execute_analysis_code',
                             args: { code: codeToExecute, parsed_data_ref: parsedDataRefForExecution }
                         };
                     }
                     this.turnContext.intermediateResults.generatedAnalysisCode = null; // Clear intermediate context
                }
                
                // If no action forced, get from LLM
                if (!action) { 
                    const llmContext = this._prepareLLMContext();
                    const llmResponse = await promptService.getLLMReasoningResponse(llmContext);
                    action = this._parseLLMResponse(llmResponse);
                }

                // --- Action Processing --- 
                if (action.tool === '_answerUserTool') {
                    // Validate the extracted answer
                    if (typeof action.args.textResponse !== 'string' || action.args.textResponse.trim() === '') {
                         logger.warn(`[Agent Loop ${this.sessionId}] LLM called _answerUserTool with invalid/empty textResponse. Raw response: ${llmResponse}`);
                         // Fallback: Use the raw response, hoping it's the intended answer
                         this.turnContext.finalAnswer = llmResponse.trim();
                    } else {
                        this.turnContext.finalAnswer = action.args.textResponse;
                    }
                    logger.info(`[Agent Loop ${this.sessionId}] LLM decided to answer.`);
                    this.turnContext.steps.push({ tool: action.tool, args: action.args, resultSummary: 'Final answer provided.' });
                    break; 
                } else if (action.tool === 'generate_report_code') { // Handle report generation
                    logger.info(`[Agent Loop ${this.sessionId}] LLM requested tool: ${action.tool}`);
                    this.turnContext.steps.push({ tool: action.tool, args: action.args, resultSummary: 'Executing tool...'});
                    this._emitAgentStatus('agent:using_tool', { toolName: action.tool, args: action.args });

                    const toolResult = await this.toolDispatcher(action.tool, action.args);
                    const resultSummary = this._summarizeToolResult(toolResult);
                    this.turnContext.steps[this.turnContext.steps.length - 1].resultSummary = resultSummary;
                    this._emitAgentStatus('agent:tool_result', { toolName: action.tool, resultSummary });

                    if (toolResult.error) {
                        logger.warn(`[Agent Loop ${this.sessionId}] Tool ${action.tool} resulted in error: ${toolResult.error}`);
                    } else if (toolResult.result && toolResult.result.react_code) {
                        // Clean the code before storing
                        let cleanedCode = toolResult.result.react_code;
                        if (cleanedCode && typeof cleanedCode === 'string') {
                            const codeFenceRegex = /^```(?:javascript|js|json)?\s*([\s\S]*?)\s*```$/m;
                            const match = cleanedCode.match(codeFenceRegex);
                            if (match && match[1]) {
                                cleanedCode = match[1].trim();
                                console.log('[Agent Loop Clean] Cleaned React Code (fences removed):', cleanedCode);
                            } else {
                                cleanedCode = cleanedCode.trim();
                            }
                        }
                        // Store the CLEANED generated code in the turn context
                        this.turnContext.generatedReportCode = cleanedCode;
                        logger.info(`[Agent Loop ${this.sessionId}] Stored cleaned generated React report code.`);
                    }
                    // Loop continues after report generation attempt
                } else if (action.tool) {
                    logger.info(`[Agent Loop ${this.sessionId}] Executing Action: Tool ${action.tool}`);
                    const currentStepIndex = this.turnContext.steps.length;
                    // Don't add a step if it's a forced action that logically follows the previous step?
                    // Or maybe add it to show the forced step? Let's add it.
                    this.turnContext.steps.push({ 
                        tool: action.tool, 
                        args: action.args, 
                        resultSummary: 'Executing tool...', 
                        attempt: 1, 
                        isForced: !!forceAction // Mark if step was forced
                    });
                    
                    this._emitAgentStatus('agent:using_tool', { toolName: action.tool, args: action.args });

                    let toolResult = await this.toolDispatcher(action.tool, action.args);
                    let resultSummary = this._summarizeToolResult(toolResult);
                    
                    if(this.turnContext.steps[currentStepIndex]) {
                        this.turnContext.steps[currentStepIndex].resultSummary = resultSummary;
                    }
                    
                    // --- Retry Logic (Only for non-forced steps?) ---
                    // If a forced step fails, retrying might not help if the input was wrong.
                    // Let's disable retry for forced steps for now.
                    const allowRetry = !forceAction;
                    if (allowRetry && toolResult.error && (this.turnContext.toolErrorCounts[action.tool] || 0) < MAX_TOOL_RETRIES) {
                         const retryCount = (this.turnContext.toolErrorCounts[action.tool] || 0) + 1;
                         logger.warn(`[Agent Loop ${this.sessionId}] Tool ${action.tool} failed. Attempting retry (${retryCount}/${MAX_TOOL_RETRIES}). Error: ${toolResult.error}`);
                         this.turnContext.toolErrorCounts[action.tool] = retryCount;
                         
                         const stepSummaryWithError = `Error: ${toolResult.error}. Retrying...`;
                         if(this.turnContext.steps[currentStepIndex]) {
                              this.turnContext.steps[currentStepIndex].resultSummary = stepSummaryWithError;
                              this.turnContext.steps[currentStepIndex].attempt = retryCount + 1; 
                         }
                         this._emitAgentStatus('agent:tool_result', { toolName: action.tool, resultSummary: stepSummaryWithError });

                         this._emitAgentStatus('agent:using_tool', { toolName: action.tool, args: action.args }); 
                         toolResult = await this.toolDispatcher(action.tool, action.args); 
                         resultSummary = this._summarizeToolResult(toolResult);
                         
                         if(this.turnContext.steps[currentStepIndex]) {
                             this.turnContext.steps[currentStepIndex].resultSummary = resultSummary;
                         }
                         
                         if (toolResult.error) {
                            logger.error(`[Agent Loop ${this.sessionId}] Tool ${action.tool} failed on retry. Error: ${toolResult.error}`);
                         } else {
                            logger.info(`[Agent Loop ${this.sessionId}] Tool ${action.tool} succeeded on retry.`);
                         }
                     }
                    // --- End Retry Logic ---

                    this._emitAgentStatus('agent:tool_result', { toolName: action.tool, resultSummary });

                    // --- ADDED: Error Check specifically for Analysis Execution Failure ---
                    if ((action.tool === 'execute_analysis_code' || action.tool === 'execute_backend_code') && toolResult.error) {
                        logger.error(`[Agent Loop ${this.sessionId}] CRITICAL ERROR during code execution: ${toolResult.error}. Terminating loop.`);
                        this.turnContext.error = `Code Execution Failed: ${resultSummary}`; 
                        await this._updatePromptHistoryRecord('error', null, this.turnContext.error, null);
                        this._emitAgentStatus('agent:error', { error: this.turnContext.error });
                        return { status: 'error', error: this.turnContext.error }; // Exit loop immediately
                    }
                    // --- END ADDED Error Check ---

                    // --- Store Intermediate Results --- 
                    if (action.tool === 'get_dataset_schema' && toolResult.result) {
                        this.turnContext.intermediateResults.lastSchema = toolResult.result;
                        logger.info(`Stored dataset schema.`);
                    }
                    if (action.tool === 'parse_csv_data' && toolResult.result?.parsed_data_ref) {
                        this.turnContext.intermediateResults.parsedDataRef = toolResult.result.parsed_data_ref;
                        logger.info(`Stored parsed data reference: ${toolResult.result.parsed_data_ref}`);
                    }
                    if (action.tool === 'generate_data_extraction_code' && toolResult.result?.code) {
                        this.turnContext.intermediateResults.generatedParserCode = toolResult.result.code;
                        logger.info(`Stored generated PARSER code for execution.`);
                    }
                     if (action.tool === 'generate_analysis_code' && toolResult.result?.code) {
                         this.turnContext.intermediateResults.generatedAnalysisCode = toolResult.result.code;
                         logger.info(`Stored generated ANALYSIS code.`);
                    } 
                    // Distinguish parser vs analysis execution results based on context
                    if (action.tool === 'execute_backend_code') { // Old name used by parser exec
                        if (toolResult.result !== undefined) {
                             this.turnContext.intermediateResults.parserExecutionResult = toolResult.result;
                             logger.info(`Stored PARSER execution result.`);
                        } else if (toolResult.error) {
                             this.turnContext.intermediateResults.parserExecutionError = toolResult.error;
                             logger.warn(`Stored PARSER execution error.`);
                        }
                    }
                     if (action.tool === 'execute_analysis_code') { // New name for analysis exec
                         if (toolResult.result !== undefined) {
                             // Ensure we store the *actual* result from the execution tool's {result: ...} wrapper
                             this.turnContext.intermediateResults.analysisResult = toolResult.result;
                             logger.info(`Stored ANALYSIS execution result.`);
                         } else if (toolResult.error) {
                             this.turnContext.intermediateResults.analysisError = toolResult.error;
                             logger.warn(`Stored ANALYSIS execution error.`);
                         }
                    }
                    if (action.tool === 'generate_report_code' && toolResult.result?.react_code) {
                         this.turnContext.generatedReportCode = toolResult.result.react_code;
                         logger.info(`Stored generated React report code.`);
                    }
                    // --- End Store Results ---
                    
                } else { 
                    logger.warn(`[Agent Loop ${this.sessionId}] LLM response parsing failed or yielded no action. Treating raw response as final answer. Raw: ${llmResponse}`);
                    this.turnContext.finalAnswer = llmResponse.trim();
                    this.turnContext.steps.push({ tool: '_unknown', args: {}, resultSummary: 'LLM response unclear, using as final answer.' });
                    break;
                }
            } // End while loop

            if (iterations >= MAX_AGENT_ITERATIONS && !this.turnContext.finalAnswer) {
                logger.warn(`[Agent Loop ${this.sessionId}] Agent reached maximum iterations.`);
                // Attempt to formulate a response indicating failure due to complexity/iterations
                this.turnContext.finalAnswer = "I apologize, but I couldn't complete the request within the allowed steps. The query might be too complex.";
                this.turnContext.steps.push({ tool: '_maxIterations', args: {}, resultSummary: 'Reached max iterations.'});
                // Fall through to update record and return gracefully
            }

            if (!this.turnContext.finalAnswer) {
                 logger.error(`[Agent Loop ${this.sessionId}] Loop finished unexpectedly without a final answer.`);
                 // Try to provide a generic error message if no answer was formed
                 this.turnContext.finalAnswer = "I encountered an unexpected issue and could not complete the request.";
                 this.turnContext.steps.push({ tool: '_internalError', args: {}, resultSummary: 'Loop ended without final answer.'});
                 // Fall through to update record, but maybe mark as error?
                 await this._updatePromptHistoryRecord('error', null, 'Agent loop finished without final answer', null);
                 return { status: 'error', error: 'Agent loop finished without final answer' };
            }

            // 5. Finalize: Update the PromptHistory record with the potentially corrected answer
            await this._updatePromptHistoryRecord(
                'completed',
                this.turnContext.finalAnswer, // Use the original LLM final answer
                null, // No error message
                this.turnContext.generatedReportCode // Pass generated code
            );
            logger.info(`[Agent Loop ${this.sessionId}] Completed successfully.`);
            return { 
                status: 'completed', 
                aiResponseText: this.turnContext.finalAnswer, // Return original LLM final answer
                // Optionally return code here too? Task handler re-fetches anyway.
                // aiGeneratedCode: this.turnContext.generatedReportCode 
            };

        } catch (error) {
            logger.error(`[Agent Loop ${this.sessionId}] Error during agent execution: ${error.message}`, { error });
            const errorMessage = error.message || 'Unknown agent error';
            this.turnContext.error = errorMessage;
            this._emitAgentStatus('agent:error', { error: errorMessage });
            // Ensure update happens even if placeholder ID is null somehow (shouldn't happen)
            if (this.aiMessagePlaceholderId) {
                 await this._updatePromptHistoryRecord('error', null, errorMessage, null); 
            }
            return { status: 'error', error: errorMessage };
        }
    }

    /** Fetches and potentially summarizes chat history. */
    async _prepareChatHistory() {
        try {
             const historyRecords = await PromptHistory.find({
                 chatSessionId: this.sessionId,
                 _id: { $ne: this.aiMessagePlaceholderId } // Exclude the current placeholder
             })
             .sort({ createdAt: 1 }) // Fetch oldest first for chronological order
             .limit(HISTORY_FETCH_LIMIT) // Still limit to avoid excessive context
             .select('messageType promptText aiResponseText reportAnalysisData aiGeneratedCode createdAt _id') // Added reportAnalysisData, aiGeneratedCode, _id
             .lean();

             logger.debug(`[Agent History Prep] Fetched ${historyRecords.length} history records.`);

             // Format history for LLM (chronological order)
             const formattedHistory = historyRecords.map(msg => ({
                 role: msg.messageType === 'user' ? 'user' : 'assistant',
                 // Ensure content exists, provide fallback if necessary
                 content: (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''
             })).filter(msg => msg.content); // Filter out messages with no content


             // Store the formatted full history in the turn context
             this.turnContext.fullChatHistory = formattedHistory;


             // --- REVISED LOGIC to find artifacts independently ---
             // Search newest-to-oldest for artifacts
             let previousAnalysisResult = null;
             let previousGeneratedCode = null;
             let analysisFoundOnMsgId = null;
             let codeFoundOnMsgId = null;

             // Use the original lean objects from historyRecords for artifact search, which include the necessary fields
             const historyRecordsForArtifactSearch = [...historyRecords].reverse(); // Create reversed copy for searching newest-first
             logger.debug(`[Agent History Prep] Searching ${historyRecordsForArtifactSearch.length} history records (newest first) for artifacts...`);


             for (const msg of historyRecordsForArtifactSearch) { // Iterate newest to oldest
                 if (msg.messageType === 'assistant') {
                     // Find the *first* (most recent) message with analysis data
                     if (previousAnalysisResult === null && msg.reportAnalysisData) {
                         previousAnalysisResult = msg.reportAnalysisData;
                         analysisFoundOnMsgId = msg._id;
                         logger.info(`[Agent History Prep] Found previous analysis result on message ID ${analysisFoundOnMsgId}`);
                     }

                    // Find the *first* (most recent) message with generated code
                    if (previousGeneratedCode === null && msg.aiGeneratedCode) {
                         previousGeneratedCode = msg.aiGeneratedCode;
                         codeFoundOnMsgId = msg._id;
                          logger.info(`[Agent History Prep] Found previous generated code on message ID ${codeFoundOnMsgId}`);
                    }
                 }
                 // Stop searching if we've found both artifacts
                 if (previousAnalysisResult !== null && previousGeneratedCode !== null) {
                     logger.debug('[Agent History Prep] Found both analysis and code artifacts. Stopping artifact search.');
                     break;
                 }
             }
             // --- END REVISED LOGIC --


             // Store potentially found artifacts in intermediate results
             this.turnContext.intermediateResults.previousAnalysisData = previousAnalysisResult;
             this.turnContext.intermediateResults.previousGeneratedCode = previousGeneratedCode;

             logger.debug(`[Agent History Prep] Post-artifact search check:`, {
                 hasPreviousAnalysis: !!previousAnalysisResult,
                 analysisMsgId: analysisFoundOnMsgId,
                 hasPreviousCode: !!previousGeneratedCode,
                 codeMsgId: codeFoundOnMsgId,
             });

             // --- History Summarization and related fields REMOVED ---
             // Removed: chatHistoryForSummarization, historySummary generation logic

        } catch (err) {
             logger.error(`Failed to fetch chat history for session ${this.sessionId}: ${err.message}`);
             this.turnContext.fullChatHistory = []; // Ensure it's an empty array on error
             // Reset artifact state on error to avoid passing stale data
             this.turnContext.intermediateResults.previousAnalysisData = null;
             this.turnContext.intermediateResults.previousGeneratedCode = null;
        }
    }

    /**
     * Prepares the full context object required by the LLM reasoning prompt service.
     * @returns {object} - Context object for promptService.getLLMReasoningResponse.
     */
    _prepareLLMContext() {
        // --- ADDED: Prepare previous analysis context ---
        let previousAnalysisResultSummary = null;
        let hasPreviousGeneratedCode = false;

        if (this.turnContext.intermediateResults.previousAnalysisData) {
            // Simple summary indicating data is available. The LLM prompt instructs it to use this.
            previousAnalysisResultSummary = "Analysis results from a previous turn are available and should be reused if applicable.";
            // You could add more detail here if needed, e.g., extracting key figures.
        }
        if (this.turnContext.intermediateResults.previousGeneratedCode) {
            hasPreviousGeneratedCode = true;
        }
        // --- END ADDED ---

        // Ensure fullChatHistory exists (it should be set by _prepareChatHistory)
        const fullChatHistory = this.turnContext.fullChatHistory || [];

        return {
            userId: this.userId, // Pass userId for model preference selection
            originalQuery: this.turnContext.originalQuery,
            // REMOVED historySummary
            fullChatHistory: fullChatHistory, // Pass the full formatted history
            currentTurnSteps: this.turnContext.steps,
            availableTools: this._getToolDefinitions(), // Pass tool definitions
            userContext: this.turnContext.userContext, // Pass user context
            teamContext: this.turnContext.teamContext, // Pass team context
            // --- ADDED: Pass previous analysis info ---
            previousAnalysisResultSummary: previousAnalysisResultSummary,
            hasPreviousGeneratedCode: hasPreviousGeneratedCode,
            // --- END ADDED ---
            // Pass current turn analysis result if available (for direct use)
            analysisResult: this.turnContext.intermediateResults.analysisResult
        };
    }

    /**
     * Parses the LLM's raw response text to identify tool calls or final answers.
     * Expected tool call format: A JSON object like {"tool": "<name>", "args": {...}}
     * Anything else is treated as a final answer for the _answerUserTool.
     * @param {string} llmResponse - The raw text response from the LLM.
     * @returns {{tool: string|null, args: object|null}} - Parsed action.
     */
    _parseLLMResponse(llmResponse) {
        if (!llmResponse || typeof llmResponse !== 'string') {
             logger.warn('LLM response is empty or not a string.');
             return { tool: '_answerUserTool', args: { textResponse: 'An error occurred: Empty response from AI.' } };
        }

        const trimmedResponse = llmResponse.trim();
        
        // Regex to find a JSON object enclosed in optional markdown fences
        const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*\})\s*```$|^(\{[\s\S]*\})$/m;
        const jsonMatch = trimmedResponse.match(jsonRegex);

        if (jsonMatch) {
            const potentialJson = jsonMatch[1] || jsonMatch[2];
            if (potentialJson) {
                 let sanitizedJsonString = null; // Declare outside the try block
                 try {
                    // --- SANITIZATION STEP --- 
                    sanitizedJsonString = potentialJson.replace(/("code"\s*:\s*")([\s\S]*?)("(?!\\))/gs, (match, p1, p2, p3) => {
                        const escapedCode = p2
                            .replace(/\\/g, '\\') // Escape backslashes FIRST
                            .replace(/"/g, '\"')  // Escape double quotes
                            .replace(/\n/g, '\\n') // Escape newlines
                            .replace(/\r/g, '\\r'); // Escape carriage returns
                        return p1 + escapedCode + p3;
                    });
                    // --- END SANITIZATION --- 

                    const parsed = JSON.parse(sanitizedJsonString); // Parse the sanitized string

                    // Validate the parsed JSON structure for a tool call
                    if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                        const knownTools = this._getToolImplementations();
                        if (knownTools[parsed.tool]) {
                            logger.debug(`Parsed tool call via regex: ${parsed.tool}`, parsed.args);
                            // Handle _answerUserTool called via JSON
                            if (parsed.tool === '_answerUserTool') {
                                if(typeof parsed.args.textResponse === 'string' && parsed.args.textResponse.trim() !== ''){
                                     return { tool: parsed.tool, args: parsed.args };
                                } else {
                                     logger.warn('_answerUserTool called via JSON but missing/empty textResponse.');
                                     return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                                }
                            }
                            return { tool: parsed.tool, args: parsed.args }; // Valid tool call
                        } else {
                            logger.warn(`LLM requested unknown tool via JSON: ${parsed.tool}`);
                            return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                        }
                    } else {
                         logger.warn('Parsed JSON does not match expected tool structure.', parsed);
                         return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                    }
                } catch (e) {
                    // sanitizedJsonString is now accessible here
                    logger.error(`Failed to parse extracted JSON: ${e.message}. Sanitized attempt: ${sanitizedJsonString !== null ? sanitizedJsonString : '[Sanitization failed or not reached]'}. Original JSON source: ${potentialJson}`);
                    return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                }
            }
        }

        logger.debug('LLM response treated as final answer text (no valid JSON tool call found).');
        return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
    }

    /** Returns array of tool definitions the LLM can use. */
    _getToolDefinitions() {
        // Note: Output format must match what the LLM expects.
        return [
            {
                name: 'list_datasets',
                description: 'Lists available datasets (IDs, names, descriptions).',
                args: {}, // No arguments needed
                output: '{ "datasets": [{ "id": "...", "name": "...", "description": "..." }] }'
            },
            {
                name: 'get_dataset_schema',
                description: 'Gets schema (column names, types, descriptions) for a specific dataset ID.',
                args: {
                    dataset_id: 'string' // Specify required arguments and types
                },
                output: '{ "schemaInfo": [...], "columnDescriptions": {...}, "description": "..." }'
            },
            {
                name: 'parse_csv_data',
                description: 'Parses the raw CSV content of a dataset using PapaParse. Returns a reference ID to the parsed data.',
                args: {
                    dataset_id: 'string'
                },
                 output: '{ "status": "success", "parsed_data_ref": "<ref_id>", "rowCount": <number> } or { "error": "..." }'
            },
            {
                name: 'generate_analysis_code',
                description: 'Generates Node.js analysis code expecting pre-parsed data in `inputData` variable. Requires schema context from `get_dataset_schema`.',
                args: {
                     analysis_goal: 'string'
                     // Removed dataset_id, as schema is retrieved separately
                },
                 output: '{ "code": "<Node.js code string>" }'
            },
            {
                 name: 'execute_analysis_code',
                 description: 'Executes analysis code in a sandbox with parsed data injected as `inputData`. Requires `parse_csv_data` to be called first.',
                 args: {
                     code: 'string', 
                     parsed_data_ref: 'string'
                 },
                 output: '{ "result": <JSON result>, "error": "..." }'
            },
            {
                name: 'generate_report_code',
                description: 'Generates React report code based on analysis results available in the context. Use this AFTER `execute_analysis_code` succeeds.',
                // *** REMOVED analysis_result from args presented to LLM ***
                args: {
                    analysis_summary: 'string' // Only require summary from LLM
                },
                output: '{ "react_code": "<React code string>" }'
            },
            {
                name: '_answerUserTool',
                description: 'Provides the final textual answer to the user.',
                args: { textResponse: 'string' },
                output: 'Signals loop end.'
            }
        ];
    }

    /** Returns mapping of tool names to their implementation functions. */
    _getToolImplementations() {
        return {
            'list_datasets': this._listDatasetsTool,
            'get_dataset_schema': this._getDatasetSchemaTool,
            'parse_csv_data': this._parseCsvDataTool, 
            'generate_analysis_code': this._generateAnalysisCodeTool, 
            'execute_analysis_code': this._executeAnalysisCodeTool, 
            'generate_report_code': this._generateReportCodeTool,
            '_answerUserTool': this._answerUserTool,
        };
    }

    /** Summarizes tool results, especially large ones, for the LLM context. */
    _summarizeToolResult(result) {
        try {
            if (!result) return 'Tool returned no result.';
            if (result.error) {
                let errorSummary = `Error: ${result.error}`; 
                // Be more specific for common errors if possible
                if (result.error.includes('timed out')) {
                    errorSummary = 'Error: Code execution timed out.';
                } else if (result.error.includes('sendResult')) {
                    errorSummary = 'Error: Analysis code did not produce a result correctly.';
                } else if (result.error.includes('access denied')) {
                     errorSummary = 'Error: Access denied to the required resource.';
                }
                // Limit length
                const limit = 250;
                if (errorSummary.length > limit) {
                    errorSummary = errorSummary.substring(0, limit - 3) + '...';
                }
                return errorSummary;
            }
            // Add summary for successful parsing
            if (result.result?.status === 'success' && result.result?.parsed_data_ref) {
                 return `Successfully parsed data (${result.result.rowCount || '?'} rows). Ref ID: ${result.result.parsed_data_ref}`;
            }
            // Add specific summary for report code generation
            if (result.result && typeof result.result.react_code === 'string') {
                return 'Successfully generated React report code.';
            }
            const resultString = JSON.stringify(result.result);
            const limit = 500; // Shorter limit for analysis results in context
            if (resultString.length > limit) {
                let summary = resultString.substring(0, limit - 3) + '...';
                try {
                    const parsed = JSON.parse(resultString); 
                    if (Array.isArray(parsed)) summary = `Result: Array[${parsed.length}]`;
                    else if (typeof parsed === 'object' && parsed !== null) summary = `Result: Object{${Object.keys(parsed).slice(0,3).join(',')}${Object.keys(parsed).length > 3 ? ',...' : ''}}`;
                } catch(e){ /* ignore */ }
                 return summary;
            }
            return resultString;
        } catch (e) {
            logger.warn(`Could not summarize tool result: ${e.message}`);
            return 'Could not summarize tool result.';
        }
    }

    /** Updates the PromptHistory record in the database. */
    async _updatePromptHistoryRecord(status, aiResponseText = null, errorMessage = null, aiGeneratedCode = null) {
        if (!this.aiMessagePlaceholderId) {
             logger.error('Cannot update PromptHistory: aiMessagePlaceholderId is missing.');
             return;
        }
        try {
            // Get analysis result if available (needed when completing)
            const analysisResult = this.turnContext.intermediateResults.analysisResult;
            // --- Get the report code DIRECTLY from the context --- 
            const finalGeneratedCode = this.turnContext.generatedReportCode;
            // --- Log the value directly from context --- 
            console.log(`[_updatePromptHistoryRecord] Value of this.turnContext.generatedReportCode: ${finalGeneratedCode ? `Exists (Length: ${finalGeneratedCode.length})` : 'MISSING'}`);

            // ---- ADD DEBUG LOG ----
            logger.debug(`[Agent Update DB] Preparing update for ${this.aiMessagePlaceholderId}`, { 
                status, 
                hasResponseText: !!aiResponseText, 
                hasErrorMessage: !!errorMessage, 
                // Use the potentially cleaned code for logging and saving
                hasGeneratedCode: !!finalGeneratedCode, 
                codeLength: finalGeneratedCode?.length,
                hasAnalysisResult: !!analysisResult, 
            });
            // ---- END DEBUG LOG ----
            const updateData = {
                status: status,
                // Conditionally add fields only if they have a value
                ...(aiResponseText !== null && { aiResponseText: aiResponseText }),
                ...(errorMessage !== null && { errorMessage: errorMessage }),
                // Use the potentially cleaned code for saving
                ...(finalGeneratedCode !== null && finalGeneratedCode !== undefined && { aiGeneratedCode: finalGeneratedCode }), // Check not null/undefined
                ...(status === 'completed' && analysisResult !== null && analysisResult !== undefined && { reportAnalysisData: analysisResult }),
                 agentSteps: this.turnContext.steps, // Store the steps taken
            };
            const updatedMessage = await PromptHistory.findByIdAndUpdate(this.aiMessagePlaceholderId, updateData, { new: true });
            if (updatedMessage) {
                 logger.info(`Updated PromptHistory ${this.aiMessagePlaceholderId} with status: ${status}`);
                 // Log if analysis data was actually saved (useful for verification)
                 if (status === 'completed' && analysisResult !== null && analysisResult !== undefined) {
                     logger.debug(`[Agent Update DB] Saved reportAnalysisData for ${this.aiMessagePlaceholderId}`);
                 }
            } else {
                 logger.warn(`PromptHistory record ${this.aiMessagePlaceholderId} not found during update.`);
            }
        } catch (dbError) {
            logger.error(`Failed to update PromptHistory ${this.aiMessagePlaceholderId}: ${dbError.message}`, { dbError });
        }
    }

    //=================================
    // Tool Implementation Functions
    //=================================

    /** Dispatcher */
    async toolDispatcher(toolName, args) {
        const toolImplementations = this._getToolImplementations();
        const toolFunction = toolImplementations[toolName];

        if (!toolFunction) {
            logger.error(`Attempted to dispatch unknown tool: ${toolName}`);
            return { error: `Unknown tool: ${toolName}` };
        }

        if (toolName === '_answerUserTool') {
             return { result: { message: 'Signal to answer user received.' } };
        }

        try {
            if (typeof args !== 'object' || args === null) {
                 throw new Error(`Invalid arguments provided for tool ${toolName}. Expected an object.`);
            }

            // *** MODIFICATION FOR generate_report_code ***
            let finalArgs = args;
            if (toolName === 'generate_report_code') {
                const analysisResultFromContext = this.turnContext.intermediateResults.analysisResult;
                if (!analysisResultFromContext) {
                    logger.error(`Cannot dispatch generate_report_code: analysisResult is missing from turn context.`);
                    return { error: 'Cannot generate report code: Analysis result is missing. Please run analysis first.' };
                }
                // Add the analysis result from context to the arguments passed to the implementation
                finalArgs = {
                    ...args, // Should contain analysis_summary from LLM
                    analysis_result: analysisResultFromContext
                };
                logger.debug(`[Dispatcher] Augmented generate_report_code args with analysisResult from context.`);
            }
            // *** END MODIFICATION ***

            // Pass the potentially modified args to the tool function
            const result = await toolFunction.call(this, finalArgs);

            // Ensure result is in the { result: ... } or { error: ... } format
            if (result && (result.result !== undefined || result.error !== undefined)) {
                 return result;
            } else {
                 logger.warn(`Tool ${toolName} did not return the expected format. Wrapping result.`);
                 // Wrap unexpected return values for consistency, assuming success if no error thrown
                 return { result: result };
            }
        } catch (error) {
            logger.error(`Error executing tool ${toolName}: ${error.message}`, { args, error });
            return { error: `Tool ${toolName} execution failed: ${error.message}` };
        }
    }

    /** Tool: List Datasets */
    async _listDatasetsTool(args) { // Args ignored
        logger.info(`Executing tool: list_datasets`);
        try {
            const datasets = await datasetService.listAccessibleDatasets(this.userId, this.teamId);
            const formattedDatasets = datasets.map(d => ({
                id: d._id.toString(),
                name: d.name,
                description: d.description || ''
            }));
            return { result: { datasets: formattedDatasets } };
        } catch (error) {
            logger.error(`_listDatasetsTool failed: ${error.message}`, { error });
            return { error: `Failed to list datasets: ${error.message}` };
        }
    }

    /** Tool: Get Schema */
    async _getDatasetSchemaTool(args) {
        const { dataset_id } = args;
        logger.info(`Executing tool: get_dataset_schema with id: ${dataset_id}`);
        if (!dataset_id || typeof dataset_id !== 'string') {
            return { error: 'Missing or invalid required argument: dataset_id (must be a string)' };
        }

        try {
            const schemaData = await datasetService.getDatasetSchema(dataset_id, this.userId);
            if (!schemaData) {
                 return { error: `Dataset schema not found or access denied for ID: ${dataset_id}` };
            }
             // Ensure the returned data matches the documented output structure
             const resultData = {
                schemaInfo: schemaData.schemaInfo || [],
                columnDescriptions: schemaData.columnDescriptions || {},
                description: schemaData.description || ''
             };
            // STORE SCHEMA FOR LATER USE BY CODE GEN
            this.turnContext.intermediateResults.lastSchema = resultData;
            logger.info(`[Agent Loop ${this.sessionId}] Stored dataset schema.`);
            return { result: resultData };
        } catch (error) {
            logger.error(`_getDatasetSchemaTool failed for ${dataset_id}: ${error.message}`, { error });
             // Handle specific errors like CastError for invalid ObjectId
             if (error.name === 'CastError') {
                 return { error: `Invalid dataset ID format: ${dataset_id}` };
             }
            return { error: `Failed to get dataset schema: ${error.message}` };
        }
    }

    /** Tool: Parse CSV Data */
    async _parseCsvDataTool(args) {
        const { dataset_id } = args;
        logger.info(`Executing tool: parse_csv_data for dataset ${dataset_id}`);
        if (!dataset_id || typeof dataset_id !== 'string') {
            return { error: 'Missing or invalid required argument: dataset_id' };
        }

        try {
            const rawContent = await datasetService.getRawDatasetContent(dataset_id, this.userId);
            if (!rawContent) {
                // Should be caught by getRawDatasetContent, but double-check
                throw new Error('Failed to fetch dataset content or content is empty.');
            }
            
            logger.info(`Parsing CSV content for dataset ${dataset_id} (length: ${rawContent.length})`);
            // Use PapaParse for reliable parsing
            const parseResult = Papa.parse(rawContent, {
                header: true, // Automatically use first row as header
                dynamicTyping: true, // Attempt to convert numbers/booleans
                skipEmptyLines: true,
                transformHeader: header => header.trim(), // Trim header whitespace
                //delimiter: ",", // Default is comma
                //newline: "", // Auto-detect
                //quoteChar: '"', // Default
            });

            if (parseResult.errors && parseResult.errors.length > 0) {
                logger.error(`PapaParse errors for dataset ${dataset_id}:`, parseResult.errors);
                // Report only the first few errors to avoid overwhelming context
                const errorSummary = parseResult.errors.slice(0, 3).map(e => e.message).join('; ');
                return { error: `CSV Parsing failed: ${errorSummary}` };
            }

            if (!parseResult.data || parseResult.data.length === 0) {
                return { error: 'CSV Parsing resulted in no data.' };
            }

            logger.info(`Successfully parsed ${parseResult.data.length} rows for dataset ${dataset_id}.`);
            // Store the *full* parsed data in intermediate results
            // Generate a unique reference for this parsed data within the turn
            const parsedDataRef = `parsed_${dataset_id}_${Date.now()}`;
            this.turnContext.intermediateResults[parsedDataRef] = parseResult.data; 

            // Return success and the reference ID
            return { 
                result: { 
                    status: 'success', 
                    message: `Data parsed successfully, ${parseResult.data.length} rows found.`,
                    parsed_data_ref: parsedDataRef, // Return reference for agent
                    rowCount: parseResult.data.length
                } 
            };

        } catch (error) {
            logger.error(`_parseCsvDataTool failed for ${dataset_id}: ${error.message}`, { error });
            return { error: `Failed to parse dataset content: ${error.message}` };
        }
    }

    async _generateAnalysisCodeTool(args) { 
        const { analysis_goal } = args; 
        logger.info(`Executing tool: generate_analysis_code`);
        if (!analysis_goal) {
            return { error: 'Missing or invalid required argument: analysis_goal' };
        }
        // Retrieve the stored schema
        const schemaData = this.turnContext.intermediateResults.lastSchema;
        if (!schemaData) {
            return { error: 'Schema not found in context. Use get_dataset_schema first.' };
        }
        try {
            const generatedCodeResponse = await promptService.generateAnalysisCode({
                userId: this.userId,
                analysisGoal: analysis_goal,
                datasetSchema: schemaData 
            });

            if (!generatedCodeResponse || !generatedCodeResponse.code) {
                 throw new Error('AI failed to generate valid analysis code.');
            }
            // Don't store here, just return. Agent loop stores in intermediateResults.
            return { result: { code: generatedCodeResponse.code } }; 
        } catch (error) {
            logger.error(`_generateAnalysisCodeTool failed: ${error.message}`, { error });
            return { error: `Failed to generate analysis code: ${error.message}` };
        }
    }

    /** Tool: Execute Analysis Code */
    async _executeAnalysisCodeTool(args) {
        const { code, parsed_data_ref } = args;
        logger.info(`Executing tool: execute_analysis_code`);
        if (!code || typeof code !== 'string' || !parsed_data_ref || typeof parsed_data_ref !== 'string') {
            return { error: 'Missing or invalid arguments: code (string) and parsed_data_ref (string) are required' };
        }
        
        // Retrieve the actual parsed data using the reference ID
        const parsedData = this.turnContext.intermediateResults[parsed_data_ref];
        if (!parsedData) {
             return { error: `Parsed data not found for ref: ${parsed_data_ref}` };
        }
        if (!Array.isArray(parsedData)) {
            return { error: 'Referenced parsed data is not an array.'}; 
        }

        try {
            // Call the CORRECT function from the service: executeSandboxedCode
            const result = await codeExecutionService.executeSandboxedCode(code, parsedData);
            
            // Log the full result
            console.log('[Agent Tool _executeAnalysisCodeTool] Full analysis result:', JSON.stringify(result, null, 2));
            
            // Store the ACTUAL result object internally 
            this.turnContext.intermediateResults.analysisResult = result.result; // Extract the inner 'result' object
            return { result: result.result }; // Return the inner 'result' object
        } catch (error) {
            logger.error(`_executeAnalysisCodeTool failed: ${error.message}`, { error });
            this.turnContext.intermediateResults.analysisError = error.message;
            return { error: `Analysis code execution failed: ${error.message}` };
        }
    }

    /** Tool: Generate React Report Code */
    async _generateReportCodeTool(args) {
        logger.info(`Executing tool: generate_report_code`);

        // 1. Get the analysis summary from the LLM arguments first
        const analysisSummaryArg = args?.analysis_summary;

        // 2. Determine the correct analysis data source
        // Prioritize results from analysis run *this turn*, fallback to previous turn's results for modifications.
        let analysisDataForReport = this.turnContext.intermediateResults.analysisResult;
        let dataSourceMessage = 'current turn analysis';

        if (!analysisDataForReport) {
            // No analysis run this turn, try using previous results
            analysisDataForReport = this.turnContext.intermediateResults.previousAnalysisResult;
            if (analysisDataForReport) {
                dataSourceMessage = 'previous turn analysis (modification)';
                logger.info(`[Agent Report Gen] ${dataSourceMessage}: Using previous analysis data.`);
            }
        } else {
             logger.info(`[Agent Report Gen] ${dataSourceMessage}: Using analysis data from this turn.`);
        }

        // 3. Validate that we have *some* analysis data to proceed
        if (!analysisDataForReport) {
            logger.error('_generateReportCodeTool called, but no analysis result found in current OR previous context.');
            return { error: 'Cannot generate report: Analysis results are missing.' };
        }

        // 4. Validate the summary argument provided by the LLM
        if (!analysisSummaryArg || typeof analysisSummaryArg !== 'string') {
            logger.warn('_generateReportCodeTool called without a valid analysis_summary argument from LLM.');
            // If the summary is missing, we cannot reliably generate the report as instructed
            return { error: 'Cannot generate report: Analysis summary argument is missing or invalid.' };
        }

        // 5. Prepare arguments for the prompt service, using the determined data and validated summary
        const reportArgs = {
            analysisSummary: analysisSummaryArg, 
            dataJson: analysisDataForReport // Use the determined data source (current or previous)
        };

        // Call the prompt service with the CORRECT, verified data
        try {
            logger.debug('[Agent Report Gen] Calling promptService.generateReportCode with args:', { analysisSummary: reportArgs.analysisSummary, dataJsonKeys: Object.keys(reportArgs.dataJson || {}) });
            const result = await promptService.generateReportCode({
                userId: this.userId,
                ...reportArgs // Spread the existing arguments
            });
            
            let cleanedCode = result?.react_code;
            if (cleanedCode && typeof cleanedCode === 'string') {
                // console.log('[Agent Tool _generateReportCodeTool] Raw Generated React Code:', cleanedCode); 
                const codeFenceRegex = /^```(?:javascript|js|json)?\s*([\s\S]*?)\s*```$/m;
                const match = cleanedCode.match(codeFenceRegex);
                if (match && match[1]) {
                    cleanedCode = match[1].trim();
                    // console.log('[Agent Tool _generateReportCodeTool] Cleaned React Code (fences removed):', cleanedCode);
                } else {
                    cleanedCode = cleanedCode.trim();
                }
            } else {
                logger.warn('_generateReportCodeTool received no code from promptService.');
                cleanedCode = null; // Ensure it's null if no code
            }

            // Store the CLEANED code internally for the final DB update
            this.turnContext.generatedReportCode = cleanedCode; 
            // Return the cleaned code for the step result summary etc.
            return { result: { react_code: cleanedCode } }; 

        } catch (error) {
             logger.error(`_generateReportCodeTool failed during promptService call: ${error.message}`, { error });
             return { error: `Failed to generate report code: ${error.message}` };
        }
    }

    /** Tool: Answer User Signal */
    async _answerUserTool(args) {
       logger.info(`Executing tool: _answerUserTool`);
        const { textResponse } = args;
        if (typeof textResponse !== 'string' || textResponse.trim() === '') {
            // This validation is technically redundant due to parsing logic, but good practice
            return { error: 'Missing or empty required argument: textResponse for _answerUserTool' };
        }
        // This tool doesn't *do* anything other than signal the end
        // The actual textResponse is handled when the agent loop breaks
        return { result: { message: 'Answer signal processed.'} };
    }
}

module.exports = { AgentOrchestrator };
