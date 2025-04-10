const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const promptService = require('./prompt.service');
const PromptHistory = require('./prompt.model');
const { getIO } = require('../../socket'); // Corrected path
const { assembleContext } = require('./prompt.service'); // Import assembleContext
const codeExecutionService = require('../../shared/services/codeExecution.service'); // Import Code Execution Service

const MAX_AGENT_ITERATIONS = 10; // Increased iterations slightly for multi-step tasks
const MAX_TOOL_RETRIES = 1; // Allow one retry for potentially transient tool errors
const HISTORY_SUMMARIZATION_THRESHOLD = 10; // Summarize if more than 10 messages
const HISTORY_FETCH_LIMIT = 20; // Max messages to fetch for context/summarization

/**
 * Orchestrates the agent's reasoning loop to fulfill user requests.
 */
class AgentOrchestrator {
    constructor(userId, teamId, sessionId, aiMessagePlaceholderId) {
        this.userId = userId;
        this.teamId = teamId; // May be null for personal context
        this.sessionId = sessionId;
        this.aiMessagePlaceholderId = aiMessagePlaceholderId;
        this.turnContext = {
            originalQuery: '',
            chatHistoryForSummarization: [], // Store raw history for summarizer
            steps: [], // Track tools used and results this turn
            intermediateResults: {},
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

                // 1. Reason/Plan: Call LLM to decide next action
                const llmContext = this._prepareLLMContext();
                const llmResponse = await promptService.getLLMReasoningResponse(llmContext);

                // 2. Parse LLM Response: Tool call or final answer?
                const action = this._parseLLMResponse(llmResponse);

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
                    break; // Exit loop
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
                        // Store the generated code in the turn context
                        this.turnContext.generatedReportCode = toolResult.result.react_code;
                        logger.info(`[Agent Loop ${this.sessionId}] Stored generated React report code.`);
                    }
                    // Loop continues after report generation attempt
                } else if (action.tool) {
                    logger.info(`[Agent Loop ${this.sessionId}] LLM requested tool: ${action.tool}`);
                    const currentStepIndex = this.turnContext.steps.length; // Index for potential updates
                    this.turnContext.steps.push({ tool: action.tool, args: action.args, resultSummary: 'Executing tool...', attempt: 1 });
                    this._emitAgentStatus('agent:using_tool', { toolName: action.tool, args: action.args });

                    let toolResult = await this.toolDispatcher(action.tool, action.args);
                    let resultSummary = this._summarizeToolResult(toolResult);
                    this.turnContext.steps[currentStepIndex].resultSummary = resultSummary;
                    
                    // --- Error Handling & Retry Logic --- 
                    if (toolResult.error && (this.turnContext.toolErrorCounts[action.tool] || 0) < MAX_TOOL_RETRIES) {
                        logger.warn(`[Agent Loop ${this.sessionId}] Tool ${action.tool} failed. Attempting retry (${(this.turnContext.toolErrorCounts[action.tool] || 0) + 1}/${MAX_TOOL_RETRIES}). Error: ${toolResult.error}`);
                        this.turnContext.toolErrorCounts[action.tool] = (this.turnContext.toolErrorCounts[action.tool] || 0) + 1;
                        
                        // Update step summary to indicate retry
                        this.turnContext.steps[currentStepIndex].resultSummary = `Error: ${toolResult.error}. Retrying...`;
                        this._emitAgentStatus('agent:tool_result', { toolName: action.tool, resultSummary: this.turnContext.steps[currentStepIndex].resultSummary }); // Update FE briefly

                        // Wait briefly before retry?
                        // await new Promise(resolve => setTimeout(resolve, 500)); 

                        this._emitAgentStatus('agent:using_tool', { toolName: action.tool, args: action.args }); // Indicate retry attempt
                        toolResult = await this.toolDispatcher(action.tool, action.args); // Retry the tool
                        resultSummary = this._summarizeToolResult(toolResult); // Get new summary
                        
                        // Update step with final attempt result
                        this.turnContext.steps[currentStepIndex].resultSummary = resultSummary;
                        this.turnContext.steps[currentStepIndex].attempt = 2; 
                        
                        if (toolResult.error) {
                           logger.error(`[Agent Loop ${this.sessionId}] Tool ${action.tool} failed on retry. Error: ${toolResult.error}`);
                        } else {
                           logger.info(`[Agent Loop ${this.sessionId}] Tool ${action.tool} succeeded on retry.`);
                        }
                    }
                    // --- End Retry Logic --- 

                    this._emitAgentStatus('agent:tool_result', { toolName: action.tool, resultSummary });

                    // Store intermediate results if needed (e.g., code from generate_data_extraction_code)
                    if (action.tool === 'generate_data_extraction_code' && toolResult.result?.code) {
                         this.turnContext.intermediateResults.generatedCode = toolResult.result.code;
                    } 
                    // Store execution result
                    if (action.tool === 'execute_backend_code' && toolResult.result !== undefined) {
                         this.turnContext.intermediateResults.codeExecutionResult = toolResult.result;
                    } else if (action.tool === 'execute_backend_code' && toolResult.error) {
                         this.turnContext.intermediateResults.codeExecutionError = toolResult.error;
                    }

                    if (toolResult.error) {
                         logger.warn(`[Agent Loop ${this.sessionId}] Tool ${action.tool} resulted in error: ${toolResult.error}`);
                    }
                } else { // Should not happen with current parsing logic, but handle defensively
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

            // 5. Finalize: Update the PromptHistory record
            await this._updatePromptHistoryRecord(
                'completed',
                this.turnContext.finalAnswer,
                null, // No error message
                this.turnContext.generatedReportCode // Pass generated code
            );
            logger.info(`[Agent Loop ${this.sessionId}] Completed successfully.`);
            return { 
                status: 'completed', 
                aiResponseText: this.turnContext.finalAnswer, 
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
                 _id: { $ne: this.aiMessagePlaceholderId }
             })
             .sort({ createdAt: -1 }) 
             .limit(HISTORY_FETCH_LIMIT) 
             .lean();

