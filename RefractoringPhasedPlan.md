Okay, here is an **insanely detailed, phased refactoring plan** for the NeuroLedger backend's chat, prompting, and AI agent functionalities. The goal is maximum clarity and safety, allowing developers to follow steps precisely and test thoroughly at each stage.

**Underlying Principles:**

*   **Incremental Changes:** Each phase makes specific, contained changes.
*   **Testability:** Each phase concludes with clear testing steps.
*   **Preserve Functionality:** Aim to maintain existing external behavior at each step (unless explicitly changing it).
*   **Extreme Specificity:** Explicit file paths, function names, and code structure changes are outlined.

---

## Phase 1: Abstract LLM Providers in `prompt.service.js` ✅ COMPLETED

**Goal:** Remove provider-specific `if/else` logic from `prompt.service.js` functions by introducing an Adapter pattern for LLM interactions. Make `prompt.service.js` depend on a unified interface.

1.  **Files to Create:**
    *   `backend/src/shared/llm_providers/` (New Directory)
    *   `backend/src/shared/llm_providers/BaseLLMProvider.js`:
        *   **Content:** Define a base class (or constructor function prototype) outlining the common interface.
            ```javascript
            // Conceptual structure
            class BaseLLMProvider {
                constructor(apiKey, config = {}) { /* store config */ }
                isAvailable() { throw new Error("Not implemented"); }
                // Unified method signature for non-streaming
                async generateContent(options) { throw new Error("Not implemented"); }
                // Unified method signature for streaming
                async streamContent(options) { throw new Error("Not implemented"); }
                // Helper for mapping messages (can be overridden)
                _mapMessages(messages, systemPrompt) { /* default mapping logic */ }
            }
            module.exports = BaseLLMProvider;
            ```
    *   `backend/src/shared/llm_providers/ClaudeProvider.js`:
        *   **Content:** Implement `BaseLLMProvider`. Import `anthropic` client from `external_apis`. Implement `generateContent` and `streamContent` using `anthropic.messages.create`. Include logic to map messages if needed. Implement `isAvailable` check.
    *   `backend/src/shared/llm_providers/GeminiProvider.js`:
        *   **Content:** Implement `BaseLLMProvider`. Import `geminiClient`. Implement methods using `geminiClient.generateContent` and `geminiClient.streamGenerateContent`. Include logic from `prompt.service.js`'s `mapMessagesToGemini`. Implement `isAvailable`.
    *   `backend/src/shared/llm_providers/OpenAIProvider.js`:
        *   **Content:** Implement `BaseLLMProvider`. Import `openaiClient`. Implement methods using `openaiClient.createChatCompletion` and `openaiClient.streamChatCompletion`. Include logic from `prompt.service.js`'s `mapMessagesToOpenAI`. Implement `isAvailable`.
    *   `backend/src/shared/llm_providers/ProviderFactory.js`:
        *   **Content:** Create a factory function or class.
            ```javascript
            // Conceptual structure
            const ClaudeProvider = require('./ClaudeProvider');
            // ... other providers ...
            const config = require('../../shared/config'); // For API keys

            async function getProvider(userId) {
                // Fetch user preference (similar to old getUserModelPreference)
                const userPreference = /* ... fetch preference ... */ || 'claude';
                let ProviderClass;
                let apiKey;

                if (userPreference === 'gemini' && GeminiProvider.prototype.isAvailable()) { // Check availability
                    ProviderClass = GeminiProvider; apiKey = config.geminiApiKey;
                } else if (userPreference === 'openai' && OpenAIProvider.prototype.isAvailable()) {
                    ProviderClass = OpenAIProvider; apiKey = config.openaiApiKey;
                } else { // Default or fallback to Claude
                    if (!ClaudeProvider.prototype.isAvailable()) throw new Error("No LLM providers available!");
                    ProviderClass = ClaudeProvider; apiKey = config.claudeApiKey;
                }
                return new ProviderClass(apiKey, { /* any other config */ });
            }
            module.exports = { getProvider };
            ```
    *   `backend/src/shared/llm_providers/README.md`: Document the new structure.

