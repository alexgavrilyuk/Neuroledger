// backend/src/features/chat/agent.service.js
const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const promptService = require('./prompt.service');
const PromptHistory = require('./prompt.model');
const { getIO } = require('../../socket');
const { assembleContext } = require('./prompt.service');
const codeExecutionService = require('../../shared/services/codeExecution.service');
const Papa = require('papaparse');
const User = require('../users/user.model');

const MAX_AGENT_ITERATIONS = 15; // Increased for multi-step analysis
const MAX_TOOL_RETRIES = 1;
const HISTORY_SUMMARIZATION_THRESHOLD = 10;
const HISTORY_FETCH_LIMIT = 20;

/**
 * Orchestrates the agent's reasoning loop to fulfill user requests.
 */
class AgentOrchestrator {
    constructor(userId, teamId, sessionId, aiMessagePlaceholderId, previousAnalysisData = null, previousGeneratedCode = null) {
        this.userId = userId;
        this.teamId = teamId;
        this.sessionId = sessionId;
        this.aiMessagePlaceholderId = aiMessagePlaceholderId;
        this.turnContext = {
            originalQuery: '',
            chatHistoryForSummarization: [],
            steps: [],
            intermediateResults: {
                lastSchema: null,
                parsedDataRefs: {}, // Changed to an object to store multiple parsed datasets
                analysisResults: {}, // Changed to store multiple analysis results by goal
                previousAnalysisData: previousAnalysisData,
                previousGeneratedCode: previousGeneratedCode,
            },
            userContext: '',
            teamContext: '',
            generatedReportCode: null,
            finalAnswer: null,
            error: null,
            toolErrorCounts: {},
        };
        this.io = getIO();
    }