             historyRecords.reverse(); // Chronological order

             this.turnContext.chatHistoryForSummarization = historyRecords.map(msg => ({
                 role: msg.messageType === 'user' ? 'user' : 'assistant',
                 content: msg.messageType === 'user' ? msg.promptText : msg.aiResponseText 
             })).filter(msg => msg.content);

             const historyLength = this.turnContext.chatHistoryForSummarization.length;
             logger.debug(`Fetched ${historyLength} history records for session ${this.sessionId}.`);

             if (historyLength === 0) {
                 this.turnContext.historySummary = "No previous conversation history.";
             } else if (historyLength > HISTORY_SUMMARIZATION_THRESHOLD) {
                 logger.info(`History length (${historyLength}) exceeds threshold (${HISTORY_SUMMARIZATION_THRESHOLD}). Attempting summarization...`);
                 // Call prompt service to summarize the fetched history
                 this.turnContext.historySummary = await promptService.summarizeChatHistory(
                     this.turnContext.chatHistoryForSummarization
                 );
                 logger.info(`History summarized successfully.`);
             } else {
                 // If history is short, format it directly (or use as is for the main prompt)
                 // For now, just use a simple message indicating direct inclusion might happen
                 this.turnContext.historySummary = `Recent conversation history (last ${historyLength} messages - full content provided in context if possible).`;
                 // TODO: Decide if short history should be passed differently to the main LLM call
                 // vs. relying on the summarization slot in the system prompt.
             }
             
        } catch (err) {
             logger.error(`Failed to fetch or summarize chat history for session ${this.sessionId}: ${err.message}`);
             this.turnContext.historySummary = "Error processing conversation history.";
        }
    }

    /** Prepares context for the LLM reasoning step. */
    _prepareLLMContext() {
        const context = {
            userId: this.userId,
            teamId: this.teamId,
            sessionId: this.sessionId,
            originalQuery: this.turnContext.originalQuery,
            historySummary: this.turnContext.historySummary, // Use the prepared summary
            currentTurnSteps: this.turnContext.steps,
            availableTools: this._getToolDefinitions(),
            userContext: this.turnContext.userContext, // User settings context
            teamContext: this.turnContext.teamContext, // Team settings context
        };
        logger.debug('[Agent Loop] Prepared LLM Context', { stepsCount: context.currentTurnSteps.length, historyLength: this.turnContext.chatHistoryForSummarization.length });
        return context;
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
        // It looks for { ... } possibly surrounded by ```json ... ``` or ``` ... ```
        const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*\})\s*```$|^(\{[\s\S]*\})$/m;
        const jsonMatch = trimmedResponse.match(jsonRegex);

        // If a JSON block is found (either fenced or raw)
        if (jsonMatch) {
            // Extract the JSON part (group 1 for fenced, group 2 for raw)
            const potentialJson = jsonMatch[1] || jsonMatch[2];
            if (potentialJson) {
                 try {
                    const parsed = JSON.parse(potentialJson);

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
                                     // Fallback to treating the original trimmed string as the answer if textResponse is invalid
                                     return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                                }
                            }
                            return { tool: parsed.tool, args: parsed.args }; // Valid tool call
                        } else {
                            logger.warn(`LLM requested unknown tool via JSON: ${parsed.tool}`);
                            // Fallback: Treat original string as answer
                            return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                        }
                    } else {
                         logger.warn('Parsed JSON does not match expected tool structure.', parsed);
                         // Fallback: Treat original string as answer
                         return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                    }
                } catch (e) {
                    logger.error(`Failed to parse extracted JSON: ${e.message}. JSON source: ${potentialJson}`);
                    // Fallback: Treat original string as answer
                    return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
                }
            }
        }

        // If no JSON block is found or parsing failed, assume the whole response is the final answer text
        logger.debug('LLM response treated as final answer text (no valid JSON tool call found).');
        return { tool: '_answerUserTool', args: { textResponse: trimmedResponse } };
    }

    /** Returns the structured definitions of available tools for the LLM prompt. */
    _getToolDefinitions() {
        // Based on Section 7 of AI-Improvement-Plan.md (Phase 1, 2 & 3)
        return [
            // Phase 1 tools (list_datasets, get_dataset_schema)
            {
                name: 'list_datasets',
                description: 'Lists available datasets (IDs, names, descriptions) accessible to the user/team.',
                args: {}, // No arguments needed
                output: '{ \"datasets\": [{ \"id\": \"...\", \"name\": \"...\", \"description\": \"...\" }, ...] }'
            },
            {
                name: 'get_dataset_schema',
                description: 'Gets detailed schema (column names, types), description, and column descriptions for a specific dataset ID.',
                args: { dataset_id: 'string (The ID of the dataset)' },
                output: '{ \"schemaInfo\": [{ \"name\": \"...\", \"type\": \"...\" }, ...], \"columnDescriptions\": {\"colA\": \"desc\", ...}, \"description\": \"...\" }'
            },
            // Phase 2 tools (generate_data_extraction_code, execute_backend_code)
            {
                name: 'generate_data_extraction_code', // Phase 2 Tool
                description: 'Generates Node.js code suitable for a restricted sandbox environment to extract or analyze data from a specific dataset based on a goal. Use this BEFORE execute_backend_code.',
                args: {
                    dataset_id: 'string (The ID of the dataset to analyze)',
                    // columns_needed: 'string[] (Specific columns required for the analysis - optional but helpful)',
                    // filters: 'object (Key-value pairs for filtering data - optional)',
                    analysis_goal: 'string (Clear description of what the code should calculate or extract)'
                },
                output: '{ \"code\": \"<Node.js code string>\" }'
            },
            {
                name: 'execute_backend_code', // Phase 2 Tool
                description: 'Executes the provided Node.js code in a secure backend sandbox with access ONLY to the content of the specified dataset (as datasetContent variable) and a sendResult(data) function. Use this AFTER generate_data_extraction_code.',
                args: {
                    code: 'string (The Node.js code generated by generate_data_extraction_code)',
                    dataset_id: 'string (The ID of the dataset the code needs to access)'
                },
                output: '{ \"result\": <JSON output from sendResult(data)>, \"error\": \"<error message if execution failed>\" }'
            },
            // Phase 3 tool (generate_report_code)
            {
                name: 'generate_report_code', 
                description: 'Generates React component code (using React.createElement, NO JSX) for visualizing analysis results using provided data. Call this BEFORE _answerUserTool if a visual report is beneficial.',
                args: {
                    analysis_summary: 'string (A textual summary of the key findings from your analysis)',
                    data_json: 'object (The JSON data object returned by execute_backend_code containing the data needed for the report)'
                },
                output: '{ \"react_code\": \"<React component code string>\" }'
            },
            // Final answer tool
             {
                name: '_answerUserTool', 
                description: 'Provides the final textual answer to the user. If you generated report code with generate_report_code, call this AFTER that tool finishes, providing a concise text summary alongside the report.',
                args: { 
                    textResponse: 'string (The final, complete answer/summary for the user.)' 
                    // No need to pass react code here, agent manages it internally
                },
                output: 'Signals loop completion. The provided textResponse will be sent to the user.'
            }
        ];
    }

    /** Returns mapping of tool names to their implementation functions. */
    _getToolImplementations() {
        return {
            'list_datasets': this._listDatasetsTool,
            'get_dataset_schema': this._getDatasetSchemaTool,
            'generate_data_extraction_code': this._generateDataExtractionCodeTool,
            'execute_backend_code': this._executeBackendCodeTool,
            'generate_report_code': this._generateReportCodeTool, // Phase 3
            '_answerUserTool': this._answerUserTool,
            // Add future tool implementations here
        };
    }

    /** Summarizes tool results, especially large ones, for the LLM context. */
    _summarizeToolResult(result) {
        // Add more detail to error summaries
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
            // Add specific summary for report code generation
            if (result.result && typeof result.result.react_code === 'string') {
                return 'Successfully generated React report code.';
            }
            const resultString = JSON.stringify(result.result);
            const limit = 1000;
            if (resultString.length > limit) {
                if (result.result && typeof result.result.code === 'string') {
                    return 'Successfully generated data extraction code snippet.';
                }
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
            const updateData = {
                status: status,
                // Conditionally add fields only if they have a value
                ...(aiResponseText !== null && { aiResponseText: aiResponseText }),
                ...(errorMessage !== null && { errorMessage: errorMessage }),
                ...(aiGeneratedCode !== null && { aiGeneratedCode: aiGeneratedCode }), // Add generated code
                 agentSteps: this.turnContext.steps, // Store the steps taken
            };
            const updatedMessage = await PromptHistory.findByIdAndUpdate(this.aiMessagePlaceholderId, updateData, { new: true });
            if (updatedMessage) {
                 logger.info(`Updated PromptHistory ${this.aiMessagePlaceholderId} with status: ${status}`);
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

            const result = await toolFunction.call(this, args);
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

    /** Tool: Generate Data Extraction Code */ 
    async _generateDataExtractionCodeTool(args) {
        const { dataset_id, analysis_goal } = args;
        // Force a simpler goal for now to test parsing
        const simplifiedGoal = "Parse the datasetContent CSV string into an array of objects using manual string splitting. Return the headers and the first 5 data rows.";
        logger.info(`Executing tool: generate_data_extraction_code for dataset ${dataset_id} with simplified goal.`);
        // Original goal logged for reference, but not sent for code gen yet
        logger.debug(`Original analysis goal was: ${analysis_goal}`);

        if (!dataset_id || typeof dataset_id !== 'string') {
            return { error: 'Missing or invalid required argument: dataset_id (must be a string)' };
        }
        // Analysis goal is now fixed, no need to validate it as input arg for now
        // if (!analysis_goal || typeof analysis_goal !== 'string') {
        //     return { error: 'Missing or invalid required argument: analysis_goal (must be a string)' };
        // }

        try {
            const schemaData = await datasetService.getDatasetSchema(dataset_id, this.userId);
            if (!schemaData) {
                 return { error: `Dataset schema not found or access denied for ID: ${dataset_id}. Cannot generate code without schema.` };
            }

            // Call promptService with the *simplified* goal
            const generatedCodeResponse = await promptService.generateSandboxedCode({
                analysisGoal: simplifiedGoal, // Use the simplified goal
                datasetSchema: schemaData 
            });

            if (!generatedCodeResponse || !generatedCodeResponse.code) {
                 throw new Error('AI failed to generate valid code.');
            }

            // Store the generated code for potential later execution
            this.turnContext.intermediateResults.generatedParserCode = generatedCodeResponse.code;

            // Return the generated code string (even though we might not execute it directly yet)
            // The next step for the agent should be to execute this code.
            return { result: { code: generatedCodeResponse.code } }; 

        } catch (error) {
            logger.error(`_generateDataExtractionCodeTool failed for ${dataset_id}: ${error.message}`, { error });
            return { error: `Failed to generate data extraction code: ${error.message}` };
        }
    }

    /** Tool: Execute Backend Code */ 
    async _executeBackendCodeTool(args) {
        let { code, dataset_id } = args;
        logger.info(`Executing tool: execute_backend_code for dataset ${dataset_id}`);
        
        // If code wasn't explicitly passed, try using the parser code generated in the previous step
        if (!code && this.turnContext.intermediateResults.generatedParserCode) {
             logger.info('Using parser code generated in previous step.');
             code = this.turnContext.intermediateResults.generatedParserCode;
        } else if (!code) {
             return { error: 'Missing required argument: code (and no parser code found in context)' };
        }
        
        if (typeof code !== 'string' || code.trim() === '') {
             return { error: 'Invalid argument: code must be a non-empty string' };
        }
        if (!dataset_id || typeof dataset_id !== 'string') {
            return { error: 'Missing or invalid required argument: dataset_id (must be a string)' };
        }

        try {
            const executionResult = await codeExecutionService.executeSandboxedCode(
                code,
                dataset_id,
                this.userId
            );
            return executionResult;
        } catch (error) {
            logger.error(`_executeBackendCodeTool failed unexpectedly for ${dataset_id}: ${error.message}`, { error });
            return { error: `Unexpected error during code execution: ${error.message}` };
        }
    }

    /** Tool: Generate React Report Code */ // NEW PHASE 3 TOOL
    async _generateReportCodeTool(args) {
        const { analysis_summary, data_json } = args;
        logger.info(`Executing tool: generate_report_code`);
        if (!analysis_summary || typeof analysis_summary !== 'string') {
            return { error: 'Missing or invalid required argument: analysis_summary (must be a string)' };
        }
         // data_json could be null/empty if code execution failed or produced no result, handle gracefully
        if (typeof data_json !== 'object') { // Allow null or object
            logger.warn('_generateReportCodeTool called with invalid data_json type.', { type: typeof data_json});
            // Proceed but LLM might struggle without data
        }

        try {
            // Call a new function in promptService to generate the React code
            const generatedCodeResponse = await promptService.generateReportCode({
                analysisSummary: analysis_summary,
                dataJson: data_json || {} // Pass empty object if data is null/undefined
            });

            if (!generatedCodeResponse || !generatedCodeResponse.react_code) {
                 throw new Error('AI failed to generate valid React report code.');
            }

            // Return the generated code string
            return { result: { react_code: generatedCodeResponse.react_code } };

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
            // This validation is technically redundant due to parsing logic, but good practice
            return { error: 'Missing or empty required argument: textResponse for _answerUserTool' };
        }
        return { result: { message: 'Answer signal processed.'} };
    }
}

module.exports = { AgentOrchestrator }; 