2.  **Files to Modify:**
    *   `backend/src/features/chat/prompt.service.js`:
        *   **Remove Imports:** Delete direct imports of `anthropic`, `geminiClient`, `openaiClient`.
        *   **Remove Helper Functions:** Delete `getUserModelPreference`, `mapMessagesToOpenAI`, `mapMessagesToGemini`.
        *   **Import Factory:** Add `const { getProvider } = require('../../shared/llm_providers/ProviderFactory');`.
        *   **Refactor `getLLMReasoningResponse`:**
            *   Remove the initial `getUserModelPreference` call.
            *   Remove the `if/else if/else` block calling specific clients.
            *   **Add:** `const provider = await getProvider(userId);` near the beginning.
            *   **Modify:** Call `const apiResponse = await provider.generateContent(apiOptions);`.
            *   Ensure `apiOptions` contains standardized keys (`model` name might still be needed from factory, or handled inside provider).
            *   Keep the response parsing logic *after* the `provider.generateContent` call (as the providers should return a consistent format).
        *   **Refactor `generateAnalysisCode`:** Apply the same pattern as `getLLMReasoningResponse` (use factory, call `provider.generateContent`).
        *   **Refactor `generateReportCode`:** Apply the same pattern (use factory, call `provider.generateContent`).
        *   **Refactor `streamLLMReasoningResponse`:**
            *   Remove the initial `getUserModelPreference` call.
            *   Remove the `if/else if/else` block calling specific clients for streaming.
            *   **Add:** `const provider = await getProvider(userId);` near the beginning.
            *   **Modify:** Call `const stream = await provider.streamContent(apiOptions);`.
            *   **CRITICAL:** Adapt the `for await (const chunk of stream)` loop. The *structure* of `chunk` will now depend on what the standardized `streamContent` method yields (e.g., always yield an object like `{ type: 'token', content: '...' }` or `{ type: 'tool_call', name: '...', input: '...' }` or `{ type: 'finish', reason: '...' }`). The individual Provider classes are responsible for adapting the raw SDK stream chunks into this standardized format *before* yielding them. Update the `switch` statement inside the loop to handle these standardized event types.

3.  **Key Precautions:**
    *   **Interface Consistency:** Ensure `generateContent` and `streamContent` in all provider classes accept the *same* `options` structure (or handle minor variations internally) and return/yield data in a *standardized* format that `prompt.service.js` expects.
    *   **Message Mapping:** Ensure the message mapping logic (user/assistant/model roles, content structure) is correctly moved into *each* provider's `_mapMessages` or within its `generate/streamContent` methods.
    *   **API Keys:** Double-check API keys are correctly passed from `config` to the `ProviderFactory` and then to the provider constructors.
    *   **Model Names:** The `ProviderFactory` needs to select the appropriate *specific model name* (e.g., 'claude-3-7-sonnet-20250219', 'gemini-2.5-pro-preview-03-25', 'o3-mini-2025-01-31') for the chosen provider. This logic replaces the hardcoded model names in `prompt.service.js`.
    *   **Streaming Chunk Adaptation:** This is the trickiest part. The `streamContent` method in each provider *must* transform the native SDK stream chunks into a consistent format before yielding. For example:
        *   OpenAI delta -> `{ type: 'token', content: delta }`
        *   Gemini chunk.text() -> `{ type: 'token', content: text }`
        *   Claude text_delta -> `{ type: 'token', content: deltaText }`
        *   Claude tool_use -> `{ type: 'tool_call', name: ..., input: ... }` (Needs careful mapping)

4.  **Testing Strategy:**
    *   **Unit Tests:**
        *   Write tests for each `XProvider.js` class, mocking the underlying SDK client (`anthropic`, `geminiClient`, `openaiClient`). Verify `generateContent` and `streamContent` call the SDK correctly and return/yield the expected standardized format. Test message mapping. Test `isAvailable`.
        *   Write tests for `ProviderFactory.js`, mocking user preference fetching and provider constructors. Verify it returns the correct provider instance based on preference and availability.
    *   **Integration Tests:**
        *   Modify existing (or create new) integration tests for `prompt.service.js`. Mock the `ProviderFactory.getProvider` function to return *mocked* provider instances. Verify that the correct provider method (`generateContent` or `streamContent`) is called and that the `prompt.service` function correctly handles the standardized response/stream.
    *   **End-to-End (Manual):**
        *   Change your user's `preferredAiModel` setting in the database (or via UI/API if possible) to 'gemini', 'openai', and 'claude'.
        *   Trigger chat interactions (both standard and streaming if applicable).
        *   Verify that the correct LLM is being called (check backend logs for "[LLM Reasoning] Using X model..." messages).
        *   Verify that responses (text, reports, tool usage indicators) are still generated correctly regardless of the provider selected. Test edge cases (errors, empty responses).

---

## Phase 2: Refactor Tool Handling ✅ COMPLETED

**Goal:** Standardize tool execution logic, validation, and error handling, removing boilerplate from individual tool files.

1.  **Files to Create:**
    *   `backend/src/features/chat/tools/BaseToolWrapper.js` (or similar name like `createToolWrapper.js`):
        *   **Content:** A higher-order function or utility class.
            ```javascript
            // Conceptual HOF structure
            const { Types } = require('mongoose');
            const logger = require('../../../shared/utils/logger');

            function createToolWrapper(toolName, handlerFn) {
                return async (args, context) => {
                    const { userId, sessionId } = context;
                    logger.info(`[ToolWrapper:${toolName}] Called by User ${userId} in Session ${sessionId} with args:`, args);

                    // --- Standard Argument Validation (Example for dataset_id) ---
                    if (args && args.hasOwnProperty('dataset_id') && (!args.dataset_id || !Types.ObjectId.isValid(args.dataset_id))) {
                        const errorMsg = `Invalid or missing dataset_id argument for tool ${toolName}.`;
                        logger.warn(`[ToolWrapper:${toolName}] ${errorMsg}`);
                        return { status: 'error', error: errorMsg, args };
                    }
                    // Add other common validations here (e.g., required args check)

                    try {
                        const result = await handlerFn(args, context); // Execute the specific tool logic

                        // --- Standard Result Validation (Basic) ---
                        if (typeof result !== 'object' || !result.status) {
                             logger.error(`[ToolWrapper:${toolName}] Tool returned invalid result structure:`, result);
                             return { status: 'error', error: `Tool ${toolName} returned an invalid result.`, args };
                        }
                        logger.info(`[ToolWrapper:${toolName}] Execution successful. Status: ${result.status}`);
                        return { ...result, args }; // Ensure args are passed back

                    } catch (error) {
                        logger.error(`[ToolWrapper:${toolName}] Uncaught error during execution: ${error.message}`, { stack: error.stack, toolArgs: args });
                        return {
                            status: 'error',
                            error: `Tool execution failed unexpectedly: ${error.message}`,
                            args
                        };
                    }
                };
            }
            module.exports = { createToolWrapper };
            ```