    /**
     * Emits WebSocket events to update the frontend on agent status.
     * @param {string} eventName - The name of the event.
     * @param {object} payload - The data payload for the event.
     */
    _emitAgentStatus(eventName, payload) {
        if (this.io && this.sessionId && this.userId) {
            const eventPayload = {
                messageId: this.aiMessagePlaceholderId,
                sessionId: this.sessionId,
                ...payload,
            };
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
        this.turnContext.toolErrorCounts = {};
        let iterations = 0;

        try {
            // 0. Set initial state & emit thinking
            this._emitAgentStatus('agent:thinking', {});

            // Fetch initial user/team context settings
            const initialContext = await assembleContext(this.userId, []);
            this.turnContext.userContext = initialContext.userContext;
            this.turnContext.teamContext = initialContext.teamContext;

            await this._prepareChatHistory();

            while (iterations < MAX_AGENT_ITERATIONS) {
                iterations++;
                logger.info(`[Agent Loop ${this.sessionId}] Iteration ${iterations}`);
                
                // Get the next action from the LLM
                const llmContext = this._prepareLLMContext();
                const llmResponse = await promptService.getLLMReasoningResponse(llmContext);
                const action = this._parseLLMResponse(llmResponse);

                // Process the action
                if (action.tool === '_answerUserTool') {
                    // Final answer received
                    if (typeof action.args.textResponse !== 'string' || action.args.textResponse.trim() === '') {
                        logger.warn(`[Agent Loop ${this.sessionId}] LLM called _answerUserTool with invalid/empty textResponse.`);
                        this.turnContext.finalAnswer = llmResponse.trim();
                    } else {
                        this.turnContext.finalAnswer = action.args.textResponse;
                    }
                    logger.info(`[Agent Loop ${this.sessionId}] LLM decided to answer.`);
                    this.turnContext.steps.push({ tool: action.tool, args: action.args, resultSummary: 'Final answer provided.' });
                    break; 
                } else if (action.tool) {
                    logger.info(`[Agent Loop ${this.sessionId}] Executing Action: Tool ${action.tool}`);
                    const currentStepIndex = this.turnContext.steps.length;

                    this.turnContext.steps.push({ 
                        tool: action.tool, 
                        args: action.args, 
                        resultSummary: 'Executing tool...', 
                        attempt: 1
                    });
                    
                    this._emitAgentStatus('agent:using_tool', { toolName: action.tool, args: action.args });

                    let toolResult = await this.toolDispatcher(action.tool, action.args);
                    let resultSummary = this._summarizeToolResult(toolResult);
                    
                    if(this.turnContext.steps[currentStepIndex]) {
                        this.turnContext.steps[currentStepIndex].resultSummary = resultSummary;
                    }
                    
                    // Retry logic for failed tools
                    if (toolResult.error && (this.turnContext.toolErrorCounts[action.tool] || 0) < MAX_TOOL_RETRIES) {
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

                    this._emitAgentStatus('agent:tool_result', { toolName: action.tool, resultSummary });

                    // Critical error check for code execution failures
                    if ((action.tool === 'execute_analysis_code') && toolResult.error) {
                        logger.error(`[Agent Loop ${this.sessionId}] CRITICAL ERROR during code execution: ${toolResult.error}. Terminating loop.`);
                        this.turnContext.error = `Code Execution Failed: ${resultSummary}`; 
                        await this._updatePromptHistoryRecord('error', null, this.turnContext.error, null);
                        this._emitAgentStatus('agent:error', { error: this.turnContext.error });
                        return { status: 'error', error: this.turnContext.error };
                    }

                    // Store intermediate results based on the tool used
                    this._storeToolResults(action.tool, action.args, toolResult);
                }
            }

            if (iterations >= MAX_AGENT_ITERATIONS && !this.turnContext.finalAnswer) {
                logger.warn(`[Agent Loop ${this.sessionId}] Agent reached maximum iterations.`);
                this.turnContext.finalAnswer = "I apologize, but I couldn't complete the request within the allowed steps. The query might be too complex.";
                this.turnContext.steps.push({ tool: '_maxIterations', args: {}, resultSummary: 'Reached max iterations.'});
            }

            if (!this.turnContext.finalAnswer) {
                logger.error(`[Agent Loop ${this.sessionId}] Loop finished unexpectedly without a final answer.`);
                this.turnContext.finalAnswer = "I encountered an unexpected issue and could not complete the request.";
                this.turnContext.steps.push({ tool: '_internalError', args: {}, resultSummary: 'Loop ended without final answer.'});
                await this._updatePromptHistoryRecord('error', null, 'Agent loop finished without final answer', null);
                return { status: 'error', error: 'Agent loop finished without final answer' };
            }

            // Finalize: Update the PromptHistory record
            await this._updatePromptHistoryRecord(
                'completed',
                this.turnContext.finalAnswer,
                null,
                this.turnContext.generatedReportCode
            );
            logger.info(`[Agent Loop ${this.sessionId}] Completed successfully.`);
            return { 
                status: 'completed', 
                aiResponseText: this.turnContext.finalAnswer
            };

        } catch (error) {
            logger.error(`[Agent Loop ${this.sessionId}] Error during agent execution: ${error.message}`, { error });
            const errorMessage = error.message || 'Unknown agent error';
            this.turnContext.error = errorMessage;
            this._emitAgentStatus('agent:error', { error: errorMessage });
            if (this.aiMessagePlaceholderId) {
                await this._updatePromptHistoryRecord('error', null, errorMessage, null);
            }
            return { status: 'error', error: errorMessage };
        }
    }

    /**
     * Store tool results in the intermediateResults based on the tool type
     * @param {string} toolName - The name of the tool
     * @param {object} args - The arguments used in the tool call
     * @param {object} toolResult - The result from the tool execution
     */
    _storeToolResults(toolName, args, toolResult) {
        if (toolName === 'get_dataset_schema' && toolResult.result) {
            this.turnContext.intermediateResults.lastSchema = toolResult.result;
            logger.info('Stored dataset schema.');
        }
        else if (toolName === 'parse_csv_data' && toolResult.result?.parsed_data_ref) {
            const parsedDataRef = toolResult.result.parsed_data_ref;
            const datasetId = args.dataset_id;
            // Store with dataset ID as key
            this.turnContext.intermediateResults.parsedDataRefs[datasetId] = parsedDataRef;
            logger.info(`Stored parsed data reference: ${parsedDataRef} for dataset ${datasetId}`);
        }
        else if (toolName === 'generate_analysis_code' && toolResult.result?.code) {
            // Store the generated code with the analysis goal as a key
            const analysisGoal = args.analysis_goal;
            this.turnContext.intermediateResults.lastGeneratedAnalysisCode = {
                code: toolResult.result.code,
                goal: analysisGoal
            };
            logger.info(`Stored generated code for analysis goal: "${analysisGoal.substring(0, 50)}..."`);
        }
        else if (toolName === 'execute_analysis_code' && toolResult.result !== undefined) {
            // Store the analysis result using the analysis goal as key
            // Retrieve the goal from the current turn context or the args
            const analysisGoal = this.turnContext.intermediateResults.lastGeneratedAnalysisCode?.goal || args.analysis_goal || `Analysis ${Object.keys(this.turnContext.intermediateResults.analysisResults).length + 1}`;

            this.turnContext.intermediateResults.analysisResults[analysisGoal] = toolResult.result;
            logger.info(`Stored analysis result for goal: "${analysisGoal.substring(0, 50)}..."`);
        }
        else if (toolName === 'generate_report_code' && toolResult.result?.react_code) {
            this.turnContext.generatedReportCode = toolResult.result.react_code;
            logger.info(`Stored generated React report code.`);
        }
    }

    /** Fetches and potentially summarizes chat history. */
    async _prepareChatHistory() {
        try {
            // Look for previous analysis results or code
            const historyRecords = await PromptHistory.find({
                chatSessionId: this.sessionId,
                _id: { $ne: this.aiMessagePlaceholderId },
                messageType: 'ai_report',
                status: 'completed',
                $or: [
                    { reportAnalysisData: { $exists: true, $ne: null } },
                    { aiGeneratedCode: { $exists: true, $ne: null } }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(HISTORY_FETCH_LIMIT)
            .select('messageType status reportAnalysisData aiGeneratedCode createdAt _id')
            .lean();

            logger.debug(`[Agent History Prep] Fetched ${historyRecords.length} potential artifact records (newest first).`);

            // Find the most recent successful report with analysis data
            const lastSuccessfulReport = historyRecords.find(msg => msg.reportAnalysisData);

            let artifactData = {
                previousAnalysisResult: null,
                previousGeneratedCode: null,
                analysisFoundOnMsgId: null,
                codeFoundOnMsgId: null
            };

            if (lastSuccessfulReport) {
                artifactData = {
                    previousAnalysisResult: lastSuccessfulReport.reportAnalysisData,
                    previousGeneratedCode: lastSuccessfulReport.aiGeneratedCode,
                    analysisFoundOnMsgId: lastSuccessfulReport._id,
                    codeFoundOnMsgId: lastSuccessfulReport.aiGeneratedCode ? lastSuccessfulReport._id : null
                };

                logger.info(`[Agent History Prep] Found previous artifacts in message ${lastSuccessfulReport._id}`, {
                    hasAnalysis: !!artifactData.previousAnalysisResult,
                    hasCode: !!artifactData.previousGeneratedCode
                });
            } else {
                logger.info(`[Agent History Prep] No suitable previous completed report with analysis data found.`);
            }

            // Store potentially found artifacts in intermediate results
            this.turnContext.intermediateResults.previousAnalysisResult = artifactData.previousAnalysisResult;
            this.turnContext.intermediateResults.previousGeneratedCode = artifactData.previousGeneratedCode;

            logger.debug(`[Agent History Prep] Post-artifact search check:`, {
                hasPreviousAnalysis: !!artifactData.previousAnalysisResult,
                analysisMsgId: artifactData.analysisFoundOnMsgId,
                hasPreviousCode: !!artifactData.previousGeneratedCode,
                codeMsgId: artifactData.codeFoundOnMsgId,
            });

            // Fetch the full history for LLM context
            const fullHistoryRecords = await PromptHistory.find({
                chatSessionId: this.sessionId,
                _id: { $ne: this.aiMessagePlaceholderId }
            })
            .sort({ createdAt: 1 })
            .limit(HISTORY_FETCH_LIMIT)
            .select('messageType promptText aiResponseText')
            .lean();

            const formattedHistory = fullHistoryRecords.map(msg => ({
                role: msg.messageType === 'user' ? 'user' : 'assistant',
                content: (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''
            })).filter(msg => msg.content);

            this.turnContext.fullChatHistory = formattedHistory;

        } catch (err) {
            logger.error(`Failed to fetch chat history for session ${this.sessionId}: ${err.message}`);
            this.turnContext.fullChatHistory = [];
            this.turnContext.intermediateResults.previousAnalysisResult = null;
            this.turnContext.intermediateResults.previousGeneratedCode = null;
        }
    }

    /**
     * Prepares the full context object required by the LLM reasoning prompt service.
     * @returns {object} - Context object for promptService.getLLMReasoningResponse.
     */
    _prepareLLMContext() {
        // Prepare previous analysis context
        let previousAnalysisResultSummary = null;
        let hasPreviousGeneratedCode = false;

        if (this.turnContext.intermediateResults.previousAnalysisResult) {
            previousAnalysisResultSummary = "Analysis results from a previous turn are available and should be reused if applicable.";
        }
        if (this.turnContext.intermediateResults.previousGeneratedCode) {
            hasPreviousGeneratedCode = true;
        }

        // Ensure fullChatHistory exists
        const fullChatHistory = this.turnContext.fullChatHistory || [];

        return {
            userId: this.userId,
            originalQuery: this.turnContext.originalQuery,
            fullChatHistory: fullChatHistory,
            currentTurnSteps: this.turnContext.steps,
            availableTools: this._getToolDefinitions(),
            userContext: this.turnContext.userContext,
            teamContext: this.turnContext.teamContext,
            previousAnalysisResultSummary: previousAnalysisResultSummary,
            hasPreviousGeneratedCode: hasPreviousGeneratedCode,
            analysisResults: this.turnContext.intermediateResults.analysisResults
        };
    }

    /**
     * Parses the LLM's raw response text to identify tool calls or final answers.
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
                let sanitizedJsonString = null;
                try {
                    // Sanitize the JSON string
                    sanitizedJsonString = potentialJson.replace(/("code"\s*:\s*")([\s\S]*?)("(?!\\))/gs, (match, p1, p2, p3) => {
                        const escapedCode = p2
                            .replace(/\\/g, '\\')
                            .replace(/"/g, '\"')
                            .replace(/\n/g, '\\n')
                            .replace(/\r/g, '\\r');
                        return p1 + escapedCode + p3;
                    });

                    const parsed = JSON.parse(sanitizedJsonString);

                    // Validate the parsed JSON structure for a tool call
                    if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                        const knownTools = this._getToolImplementations();
                        if (knownTools[parsed.tool]) {
                            logger.debug(`Parsed tool call via regex: ${parsed.tool}`, parsed.args);
                            // Handle _answerUserTool called via JSON
                            if (parsed.tool === '_answerUserTool') {
                                if(typeof parsed.args.textResponse === 'string' && parsed.args.textResponse.trim() !== '') {
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
        // Updated tool definitions with more flexibility for dynamic analysis
        return [
            {
                name: 'list_datasets',
                description: 'Lists available datasets (IDs, names, descriptions).',
                args: {},
                output: '{ "datasets": [{ "id": "...", "name": "...", "description": "..." }] }'
            },
            {
                name: 'get_dataset_schema',
                description: 'Gets schema (column names, types, descriptions) for a specific dataset ID.',
                args: {
                    dataset_id: 'string'
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
                description: 'Generates Node.js analysis code to achieve a specific analysis goal based on the available schema.',
                args: {
                    analysis_goal: 'string'
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
                output: '{ "result": <JSON result specific to the analysis goal>, "error": "..." }'
            },
            {
                name: 'generate_report_code',
                description: 'Generates a React report component to visualize previously executed analysis results.',
                args: {
                    report_goal: 'string' // Description of what the report should show
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

            // For general results (especially analysis results)
            const resultString = JSON.stringify(result.result);
            const limit = 500;
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
            // Get all analysis results
            const analysisResults = this.turnContext.intermediateResults.analysisResults;
            const finalGeneratedCode = this.turnContext.generatedReportCode;

            logger.debug(`[Agent Update DB] Preparing update for ${this.aiMessagePlaceholderId}`, { 
                status, 
                hasResponseText: !!aiResponseText, 
                hasErrorMessage: !!errorMessage, 
                hasGeneratedCode: !!finalGeneratedCode, 
                codeLength: finalGeneratedCode?.length,
                hasAnalysisResults: !!analysisResults && Object.keys(analysisResults).length > 0,
                analysisResultKeys: Object.keys(analysisResults || {})
            });

            const updateData = {
                status: status,
                ...(aiResponseText !== null && { aiResponseText: aiResponseText }),
                ...(errorMessage !== null && { errorMessage: errorMessage }),
                ...(finalGeneratedCode !== null && { aiGeneratedCode: finalGeneratedCode }),
                ...(status === 'completed' && analysisResults && Object.keys(analysisResults).length > 0 &&
                   { reportAnalysisData: analysisResults }),
                agentSteps: this.turnContext.steps,
            };

            const updatedMessage = await PromptHistory.findByIdAndUpdate(this.aiMessagePlaceholderId, updateData, { new: true });
            if (updatedMessage) {
                logger.info(`Updated PromptHistory ${this.aiMessagePlaceholderId} with status: ${status}`);
                if (status === 'completed' && analysisResults && Object.keys(analysisResults).length > 0) {
                    logger.debug(`[Agent Update DB] Saved analysisResults for ${this.aiMessagePlaceholderId}`);
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
                return { result: toolOutput };
            }
        } catch (error) {
            logger.error(`Error executing tool ${toolName}: ${error.message}`, { args, error });
            return { error: `Tool ${toolName} execution failed: ${error.message}` };
        }
    }

    /** Tool: List Datasets */
    async _listDatasetsTool(args) {
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
            const resultData = {
                schemaInfo: schemaData.schemaInfo || [],
                columnDescriptions: schemaData.columnDescriptions || {},
                description: schemaData.description || ''
            };
            // Store schema for later use
            this.turnContext.intermediateResults.lastSchema = resultData;
            logger.info(`Stored dataset schema.`);
            return { result: resultData };
        } catch (error) {
            logger.error(`_getDatasetSchemaTool failed for ${dataset_id}: ${error.message}`, { error });
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
                throw new Error('Failed to fetch dataset content or content is empty.');
            }
            
            logger.info(`Parsing CSV content for dataset ${dataset_id} (length: ${rawContent.length})`);
            const parseResult = Papa.parse(rawContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim(),
            });

            if (parseResult.errors && parseResult.errors.length > 0) {
                logger.error(`PapaParse errors for dataset ${dataset_id}:`, parseResult.errors);
                const errorSummary = parseResult.errors.slice(0, 3).map(e => e.message).join('; ');
                return { error: `CSV Parsing failed: ${errorSummary}` };
            }

            if (!parseResult.data || parseResult.data.length === 0) {
                return { error: 'CSV Parsing resulted in no data.' };
            }

            logger.info(`Successfully parsed ${parseResult.data.length} rows for dataset ${dataset_id}.`);
            // Generate a unique reference for this parsed data
            const parsedDataRef = `parsed_${dataset_id}_${Date.now()}`;
            // Store in the intermediate results
            this.turnContext.intermediateResults[parsedDataRef] = parseResult.data; 

            return { 
                result: { 
                    status: 'success', 
                    message: `Data parsed successfully, ${parseResult.data.length} rows found.`,
                    parsed_data_ref: parsedDataRef,
                    rowCount: parseResult.data.length
                } 
            };
        } catch (error) {
            logger.error(`_parseCsvDataTool failed for ${dataset_id}: ${error.message}`, { error });
            return { error: `Failed to parse dataset content: ${error.message}` };
        }
    }

    /** Tool: Generate Analysis Code */
    async _generateAnalysisCodeTool(args) { 
        const { analysis_goal } = args; 
        logger.info(`Executing tool: generate_analysis_code with goal: "${analysis_goal?.substring(0, 50)}..."`);

        if (!analysis_goal || typeof analysis_goal !== 'string') {
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

            return { result: { code: generatedCodeResponse.code } }; 
        } catch (error) {
            logger.error(`_generateAnalysisCodeTool failed: ${error.message}`, { error });
            return { error: `Failed to generate analysis code: ${error.message}` };
        }
    }

    /** Tool: Execute Analysis Code */
    async _executeAnalysisCodeTool(args) {
        const { code, parsed_data_ref } = args;
        logger.info(`Executing tool: execute_analysis_code with parsed data ref: ${parsed_data_ref}`);

        if (!code || typeof code !== 'string') {
            return { error: 'Missing or invalid required argument: code (must be a string)' };
        }
        
        if (!parsed_data_ref || typeof parsed_data_ref !== 'string') {
            return { error: 'Missing or invalid required argument: parsed_data_ref (must be a string)' };
        }

        // Retrieve the parsed data using the reference
        const parsedData = this.turnContext.intermediateResults[parsed_data_ref];
        if (!parsedData) {
            return { error: `Parsed data not found for ref: ${parsed_data_ref}` };
        }

        if (!Array.isArray(parsedData)) {
            return { error: 'Referenced parsed data is not an array.'}; 
        }

        try {
            const result = await codeExecutionService.executeSandboxedCode(code, parsedData);
            
            if (result.error) {
                return { error: result.error };
            }

            if (result.result === undefined) {
                return { error: 'Analysis code execution did not return any result.' };
            }
            
            logger.info(`Analysis execution successful.`);
            return { result: result.result };

        } catch (error) {
            logger.error(`_executeAnalysisCodeTool failed: ${error.message}`, { error });
            return { error: `Analysis code execution failed: ${error.message}` };
        }
    }

    /** Tool: Generate Report Code */
    async _generateReportCodeTool(args) {
        const { report_goal } = args;
        logger.info(`Executing tool: generate_report_code with goal: "${report_goal?.substring(0, 50)}..."`);

        if (!report_goal || typeof report_goal !== 'string') {
            return { error: 'Missing or invalid required argument: report_goal' };
        }

        // Gather all analysis results from the current turn
        const analysisResults = this.turnContext.intermediateResults.analysisResults;

        // Check if we have any analysis results
        if (!analysisResults || Object.keys(analysisResults).length === 0) {
            // Try using previous results if available
            if (this.turnContext.intermediateResults.previousAnalysisData) {
                logger.info('No current analysis results found, using previous analysis data for report generation.');
                analysisResults = this.turnContext.intermediateResults.previousAnalysisData;
            } else {
                return {
                    error: 'Cannot generate report code: No analysis results available. Please perform analysis first.'
                };
            }
        }

        try {
            // Convert analysis results to a format suitable for the report generator
            let resultsForReport;
            try {
                resultsForReport = JSON.stringify(analysisResults);
            } catch (stringifyError) {
                logger.error(`Failed to stringify analysis results: ${stringifyError.message}`);
                return { error: `Internal error: Could not process analysis results for report.` };
            }

            const reportResult = await promptService.generateReportCode({
                userId: this.userId,
                reportGoal: report_goal,
                analysisResults: resultsForReport
            });

            const generatedCodeString = reportResult?.react_code;

            if (!generatedCodeString || typeof generatedCodeString !== 'string') {
                logger.warn('promptService.generateReportCode returned no valid code string.');
                return { error: 'Failed to generate report code. The AI might need more information or context.' };
            }

            logger.info('Successfully generated React report code string.');
            return { result: { react_code: generatedCodeString } };

        } catch (error) {
            logger.error(`_generateReportCodeTool failed: ${error.message}`, { error });
            return { error: `Failed to generate report code: ${error.message}` };
        }
    }

    /** Tool: Answer User Signal */
    async _answerUserTool(args) {
        logger.info(`Executing tool: _answerUserTool`);
        const { textResponse } = args;
        if (typeof textResponse !== 'string' || textResponse.trim() === '') {
            return { error: 'Missing or empty required argument: textResponse for _answerUserTool' };
        }
        // This tool doesn't *do* anything other than signal the end
        return { result: { message: 'Answer signal processed.'} };
    }
}

module.exports = { AgentOrchestrator };