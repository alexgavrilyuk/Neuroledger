Okay, this is a detailed, phased plan to enhance the NeuroLedger AI agent functionality based on your requirements. It adheres strictly to your constraints (no robust sandboxing beyond `vm`, no vector DBs, no external API tools, user selects datasets, no model tiering, no caching) while incorporating the other suggested improvements.

**Core Principles for this Plan:**

*   **Specificity:** Instructions target exact files, functions, and code structures.
*   **Isolation:** Each phase introduces a distinct, testable piece of functionality.
*   **Testability:** Clear instructions on how to verify the success of each phase before proceeding.
*   **Consistency:** Uses consistent terminology and assumes a new developer might pick up each phase.
*   **Incremental Value:** Each phase aims to provide a tangible improvement or foundation.

**Preamble:**

This plan outlines the enhancement of the AI agent within the `backend/src/features/chat/` directory. It assumes the existing agent structure (`AgentRunner`, `AgentStateManager`, `ToolExecutor`, `LLMOrchestrator`, `SystemPromptBuilder`, `AgentContextService`, modular tools) is in place as described in the previous documentation. The user remains responsible for selecting the datasets available to the chat session upfront; the agent will operate only on the context provided from those user-selected datasets. All code execution remains within the Node.js `vm` module sandbox.

---

**Phase 1: System Prompt Enhancements & Basic Chain-of-Thought (CoT) Output**