2.  **Files to Modify:**
    *   **All individual tool files** (`backend/src/features/chat/tools/*.js` **EXCEPT** `tool.definitions.js` and `answer_user.js` which is very simple):
        *   **Import:** Add `const { createToolWrapper } = require('./BaseToolWrapper');` (adjust path).
        *   **Refactor:**
            *   Keep the core logic of the tool inside the main exported function (e.g., `async function parse_csv_data_logic(args, context) { ... }`).
            *   Remove the boilerplate `try...catch` block.
            *   Remove common argument validation (like `dataset_id` check) that is now handled by the wrapper.
            *   Ensure the core logic function returns the expected `{ status: 'success', result: ... }` or `{ status: 'error', error: ... }` object.
            *   **Modify Export:** Wrap the core logic function with the wrapper:
                ```javascript
                // Example for parse_csv_data.js
                const { createToolWrapper } = require('./BaseToolWrapper');
                // ... other imports like datasetService, Papa ...

                async function parse_csv_data_logic(args, context) {
                    const { dataset_id } = args; // Args already validated by wrapper (if configured)
                    const { userId } = context;
                    // --- Core logic starts here ---
                    try {
                         const rawContent = await datasetService.getRawDatasetContent(dataset_id, userId);
                         // ... rest of parsing logic ...
                         if (parseResult.errors.length > 0) {
                              return { status: 'error', error: `Failed to parse CSV: ${errorSummary}` };
                         }
                         return { status: 'success', result: { parsedData: parsedData, rowCount: rowCount } };
                    } catch (error) {
                         // Specific errors can still be caught and returned cleanly if needed
                         if (error.message.includes('not found')) {
                              return { status: 'error', error: error.message };
                         }
                         // Otherwise, re-throw for the wrapper to catch
                         throw error;
                    }
                     // --- Core logic ends here ---
                }

                // Export the wrapped function
                module.exports = createToolWrapper('parse_csv_data', parse_csv_data_logic);
                ```
    *   `backend/src/features/chat/agent.service.js`:
        *   **Modify Tool Loading:** The dynamic loading section should still work as it loads the *exported* function, which is now the *wrapped* function. No changes strictly needed here, but verify the `adjustedToolName` logic still correctly maps filenames to the names used in `createToolWrapper`.

3.  **Key Precautions:**
    *   **Wrapper Logic:** Ensure the `createToolWrapper` correctly handles different argument types and validation needs. Start with basic validation (like `dataset_id`) and add more common checks as needed.
    *   **Error Propagation:** Ensure that errors thrown within the original tool logic (`handlerFn`) are correctly caught and formatted by the wrapper. Decide if specific errors should still be handled within the tool logic for more specific error messages or if the wrapper should handle all unexpected errors.
    *   **Context/Args Passing:** Verify the `args` and `context` objects are correctly passed through the wrapper to the original tool logic. Make sure the final return includes the original `args` for the `AgentExecutor`.
    *   **Tool Naming:** The `toolName` passed to `createToolWrapper` *must* match the key expected by `AgentExecutor` and defined in `tool.definitions.js`.

4.  **Testing Strategy:**
    *   **Unit Tests:**
        *   Test the `createToolWrapper` function itself. Mock a `handlerFn` and verify the wrapper performs validation, calls the handler, catches errors, and formats results correctly.
        *   Update unit tests for individual tools. They should now test the `_logic` function directly (if you export it for testing) or test the wrapped function by mocking the wrapper's dependencies (like `datasetService`).
    *   **Integration Tests:**
        *   Focus on testing the interaction between `AgentExecutor._executeTool` and the *wrapped* tool functions. Mock the necessary context/callbacks (`getParsedDataCallback`). Verify that calling `_executeTool` results in the wrapped tool being executed and the correctly formatted `{ status, result/error, args }` object being returned.
    *   **End-to-End (Manual):**
        *   Test chat scenarios that involve various tools (listing datasets, parsing data, executing code, generating reports).
        *   Check backend logs for `[ToolWrapper:...]` messages to confirm the wrapper is active.
        *   Verify error handling is consistent (e.g., providing an invalid dataset ID should return the standardized error message from the wrapper).
        *   Ensure successful tool executions still proceed correctly.

