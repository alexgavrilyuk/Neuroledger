const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const promptService = require('./prompt.service');
const PromptHistory = require('./prompt.model');
const { getIO } = require('../../socket'); // Corrected path
const { assembleContext } = require('./prompt.service'); // Import assembleContext
const codeExecutionService = require('../../shared/services/codeExecution.service'); // Import Code Execution Service
const Papa = require('papaparse'); // Import papaparse
const User = require('../users/user.model');
const { streamLLMReasoningResponse } = require('./prompt.service'); // Ensure this is imported

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
                datasetSchemas: {}, // Store schemas for all datasets
                datasetSamples: {}, // Store sample rows for all datasets
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
     * Pre-fetches dataset schemas and sample data for all datasets in the session.
     * @param {Array<string>} datasetIds - Array of dataset IDs in the session
     * @return {Promise<void>}
     */
    async _preloadDatasetContext(datasetIds) {
        if (!datasetIds || datasetIds.length === 0) {
            logger.info(`[Agent Loop ${this.sessionId}] No datasets to preload.`);
            return;
        }

        logger.info(`[Agent Loop ${this.sessionId}] Preloading context for ${datasetIds.length} datasets.`);
        // Add detailed logging of exact dataset IDs
        logger.info(`[Agent Loop ${this.sessionId}] DATASET IDs RECEIVED: ${JSON.stringify(datasetIds)}`);
        
        // Process each dataset ID sequentially to avoid overwhelming the DB
        for (const datasetId of datasetIds) {
            try {
                // Log each dataset ID being processed
                logger.info(`[Agent Loop ${this.sessionId}] Processing dataset ID: ${datasetId} (Type: ${typeof datasetId})`);
                
                // 1. Fetch schema
                const schemaData = await datasetService.getDatasetSchema(datasetId, this.userId);
                if (schemaData) {
                    this.turnContext.intermediateResults.datasetSchemas[datasetId] = schemaData;
                    // Also store in lastSchema for backward compatibility
                    this.turnContext.intermediateResults.lastSchema = schemaData;
                    logger.info(`[Agent Loop ${this.sessionId}] Preloaded schema for dataset ${datasetId}`);
                }

                // 2. Fetch and parse sample data (last 20 rows)
                const rawContent = await datasetService.getRawDatasetContent(datasetId, this.userId);
                if (rawContent) {
                    // Parse the CSV content
                    const parseResult = Papa.parse(rawContent, {
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        transformHeader: header => header.trim()
                    });

                    if (parseResult.data && parseResult.data.length > 0) {
                        // Get the last 20 rows (or all if fewer than 20)
                        const sampleSize = 20;
                        const totalRows = parseResult.data.length;
                        const startIndex = Math.max(0, totalRows - sampleSize);
                        const sampleRows = parseResult.data.slice(startIndex);
                        
                        // Store the sample
                        this.turnContext.intermediateResults.datasetSamples[datasetId] = {
                            totalRows,
                            sampleRows
                        };
                        
                        // Also store the parsed data reference for backward compatibility
                        const parsedDataRef = `parsed_${datasetId}_${Date.now()}`;
                        this.turnContext.intermediateResults[parsedDataRef] = parseResult.data;
                        this.turnContext.intermediateResults.parsedDataRef = parsedDataRef;
                        
                        logger.info(`[Agent Loop ${this.sessionId}] Preloaded ${sampleRows.length} sample rows from ${totalRows} total rows for dataset ${datasetId}`);
                    }
                }
            } catch (error) {
                logger.error(`[Agent Loop ${this.sessionId}] Error preloading context for dataset ${datasetId}: ${error.message}`, { error });
                // Continue with next dataset, don't fail the whole operation
            }
        }
    }

    /**
     * Runs the main agent loop: Reason -> Act -> Observe.
     * @param {string} userMessage - The user's current message/query.
     * @param {Array<string>} sessionDatasetIds - Array of dataset IDs in the session
     * @returns {Promise<{status: string, aiResponseText?: string, error?: string}>} - Final status and result.
     */
    async runAgentLoop(userMessage, sessionDatasetIds = []) {
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

            // Preload dataset schemas and samples (if session has datasets)
            if (sessionDatasetIds && sessionDatasetIds.length > 0) {
                await this._preloadDatasetContext(sessionDatasetIds);
            }

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

                     // --- Updated Code Cleaning Logic --- 
                     let codeToExecute = '';
                     if (rawGeneratedCode && typeof rawGeneratedCode === 'string') {
                         let cleanedCode = rawGeneratedCode.trim(); // 1. Trim whitespace
                         const startFence = /^```(?:javascript|js)?\s*/; // Regex for start fence
                         const endFence = /\s*```$/; // Regex for end fence
                         cleanedCode = cleanedCode.replace(startFence, ''); // 2. Remove start fence
                         cleanedCode = cleanedCode.replace(endFence, ''); // 3. Remove end fence
                         codeToExecute = cleanedCode.trim(); // 4. Trim again
                         logger.debug('[Agent Loop] Cleaned analysis code before execution. Length after clean: ', codeToExecute.length);
                     } else {
                         logger.warn('[Agent Loop] Raw generated code is missing or not a string.');
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
            // Fix 1: Update PromptHistory Query
            const historyRecords = await PromptHistory.find({
                chatSessionId: this.sessionId,
                _id: { $ne: this.aiMessagePlaceholderId },
                messageType: 'ai_report', // Target only AI reports
                status: 'completed', // Only successful ones
                $or: [ // Ensure either analysis data or code exists
                    { reportAnalysisData: { $exists: true, $ne: null } },
                    { aiGeneratedCode: { $exists: true, $ne: null } }
                ]
            })
            .sort({ createdAt: -1 }) // Fetch newest first for artifact search
            .limit(HISTORY_FETCH_LIMIT) // Limit history size
            .select('messageType status reportAnalysisData aiGeneratedCode createdAt _id') // Select needed fields
            .lean();

            logger.debug(`[Agent History Prep] Fetched ${historyRecords.length} potential artifact records (newest first).`);

            // Fix 2: Update artifact search logic
            let artifactData = {
                previousAnalysisResult: null,
                previousGeneratedCode: null,
                analysisFoundOnMsgId: null,
                codeFoundOnMsgId: null
            };

            // Find the most recent successful report with analysis data
            // The query already sorts by newest and filters for completed reports
            const lastSuccessfulReport = historyRecords.find(msg => msg.reportAnalysisData);

            if (lastSuccessfulReport) {
                artifactData = {
                    previousAnalysisResult: lastSuccessfulReport.reportAnalysisData,
                    previousGeneratedCode: lastSuccessfulReport.aiGeneratedCode, // May or may not exist, that's okay
                    analysisFoundOnMsgId: lastSuccessfulReport._id,
                    codeFoundOnMsgId: lastSuccessfulReport.aiGeneratedCode ? lastSuccessfulReport._id : null // Only set if code exists
                };

                logger.info(`[Agent History Prep] Found previous artifacts in message ${lastSuccessfulReport._id}`, {
                    hasAnalysis: !!artifactData.previousAnalysisResult,
                    hasCode: !!artifactData.previousGeneratedCode
                });
            } else {
                 logger.info(`[Agent History Prep] No suitable previous completed report with analysis data found.`);
            }
            // --- End Fix 2 --

            // Store potentially found artifacts in intermediate results
            // Use consistent naming: previousAnalysisResult, previousGeneratedCode
            this.turnContext.intermediateResults.previousAnalysisResult = artifactData.previousAnalysisResult;
            this.turnContext.intermediateResults.previousGeneratedCode = artifactData.previousGeneratedCode;

            logger.debug(`[Agent History Prep] Post-artifact search check:`, {
                hasPreviousAnalysis: !!artifactData.previousAnalysisResult,
                analysisMsgId: artifactData.analysisFoundOnMsgId,
                hasPreviousCode: !!artifactData.previousGeneratedCode,
                codeMsgId: artifactData.codeFoundOnMsgId,
            });

            // Fetch the full history separately for LLM context (chronological)
            const fullHistoryRecords = await PromptHistory.find({
                chatSessionId: this.sessionId,
                _id: { $ne: this.aiMessagePlaceholderId }
            })
            .sort({ createdAt: 1 }) // Chronological for LLM
            .limit(HISTORY_FETCH_LIMIT)
            .select('messageType promptText aiResponseText') // Only need text content
            .lean();

             const formattedHistory = fullHistoryRecords.map(msg => ({
                role: msg.messageType === 'user' ? 'user' : 'assistant',
                content: (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''
            })).filter(msg => msg.content);

            this.turnContext.fullChatHistory = formattedHistory;

            // --- History Summarization and related fields REMOVED --

        } catch (err) {
             logger.error(`Failed to fetch chat history for session ${this.sessionId}: ${err.message}`);
             this.turnContext.fullChatHistory = []; // Ensure it's an empty array on error
             // Reset artifact state on error to avoid passing stale data
             this.turnContext.intermediateResults.previousAnalysisResult = null;
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

        // Use the corrected field name from turnContext
        if (this.turnContext.intermediateResults.previousAnalysisResult) {
            previousAnalysisResultSummary = "Analysis results from a previous turn are available and should be reused if applicable.";
        }
        if (this.turnContext.intermediateResults.previousGeneratedCode) {
            hasPreviousGeneratedCode = true;
        }
        // --- END ADDED --

        // Ensure fullChatHistory exists (it should be set by _prepareChatHistory)
        const chatHistoryForLLM = this.turnContext.fullChatHistory || []; // Use variable from context

        // Prepare dataset context by adding schemas and samples to the context
        const datasetSchemas = this.turnContext.intermediateResults.datasetSchemas || {};
        const datasetSamples = this.turnContext.intermediateResults.datasetSamples || {};
        
        // Log the exact dataset IDs being sent to the LLM
        const datasetIds = Object.keys(datasetSchemas);
        logger.info(`[_prepareLLMContext] Sending the following dataset IDs to LLM: ${JSON.stringify(datasetIds)}`);
        if (datasetIds.length > 0) {
            logger.info(`[_prepareLLMContext] First dataset ID type: ${typeof datasetIds[0]}, length: ${datasetIds[0].length}`);
        }

        return {
            userId: this.userId, 
            originalQuery: this.turnContext.originalQuery,
            // --- FIX: Use 'history' key --- 
            history: chatHistoryForLLM, // Use the standardized key 'history'
            currentTurnSteps: this.turnContext.steps,
            availableTools: this._getToolDefinitions(), 
            userContext: this.turnContext.userContext, 
            teamContext: this.turnContext.teamContext, 
            previousAnalysisResultSummary: previousAnalysisResultSummary,
            hasPreviousGeneratedCode: hasPreviousGeneratedCode,
            analysisResult: this.turnContext.intermediateResults.analysisResult,
            datasetSchemas: datasetSchemas,
            datasetSamples: datasetSamples
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
            'list_datasets': this._listDatasetsTool, // Keep for backward compatibility
            'get_dataset_schema': this._getDatasetSchemaTool, // Keep for backward compatibility
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

            // Pass the original args directly to the tool function
            const toolOutput = await toolFunction.call(this, args);

            // Ensure the output is in the { result: ... } or { error: ... } format
            if (toolOutput && (toolOutput.result !== undefined || toolOutput.error !== undefined)) {
                 return toolOutput;
            } else {
                 logger.warn(`Tool ${toolName} did not return the expected format. Wrapping result.`);
                 // Wrap unexpected return values for consistency, assuming success if no error thrown
                 return { result: toolOutput };
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
        
        // Add detailed logging about the dataset ID
        logger.info(`[_parseCsvDataTool] DATASET ID DEBUG: Value: "${dataset_id}", Type: ${typeof dataset_id}, Length: ${dataset_id ? dataset_id.length : 'N/A'}`);
        
        if (!dataset_id || typeof dataset_id !== 'string') {
            return { error: 'Missing or invalid required argument: dataset_id' };
        }
        
        // Check for common non-ObjectId values that might be attempted by the AI
        if (['implicit_revenue_data', 'revenue_data', 'sales_data', 'financial_data', 'dataset', 'ds_f697a53475'].includes(dataset_id)) {
            logger.warn(`[_parseCsvDataTool] AI attempted to use a literal name "${dataset_id}" instead of the ObjectId`);
            
            // FALLBACK MECHANISM: Get the first valid dataset ID from context
            const availableDatasetIds = Object.keys(this.turnContext.intermediateResults.datasetSchemas || {});
            if (availableDatasetIds.length > 0) {
                const correctDatasetId = availableDatasetIds[0];
                logger.info(`[_parseCsvDataTool] FALLBACK: Using correct dataset ID: ${correctDatasetId} instead of invalid ID: ${dataset_id}`);
                
                // Proceed with the correct ID
                try {
                    const rawContent = await datasetService.getRawDatasetContent(correctDatasetId, this.userId);
                    if (!rawContent) {
                        throw new Error('Failed to fetch dataset content or content is empty.');
                    }
                    
                    logger.info(`Parsing CSV content for dataset ${correctDatasetId} (length: ${rawContent.length})`);
                    // Continue with parsing as normal...
                    const parseResult = Papa.parse(rawContent, {
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        transformHeader: header => header.trim()
                    });
                    
                    if (parseResult.errors && parseResult.errors.length > 0) {
                        logger.error(`PapaParse errors for dataset ${correctDatasetId}:`, parseResult.errors);
                        const errorSummary = parseResult.errors.slice(0, 3).map(e => e.message).join('; ');
                        return { error: `CSV Parsing failed: ${errorSummary}` };
                    }
                    
                    if (!parseResult.data || parseResult.data.length === 0) {
                        return { error: 'CSV Parsing resulted in no data.' };
                    }
                    
                    logger.info(`Successfully parsed ${parseResult.data.length} rows for dataset ${correctDatasetId}.`);
                    const parsedDataRef = `parsed_${correctDatasetId}_${Date.now()}`;
                    this.turnContext.intermediateResults[parsedDataRef] = parseResult.data;
                    
                    return {
                        result: {
                            status: 'success',
                            message: `Data parsed successfully, ${parseResult.data.length} rows found. Note: Used correct dataset ID: ${correctDatasetId}`,
                            parsed_data_ref: parsedDataRef,
                            rowCount: parseResult.data.length
                        }
                    };
                } catch (error) {
                    logger.error(`_parseCsvDataTool fallback failed for ${correctDatasetId}: ${error.message}`, { error });
                    return { error: `Failed to parse dataset content: ${error.message}` };
                }
            } else {
                return { 
                    error: `Invalid dataset ID: '${dataset_id}'. You must use the exact MongoDB ObjectId (24-character hex string) provided in the system prompt, not a descriptive name.` 
                };
            }
        }
        
        // NORMAL PATH FOR VALID DATASET IDs
        try {
            // Add ObjectId validation check
            const mongoose = require('mongoose');
            const isValidObjectId = mongoose.Types.ObjectId.isValid(dataset_id);
            logger.info(`[_parseCsvDataTool] Is valid MongoDB ObjectId: ${isValidObjectId}`);
            
            if (!isValidObjectId) {
                // Check if we have any available datasets to use as fallback
                const availableDatasetIds = Object.keys(this.turnContext.intermediateResults.datasetSchemas || {});
                if (availableDatasetIds.length > 0) {
                    logger.info(`[_parseCsvDataTool] Invalid ObjectId but fallback available. Will retry.`);
                    // Recursively call this method with the first dataset ID
                    return this._parseCsvDataTool({ dataset_id: availableDatasetIds[0] });
                } else {
                    return { error: `Invalid dataset ID format: '${dataset_id}'. Dataset ID must be a valid MongoDB ObjectId (24-character hex string).` };
                }
            }
            
            const rawContent = await datasetService.getRawDatasetContent(dataset_id, this.userId);
            if (!rawContent) {
                throw new Error('Failed to fetch dataset content or content is empty.');
            }
            
            logger.info(`Parsing CSV content for dataset ${dataset_id} (length: ${rawContent.length})`);
            // Use PapaParse for reliable parsing
            const parseResult = Papa.parse(rawContent, {
                header: true, // Automatically use first row as header
                dynamicTyping: true, // Attempt to convert numbers/booleans
                skipEmptyLines: true,
                transformHeader: header => header.trim(), // Trim header whitespace
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
        const { analysis_summary } = args;
        logger.info(`Executing tool: generate_report_code with summary: "${analysis_summary}"`);

        // Fix 3: Add context validation
        let analysisDataForReport = this.turnContext.intermediateResults.analysisResult;

        if (!analysisDataForReport) {
            logger.info('Current turn analysis data not found, checking for previous analysis data.');
            // Try using the analysis data found during history preparation
            analysisDataForReport = this.turnContext.intermediateResults.previousAnalysisResult; // Use the correct field name

            if (!analysisDataForReport) {
                logger.error('[Generate Report Tool] No analysis data found in current OR previous context.');
                // Provide a clearer error message to the LLM
                return {
                    error: 'Cannot generate report code: Analysis result is missing. Please run analysis first or ensure a previous analysis was completed successfully.'
                };
            }

            logger.info('[Generate Report Tool] Using previous analysis data for report generation/modification.');
        } else {
             logger.info('[Generate Report Tool] Using analysis data from the current turn.');
        }

        // Ensure analysisDataForReport is actually an object/array, not just truthy
        if (typeof analysisDataForReport !== 'object' || analysisDataForReport === null) {
             logger.error(`[Generate Report Tool] Invalid analysis data format: ${typeof analysisDataForReport}`);
              return {
                error: 'Cannot generate report code: Invalid analysis data format.'
              };
        }

        // Convert analysis data to JSON string for the prompt service
        let dataJsonString;
        try {
            dataJsonString = JSON.stringify(analysisDataForReport);
        } catch (stringifyError) {
            logger.error(`[Generate Report Tool] Failed to stringify analysis data: ${stringifyError.message}`);
            return { error: `Internal error: Could not process analysis data.` };
        }

        try {
            const reportResult = await promptService.generateReportCode({
                userId: this.userId,
                analysisSummary: analysis_summary,
                dataJson: dataJsonString // Pass stringified data
            });

            // Fix: Extract the string from the result object
            const generatedCodeString = reportResult?.react_code;

            if (!generatedCodeString || typeof generatedCodeString !== 'string') {
                 logger.warn('[Generate Report Tool] promptService.generateReportCode returned no valid code string.');
                 return { error: 'Failed to generate report code. The AI might need more information or context.' };
            }

            logger.info('[Generate Report Tool] Successfully generated React report code string.');
            // Fix: Store the extracted STRING in turnContext
            this.turnContext.generatedReportCode = generatedCodeString; 
            // Fix: Return the string in the expected result structure
            return { result: { react_code: generatedCodeString } };

        } catch (error) {
            logger.error(`[Generate Report Tool] Error calling promptService.generateReportCode: ${error.message}`, { error });
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

    /**
     * Attempts to parse a JSON tool call from a string.
     * Handles potential markdown fences and JSON parsing errors.
     * @param {string} text - The text potentially containing a tool call.
     * @returns {object|null} - The parsed tool object {tool, args} or null if no valid call found.
     */
    _tryParseJsonToolCall(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmedText = text.trim();

        // Regex to find a JSON object enclosed in optional markdown fences, potentially at the end
        const jsonRegex = /(?:```(?:json)?\s*)?(\{[\s\S]*\})(?:\s*```)?$/m;
        const jsonMatch = trimmedText.match(jsonRegex);

        if (jsonMatch && jsonMatch[1]) {
            const potentialJson = jsonMatch[1];
            try {
                // Basic sanitization attempt (might need refinement based on specific LLM outputs)
                const sanitizedJsonString = potentialJson
                    // Attempt to fix trailing commas before closing braces/brackets
                    .replace(/,\s*([}\]])/g, '$1'); 

                const parsed = JSON.parse(sanitizedJsonString);

                if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                    // Validate against known tools? Maybe not strictly necessary here.
                    return { tool: parsed.tool, args: parsed.args };
                }
            } catch (e) {
                // Ignore parsing errors - might be incomplete JSON during stream
                 logger.debug(`[_tryParseJsonToolCall] Failed to parse potential JSON: ${e.message}`);
            }
        }
        return null;
    }
}

/**
 * StreamingAgentOrchestrator extends the base AgentOrchestrator with
 * streaming capabilities to provide real-time updates to the client.
 */
class StreamingAgentOrchestrator extends AgentOrchestrator {
    /**
     * @param {string} userId - User ID
     * @param {string|null} teamId - Team ID
     * @param {string} sessionId - Chat session ID
     * @param {string} aiMessagePlaceholderId - ID of the AI message placeholder
     * @param {Function} sendEventCallback - Callback function to send events to the client
     * @param {Object|null} previousAnalysisData - Previous analysis data
     * @param {string|null} previousGeneratedCode - Previously generated code
     */
    constructor(userId, teamId, sessionId, aiMessagePlaceholderId, sendEventCallback, previousAnalysisData = null, previousGeneratedCode = null) {
        super(userId, teamId, sessionId, aiMessagePlaceholderId, previousAnalysisData, previousGeneratedCode);
        this.sendEventCallback = sendEventCallback; 
        this.accumulatedText = ''; 
        this.currentToolCallInfo = null; 
        this.isToolCallComplete = false; // Flag to track if a tool call is expected
    }

    _sendStreamEvent(eventType, data) {
        if (typeof this.sendEventCallback === 'function') {
            const eventData = { messageId: this.aiMessagePlaceholderId, sessionId: this.sessionId, ...data };
            this.sendEventCallback(eventType, eventData);
        } else {
            logger.warn('Streaming event callback is not a function, cannot send event.', { eventType });
        }
    }

    _emitAgentStatus(eventName, payload) {
        if (eventName === 'agent:thinking') {
            this._sendStreamEvent('thinking', {});
            super._emitAgentStatus(eventName, payload); // Keep websocket update if needed
        }
    }

    // Helper to format tool result for LLM history
    _formatToolResultForLLM(toolName, toolResult) {
        // Gemini uses 'function' role for tool calls and 'model' for responses,
        // but expects tool results via a specific 'functionResponse' part type.
        // We'll mimic this structure logically.
        // Note: The actual API call in gemini.client.js handles the specific format.
        // Here, we just structure the history entry conceptually.
        return {
            role: 'user', // Representing the system/tool providing the result back
            parts: [{
                functionResponse: {
                    name: toolName,
                    response: toolResult.result || { error: toolResult.error || 'Tool execution failed' },
                }
            }]
        };
    }

    async runAgentLoopWithStreaming(userMessage, sessionDatasetIds = []) {
        logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Starting for user ${this.userId}`);
        this.turnContext.originalQuery = userMessage;
        this.accumulatedText = ''; // Reset accumulated text for the whole turn
        this.turnContext.steps = [];
        this.isToolCallComplete = false;

        let resolveProcessing, rejectProcessing;
        const processingCompletePromise = new Promise((resolve, reject) => {
            resolveProcessing = resolve;
            rejectProcessing = reject;
        });

        let finalOutcome = { status: 'unknown', error: null, aiResponseText: null };
        let loopCount = 0; // Add loop counter to prevent infinite loops
        const MAX_LOOPS = 10; // Set a max number of LLM <-> Tool steps

        try {
            this._sendStreamEvent('start', {});
            this._emitAgentStatus('agent:thinking', {}); // Initial thinking

            // Preload context ONCE at the start
            await this._preloadDatasetContext(sessionDatasetIds);
            await this._prepareChatHistory(); // Prepare initial history

            // Get initial LLM context
            const llmContext = this._prepareLLMContext();
            let currentAccumulatedTextForStep = ''; // Track text for the current step

            // --- Main Agent Loop ---
            while (loopCount < MAX_LOOPS) {
                loopCount++;
                logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Starting loop iteration ${loopCount}`);
                currentAccumulatedTextForStep = ''; // Reset text for this step
                let currentToolCall = null; // Reset tool call for this step
                let stepCompleted = false; // Flag for this step's completion

                const stepPromise = new Promise(async (resolveStep, rejectStep) => {

                    const streamCallback = async (eventType, data) => {
                        logger.debug(`[Stream Callback - Loop ${loopCount}] Received event: ${eventType}`, data);
                        try {
                            switch (eventType) {
                                case 'token':
                                    if (data.content) {
                                        this.accumulatedText += data.content; // Append to overall turn text
                                        currentAccumulatedTextForStep += data.content; // Append to step text
                                        this._sendStreamEvent('token', { content: data.content });
                                        // Check for tool call within the step's text
                                        const detectedTool = this._tryParseToolCall(currentAccumulatedTextForStep);
                                        if (detectedTool) {
                                            logger.info(`[Stream Callback - Loop ${loopCount}] Detected potential tool call: ${detectedTool.tool}`);
                                            currentToolCall = detectedTool;
                                        }
                                    }
                                    break;
                                case 'completed':
                                    logger.info(`[Stream Callback - Loop ${loopCount}] LLM stream for this step completed.`);
                                    stepCompleted = true;
                                    if (currentToolCall) {
                                        // --- Execute Tool ---
                                        logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Executing tool: ${currentToolCall.tool} (Loop ${loopCount})`);
                                        this.turnContext.steps.push({ tool: currentToolCall.tool, args: currentToolCall.args, resultSummary: 'Executing...', isStreaming: true });
                                        this._sendStreamEvent('tool_call', { toolName: currentToolCall.tool, input: currentToolCall.args });

                                        try {
                                            const toolResult = await this.toolDispatcher(currentToolCall.tool, currentToolCall.args);
                                            logger.debug(`Tool dispatch completed (Loop ${loopCount}). Result:`, toolResult);
                                            const resultSummary = this._summarizeToolResult(toolResult);
                                            const lastStep = this.turnContext.steps[this.turnContext.steps.length - 1];
                                            if (lastStep) lastStep.resultSummary = resultSummary;
                                            this._sendStreamEvent('tool_result', {
                                                toolName: currentToolCall.tool,
                                                status: toolResult.error ? 'error' : 'success',
                                                output: resultSummary,
                                                error: toolResult.error || null
                                            });

                                            if (toolResult.error) {
                                                const toolErrorMessage = `Tool execution failed: ${toolResult.error}`;
                                                logger.warn(`Tool ${currentToolCall.tool} returned an error state:`, toolResult.error);
                                                finalOutcome = { status: 'error', error: toolErrorMessage, aiResponseText: this.accumulatedText };
                                                await super._updatePromptHistoryRecord('error', this.accumulatedText, toolErrorMessage, this.turnContext.generatedReportCode);
                                                this._sendStreamEvent('error', { message: toolErrorMessage });
                                                resolveProcessing(); // End overall processing on tool error
                                                rejectStep(new Error(toolErrorMessage)); // End this step with error
                                            } else {
                                                // --- Tool Success: Format result and prepare for next loop ---
                                                logger.info(`[Agent Loop - STREAMING] Tool ${currentToolCall.tool} executed successfully. Preparing next step.`);
                                                // Store results contextually (as before)
                                                if (currentToolCall.tool === 'generate_report_code' && toolResult.result?.react_code) {
                                                    this.turnContext.generatedReportCode = toolResult.result.react_code;
                                                    this._sendStreamEvent('generated_code', { code: toolResult.result.react_code });
                                                     // <<< --- SPECIAL CASE: If report code generated, maybe end the loop? --- >>>
                                                     // For now, let's assume generating report code IS the final step.
                                                     logger.info(`[Agent Loop - STREAMING] Report code generated. Ending agent loop.`);
                                                     finalOutcome = { status: 'completed', error: null, aiResponseText: this.accumulatedText };
                                                     await super._updatePromptHistoryRecord('completed', this.accumulatedText, null, this.turnContext.generatedReportCode);
                                                     this._sendStreamEvent('completed', { finalContent: this.accumulatedText });
                                                     resolveProcessing(); // End overall processing
                                                     resolveStep(); // End this step successfully
                                                     return; // Exit callback early

                                                } else if (currentToolCall.tool === 'execute_analysis_code' /*...other tools...*/ ) {
                                                    // Store intermediate results if necessary
                                                    // ...
                                                }

                                                // Format tool result for LLM history
                                                const toolResultForHistory = this._formatToolResultForLLM(currentToolCall.tool, toolResult);
                                                llmContext.history.push({ role: 'model', parts: [{ text: currentAccumulatedTextForStep || '' }] }); // Add AI's part (tool call)
                                                llmContext.history.push(toolResultForHistory); // Add tool result part

                                                resolveStep(); // Resolve step promise to continue the outer loop
                                            }
                                        } catch (toolError) {
                                            const toolErrorMessage = `Tool execution failed: ${toolError.message}`;
                                            logger.error(`Error THROWN during tool execution (Loop ${loopCount}): ${currentToolCall.tool}. Message: ${toolError.message}`, { stack: toolError.stack });
                                            this._sendStreamEvent('tool_result', { /* ... error details */ });
                                            finalOutcome = { status: 'error', error: toolErrorMessage, aiResponseText: this.accumulatedText };
                                            await super._updatePromptHistoryRecord('error', this.accumulatedText, toolErrorMessage, this.turnContext.generatedReportCode);
                                            this._sendStreamEvent('error', { message: toolErrorMessage });
                                            resolveProcessing(); // End overall processing
                                            rejectStep(toolError); // Reject step promise
                                        }
                                    } else {
                                        // --- No Tool Call: LLM finished with text response ---
                                        logger.info(`[Agent Loop - STREAMING ${this.sessionId}] LLM finished loop ${loopCount} without tool call. Finalizing turn.`);
                                        finalOutcome = { status: 'completed', error: null, aiResponseText: this.accumulatedText };
                                        await super._updatePromptHistoryRecord('completed', this.accumulatedText, null, this.turnContext.generatedReportCode);
                                        this._sendStreamEvent('completed', { finalContent: this.accumulatedText });
                                        resolveProcessing(); // Resolve overall promise
                                        resolveStep(); // Resolve step promise (signals loop end)
                                    }
                                    break;
                                case 'error':
                                    const llmErrorMessage = data.message || 'Unknown streaming error from LLM';
                                    logger.error(`[Stream Callback - Loop ${loopCount}] Received error from LLM stream: ${llmErrorMessage}`);
                                    stepCompleted = true;
                                    finalOutcome = { status: 'error', error: llmErrorMessage, aiResponseText: this.accumulatedText };
                                    await super._updatePromptHistoryRecord('error', this.accumulatedText, llmErrorMessage, this.turnContext.generatedReportCode);
                                    this._sendStreamEvent('error', { message: llmErrorMessage });
                                    resolveProcessing(); // Resolve overall promise (with error state)
                                    rejectStep(new Error(llmErrorMessage)); // Reject step promise
                                    break;
                                default:
                                    logger.warn(`[Stream Callback - Loop ${loopCount}] Unhandled event type: ${eventType}`);
                            }
                        } catch (callbackError) {
                            logger.error(`[Stream Callback - Loop ${loopCount}] Internal error: ${callbackError.message}`, { callbackError });
                            stepCompleted = true;
                            const internalMessage = `Internal callback error: ${callbackError.message}`;
                            finalOutcome = { status: 'error', error: internalMessage, aiResponseText: this.accumulatedText };
                            try {
                                await super._updatePromptHistoryRecord('error', this.accumulatedText, internalMessage, this.turnContext.generatedReportCode);
                                this._sendStreamEvent('error', { message: internalMessage });
                            } catch (finalError) { logger.error(`Failed to report internal callback error: ${finalError.message}`); }
                            rejectProcessing(callbackError); // Reject overall promise
                            rejectStep(callbackError); // Reject step promise
                        }
                    }; // End streamCallback definition

                    // --- Initiate LLM call for this step ---
                    logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Calling LLM for step ${loopCount}. History length: ${llmContext.history.length}`);
                    this._sendStreamEvent('thinking', {}); // Indicate thinking before each LLM call
                    await promptService.streamLLMReasoningResponse(llmContext, streamCallback);
                    logger.info(`[Agent Loop - STREAMING ${this.sessionId}] LLM stream initiated for step ${loopCount}. Callback will handle result.`);

                }); // End stepPromise definition

                // Await the completion of the current step (LLM response + potential tool execution)
                try {
                    await stepPromise;
                    // Check if the overall process was completed/resolved within the step's callback
                    if (finalOutcome.status === 'completed' || finalOutcome.status === 'error') {
                         logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Loop break condition met after step ${loopCount}. Status: ${finalOutcome.status}`);
                         break; // Exit the while loop
                    }
                     logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Step ${loopCount} completed successfully, continuing loop.`);
                } catch (stepError) {
                    logger.error(`[Agent Loop - STREAMING ${this.sessionId}] Step ${loopCount} failed: ${stepError.message}. Ending loop.`);
                     // Ensure finalOutcome reflects the error if not already set
                     if (finalOutcome.status !== 'error') {
                         finalOutcome = { status: 'error', error: stepError.message, aiResponseText: this.accumulatedText };
                     }
                    break; // Exit the while loop on step failure
                }

            } // --- End Main Agent Loop (while) ---

            if (loopCount >= MAX_LOOPS) {
                 logger.warn(`[Agent Loop - STREAMING ${this.sessionId}] Reached max loop count (${MAX_LOOPS}). Forcing completion.`);
                 finalOutcome = { status: 'error', error: 'Agent reached maximum steps.', aiResponseText: this.accumulatedText };
                 await super._updatePromptHistoryRecord('error', this.accumulatedText, finalOutcome.error, this.turnContext.generatedReportCode);
                 this._sendStreamEvent('error', { message: finalOutcome.error });
                 resolveProcessing(); // Ensure promise is resolved
            } else if (finalOutcome.status === 'unknown') {
                 // Loop finished without explicit completed/error (shouldn't happen ideally)
                 logger.warn(`[Agent Loop - STREAMING ${this.sessionId}] Loop finished unexpectedly with unknown status.`);
                 finalOutcome = { status: 'error', error: 'Agent finished unexpectedly.', aiResponseText: this.accumulatedText };
                 await super._updatePromptHistoryRecord('error', this.accumulatedText, finalOutcome.error, this.turnContext.generatedReportCode);
                 this._sendStreamEvent('error', { message: finalOutcome.error });
                 resolveProcessing();
            }

            // --- Wait for the overall completion signal ---
            // This might be redundant now if resolveProcessing is called correctly in all end paths
            // await processingCompletePromise;
            logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Overall processing completion signal received. Final outcome: ${finalOutcome.status}`);


        } catch (error) {
            logger.error(`[Agent Loop - STREAMING ${this.sessionId}] Top-level error: ${error.message}`, { error });
            if (finalOutcome.status === 'unknown') {
                finalOutcome = { status: 'error', error: error.message || 'Unknown agent error', aiResponseText: this.accumulatedText };
            }
            if (finalOutcome.status !== 'completed') {
                try {
                    const errorMessage = finalOutcome.error || error.message || 'Unknown error';
                    await super._updatePromptHistoryRecord('error', this.accumulatedText || null, errorMessage, this.turnContext.generatedReportCode);
                    this._sendStreamEvent('error', { message: errorMessage });
                } catch (reportingError) { logger.error(`Error reporting top-level error: ${reportingError.message}`); }
            }
             // Ensure promise is resolved/rejected if an error happens before it's settled
             if (typeof rejectProcessing === 'function') { // Check if rejectProcessing is defined
                 try { rejectProcessing(error); } catch (e) { /* ignore */ }
             }

            return finalOutcome;
        } finally {
            logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Reached finally block. Final Status: ${finalOutcome.status}`);
             // Send a final 'end' event AFTER the main promise resolves/rejects
             // Ensure this doesn't race with 'completed' or 'error' events
             // Maybe delay slightly? Or rely on client handling?
             // For now, let's send it to signal HTTP response end.
             this._sendStreamEvent('end', { status: finalOutcome.status }); // Send final status
        }

        logger.info(`[Agent Loop - STREAMING ${this.sessionId}] Returning final outcome:`, finalOutcome);
        return finalOutcome;
    }

    // --- ADD HELPER FOR STREAMING PARSE --- 
    _tryParseToolCall(textChunk) {
         // Use the parsing logic from the base class
         return super._tryParseJsonToolCall(textChunk);
    }
}

module.exports = {
    AgentOrchestrator,
    StreamingAgentOrchestrator
};