*   **Objective:** Improve the LLM's foundational instructions for better reasoning and task understanding, and make it output its thinking process.
*   **Why:** Clearer instructions lead to more reliable tool usage and better alignment with user intent. Explicit thinking helps debug agent behavior.
*   **Testing:**
    1.  Initiate several chat interactions with varying complexity (simple questions, requests requiring analysis, requests requiring report generation).
    2.  Inspect the backend logs: Verify the system prompt logged by `LLMOrchestrator` (or add logging if needed) contains the new sections (Goal Decomposition, Persona, Error Handling, Constraint Reinforcement).
    3.  Inspect the raw LLM response logged by `LLMOrchestrator` (or add logging). Verify it *starts* with a `<thinking>...</thinking>` block followed by either a tool call JSON or the final answer text. The content inside `<thinking>` should reflect a plausible thought process.
    4.  Verify existing functionality (basic chat, simple tool use like `list_datasets`) still works.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js`
    *   `backend/src/features/chat/agent/LLMOrchestrator.js`
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `SystemPromptBuilder.js`:**
        *   In the `build` method, reorganize and add new sections using private helper methods (similar to the existing structure).
        *   **Add `_buildGoalDecomposition()`:** Instruct the LLM: "Before acting, first break down the user's request into smaller, logical steps or sub-goals required to fulfill it. Outline this plan briefly."
        *   **Add/Enhance `_buildPersonaReinforcement()`:** Expand the "Expert Financial Analyst" persona. Detail its expected analytical rigor, tone (professional, insightful, helpful), and how it should explain results (e.g., quantify findings, state assumptions clearly).
        *   **Add `_buildErrorHandlingGuidance()`:** Provide *basic* guidance: "If a tool call results in an error, note the error in your reasoning. Do not immediately retry the same tool with the same arguments unless the error suggests a transient issue. Consider if a different tool or approach is needed, or if you should ask the user for clarification." (More advanced self-correction comes later).
        *   **Add/Enhance `_buildConstraintReinforcement()`:** Add a dedicated section strongly emphasizing the sandbox limitations (`vm` module, no `require`, no `fs`, must use `inputData`, must call `sendResult(resultObject)` exactly once for analysis code). Reiterate these constraints clearly.
        *   **Modify `_buildCoreInstructions()` or add a new section:** Explicitly instruct the LLM to structure its response:
            ```
            **Output Format:**
            Your response MUST start with your reasoning and plan enclosed in `<thinking>...</thinking>` tags.
            Immediately following the closing </thinking> tag, provide EITHER:
            1. A single JSON object for a tool call: ```json\n{\n  "tool": "<tool_name>",\n  "args": { ... }\n}\n```
            2. OR The final text answer directly to the user (if no more tools are needed). Use the _answerUserTool JSON format for this.
            ```
    2.  **Modify `LLMOrchestrator.js`:**
        *   In the `getNextActionFromLLM` function, *before* parsing the LLM response (`_parseCompleteLLMResponse`), add logging to capture the *raw, complete* response text received from `streamLLMReasoningResponse`.
            ```javascript
            // Inside getNextActionFromLLM, after awaiting streamLLMReasoningResponse
            const fullLLMResponseText = await streamLLMReasoningResponse(apiOptions, streamCallback);

            if (fullLLMResponseText === null) { /* ... existing error handling ... */ }

            // Log the RAW response BEFORE parsing
            logger.debug(`[LLM Orchestrator] Raw LLM Response Received:\n${fullLLMResponseText}`); // <-- ADD THIS LOG

            logger.debug(`[LLM Orchestrator] Stream finished. Full response length: ${fullLLMResponseText.length}. Parsing...`);
            const parseResult = _parseCompleteLLMResponse(fullLLMResponseText, knownToolNames);
            // ... rest of the function ...
            ```
        *   **Note:** We are *not* parsing the `<thinking>` block yet in this phase, just ensuring it's generated. The existing `_parseCompleteLLMResponse` will likely treat responses starting with `<thinking>` as final answers for now, which is acceptable for this phase's testing.

---

**Phase 2: Chain-of-Thought (CoT) Parsing & Refined Observation**

*   **Objective:** Parse the `<thinking>` block generated by the LLM and make the agent's "Observation" step more explicit in the prompt context.
*   **Why:** Allows using the LLM's reasoning for potential meta-analysis or future enhancements. Provides clearer context to the LLM about the *result* of its previous action.
*   **Testing:**
    1.  Initiate chat interactions requiring tool use.
    2.  Inspect backend logs:
        *   Verify `LLMOrchestrator` logs the extracted thinking process separately from the tool call/final answer.
        *   Verify `AgentRunner` logs show the "Observation" being formatted correctly using `formatToolResultForLLM`.
        *   Verify `SystemPromptBuilder` logs show the `currentTurnSteps` including the formatted `resultSummary` (observation) from the *previous* step being included in the context for the *next* LLM call.
    3.  Confirm the agent can still successfully call tools and provide answers. The agent's behavior might slightly change as it now explicitly sees the formatted observation.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/LLMOrchestrator.js`
    *   `backend/src/features/chat/agent/AgentRunner.js`
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js`
    *   `backend/src/features/chat/agent.utils.js` (Ensure `formatToolResultForLLM` is robust).
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `LLMOrchestrator.js` -> `_parseCompleteLLMResponse` function:**
        *   Update the parsing logic to first extract the content within `<thinking>...</thinking>` tags.
        *   Parse the *remaining* part of the response for the tool JSON or final answer text.
        *   Return an object containing `thinking`, `tool`, `args`, `isFinalAnswer`, `textResponse`.
        ```javascript
        function _parseCompleteLLMResponse(llmResponse, knownToolNames) {
            const thinkingRegex = /^<thinking>([\s\S]*?)<\/thinking>\s*/; // Capture thinking content
            let thinking = null;
            let remainingResponse = llmResponse?.trim() || '';

            const thinkingMatch = remainingResponse.match(thinkingRegex);
            if (thinkingMatch) {
                thinking = thinkingMatch[1].trim();
                remainingResponse = remainingResponse.substring(thinkingMatch[0].length).trim(); // Get text *after* thinking block
                logger.debug(`[LLM Orchestrator] Extracted Thinking: ${thinking.substring(0,100)}...`);
            } else {
                 logger.warn('[LLM Orchestrator] Could not find <thinking> block at the start of the response.');
                 // Proceed assuming the whole response is the action/answer, but log it.
                 remainingResponse = llmResponse?.trim() || '';
            }

            const defaultAnswer = { thinking, tool: '_answerUserTool', args: { textResponse: remainingResponse }, isFinalAnswer: true, textResponse: remainingResponse };

            if (!remainingResponse) {
                 logger.warn('[LLM Orchestrator] No content remaining after <thinking> block (or response was empty). Treating as final answer.');
                 return { ...defaultAnswer, args: { textResponse: thinking || 'AI processed the request but provided no further action or response.' }, textResponse: thinking || 'AI processed the request but provided no further action or response.' };
            }

            // --- Apply existing JSON parsing logic to 'remainingResponse' ---
            const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*?\})\s*```$|^(\{[\s\S]*?\})$/m;
            const jsonMatch = remainingResponse.match(jsonRegex);

            if (jsonMatch) {
                // ... (rest of the JSON parsing logic from Phase 1, operating on 'remainingResponse') ...
                // Make sure to return the extracted 'thinking' along with tool/args/isFinalAnswer
                // Example return for tool call:
                // return { thinking, tool: parsed.tool, args: parsed.args, isFinalAnswer: false, textResponse: null };
                 const potentialJson = jsonMatch[1] || jsonMatch[2];
                 if (potentialJson) {
                     let sanitizedJsonString = null;
                     try {
                         // Sanitization (keep from previous step if needed)
                         // ...
                         const parsed = JSON.parse(sanitizedJsonString || potentialJson);
                         if (parsed && typeof parsed.tool === 'string' && knownToolNames.includes(parsed.tool) && typeof parsed.args === 'object' && parsed.args !== null) {
                            if (parsed.tool === '_answerUserTool') {
                                const textResponse = parsed.args.textResponse;
                                if (typeof textResponse === 'string' && textResponse.trim() !== '') {
                                    return { thinking, tool: parsed.tool, args: parsed.args, isFinalAnswer: true, textResponse: textResponse.trim() };
                                } else {
                                     logger.warn('[LLM Orchestrator] _answerUserTool JSON missing textResponse, using raw remaining.');
                                     return { ...defaultAnswer, textResponse: remainingResponse, args: { textResponse: remainingResponse } }; // Return raw remaining as text
                                }
                            }
                            logger.debug(`[LLM Orchestrator] Parsed tool call: ${parsed.tool}`);
                            return { thinking, tool: parsed.tool, args: parsed.args, isFinalAnswer: false, textResponse: null };
                         } else { /* handle invalid JSON structure */ logger.warn('[LLM Orchestrator] Parsed JSON invalid structure.'); return { ...defaultAnswer, textResponse: remainingResponse, args: { textResponse: remainingResponse } }; }
                     } catch (e) { /* handle JSON parse error */ logger.error(`[LLM Orchestrator] JSON parse failed: ${e.message}`); return { ...defaultAnswer, textResponse: remainingResponse, args: { textResponse: remainingResponse } }; }
                 }
            }
            // If no JSON tool call found in remainingResponse, it's the final answer text
            logger.debug('[LLM Orchestrator] No JSON tool found after thinking block. Treating remaining as final answer.');
            return { ...defaultAnswer, textResponse: remainingResponse, args: { textResponse: remainingResponse } }; // Return remainingResponse as text
        }
        ```
    2.  **Modify `LLMOrchestrator.js` -> `getNextActionFromLLM`:**
        *   Ensure the `parseResult` now potentially contains the `thinking` field and pass it along if needed (though it's not directly used by `AgentRunner` yet). The return structure should now consistently include `thinking`.
            ```javascript
            // Example modification in getNextActionFromLLM
            const parseResult = _parseCompleteLLMResponse(fullLLMResponseText, knownToolNames);
            logger.info(`[LLM Orchestrator] Parsed LLM Action: Tool='${parseResult.tool}', IsFinal=${parseResult.isFinalAnswer}, Thinking=${!!parseResult.thinking}`);
            return parseResult; // Return the full object including thinking
            ```
    3.  **Modify `AgentRunner.js` -> `run` method loop:**
        *   After executing a tool (`this.toolExecutor.execute`) and getting `toolResult`:
        *   Format the observation using `formatToolResultForLLM` from `agent.utils.js`.
        *   Store this formatted observation string perhaps temporarily or log it clearly. This *formatted string* is what needs to go into the *next* LLM context.
            ```javascript
            // Inside AgentRunner loop, after tool execution and updating step summary
            const observation = formatToolResultForLLM(toolName, toolResult);
            logger.debug(`[AgentRunner ${this.sessionId}] Formatted Observation: ${observation}`);
            // Store this observation? AgentStateManager might need a way to hold the *last* observation string.
            // For now, we rely on SystemPromptBuilder accessing the *updated* steps.
            this.stateManager.updateLastStep(resultSummary, toolResult.error, toolResult.result); // Ensure the step has the final summary
            this.eventEmitter.emitToolResult(toolName, resultSummary, toolResult.error);

            // ... continue loop ...
            ```
    4.  **Modify `SystemPromptBuilder.js` -> `_buildCurrentProgress` method:**
        *   Ensure this method accurately reflects the *updated* `resultSummary` for each step, which now represents the "Observation" part of the loop. The existing code likely already does this if `AgentRunner` calls `updateLastStep` correctly.
        *   Reiterate the structure in the prompt: "Below are the actions taken *so far in this turn* and their results (Observations):"
    5.  **Review `agent.utils.js` -> `formatToolResultForLLM`:**
        *   Ensure this function produces a clear, concise, and accurate JSON string summary of the tool's outcome (success or error) suitable for the LLM to understand as the "Observation". Ensure it handles various result types (code snippets, analysis data summaries, errors) appropriately and truncates large outputs.

---

**Phase 3: Simple Planning & Explicit `_answerUserTool` Usage**

*   **Objective:** Make the agent's plan explicit in the `<thinking>` block and ensure it consistently uses the `_answerUserTool` JSON format for final answers.
*   **Why:** Improves predictability, allows potential plan adjustments later, and standardizes the final step.
*   **Testing:**
    1.  Run various chat interactions.
    2.  Inspect logs for the `<thinking>` block. Verify it includes a brief plan (e.g., "1. Parse data. 2. Generate code. 3. Execute code. 4. Answer user.").
    3.  Inspect the *final* raw LLM response when the agent decides to answer. Verify it's a JSON object: `{"tool": "_answerUserTool", "args": {"textResponse": "..."}}` potentially preceded by a final `<thinking>...</thinking>` block.
    4.  Verify the UI correctly displays the final answer extracted from `textResponse`.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js`
    *   `backend/src/features/chat/agent/LLMOrchestrator.js`
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `SystemPromptBuilder.js`:**
        *   In the `_buildGoalDecomposition` or a similar introductory section within `build`, add: "Your reasoning MUST include a numbered plan outlining the sequence of tools you intend to use."
        *   In the `_buildCoreInstructions` or tool definition section, specifically for `_answerUserTool`, emphasize: "To provide the final answer to the user, YOU MUST use the `_answerUserTool` tool. Output ONLY the JSON for this tool after your final `<thinking>` block."
    2.  **Modify `LLMOrchestrator.js` -> `_parseCompleteLLMResponse`:**
        *   The existing logic should already handle parsing the `_answerUserTool` JSON correctly (added in Phase 2 refinement). Double-check this part.
        *   Ensure the fallback logic (when no valid tool JSON is found after `<thinking>`) *still* correctly wraps the remaining text into the `_answerUserTool` structure.
            ```javascript
            // Inside _parseCompleteLLMResponse, the fallback case:
            if (!jsonMatch) { // If no JSON tool call is found after </thinking>
                logger.debug('[LLM Orchestrator] No JSON tool found after thinking block. Wrapping remaining text in _answerUserTool.');
                 // Ensure remainingResponse is not empty before assigning
                 const finalAnswerText = remainingResponse || (thinking ? thinking : "Processing complete."); // Use thinking or a default if remaining is empty
                 return { thinking, tool: '_answerUserTool', args: { textResponse: finalAnswerText }, isFinalAnswer: true, textResponse: finalAnswerText };
            }
            // ... other parsing logic ...
            ```

---

**Phase 4: Basic Self-Correction on Tool Error**

*   **Objective:** Enable the agent to attempt recovery after a tool fails by feeding the error back to the LLM.
*   **Why:** Increases robustness against temporary issues or slightly incorrect tool arguments generated by the LLM.
*   **Testing:**
    1.  Artificially induce a tool error (e.g., modify `parse_csv_data` to temporarily throw an error for a specific dataset ID, or provide an invalid dataset ID in a prompt).
    2.  Initiate a chat interaction that triggers the failing tool.
    3.  Inspect logs:
        *   Verify `AgentRunner` logs the tool failure and the formatted error observation.
        *   Verify the *next* system prompt sent to the LLM (via `SystemPromptBuilder` log) includes the error information in the `currentTurnSteps`.
        *   Verify the LLM's subsequent `<thinking>` block acknowledges the error.
        *   Verify the LLM attempts a *different* action (e.g., uses `_answerUserTool` to report the failure, or tries a *different* tool if applicable) rather than immediately retrying the *exact same* failed tool call.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js` (Minor refinement)
    *   `backend/src/features/chat/agent/AgentRunner.js` (Minor logic tweak, mostly relies on existing loop)
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `SystemPromptBuilder.js` -> `_buildErrorHandlingGuidance`:**
        *   Refine the instruction: "If the *last step* shows an 'Error:', your `<thinking>` block **must** acknowledge this error. Analyze the error message and the previous steps. Decide whether to: a) Use `_answerUserTool` to inform the user you cannot proceed due to the error, b) Try a *different* tool if appropriate, or c) Ask the user for clarification. **Do not** call the *same* failed tool again unless you have strong reason to believe the error was temporary and are changing the arguments significantly."
    2.  **Review `AgentRunner.js` -> `run` method loop:**
        *   The existing loop structure, where the formatted error (`Observation`) is included in the context for the next LLM call, already facilitates this. No major code changes are strictly *required* here for basic error feedback.
        *   **Ensure:** The `formatToolResultForLLM` function correctly formats error results into the observation string.
        *   **Ensure:** The `SystemPromptBuilder` correctly includes the steps (including the one with the error summary) in the context for the next LLM call. The LLM is now *instructed* to react to that error information.

---

**Phase 5: LLM-Based Chat History Summarization**

*   **Objective:** Prevent excessive token usage from long chat histories by summarizing older messages using an LLM call.
*   **Why:** Improves performance and reduces costs for long conversations while attempting to maintain context.
*   **Testing:**
    1.  Engage in a long chat conversation (exceeding `HISTORY_FETCH_LIMIT` + a buffer, e.g., > 15-20 turns).
    2.  Inspect logs from `AgentContextService.prepareChatHistoryAndArtifacts`. Verify it logs that summarization is being triggered.
    3.  Verify it logs the summarized history being used.
    4.  Inspect the system prompt context sent to the main reasoning LLM (`LLMOrchestrator` logs). Verify the `fullChatHistory` contains a summary message like `{ role: 'system', content: 'Previous conversation summary: ...' }` instead of many older individual messages.
    5.  Verify the agent's responses still seem contextually relevant based on the summarized history.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/AgentContextService.js`
    *   `backend/src/features/chat/prompt.service.js` (Add a new summarization function)
*   **New Files:** None
*   **Packages Required:** Maybe `tiktoken` (optional, for accurate token counting). If not installed: `npm install tiktoken`
*   **Detailed Steps:**
    1.  **Modify `prompt.service.js`:**
        *   Add a new async function `summarizeChatHistory(userId, messagesToSummarize)`.
        *   Inside this function:
            *   Use `getUserModelPreference` to potentially select a *cheaper/faster* model suitable for summarization (e.g., Claude Haiku, GPT-3.5-turbo, Gemini Flash - *even though main model tiering is excluded, using a fixed cheaper one here is okay*). Let's default to Claude Haiku for now if available, otherwise the user's preferred model.
            *   Construct a prompt like: "Summarize the key points, questions, answers, and decisions from the following conversation history between a User and an AI Financial Analyst. Focus on information relevant for continuing the analysis. Keep it concise." Pass `messagesToSummarize` as context.
            *   Call the selected provider's `generateContent` (non-streaming).
            *   Return the summarized text. Handle errors gracefully (return null or an error message).
        *   Export the new function.
    2.  **Modify `AgentContextService.js`:**
        *   In `prepareChatHistoryAndArtifacts`:
            *   Fetch the *full* history first, respecting `HISTORY_FETCH_LIMIT`.
            *   **Optional but Recommended:** Use `tiktoken` (or estimate) to count tokens in the fetched history.
            *   Define a `HISTORY_TOKEN_THRESHOLD` (e.g., 2000 tokens).
            *   If token count exceeds the threshold:
                *   Log that summarization is needed.
                *   Identify messages to summarize (e.g., all messages except the most recent `N` turns, perhaps 4-6).
                *   Call `promptService.summarizeChatHistory(this.userId, messagesToSummarize)`.
                *   If summarization succeeds:
                    *   Construct the new `fullChatHistory` array: Start with a system message ` { role: 'system', content: `Previous conversation summary: ${summaryText}` }`, followed by the most recent `N` turns that were *not* summarized.
                    *   Log the summarized history being used.
                *   If summarization fails:
                    *   Log the error. Fall back to simply truncating the history to the most recent `N` turns (e.g., `HISTORY_FETCH_LIMIT / 2`). Add a system message like `{ role: 'system', content: '(Previous history truncated due to length)' }`.
            *   If token count is below threshold, use the fetched history as is.
        *   Continue with artifact detection as before.
        *   Return the potentially summarized `fullChatHistory`.

---

**Phase 6: Tool Argument Validation (JSON Schema)**

*   **Objective:** Add robust validation for arguments passed to tools by the LLM using JSON Schema.
*   **Why:** Prevents errors caused by malformed or incorrect arguments from the LLM, making tool execution more reliable.
*   **Testing:**
    1.  In one of the simpler tools (e.g., `get_dataset_schema`), intentionally provide an invalid `dataset_id` argument in its definition within `tool.definitions.js` (e.g., make it expect a number instead of a string).
    2.  Trigger an agent interaction that *should* call this tool.
    3.  Inspect logs from `BaseToolWrapper`. Verify it logs a validation error *before* attempting to execute the tool's core logic.
    4.  Verify the agent receives an error status for the tool call and reacts appropriately (as defined in Phase 4/System Prompt).
    5.  Test with correct arguments to ensure validation passes.
*   **Files to Modify:**
    *   `backend/src/features/chat/tools/tool.definitions.js`
    *   `backend/src/features/chat/tools/BaseToolWrapper.js`
*   **New Files:** None
*   **Packages Required:** `ajv` (`npm install ajv`)
*   **Detailed Steps:**
    1.  **Install Ajv:** `npm install ajv`
    2.  **Modify `tool.definitions.js`:**
        *   For *each* tool definition, replace the simple `args: {}` object with a valid JSON Schema defining the expected arguments and their types.
            ```javascript
            // Example for get_dataset_schema
            {
                name: 'get_dataset_schema',
                description: '...',
                // --- REPLACE args: {} WITH argsSchema: ---
                argsSchema: { // Use a distinct key like argsSchema
                    type: 'object',
                    properties: {
                        dataset_id: {
                            type: 'string',
                            description: 'The MongoDB ObjectId (24 hex characters) of the dataset.',
                            pattern: '^[a-f\\d]{24}$' // Regex for MongoDB ObjectId
                        }
                    },
                    required: ['dataset_id']
                },
                output: '...'
            },
            // Example for generate_analysis_code
             {
                name: 'generate_analysis_code',
                description: '...',
                argsSchema: {
                    type: 'object',
                    properties: {
                        analysis_goal: {
                            type: 'string',
                            description: 'Detailed description of the analysis needed.',
                            minLength: 10 // Example: require a minimum length
                        },
                         dataset_id: {
                            type: 'string',
                            description: 'ID of the dataset being analyzed (for context).',
                            pattern: '^[a-f\\d]{24}$'
                        }
                    },
                    required: ['analysis_goal', 'dataset_id']
                },
                output: '...'
             },
             // Example for _answerUserTool
              {
                 name: '_answerUserTool',
                 description: '...',
                 argsSchema: {
                     type: 'object',
                     properties: {
                         textResponse: {
                             type: 'string',
                             description: 'The final textual response for the user.',
                             minLength: 1
                         }
                     },
                     required: ['textResponse']
                 },
                 output: '...'
              }
            // ... Add/Update argsSchema for ALL tools ...
            ```
    3.  **Modify `BaseToolWrapper.js`:**
        *   Import Ajv: `const Ajv = require("ajv");`
        *   Instantiate Ajv: `const ajv = new Ajv();`
        *   In the returned async wrapper function, *before* calling `handlerFn`:
            *   Find the corresponding tool definition from the imported `toolDefinitions` array based on `toolName`.
            *   If the definition has an `argsSchema`:
                *   Compile the schema: `const validate = ajv.compile(toolDefinition.argsSchema);`
                *   Validate the incoming `args`: `const valid = validate(args);`
                *   If `!valid`:
                    *   Log the validation errors: `logger.warn(\`[ToolWrapper:\${toolName}] Invalid arguments:\`, validate.errors);`
                    *   Format a user-friendly error message from `validate.errors`.
                    *   Return the standard error structure: `{ status: 'error', error: 'Invalid arguments provided for tool. Details: ' + formattedError, args };`
            *   If validation passes or no schema exists, proceed to call `handlerFn`.
            ```javascript
             // Inside createToolWrapper's returned async function
             const { userId, sessionId } = context;
             logger.info(`[ToolWrapper:${toolName}] Called by User ${userId}...`);

             // --- Argument Validation ---
             const toolDefinition = require('../tools/tool.definitions').toolDefinitions.find(t => t.name === toolName); // Re-require or pass definitions

             if (toolDefinition?.argsSchema) {
                 try {
                     const validate = ajv.compile(toolDefinition.argsSchema);
                     const valid = validate(args || {}); // Validate args or empty object if null/undefined
                     if (!valid) {
                         const errorMsg = `Invalid arguments for tool ${toolName}. Issues: ${ajv.errorsText(validate.errors)}`;
                         logger.warn(`[ToolWrapper:${toolName}] ${errorMsg}`);
                         return { status: 'error', error: errorMsg, args };
                     }
                     logger.debug(`[ToolWrapper:${toolName}] Arguments validated successfully.`);
                 } catch (schemaError) {
                      logger.error(`[ToolWrapper:${toolName}] Error compiling or using schema: ${schemaError.message}`);
                      // Potentially return error or proceed without validation if schema is broken
                      return { status: 'error', error: `Internal schema error for tool ${toolName}.`, args };
                 }
             } else if (toolName !== 'list_datasets') { // Assume list_datasets needs no args schema
                  logger.warn(`[ToolWrapper:${toolName}] No argsSchema defined in tool.definitions.js. Skipping validation.`);
             }

             // --- Execute Core Logic ---
             try {
                 const result = await handlerFn(args, context);
                 // ... (rest of existing success/error handling) ...
            ```

---

**Phase 7: Add New Internal Analysis Tool (`calculate_financial_ratios`)**

*   **Objective:** Expand agent capabilities with a new tool for common financial calculations.
*   **Why:** Provides direct value for financial analysis use cases without requiring complex code generation for simple ratios.
*   **Testing:**
    1.  Prepare a dataset suitable for calculating ratios (e.g., containing Revenue, COGS, Operating Expenses, Assets, Liabilities, Equity).
    2.  Start a chat session with this dataset selected.
    3.  Prompt the agent: "Calculate the Gross Profit Margin and Debt-to-Equity ratio for the selected data."
    4.  Inspect logs: Verify the agent's `<thinking>` block plans to use `calculate_financial_ratios`. Verify the tool call JSON is correct.
    5.  Verify `ToolExecutor` logs the successful execution of the new tool.
    6.  Verify the tool's calculation logic is correct by manually checking the result against the data.
    7.  Verify the agent correctly summarizes the result using `_answerUserTool`.
*   **Files to Modify:**
    *   `backend/src/features/chat/tools/tool.definitions.js`
*   **New Files:**
    *   `backend/src/features/chat/tools/calculate_financial_ratios.js`
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Define the Tool (`tool.definitions.js`):**
        *   Add a new entry to the `toolDefinitions` array:
            ```javascript
            {
                name: 'calculate_financial_ratios',
                description: 'Calculates common financial ratios (e.g., Gross Profit Margin, Net Profit Margin, Current Ratio, Debt-to-Equity) directly from parsed dataset data. Requires the dataset to be parsed first using parse_csv_data.',
                argsSchema: {
                    type: 'object',
                    properties: {
                        dataset_id: {
                            type: 'string',
                            description: 'The MongoDB ObjectId (24 hex characters) of the *parsed* dataset.',
                            pattern: '^[a-f\\d]{24}$'
                        },
                        ratios: {
                            type: 'array',
                            description: 'An array of strings specifying which ratios to calculate. Supported: "Gross Profit Margin", "Net Profit Margin", "Current Ratio", "Debt-to-Equity".',
                            items: {
                                type: 'string',
                                enum: ["Gross Profit Margin", "Net Profit Margin", "Current Ratio", "Debt-to-Equity"]
                            },
                            minItems: 1
                        },
                        // Add required column names as args for flexibility
                        revenue_column: { type: 'string', description: 'Exact column name for Total Revenue/Sales.' },
                        cogs_column: { type: 'string', description: 'Exact column name for Cost of Goods Sold.' },
                        net_income_column: { type: 'string', description: 'Exact column name for Net Income.' },
                        current_assets_column: { type: 'string', description: 'Exact column name for Current Assets.' },
                        current_liabilities_column: { type: 'string', description: 'Exact column name for Current Liabilities.' },
                        total_debt_column: { type: 'string', description: 'Exact column name for Total Debt (or Total Liabilities).'},
                        total_equity_column: { type: 'string', description: 'Exact column name for Total Shareholders Equity.'}
                    },
                    // Dynamically determine required columns based on requested ratios
                    // This is complex for schema, handle required logic in the tool itself for now.
                    required: ['dataset_id', 'ratios'] // Core requirements
                },
                output: 'On success, returns object with status: success and result: an object containing calculated ratios { ratioName: value, ... }. On failure, status: error and error message.'
            },
            ```
    2.  **Implement the Tool (`calculate_financial_ratios.js`):**
        *   Create the new file `backend/src/features/chat/tools/calculate_financial_ratios.js`.
        *   Import necessary modules (`logger`, `createToolWrapper`).
        *   Implement the `calculate_financial_ratios_logic(args, context)` async function.
        *   Inside the function:
            *   Extract `dataset_id`, `ratios`, and column name arguments from `args`.
            *   Get the `getParsedDataCallback` from `context`.
            *   Call `getParsedDataCallback(dataset_id)` to retrieve the parsed data array. Return error if data is missing/not an array.
            *   Implement helper `safeParseFloat` (similar to the one in `prompt.service.js` system prompt example) to handle currency/commas.
            *   **Crucially:** Implement logic to *dynamically find the correct columns* in the `inputData` objects based on the provided `*_column` arguments (e.g., `revenue_column`). Handle cases where columns are missing in the data. Use case-insensitive matching or keyword searching (`toLowerCase().includes(...)`) if exact names aren't guaranteed.
            *   Implement calculation logic for each requested ratio in the `ratios` array:
                *   Iterate through `inputData`.
                *   Sum up required values (e.g., total revenue, total COGS) using `safeParseFloat` and the dynamically found column keys. Handle potential errors/missing columns gracefully (e.g., skip row, return error if essential column missing entirely).
                *   Calculate the ratio (handle division by zero).
            *   Validate required columns are present based on *requested* ratios (e.g., if "Gross Profit Margin" is requested, check if `revenue_column` and `cogs_column` were provided *and* found in the data). Return specific errors if dependencies are missing.
            *   Store results in an object `{ ratioName: calculatedValue, ... }`.
            *   Return `{ status: 'success', result: resultsObject }` or `{ status: 'error', error: '...' }`.
        *   Wrap the logic function: `module.exports = createToolWrapper('calculate_financial_ratios', calculate_financial_ratios_logic);`
    3.  **Restart the Backend:** Ensure the new tool is loaded by `ToolExecutor`.

---

**Phase 8: Iterative Code Refinement for Analysis Code**

*   **Objective:** If `execute_analysis_code` fails due to an error *in the generated code*, automatically feed the error back to `generate_analysis_code` to attempt a fix.
*   **Why:** Improves the success rate of complex analysis requests by allowing the AI to fix its own coding mistakes.
*   **Testing:**
    1.  Prompt the agent with an analysis request likely to generate slightly buggy code (e.g., complex data manipulation, potential off-by-one errors, incorrect property access).
    2.  Inspect logs:
        *   Verify `execute_analysis_code` tool fails and returns an error related to the code execution itself.
        *   Verify `AgentRunner` detects this specific type of error.
        *   Verify `AgentRunner` *automatically* calls the `generate_analysis_code` tool again, *including the error message* in the `analysis_goal` or a dedicated context field.
        *   Verify the LLM generates *different* code in the second attempt.
        *   Verify `execute_analysis_code` is called again with the *new* code.
        *   Check if the second execution succeeds or fails. Limit retries.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/AgentRunner.js`
    *   `backend/src/features/chat/tools/generate_analysis_code.js` (Add error context handling)
    *   `backend/src/features/chat/tools/tool.definitions.js` (Update `generate_analysis_code` args)
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `tool.definitions.js` (for `generate_analysis_code`):**
        *   Add an optional argument to `argsSchema.properties`:
            ```json
            "previous_error": {
                "type": "string",
                "description": "Optional. If provided, this contains the error message from the previous failed execution attempt. Use this error context to fix the code."
            }
            ```
    2.  **Modify `generate_analysis_code.js` (`generate_analysis_code_logic`):**
        *   Accept the optional `previous_error` argument from `args`.
        *   Modify the call to `promptService.generateAnalysisCode`: Pass the `previous_error` string as part of the context/goal.
            ```javascript
            // Inside generate_analysis_code_logic
            const { analysis_goal, dataset_id, previous_error } = args;
            // ... get schemaData ...
            const generationParams = {
                userId: userId,
                analysisGoal: analysis_goal,
                datasetSchema: schemaData,
                // --- ADD ERROR CONTEXT ---
                previousError: previous_error // Pass the error to the service
            };
            const generationResult = await promptService.generateAnalysisCode(generationParams);
            // ... rest of the function ...
            ```
    3.  **Modify `backend/src/features/chat/prompt.service.js` -> `generateAnalysisCode`:**
        *   Accept the new `previousError` parameter.
        *   Modify `generateAnalysisCodePrompt`: If `params.previousError` exists, add a section to the system prompt:
            ```
            **Previous Execution Failed:**
            The code generated previously failed with the following error:
            \`\`\`
            ${params.previousError}
            \`\`\`
            Please analyze this error and the original goal/schema. Generate **corrected** Javascript code that fixes the issue and adheres to all sandbox constraints.
            ```
    4.  **Modify `AgentRunner.js` -> `run` method loop:**
        *   After the `execute_analysis_code` tool call (`toolResult`):
        *   Check if `toolResult.error` exists AND if the error seems like a *code execution* error (e.g., check if the error string contains common JS error types like "ReferenceError", "TypeError", "SyntaxError", or specific messages from the `vm` sandbox timeout/failure). This check needs refinement based on actual errors observed from `codeExecutionService`.
        *   Check if the retry count for *this specific refinement loop* is within a limit (e.g., `MAX_CODE_REFINEMENT_ATTEMPTS = 1`). Use `stateManager.getToolErrorCount('generate_analysis_code')` or a dedicated counter.
        *   If both conditions are met:
            *   Log the refinement attempt.
            *   Prepare arguments for `generate_analysis_code`: `analysis_goal` (can be the original goal or potentially refined), `dataset_id`, and crucially `previous_error: toolResult.error`.
            *   **Instead of breaking or proceeding**, modify the loop logic to *immediately* set the *next action* to be `generate_analysis_code` with these arguments. This overrides whatever the LLM might have said previously based on the error.
            *   Add a step to the `stateManager` indicating the refinement attempt.
            *   Emit an event like `agent:refining_code`.
            *   `continue` the `while` loop to execute the `generate_analysis_code` tool in the next iteration.
            ```javascript
             // Inside AgentRunner loop, after execute_analysis_code returns toolResult
             const MAX_CODE_REFINEMENT_ATTEMPTS = 1; // Allow one refinement attempt

             if (toolName === 'execute_analysis_code' && toolResult.error) {
                 const executionError = toolResult.error;
                 // --- Refine this check based on actual errors ---
                 const isCodeExecutionError = executionError.includes('timed out') || executionError.includes('failed:') || executionError.includes('ReferenceError') || executionError.includes('TypeError');
                 // ---
                 const refinementAttempts = this.stateManager.getToolErrorCount('generate_analysis_code_refinement') || 0; // Use a specific counter

                 if (isCodeExecutionError && refinementAttempts < MAX_CODE_REFINEMENT_ATTEMPTS) {
                      logger.warn(`[AgentRunner ${this.sessionId}] Analysis code execution failed. Attempting automated refinement (${refinementAttempts + 1}). Error: ${executionError}`);
                      this.stateManager.incrementToolErrorCount('generate_analysis_code_refinement'); // Increment specific counter
                      // Reuse the original goal or potentially extract it from previous steps
                      const originalGoal = this.stateManager.context.steps.find(s => s.tool === 'generate_analysis_code')?.args?.analysis_goal || this.stateManager.context.originalQuery; // Fallback

                      // --- Set the NEXT action to be code generation ---
                      const nextToolName = 'generate_analysis_code';
                      const nextToolArgs = {
                          analysis_goal: originalGoal, // Or maybe refine goal text slightly?
                          dataset_id: finalToolArgs.dataset_id, // Use dataset_id from failed execution
                          previous_error: executionError // Provide the error context
                      };

                      // Add step for the *failed* execution BEFORE the refinement attempt step
                      this.stateManager.updateLastStep(summarizeToolResult(toolResult), toolResult.error, toolResult.result);
                      this.eventEmitter.emitToolResult(toolName, summarizeToolResult(toolResult), toolResult.error);

                       // Add step indicating refinement is happening
                       this.stateManager.addStep({ tool: '_refiningCode', args: { failedTool: toolName }, resultSummary: 'Attempting to fix code...', attempt: refinementAttempts + 1 });
                       this.eventEmitter.emitUsingTool('_refiningCode', { failedTool: toolName }); // Emit refinement status

                      // --- Force the next iteration to call generate_analysis_code ---
                      // This requires adjusting the loop slightly. Instead of parsing LLM response,
                      // we inject the next action directly if refinement is triggered.
                       // Modify the main loop structure:
                       /*
                       let nextAction = null; // Variable to hold injected actions
                       while(...) {
                           if (nextAction) {
                               llmAction = nextAction; // Use injected action
                               nextAction = null; // Clear injected action
                               logger.info(`[AgentRunner] Using injected action: ${llmAction.tool}`);
                           } else {
                               // Normal flow: Get action from LLM
                               llmAction = await getNextActionFromLLM(...);
                           }

                           // ... process llmAction ...

                           // Inside error handling for execute_analysis_code:
                           if (isCodeExecutionError && refinementAttempts < MAX_CODE_REFINEMENT_ATTEMPTS) {
                               // ... prepare nextToolName, nextToolArgs ...
                               // --- INJECT THE ACTION ---
                               nextAction = { tool: nextToolName, args: nextToolArgs, isFinalAnswer: false, textResponse: null, thinking: "Attempting to regenerate code due to execution error." };
                               // Add steps/emit events for failed exec and refinement trigger
                               // ...
                               continue; // Go to next loop iteration, which will use nextAction
                           }
                       }
                       */
                      // Requires refactoring the main loop slightly to support action injection.
                      // For now, just log the intent and let the LLM handle the error context in the next iteration (simpler implementation)
                      logger.info(`[AgentRunner ${this.sessionId}] Code execution failed. Error context will be provided to LLM for next reasoning step.`);
                      // The existing loop structure will pass the error observation back.
                 } else if (isCodeExecutionError) {
                      logger.error(`[AgentRunner ${this.sessionId}] CRITICAL ERROR: Code execution failed after ${refinementAttempts} refinement attempts. Error: ${executionError}`);
                      this.stateManager.setError(`Code Execution Failed: ${summarizeToolResult(toolResult)}`);
                      this.eventEmitter.emitAgentError(this.stateManager.context.error);
                      // Update step, loop will terminate
                 }
                 // Else (not a code execution error, or max refinements reached), let normal error handling proceed
             }
            ```
            *   **Refinement:** For a more robust implementation, the loop in `AgentRunner.run` should be modified to allow *injecting* the next action (calling `generate_analysis_code` with the error) instead of relying solely on the LLM to decide to regenerate based on the error observation. This guarantees the refinement attempt occurs. The commented pseudocode above outlines this approach. The simpler approach relies on good prompting (Phase 4) for the LLM to react correctly to the error observation.

---

**Phase 9: Implement Agent Clarification Tool (`ask_user_for_clarification`)**

*   **Objective:** Allow the agent to explicitly pause and ask the user for clarification when the request is ambiguous or required information (like column names for a ratio) is missing.
*   **Why:** Improves accuracy and avoids the agent making incorrect assumptions or failing due to insufficient information. Requires frontend changes to handle the clarification request.
*   **Testing:**
    1.  Prompt the agent with an ambiguous request, e.g., "Calculate the profit margin" without specifying the necessary columns or which dataset if multiple are selected.
    2.  Inspect logs: Verify the agent's `<thinking>` block identifies the ambiguity. Verify it calls the `ask_user_for_clarification` tool with a relevant question in the `args`.
    3.  Inspect the UI (Requires FE update): Verify a prompt appears asking the user the clarification question.
    4.  Respond to the clarification in the chat UI.
    5.  Inspect logs: Verify the user's clarification is added to the chat history. Verify the agent's *next* `<thinking>` block uses the clarification. Verify the agent proceeds correctly with the clarified information.
*   **Files to Modify:**
    *   `backend/src/features/chat/tools/tool.definitions.js`
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js`
    *   `backend/src/features/chat/agent/AgentRunner.js` (To handle the tool's specific 'pause' effect)
    *   `backend/src/features/chat/agent/ToolExecutor.js` (To load the new tool)
    *   **Requires Frontend Changes:** The frontend (`ChatContext`, `ChatInterface`/`MessageBubble`) needs to detect a special message type or status indicating a clarification request and display an input for the user's response. The response needs to be sent back as a regular user message. (FE changes are out of scope for *this* plan, but note the dependency).
*   **New Files:**
    *   `backend/src/features/chat/tools/ask_user_for_clarification.js`
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Define the Tool (`tool.definitions.js`):**
        ```javascript
        {
            name: 'ask_user_for_clarification',
            description: 'Use this tool ONLY when you need more information from the user to proceed. Ask a specific question to resolve ambiguity or gather missing details (like column names).',
            argsSchema: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: 'The specific question to ask the user.'
                    }
                },
                required: ['question']
            },
            output: 'Pauses the agent turn and sends the question to the user. Does not return a value to the agent loop directly.'
        },
        ```
    2.  **Implement the Tool (`ask_user_for_clarification.js`):**
        *   Create the new file.
        *   Import `logger`, `createToolWrapper`.
        *   Implement `ask_user_for_clarification_logic(args, context)`.
        *   This tool's logic is simple: it just needs to signal success to the wrapper. The *effect* happens in `AgentRunner`.
            ```javascript
            async function ask_user_for_clarification_logic(args, context) {
                const { question } = args;
                logger.info(`[Tool:ask_user_for_clarification] Agent requesting clarification: "${question}"`);
                // The actual pausing and sending to FE happens in AgentRunner based on this tool being called.
                // Return success to indicate the tool call itself was valid.
                return { status: 'success', result: { clarification_requested: true, question: question } };
            }
            module.exports = createToolWrapper('ask_user_for_clarification', ask_user_for_clarification_logic);
            ```
    3.  **Modify `SystemPromptBuilder.js`:**
        *   In `_buildErrorHandlingGuidance` or a dedicated section, instruct the LLM: "If the user's request is ambiguous (e.g., asks for 'profit margin' but required columns like 'Revenue' or 'COGS' aren't obvious from the schema) or if a previous tool failed because information was missing, use the `ask_user_for_clarification` tool to ask a specific question."
    4.  **Modify `AgentRunner.js` -> `run` method loop:**
        *   After parsing the LLM action (`llmAction = await getNextActionFromLLM(...)`):
        *   Check if `llmAction.tool === 'ask_user_for_clarification'`.
        *   If it is:
            *   Log that clarification is being requested.
            *   Extract the `question` from `llmAction.args`.
            *   **Signal the end of *this* agent turn:** Set a final state in `stateManager` indicating clarification is needed. Maybe `status: 'awaiting_user_input'`, and store the `question` in the `aiResponseText` or a dedicated field.
                ```javascript
                 // Inside AgentRunner loop, after getting llmAction
                 if (llmAction.tool === 'ask_user_for_clarification') {
                     const question = llmAction.args.question || "I need more information to proceed. Could you please clarify?";
                     logger.info(`[AgentRunner ${this.sessionId}] Agent requested clarification: "${question}"`);
                     // Set a final state for *this turn* that indicates waiting
                     this.stateManager.context.status = 'awaiting_user_input'; // Custom status?
                     this.stateManager.setFinalAnswer(question); // Use finalAnswer to store the question text
                     this.stateManager.addStep({ tool: llmAction.tool, args: llmAction.args, resultSummary: 'Waiting for user clarification.', attempt: 1 });
                     // Emit an event that the FE can use to display the question input
                     this.eventEmitter._emit('agent:needs_clarification', { question: question }); // Use _emit directly or add a dedicated emitter method
                     break; // Exit the agent loop for this turn
                 }
                ```
            *   The agent run will then `_finalizeRun` saving the 'awaiting_user_input' status and the question.
            *   **Important:** The frontend needs to handle this state, display the question, allow the user to reply, and submit the reply as a *new* user message, which starts a *new* agent run cycle. The new cycle's context will include the original question and the user's clarifying answer in the `fullChatHistory`.

---

**(Continue for Phases 10-13 following the same detailed format: Objective, Why, Testing, Files, Packages, Detailed Steps with code snippets)**

---

**Phase 10: Enhance `generate_report_code` Tool with Arguments**

*   **Objective:** Allow the LLM to specify parameters (chart type, columns, title) when requesting report code generation.
*   **Why:** Enables more dynamic and user-influenced report generation beyond just showing the raw analysis results.
*   **Testing:**
    1.  Prompt the agent: "Analyze revenue by month and show it as a line chart titled 'Monthly Revenue Trend'."
    2.  Inspect logs: Verify the agent calls `execute_analysis_code` first. Verify the *next* call is to `generate_report_code` with args like `{ "analysis_summary": "...", "dataset_id": "...", "chart_type": "LineChart", "columns": ["month", "revenue"], "title": "Monthly Revenue Trend" }`.
    3.  Verify the generated React code uses the specified chart type, columns, and title.
    4.  Test with different chart types and column combinations.
*   **Files to Modify:**
    *   `backend/src/features/chat/tools/tool.definitions.js`
    *   `backend/src/features/chat/tools/generate_report_code.js`
    *   `backend/src/features/chat/prompt.service.js` (Update `generateReportCode` and its prompt)
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `tool.definitions.js` (for `generate_report_code`):**
        *   Update the `argsSchema` to include optional parameters:
            ```json
            argsSchema: {
                type: 'object',
                properties: {
                    analysis_summary: { type: 'string', description: 'A summary of the analysis goal and results.' },
                    dataset_id: { type: 'string', description: 'ID of the dataset related to the analysis.', pattern: '^[a-f\\d]{24}$' },
                    title: { type: 'string', description: 'Optional: A title for the report component.' },
                    chart_type: {
                        type: 'string',
                        description: 'Optional: Preferred Recharts chart type (e.g., "LineChart", "BarChart", "PieChart", "ComposedChart").',
                        enum: ["LineChart", "BarChart", "PieChart", "ComposedChart", "AreaChart", "Table"] // Add Table
                    },
                    columns_to_visualize: {
                        type: 'array',
                        description: 'Optional: Specific column names from the analysis result to focus on in the visualization.',
                        items: { type: 'string' }
                    }
                },
                required: ['analysis_summary', 'dataset_id'] // Keep core requirements
            },
            ```
    2.  **Modify `prompt.service.js` -> `generateReportCode` function:**
        *   Update the function signature to accept the new optional args: `async ({ userId, analysisSummary, dataJson, title, chart_type, columns_to_visualize })`.
        *   Update the call to `generateReportCodePrompt` (or directly modify the system prompt string construction).
    3.  **Modify `prompt.service.js` -> `generateReportCodePrompt` function (or system prompt string):**
        *   Add a new section to the prompt incorporating the optional arguments:
            ```
            **User Preferences (Optional):**
            - Report Title: ${title || 'Use an appropriate title based on the analysis'}
            - Preferred Chart Type: ${chart_type || 'Choose the best fit (Line, Bar, Pie, Composed, Table)'}
            - Focus Columns: ${columns_to_visualize ? columns_to_visualize.join(', ') : 'Visualize relevant data'}

            Generate the React component, taking these preferences into account where possible, while still ensuring the visualization is appropriate for the data. Use a Table if specified or if data is best presented tabularly.
            ```
        *   Ensure the prompt still emphasizes using the provided `reportData` prop (derived from `dataJson`) and adhering to sandbox constraints (no imports/exports).
    4.  **Modify `generate_report_code.js` (`generate_report_code_logic`):**
        *   Extract the new optional args: `const { analysis_summary, dataset_id, title, chart_type, columns_to_visualize } = args;`.
        *   Pass these arguments correctly to the `promptService.generateReportCode` call.
            ```javascript
            // Inside generate_report_code_logic
            const generationArgs = {
                userId: userId,
                analysisSummary: analysis_summary,
                dataJson: dataJsonString,
                // --- Pass new args ---
                title: args.title,
                chart_type: args.chart_type,
                columns_to_visualize: args.columns_to_visualize
            };
            const generationResult = await promptService.generateReportCode(generationArgs);
            // ... rest of the function ...
            ```

---

**Phase 11: Interactive Report Modification Logic (Basic)**

*   **Objective:** Enable the agent to handle simple modification requests for an *existing* report (e.g., change title, use different chart type) by regenerating the report code using the *previous* analysis results.
*   **Why:** Makes the chat more interactive and useful for refining visualizations without re-running potentially expensive analysis.
*   **Testing:**
    1.  Generate an initial report (e.g., "Show revenue by month").
    2.  In the *next* prompt, ask for a modification: "Change the chart title to 'Monthly Revenue' and make it a Bar chart."
    3.  Inspect logs:
        *   Verify `AgentContextService.prepareChatHistoryAndArtifacts` correctly identifies the `previousAnalysisResult` and `previousGeneratedCode` from the first report generation step.
        *   Verify the system prompt sent to the LLM includes context about the previous artifacts (`previousAnalysisResultSummary`, `hasPreviousGeneratedCode`).
        *   Verify the agent's `<thinking>` block indicates it understands this is a modification request and plans to reuse previous analysis data.
        *   Verify the agent calls `generate_report_code` *directly* (without re-running `parse_csv_data` or `execute_analysis_code`).
        *   Verify the arguments to `generate_report_code` include the requested modifications (new title, chart type).
        *   Verify the newly generated code reflects the changes.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js` (Refine modification handling section)
    *   `backend/src/features/chat/agent/AgentRunner.js` (Ensure previous context is passed correctly)
    *   `backend/src/features/chat/agent/AgentContextService.js` (Ensure artifact retrieval is reliable)
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Review `AgentContextService.js` -> `prepareChatHistoryAndArtifacts`:**
        *   Double-check the logic for finding the *most recent relevant* `reportAnalysisData` and `aiGeneratedCode`. Ensure it correctly identifies these artifacts from the previous successful AI report turn.
    2.  **Modify `AgentRunner.js` -> constructor and `run` method:**
        *   Ensure the `initialContext` passed to `AgentStateManager` correctly includes `previousAnalysisResult` and `previousGeneratedCode` if they were fetched by `AgentContextService`.
        *   Ensure the `executionContext` passed to `ToolExecutor` includes `analysisResult` when calling `generate_report_code`, sourcing it from `this.stateManager.getIntermediateResult('analysisResult')` (which should hold either this turn's result or the carried-over previous result).
            ```javascript
            // Inside AgentRunner -> run method, when preparing executionContext for generate_report_code
            const executionContext = {
                // ... other context ...
                analysisResult: this.stateManager.getIntermediateResult('analysisResult'), // Pass current or carried-over result
                // ...
            };
            ```
    3.  **Modify `SystemPromptBuilder.js` -> `_buildModificationHandling`:**
        *   Refine the instructions: "If the user asks to modify the *most recently generated report* (e.g., 'change the title', 'use a line chart instead') AND you determine the modification **does not require recalculating the underlying data**:
            a. Acknowledge the modification request in your `<thinking>` block.
            b. Confirm that `Previous Turn Artifacts` shows existing analysis results or generated code.
            c. Your **only** action should be to use the `generate_report_code` tool.
            d. In the `analysis_summary` argument, describe the requested change (e.g., "User wants to change the title to 'New Title' and use a LineChart.").
            e. Include any specific modification arguments (`title`, `chart_type`, etc.) based on the user's request.
            f. **DO NOT** call `parse_csv_data` or `execute_analysis_code`."
        *   Also update `_buildPreviousArtifacts` to be clearer about what the summary/flag represent.

---

**Phase 12: Granular Status Updates & Logging Enhancements**

*   **Objective:** Improve user feedback during processing and enhance backend logging for debugging.
*   **Why:** Better UX during potentially long operations. Easier troubleshooting for developers.
*   **Testing:**
    1.  Run complex chat interactions involving multiple tool calls (parsing, code gen, execution, report gen).
    2.  Monitor the frontend UI. Verify more specific status messages appear corresponding to agent actions (using `messageFragments`). E.g., "Parsing dataset 'xyz.csv'...", "Generating analysis code...", "Running analysis...", "Generating report view...".
    3.  Inspect backend logs:
        *   Verify logs include Trace IDs consistently.
        *   Verify logs clearly indicate the start and end of each agent turn (`runAgent` invocation).
        *   Verify detailed logs for tool execution start/end, LLM calls (prompt/response snippets), and state changes within `AgentRunner`.
        *   Verify `AgentEventEmitter` logs the events being sent.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/AgentRunner.js` (Add detailed logging, ensure emitter is called correctly)
    *   `backend/src/features/chat/agent/AgentEventEmitter.js` (Ensure all key events are emitted)
    *   `backend/src/features/chat/agent/ToolExecutor.js` (Add logging around execution)
    *   `backend/src/features/chat/agent/LLMOrchestrator.js` (Add logging for prompt/response)
    *   `backend/src/features/chat/agent/AgentStateManager.js` (Refine fragment generation)
    *   **Requires Frontend Changes:** The frontend (`MessageBubble` or similar) needs to be updated to render the `messageFragments` array effectively, showing the interleaved text and step summaries. (FE changes out of scope for *this* plan).
*   **New Files:** None
*   **Packages Required:** `uuid` (if not already used for trace IDs) - `npm install uuid`
*   **Detailed Steps:**
    1.  **Add Trace IDs:**
        *   In `AgentRunner.js` -> `run` method, generate a unique trace ID at the start: `const traceId = require('uuid').v4();`.
        *   Pass this `traceId` to all logging calls within the `run` method and potentially down to other services/tools called during that turn (e.g., include it in the `executionContext` passed to tools). Prefix log messages with `[Trace:${traceId}]`.
    2.  **Enhance Logging:**
        *   **`AgentRunner.js`:** Add detailed logs at the start/end of `run`, before/after `getNextActionFromLLM`, before/after `toolExecutor.execute`, and when handling errors or loop termination. Include key state information (current iteration, tool name, args).
        *   **`ToolExecutor.js`:** Add `debug` logs inside `execute` before calling `toolFn` and after receiving the result, including tool name and args (potentially truncated).
        *   **`LLMOrchestrator.js`:** Log the *final constructed system prompt* before the API call (potentially truncated). Log the *raw LLM response* (already added in Phase 2). Log the *parsed action* clearly.
        *   **`AgentContextService.js`:** Add logs during context fetching (start/end of each fetch, success/failure, items found).
    3.  **Refine `AgentStateManager.js` -> `addStep` and `updateLastStep`:**
        *   Ensure these methods consistently create/update the `messageFragments` array.
        *   When `addStep` is called, add a fragment like `{ type: 'step', tool: stepData.tool, status: 'running', resultSummary: 'Executing...' }`.
        *   When `updateLastStep` is called, find the corresponding 'step' fragment in the array and update its `status` ('completed' or 'error') and `resultSummary`.
    4.  **Refine `AgentEventEmitter.js`:**
        *   Ensure events are emitted consistently *after* state changes in `AgentRunner`.
        *   Make sure `emitUsingTool` and `emitToolResult` are called appropriately around `toolExecutor.execute`.
        *   Emit `agent:thinking` *before* calling `getNextActionFromLLM`.

---

**Phase 13: Few-Shot Examples in System Prompt**

*   **Objective:** Provide concrete examples of successful interactions within the system prompt to guide the LLM.
*   **Why:** Can significantly improve the LLM's ability to follow instructions, format tool calls correctly, and handle specific scenarios.
*   **Testing:**
    1.  Run various scenarios, especially those involving multi-step tool sequences (e.g., parse -> gen code -> exec code -> gen report).
    2.  Observe agent behavior. Is it more consistently following the desired workflow? Is the JSON formatting for tool calls more reliable?
    3.  Inspect system prompts in logs to confirm examples are included.
*   **Files to Modify:**
    *   `backend/src/features/chat/agent/SystemPromptBuilder.js`
*   **New Files:** None
*   **Packages Required:** None
*   **Detailed Steps:**
    1.  **Modify `SystemPromptBuilder.js`:**
        *   Create a new private method, e.g., `_buildFewShotExamples()`.
        *   Inside this method, construct 1-3 *concise* examples of interaction turns. Each example should show:
            *   A simplified `User Request`.
            *   The expected `<thinking>...</thinking>` block from the agent.
            *   The subsequent `Tool Call JSON` *or* `_answerUserTool` JSON.
            *   Optionally, a simplified `Observation` (tool result) that would lead to the *next* step in a sequence.
        *   **Example Snippet (Conceptual):**
            ```javascript
            _buildFewShotExamples() {
                return `**Examples:**

                Example 1: User asks for dataset schema.
                User Request: "What columns are in dataset 507f1f77bcf86cd799439011?"
                Agent Response:
                <thinking>The user wants the schema for a specific dataset. I need to use the get_dataset_schema tool with the provided ID.</thinking>
                \`\`\`json
                {
                  "tool": "get_dataset_schema",
                  "args": { "dataset_id": "507f1f77bcf86cd799439011" }
                }
                \`\`\`

                Example 2: After getting analysis results, user asks for a report.
                Observation: (Result from execute_analysis_code) {"tool_name": "execute_analysis_code", "status": "success", "result": {"total_revenue": 150000, "profit_margin": 0.25}}
                User Request: "Generate a report visualizing this."
                Agent Response:
                <thinking>The user wants a report based on the analysis results I just got (total revenue $150k, profit margin 25%). I should summarize this and call generate_report_code.</thinking>
                \`\`\`json
                {
                  "tool": "generate_report_code",
                  "args": { "analysis_summary": "The analysis found a total revenue of $150,000 and a profit margin of 25%.", "dataset_id": "507f1f77bcf86cd799439011" }
                }
                \`\`\`
                `;
            }
            ```
        *   Call `this._buildFewShotExamples()` within the main `build` method, placing it strategically after the tool definitions but before the core instructions.
        *   Keep examples concise and focused on demonstrating correct format and tool sequencing.

---

**General Considerations Across All Phases:**

*   **Testing Rigor:** Thoroughly test each phase manually and consider adding automated tests (unit/integration) for key components like tool validation, state management, and prompt building logic.
*   **Logging:** Maintain high-quality, informative logging throughout. Use different log levels (`debug`, `info`, `warn`, `error`) appropriately.
*   **Error Handling:** Ensure robust error handling at each step (API calls, tool execution, state updates). Provide informative error messages back to the user/frontend where appropriate.
*   **Communication:** Since different developers might work on phases, clear commit messages and potentially internal documentation updates are essential.
*   **Rollback:** Have a strategy for rolling back a phase if testing reveals significant issues. Version control (Git) is crucial.
*   **Frontend Coordination:** Phases requiring FE changes (like Clarification Tool or rendering fragments) need coordinated planning with the frontend team.

This detailed, phased plan provides a clear roadmap for enhancing the AI agent while adhering to your specific constraints and allowing for iterative development and testing.