---

## Phase 3: Decompose `AgentExecutor` Class

**Goal:** Break down the responsibilities of the monolithic `AgentExecutor` class into smaller, focused modules for state, tools, events, and core orchestration.

1.  **Files to Create:**
    *   `backend/src/features/chat/agent/` (New Directory for agent modules)
    *   `backend/src/features/chat/agent/AgentStateManager.js`:
        *   **Content:** Class to manage `turnContext`.
            ```javascript
            // Conceptual structure
            class AgentStateManager {
                constructor(initialState = {}) {
                    this.context = {
                        originalQuery: initialState.originalQuery || '',
                        steps: initialState.steps || [],
                        intermediateResults: { /* defaults */ ...initialState.intermediateResults },
                        // ... other fields from TurnContext ...
                        finalAnswer: initialState.finalAnswer || null,
                        error: initialState.error || null,
                        toolErrorCounts: initialState.toolErrorCounts || {},
                    };
                }
                setQuery(query) { this.context.originalQuery = query; }
                addStep(stepData) { this.context.steps.push(stepData); this.context.intermediateResults.fragments.push(/* create step fragment */) }
                updateLastErrorStep(resultSummary, error) { /* find last step, update */ }
                setFinalAnswer(answer) { this.context.finalAnswer = answer; this.context.intermediateResults.fragments.push(/* create text fragment */) }
                setError(errorMsg) { this.context.error = errorMsg; }
                getSteps() { return this.context.steps; }
                getIntermediateResult(key) { return this.context.intermediateResults[key]; }
                setIntermediateResult(key, value) { /* logic for specific keys like parsedData, analysisResult, generated code */ }
                getContextForLLM() { /* Prepare subset needed for LLM call */ }
                getContextForDB() { /* Prepare subset needed for saving */ }
                isFinished() { return !!this.context.finalAnswer || !!this.context.error; }
                // ... other getters/setters/helpers ...
            }
            module.exports = AgentStateManager;
            ```
    *   `backend/src/features/chat/agent/ToolExecutor.js`:
        *   **Content:** Class or module responsible for executing tools.
            ```javascript
            // Conceptual structure
            const toolImplementations = require('../tools').implementations; // Assume tools index exports implementations map

            class ToolExecutor {
                constructor(toolDefinitions) { // Pass definitions for validation?
                    this.tools = toolImplementations;
                    this.knownToolNames = Object.keys(this.tools);
                }
                async execute(toolName, args, executionContext) {
                    if (!this.knownToolNames.includes(toolName)) { /* return error */ }
                    const toolFn = this.tools[toolName];
                    // executionContext contains userId, sessionId, callbacks like getParsedData
                    return await toolFn(args, executionContext); // Assumes tools are now wrapped
                }
                getKnownToolNames() { return this.knownToolNames; }
            }
            module.exports = ToolExecutor;
            ```
    *   `backend/src/features/chat/agent/LLMOrchestrator.js`:
        *   **Content:** Module focused on LLM interaction.
            ```javascript
            // Conceptual structure
            const { streamLLMReasoningResponse } = require('../prompt.service'); // Use only the streaming one

            async function getNextActionFromLLM(llmContext, streamCallback) {
                // 1. Call streamLLMReasoningResponse
                const fullResponse = await streamLLMReasoningResponse(llmContext, streamCallback);
                // 2. Parse the *full* response (adapt _parseCompleteLLMResponse logic here)
                const parseResult = /* ... parse fullResponse using logic from _parseCompleteLLMResponse ... */ ;
                return parseResult; // Returns { tool, args, isFinalAnswer, textResponse }
            }
            module.exports = { getNextActionFromLLM };
            ```
    *   `backend/src/features/chat/agent/AgentEventEmitter.js`:
        *   **Content:** Class to handle event emission.
            ```javascript
            // Conceptual structure
            class AgentEventEmitter {
                constructor(sendEventCallback, contextInfo) { // contextInfo = { userId, sessionId, messageId }
                    this.sendEventCallback = sendEventCallback;
                    this.contextInfo = contextInfo;
                }
                 // Example methods
                emitThinking() { this._emit('agent:thinking', {}); }
                emitUsingTool(toolName, args) { this._emit('agent:using_tool', { toolName, args }); }
                emitToolResult(toolName, summary, error) { this._emit('agent:tool_result', { toolName, resultSummary: summary, error }); }
                emitFinalAnswer(text, code, analysisData) { this._emit('agent:final_answer', { text, aiGeneratedCode: code, analysisResult: analysisData }); }
                emitAgentError(errorMsg) { this._emit('agent:error', { error: errorMsg }); }
                emitStreamToken(token) { this._emit('token', { content: token }); } // Pass through from LLM stream callback

                _emit(eventName, payload) {
                     if (typeof this.sendEventCallback !== 'function') return;
                     const fullPayload = { ...this.contextInfo, ...payload };
                     try {
                         this.sendEventCallback(eventName, fullPayload);
                     } catch (e) { logger.error('EventEmitter callback failed', e); }
                 }
            }
            module.exports = AgentEventEmitter;
            ```
    *   `backend/src/features/chat/agent/AgentRunner.js` (Replaces `AgentExecutor` logic):
        *   **Content:** The main orchestrator class using the other modules.
            ```javascript
            // Conceptual structure
            const AgentStateManager = require('./AgentStateManager');
            const ToolExecutor = require('./ToolExecutor');
            const { getNextActionFromLLM } = require('./LLMOrchestrator');
            const AgentEventEmitter = require('./AgentEventEmitter');
            const AgentContextService = require('../agentContext.service'); // From parent dir
            const PromptHistory = require('../prompt.model');

            class AgentRunner {
                 constructor(userId, teamId, sessionId, aiMessageId, sendEventCallback, initialContext = {}) {
                     this.stateManager = new AgentStateManager(initialContext);
                     this.toolExecutor = new ToolExecutor(/* tool definitions? */);
                     this.eventEmitter = new AgentEventEmitter(sendEventCallback, { userId, sessionId, messageId: aiMessageId });
                     this.contextService = new AgentContextService(userId, teamId, sessionId);
                     this.aiMessageId = aiMessageId; // Keep for DB update
                      // Store MAX_ITERATIONS etc. here or pass in config
                 }

                 async run(userMessage, sessionDatasetIds) {
                      this.stateManager.setQuery(userMessage);
                      this.eventEmitter.emitThinking();

                      try {
                          // Prepare initial context (history, datasets etc.) using contextService
                          // Update stateManager with prepared context

                          let iterations = 0;
                          while (iterations < MAX_AGENT_ITERATIONS && !this.stateManager.isFinished()) {
                              iterations++;
                              const llmContext = this.stateManager.getContextForLLM(); // Get context for LLM

                              // --- LLM Call via Orchestrator ---
                              // Pass emitter methods directly for stream handling
                              const llmAction = await getNextActionFromLLM(llmContext, (type, data) => {
                                   // Handle stream events from LLM (token, tool_call, finish etc.)
                                   if (type === 'token') this.eventEmitter.emitStreamToken(data.content);
                                   // if (type === 'tool_call') { /* maybe pre-emit using_tool? */ }
                                   // if (type === 'error') throw new Error(data.message);
                               });

                              if (llmAction.isFinalAnswer) {
                                  this.stateManager.setFinalAnswer(llmAction.textResponse);
                                  this.stateManager.addStep({ tool: '_answerUserTool', args: llmAction.args, resultSummary: 'Final answer.', attempt: 1 });
                                  this.eventEmitter.emitFinalAnswer(/* pass data from state */);
                                  break; // Exit loop
                              }

                              // --- Tool Execution via Executor ---
                              const toolName = llmAction.tool;
                              const toolArgs = llmAction.args;
                              this.eventEmitter.emitUsingTool(toolName, toolArgs);
                              this.stateManager.addStep({ tool: toolName, args: toolArgs, resultSummary: 'Executing...', attempt: 1 }); // Add step *before* execution

                              const executionContext = { userId: this.userId, sessionId: this.sessionId, /* pass getParsedData callback */ };
                              const toolResult = await this.toolExecutor.execute(toolName, toolArgs, executionContext);
                              const resultSummary = summarizeToolResult(toolResult); // Use util

                              // TODO: Add retry logic here (similar to old executor)
                               this.stateManager.updateLastErrorStep(resultSummary, toolResult.error); // Update the step added above
                               this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error);

                              if (toolResult.status === 'success') {
                                  this.stateManager.setIntermediateResult(toolName, toolResult.result, toolArgs); // Store successful result
                              } else {
                                   // Handle critical errors?
                                   if (toolName === 'execute_analysis_code') throw new Error(`Tool Error: ${toolResult.error}`);
                              }
                          } // End while loop

                          // Handle max iterations, update DB, return final status
                          await this._finalizeRun();
                          return this.stateManager.getFinalStatusObject();

                      } catch (error) {
                          this.stateManager.setError(error.message);
                          this.eventEmitter.emitAgentError(error.message);
                          await this._finalizeRun(); // Still try to save state
                           return this.stateManager.getFinalStatusObject();
                      }
                 }

                 async _finalizeRun() {
                    // Update PromptHistory using data from this.stateManager.getContextForDB()
                    const dbData = this.stateManager.getContextForDB();
                     await PromptHistory.findByIdAndUpdate(this.aiMessageId, { $set: dbData });
                 }
            }
            module.exports = AgentRunner;
            ```

4.  **Files to Modify:**
    *   `backend/src/features/chat/agent.service.js`:
        *   **Remove:** Delete the entire `AgentExecutor` class.
        *   **Modify `runAgent` function:**
            *   Import `AgentRunner` from `./agent/AgentRunner.js`.
            *   Instantiate `AgentRunner` instead of `AgentExecutor`: `const runner = new AgentRunner(userId, teamId, sessionId, aiMessageId, sendEventCallback, { /* pass initial previous data */ });`.
            *   Call `return await runner.run(userMessage, sessionDatasetIds);`.
        *   **Remove:** Delete dynamic tool loading logic (now conceptually inside `ToolExecutor` or loaded via require cache).
    *   `backend/src/features/chat/agent.utils.js`:
        *   **Modify `parseLLMResponse`:** This function's core logic should be moved into the new `LLMOrchestrator.getNextActionFromLLM`. The utility file might only keep `summarizeToolResult` and `formatToolResultForLLM`.
        *   **Modify `formatToolResultForLLM`:** Ensure it uses the `result` and `error` potentially stored on the step object (passed from `AgentStateManager`) rather than directly from tool output, depending on how state flow is implemented.
    *   `backend/src/features/chat/chat.taskHandler.js`:
        *   **Modify `workerHandler`:**
            *   Remove instantiation of `AgentOrchestrator`.
            *   Call the exported `runAgent` function from `agent.service.js` directly, passing the required parameters object: `const agentResult = await runAgent({ userId, teamId: chatSession.teamId, ... });`.
            *   Keep the logic that handles the `agentResult` (updating session, emitting final WebSocket events - although this emission might move in Phase 5).

5.  **Key Precautions:**
    *   **Data Flow:** Carefully trace how data (user query, history, dataset context, tool results, analysis results, generated code) flows between the new modules (`ContextService` -> `StateManager` -> `LLMOrchestrator` -> `ToolExecutor` -> `StateManager` -> `EventEmitter` / DB).
    *   **State Consistency:** Ensure the `AgentStateManager` is the single source of truth for the turn's state and that all modules read from and write to it correctly via its methods.
    *   **Callback Handling:** Ensure callbacks (`sendEventCallback`, `getParsedDataCallback`) are correctly passed and bound (`.bind(this)`) if necessary when passed as arguments.
    *   **Interface Mismatches:** Double-check the expected inputs and outputs of each new module's methods.
    *   **Circular Dependencies:** Be mindful of potential circular dependencies between the new agent modules. Structure imports carefully.

6.  **Testing Strategy:**
    *   **Unit Tests:**
        *   Test `AgentStateManager`: Verify state updates, context preparation methods (`getContextForLLM`, `getContextForDB`), and getters work correctly.
        *   Test `ToolExecutor`: Mock `toolImplementations`, verify `execute` calls the correct tool with correct args/context and handles unknown tools.
        *   Test `LLMOrchestrator`: Mock `streamLLMReasoningResponse` and the parsing logic. Verify it calls the stream correctly and parses the full response accurately.
        *   Test `AgentEventEmitter`: Mock `sendEventCallback`, verify `emitX` methods call the callback with the correct event name and payload structure.
        *   Test `AgentRunner`: This is now an integration test for the modules. Mock `contextService`, `promptService` (via `LLMOrchestrator`), `toolImplementations` (via `ToolExecutor`), and `PromptHistory.findByIdAndUpdate`. Simulate different scenarios (simple answer, tool use, tool error, report generation) and verify the correct sequence of calls, state updates, and event emissions.
    *   **Integration Tests:**
        *   Update existing integration tests for the `/internal/chat-ai-worker` endpoint. Ensure they still pass, verifying the overall outcome (DB updated, final WebSocket event emitted) is correct, even though the internal implementation has changed.
    *   **End-to-End (Manual):**
        *   Rigorously test all chat scenarios again: simple text, data analysis, report generation, multi-turn conversations, conversations involving previous analysis/reports, error conditions (invalid dataset ID, code execution failure).
        *   Monitor backend logs closely for errors or unexpected behavior in the new modules.
        *   Monitor frontend UI for correct streaming behavior, status updates, and final results.

---

## Phase 4: Refine System Prompt Generation

**Goal:** Improve the maintainability and readability of the dynamic system prompt generation.

1.  **Files to Create:**
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js` (Optional, but recommended):
        *   **Content:** Class or set of functions to build the prompt string section by section.
            ```javascript
            // Conceptual Structure
            const { toolDefinitions } = require('../tools/tool.definitions'); // Get definitions

            class SystemPromptBuilder {
                build(context) { // context = data from AgentStateManager
                    const parts = [
                        this._buildIntroduction(),
                        this._buildToolWarning(),
                        this._buildCurrentProgress(context.steps),
                        this._buildPreviousArtifacts(context.intermediateResults),
                        this._buildAnalysisResult(context.intermediateResults.analysisResult),
                        this._buildUserTeamContext(context.userContext, context.teamContext),
                        this._buildDatasetInfo(context.intermediateResults.datasetSchemas, context.intermediateResults.datasetSamples),
                        this._buildToolDefinitions(toolDefinitions), // Pass definitions
                        this._buildInstructions(),
                        this._buildWorkflowGuidance(),
                        this._buildModificationHandling(),
                        this._buildErrorHandling(),
                        this._buildFinalInstruction()
                    ];
                    return parts.filter(Boolean).join('\n\n'); // Join non-empty sections
                }

                _buildIntroduction() { /* return intro string */ }
                _buildToolWarning() { /* return critical ID warning string */ }
                _buildCurrentProgress(steps) { /* format steps */ }
                _buildPreviousArtifacts(results) { /* format previous artifacts */ }
                _buildAnalysisResult(analysisResult) { /* format current analysis result */ }
                _buildUserTeamContext(userCtx, teamCtx) { /* format user/team context */ }
                _buildDatasetInfo(schemas, samples) { /* format dataset schemas/samples */ }
                _buildToolDefinitions(tools) { /* format tool definitions */ }
                _buildInstructions() { /* return instructions string */ }
                // ... other private helper methods for sections ...
            }
            module.exports = SystemPromptBuilder;
            ```

2.  **Files to Modify:**
    *   `backend/src/features/chat/system-prompt-template.js`:
        *   **Remove:** Delete the existing large `generateAgentSystemPrompt` function.
        *   **Export:** Could potentially export helper functions used by the new `SystemPromptBuilder` if needed, or just be removed/archived.
    *   `backend/src/features/chat/agent/LLMOrchestrator.js` (or wherever prompt generation now occurs, likely before calling `streamLLMReasoningResponse`):
        *   **Import:** `const SystemPromptBuilder = require('./SystemPromptBuilder');` (if created).
        *   **Modify:** Instead of calling the old generator, instantiate and use the builder:
            ```javascript
            const builder = new SystemPromptBuilder();
            const systemPrompt = builder.build(llmContext); // Pass context needed by builder methods
            // ... use systemPrompt in API call ...
            ```
    *   `backend/src/features/chat/prompt.service.js`:
        *   **Modify `generateAnalysisCodePrompt`:** Consider applying the builder pattern here too if this prompt becomes complex, or keep as is if simple.

3.  **Key Precautions:**
    *   **Content Equivalence:** Ensure the prompt generated by the new builder is *identical* in content and structure to the one generated by the old function to avoid impacting LLM behavior. Copy/paste sections carefully.
    *   **Context Passing:** Make sure the `build` method of the builder receives all necessary context data from the `AgentStateManager` to generate dynamic sections correctly.

4.  **Testing Strategy:**
    *   **Unit Tests:**
        *   Test the `SystemPromptBuilder` class/functions thoroughly. Provide mock context data and assert that the generated prompt string matches the expected output exactly (use snapshot testing or string comparison). Test each section-building method individually.
    *   **Integration Tests:**
        *   Focus on the point where the prompt is generated (e.g., in `LLMOrchestrator` or `AgentRunner`). Verify the builder is called correctly and the generated prompt is passed to the (mocked) `streamLLMReasoningResponse` function.
    *   **End-to-End (Manual):**
        *   Perform the same chat tests as before. While the *content* should be the same, subtle formatting changes could theoretically affect the LLM. Monitor for any unexpected changes in agent behavior (e.g., incorrect tool usage, different response style). Check logs to ensure the prompt is being generated without errors.

---

## Phase 5: Standardize Event Emission & Frontend Alignment

**Goal:** Unify real-time event handling, likely prioritizing SSE, and ensure the frontend (`ChatContext.jsx`, `MessageBubble.jsx`) correctly consumes the standardized events.

1.  **Files to Modify:**
    *   `backend/src/features/chat/agent/AgentEventEmitter.js`:
        *   **Modify Constructor:** Accept both `sendEventCallback` (for SSE stream) and potentially `io` instance / `emitToUser` function reference.
        *   **Modify `_emit` method:**
            *   Prioritize sending via `sendEventCallback` (SSE) if it's available and the stream is active.
            *   Potentially send via WebSocket (`emitToUser`) as a fallback *only* for specific critical events (like final completion/error) if the request wasn't streaming, OR remove WebSocket emission entirely for agent status updates if SSE is always used for streaming requests. **Decision:** Let's simplify and make SSE the *only* channel for detailed agent progress if a stream request is made. Non-streaming requests will rely on the final `chat:message:completed/error` WebSocket events emitted by the *task handler* after the agent finishes.
            *   Remove redundant logging if the logger is configured with context.
    *   `backend/src/features/chat/chat.taskHandler.js`:
        *   **Remove:** Delete any direct `io.to(...).emit('agent:...')` calls. The final `'chat:message:completed'` and `'chat:message:error'` emissions *remain* here, as they signal the *overall* task completion status after the agent runner finishes (for non-streaming requests or final confirmation).
    *   `backend/src/features/chat/chat.service.js`:
        *   **Modify `handleStreamingChatRequest`:** Ensure the `sendEventCallback` passed to `runAgent` correctly maps to `sendStreamEvent(responseStream, ...)`.
        *   **Remove `sendStreamEvent` helper?** If `AgentEventEmitter` handles all SSE emissions via the callback, this helper might become redundant in `chat.service`.
    *   `frontend/src/features/dashboard/context/ChatContext.jsx`:
        *   **Refactor Event Handling:** Review the `useEffect` block that sets up listeners.
        *   **Prioritize SSE:** Ensure the `eventHandlers` passed to `streamChatMessage` in `sendStreamingMessage` handle all the detailed agent status updates (`onThinking`, `onUsingTool`, `onAgentToolResult`, `onToken`, `onAgentFinalAnswer`, `onError`, `onEnd`). Update `messages` state based *only* on these SSE events during streaming.
        *   **Simplify WebSocket:** The WebSocket listeners (`'chat:message:completed'`, `'chat:message:error'`) should now primarily act as final confirmation for non-streaming requests or as a fallback mechanism. They should update the message's *final* status and content. They should *not* be managing the intermediate `agentMessageStatuses` state.
        *   **Remove `agentMessageStatuses` state:** This state becomes largely redundant if the `messages` array itself reflects the detailed status based on SSE events (e.g., `message.status`, `message.toolName`, `message.fragments`, `message.isStreaming`).
    *   `frontend/src/features/dashboard/components/MessageBubble.jsx`:
        *   **Modify Rendering Logic:** Base the display (spinner, tool status, text, fragments, report button) *directly* on the properties of the `message` object received from `ChatContext` (e.g., `message.status`, `message.toolName`, `message.fragments`, `message.aiGeneratedCode`, `message.isStreaming`). Remove dependencies on the separate `agentMessageStatuses` context state.

2.  **Key Precautions:**
    *   **SSE vs. WebSocket:** Clearly define which events go over which channel. Recommendation: All detailed progress -> SSE; Final confirmation/non-streaming updates -> WebSocket.
    *   **Frontend State:** Ensure the frontend `messages` state correctly reflects the updates coming from SSE (appending tokens, updating status, adding fragments/steps). Avoid race conditions between SSE updates and potential WebSocket final updates.
    *   **Stream Closure:** Ensure the SSE stream is reliably closed via the `end` event from the backend.

3.  **Testing Strategy:**
    *   **Backend:**
        *   Integration test the streaming endpoint (`/chats/:sessionId/stream`). Use an SSE client to connect and verify that the correct sequence of events (`start`, `user_message_created`, `ai_message_created`, `token`, `agent:*`, `end`) is received for different scenarios (text answer, tool use, report gen, error).
        *   Verify WebSocket events (`chat:message:completed/error`) are still emitted correctly by the task handler *after* the agent finishes for both streaming and non-streaming requests (if non-streaming path exists).
    *   **Frontend:**
        *   Manually test streaming chat extensively. Watch the UI update incrementally. Check the browser console for SSE messages and potential errors. Verify tool usage indicators appear and disappear correctly. Ensure the final message state is accurate.
        *   Test non-streaming chat path (if applicable) to ensure final WebSocket updates work.
        *   Test error scenarios during streaming – does the UI correctly display the error from the SSE `error` or `agent:error` event?
        *   Ensure no reliance on the old `agentMessageStatuses` state remains.

---

## Phase 6: Final Cleanup & Review

**Goal:** Address any remaining minor issues, remove dead code, add documentation, and perform a final code review.

1.  **Code Cleanup:**
    *   **Action:** Remove any remaining commented-out code blocks related to the refactoring.
    *   **Action:** Remove any unused imports or variables flagged by linters (run `npm run lint -- --fix` if configured).
    *   **Action:** Search for any remaining TODO comments related to the refactoring and address them.
    *   **Action:** Ensure consistent logging levels and messages across the refactored modules.

2.  **Documentation:**
    *   **Action:** Update `README.md` files within the affected directories (`/chat`, `/chat/agent`, `/chat/tools`, `/shared/llm_providers`) to reflect the new architecture and components.
    *   **Action:** Add JSDoc comments to new classes and complex functions explaining their purpose, parameters, and return values.
    *   **Action:** Update the main `ARCHITECTURE.md` file with the new structure, especially the backend diagram for the chat feature.

3.  **Performance Review:**
    *   **Action:** Monitor API response times and resource usage (CPU, memory) for the chat feature under load (if possible). Check for any obvious bottlenecks introduced during refactoring.
    *   **Action:** Review database queries added or modified. Ensure appropriate indexes exist for `ChatSession` and `PromptHistory` collections, especially on `chatSessionId` and `createdAt`.

4.  **Code Review:**
    *   **Action:** Have another developer review the refactored code, focusing on clarity, adherence to principles (SRP, DRY), consistency, and potential missed edge cases.

5.  **Testing Strategy:**
    *   **Regression Testing:** Re-run all manual end-to-end test scenarios identified in Phase 0.
    *   **Automated Tests:** Ensure all existing and newly added unit/integration tests pass. Aim for good test coverage of the new modules.

---

**Final Important Considerations:**

*   **Security:** This plan focuses on structure and complexity. The **critical task** of replacing the backend `vm` module with a secure sandbox (Phase 4 in `AI-Improvement-Plan.md`) is **separate** but **essential** before production deployment.
*   **Rollback:** If a phase introduces significant issues that cannot be quickly resolved, use the Git branch and backup created in Phase 0 to revert to the previous stable state.
*   **Communication:** Keep the team informed about the progress and potential impacts of each phase.

This detailed plan provides a structured approach to refactoring the complex chat/agent system. By following these steps carefully and testing thoroughly at each phase, you should be able to significantly improve the codebase's quality and maintainability. Good luck!