Okay, this requires a meticulous and structured approach. Here is a detailed, phased plan designed for clarity and consistency, assuming different developers might work on each phase. Each phase builds upon the previous one and aims to be testable independently.

**Important Prerequisites & Conventions:**

*   **Branching Strategy:** Each phase should be developed on a separate feature branch (e.g., `feature/agent-phase-1-prompt-refinement`).
*   **Testing:** Rigorous testing is crucial after *each* phase. This includes unit tests for new/modified functions/classes and integration tests simulating user queries that exercise the new functionality. Manual testing through the chat interface is also required.
*   **Documentation:** Update relevant `README.md` files (especially `features/chat/README.md`) and inline code comments at the end of each phase.
*   **Code Style:** Maintain consistency with the existing codebase structure and style.
*   **Error Handling:** Ensure robust error handling is added or updated in every modified component.
*   **File Paths:** All file paths are relative to the `backend/src/` directory unless otherwise specified.

---

**Phase 1: Foundational Prompt Refinements & Chain-of-Thought (CoT)**

*   **Objective:** Improve the clarity and structure of the agent's reasoning by refining the system prompt and implementing basic Chain-of-Thought output. Enhance logging for better debugging.
*   **Rationale:** A better system prompt guides the LLM more effectively. Explicit CoT makes the agent's process transparent and helps identify reasoning errors. Improved logging is fundamental for diagnosing issues in later phases.
*   **Packages Required:** None.
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agent/LLMOrchestrator.js`
    *   `features/chat/agent/AgentRunner.js`
    *   `features/chat/agent/AgentEventEmitter.js`
    *   `shared/utils/logger.js` (Optional Enhancement)

*   **Specific Instructions:**

    1.  **`shared/utils/logger.js` (Optional Enhancement):**
        *   Modify `logger.debug` (or add a new `logger.trace`) to optionally accept an object for structured logging details. This helps in later phases.
        *   *Example:* `logger.debug('Message', { userId: '123', sessionId: 'abc' });`

    2.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   **Modify `buildIntroduction()`:** Reinforce the "Expert Financial Analyst" persona. Add a sentence about its goal (e.g., "Your primary goal is to provide accurate, data-driven financial insights and reports based *strictly* on the provided context and tools.").
        *   **Modify `_buildCoreInstructions()`:**
            *   Add a new instruction *before* the tool call format description:
                ```
                **Reasoning Output (Chain-of-Thought):** Before outputting a tool call JSON or the final answer, you MUST provide your step-by-step reasoning within `<thinking>...</thinking>` XML tags. Explain your current goal, analyze the available information (history, tool results, context), and justify your chosen action (which tool to call and why, or why you are providing a final answer).
                ```
            *   Modify the tool call instruction: "After your `<thinking>` block, if you need to use a tool, output ONLY a single JSON object..."
            *   Add: "If you are providing the final answer directly, provide your reasoning in `<thinking>` tags, then use the `_answerUserTool`."
        *   **Modify `_buildErrorHandling()` (or add if missing):** Add explicit instructions for reacting to tool errors (this will be expanded in later phases). Start with: "If a previous tool execution resulted in an error (indicated in 'Current Turn Progress'), acknowledge the error in your `<thinking>` block and decide whether to try a different approach or inform the user via `_answerUserTool`."
        *   **Modify `_buildCriticalWarnings()`:** Add emphasis on the sandbox constraints (NO `require`, use `inputData`, use `sendResult`) if generating analysis code.

    3.  **`features/chat/agent/LLMOrchestrator.js`:**
        *   **Modify `_parseCompleteLLMResponse()`:**
            *   Before looking for the JSON tool call, implement logic to extract text content within `<thinking>...</thinking>` tags.
            *   *How:* Use a regular expression like `/<thinking>([\s\S]*?)<\/thinking>/`.
            *   Store the extracted thinking text.
            *   Modify the JSON parsing logic to look for the JSON *after* the closing `</thinking>` tag.
            *   Return the extracted `thinkingText` along with the parsed tool/args/isFinalAnswer object. *New return structure:* `{ tool: string, args: object, isFinalAnswer: boolean, textResponse: string|null, thinkingText: string|null }`.
            *   Update the default/fallback return object (`defaultAnswer`) to also include `thinkingText: null`.
        *   **Modify `getNextActionFromLLM()`:**
            *   Receive the new structure `{ ..., thinkingText }` from `_parseCompleteLLMResponse`.
            *   *Log* the `thinkingText` for debugging purposes.
            *   Emit the `thinkingText` via the `streamCallback` using a *new* event type, e.g., `agent:thought`.
            *   Return the rest of the parsed action (`{ tool, args, isFinalAnswer, textResponse }`) as before.

    4.  **`features/chat/agent/AgentEventEmitter.js`:**
        *   Add a new method `emitThought(thoughtText)`:
            ```javascript
            emitThought(thoughtText) {
                this._emit('agent:thought', { thought: thoughtText });
            }
            ```
        *   Ensure the `streamCallback` in the constructor handles this new event type if necessary (though it's primarily for passing through to the main caller).

    5.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()` loop:**
            *   After calling `getNextActionFromLLM`, check if `thinkingText` was returned in the `llmAction` object.
            *   If `thinkingText` exists, call `this.eventEmitter.emitThought(llmAction.thinkingText);`.
            *   Proceed with processing `llmAction.tool`, `llmAction.args`, etc. as before.

*   **Testing:**
    *   Verify that reasoning text within `<thinking>` tags appears in backend logs for each LLM call.
    *   (Manual Frontend Test) Verify that if the frontend listens for `agent:thought` SSE events, it receives the reasoning text.
    *   Test simple queries that require 1-2 tool calls (e.g., "List my datasets", "Show schema for dataset X"). Ensure the agent still completes successfully.
    *   Test error cases (e.g., asking for a non-existent dataset schema). Ensure the agent acknowledges the error in its `thinking` block (as per prompt instructions) and provides an appropriate error response via `_answerUserTool`.
    *   Check that JSON tool calls are still parsed correctly *after* the thinking block.

---

**Phase 2: Implement New Financial Analysis Tools (Internal Data)**

*   **Objective:** Add new tools for common financial calculations (ratios, trends, anomaly detection) that operate *only* on data already parsed by `parse_csv_data`.
*   **Rationale:** Expands the agent's analytical capabilities beyond basic code execution, providing more direct financial insights. Sticking to internal data avoids external dependencies for now.
*   **Packages Required:** None (Calculations done in JS).
*   **New Files:**
    *   `features/chat/tools/calculate_financial_ratios.js`
    *   `features/chat/tools/perform_trend_analysis.js`
    *   `features/chat/tools/detect_anomalies.js`
*   **Files to Edit:**
    *   `features/chat/tools/tool.definitions.js`
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agent/ToolExecutor.js` (Reloads tools automatically, but verify)
    *   `features/chat/agent/AgentStateManager.js` (Optional: Add specific storage if results need caching *within* a turn)

*   **Specific Instructions:**

    1.  **Create `features/chat/tools/calculate_financial_ratios.js`:**
        *   Import `createToolWrapper`, `logger`, `Types`.
        *   Define `calculate_financial_ratios_logic(args, context)` async function.
        *   `args`: `{ dataset_id: string, ratios: string[] }` (e.g., `ratios: ['current_ratio', 'debt_to_equity']`).
        *   `context`: `{ getParsedDataCallback, userId, sessionId }`.
        *   **Logic:**
            *   Use `getParsedDataCallback(dataset_id)` to fetch the parsed data array. Handle `null` data (return error).
            *   Implement JS logic to calculate requested ratios (e.g., Current Ratio = Current Assets / Current Liabilities). Assume standard column names OR require the LLM to specify column names in `args` (e.g., `{..., current_assets_col: 'AssetsCurrent', current_liabilities_col: 'LiabilitiesCurrent'}`). *Start simple: require specific column names in args.*
            *   Handle potential errors (missing columns, non-numeric data) gracefully within the calculation logic.
            *   Return `{ status: 'success', result: { ratio_name: value, ... } }` or `{ status: 'error', error: '...' }`.
        *   Export `createToolWrapper('calculate_financial_ratios', calculate_financial_ratios_logic);`.

    2.  **Create `features/chat/tools/perform_trend_analysis.js`:**
        *   Import `createToolWrapper`, `logger`, `Types`.
        *   Define `perform_trend_analysis_logic(args, context)` async function.
        *   `args`: `{ dataset_id: string, value_column: string, date_column: string }`.
        *   `context`: `{ getParsedDataCallback, userId, sessionId }`.
        *   **Logic:**
            *   Fetch parsed data using callback.
            *   Validate required columns exist.
            *   Attempt to parse date column (e.g., using `new Date()`). Handle errors.
            *   Attempt to parse value column (handle non-numeric).
            *   Sort data by date.
            *   Perform simple trend calculation (e.g., percentage change first-to-last, simple linear regression slope).
            *   Return `{ status: 'success', result: { trend_description: 'Increasing/Decreasing', start_value: ..., end_value: ..., change_percent: ... } }` or `{ status: 'error', error: '...' }`.
        *   Export `createToolWrapper('perform_trend_analysis', perform_trend_analysis_logic);`.

    3.  **Create `features/chat/tools/detect_anomalies.js`:**
        *   Import `createToolWrapper`, `logger`, `Types`.
        *   Define `detect_anomalies_logic(args, context)` async function.
        *   `args`: `{ dataset_id: string, value_column: string, method: string }` (e.g., `method: 'z_score'/'iqr'`).
        *   `context`: `{ getParsedDataCallback, userId, sessionId }`.
        *   **Logic:**
            *   Fetch parsed data. Validate column. Parse values.
            *   Implement basic anomaly detection (e.g., Z-score > 3 or outside 1.5 * IQR range).
            *   Return `{ status: 'success', result: { method: 'z_score', anomalies_found: number, anomaly_examples: [value1, value2, ...] } }` or `{ status: 'error', error: '...' }`.
        *   Export `createToolWrapper('detect_anomalies', detect_anomalies_logic);`.

    4.  **`features/chat/tools/tool.definitions.js`:**
        *   Add new tool definitions for `calculate_financial_ratios`, `perform_trend_analysis`, `detect_anomalies` with clear descriptions, args (including required column names), and output structures.

    5.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   **Modify `_buildToolDefinitions()`:** Ensure the new tools are included in the prompt's tool list (should happen automatically if `toolDefinitions` is imported).
        *   **Modify `_buildWorkflowGuidance()`:** Add guidance on when to use these new financial tools (e.g., "If the user asks for specific financial ratios, use `calculate_financial_ratios`...", "For trend questions over time, use `perform_trend_analysis`...", "To find outliers, use `detect_anomalies`..."). Remind the LLM to specify required column names in the `args`.

    6.  **`features/chat/agent/ToolExecutor.js`:**
        *   Verify that the new tool files (`.js`) are automatically picked up and added to `toolImplementations` and `knownToolNames` by the existing dynamic loading logic. No code change should be needed unless the loading logic has issues.

    7.  **`features/chat/agent/AgentStateManager.js` (Optional):**
        *   If the results of these new tools are complex and might be needed by *multiple subsequent steps within the same turn* (unlikely for these specific tools), add cases to `setIntermediateResult` to store them. For now, storing them just on the `step.result` is likely sufficient.

*   **Testing:**
    *   Provide a simple dataset (CSV) with columns like 'Date', 'Revenue', 'Expenses', 'Assets', 'Liabilities'.
    *   Query: "Calculate the current ratio using the 'Assets' and 'Liabilities' columns for dataset X." Verify the agent calls `calculate_financial_ratios` with correct args and the tool returns the right value.
    *   Query: "What is the revenue trend for dataset X based on the 'Date' and 'Revenue' columns?" Verify `perform_trend_analysis` is called and returns a description.
    *   Query: "Find anomalies in the 'Revenue' column of dataset X using the IQR method." Verify `detect_anomalies` is called.
    *   Test cases where required columns are missing or have non-numeric data. Verify tools return specific errors.
    *   Verify the agent uses the tool results correctly in its subsequent reasoning or final answer.

---

**Phase 3: Implement Data Cleaning/Manipulation Tools & State Handling**

*   **Objective:** Add tools to perform basic data cleaning operations on the *parsed data* stored in the agent's state. Modify state management to handle these updates.
*   **Rationale:** Enables the agent to fix common data issues identified by analysis or previous tools before performing final calculations, improving reliability. This introduces complexity by modifying the in-memory parsed data.
*   **Packages Required:** None.
*   **New Files:**
    *   `features/chat/tools/clean_column_format.js`
    *   `features/chat/tools/handle_missing_values.js`
*   **Files to Edit:**
    *   `features/chat/tools/tool.definitions.js`
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agent/ToolExecutor.js` (Verify loading)
    *   `features/chat/agent/AgentStateManager.js`

*   **Specific Instructions:**

    1.  **`features/chat/agent/AgentStateManager.js`:**
        *   **Modify `context.intermediateResults`:** Ensure `parsedData` is structured to hold potentially modified data, e.g., `parsedData: { [datasetId]: { original: [...], modified: [...] } }`. Or simply allow tools to directly modify the array stored under `parsedData[datasetId]`. *Decision: Keep it simple for now, allow tools to directly modify `parsedData[datasetId]`. Add a disclaimer.*
        *   **Add Disclaimer:** Add a comment noting that tools modifying `parsedData` operate on an in-memory copy for the current turn only; the original dataset file is not changed.

    2.  **Create `features/chat/tools/clean_column_format.js`:**
        *   Import `createToolWrapper`, `logger`, `Types`.
        *   Define `clean_column_format_logic(args, context)` async function.
        *   `args`: `{ dataset_id: string, column_name: string, target_format: string }` (e.g., `target_format: 'date_iso'/'number_us'/'string_trim_lower'`).
        *   `context`: `{ getParsedDataCallback, userId, sessionId, stateManager }`. *Crucially, pass the `stateManager` instance.*
        *   **Logic:**
            *   Fetch parsed data using `getParsedDataCallback(dataset_id)`. If null, return error.
            *   Iterate through the `parsedData` array *in memory*.
            *   For each row, attempt to clean the value in `row[column_name]` based on `target_format`. (e.g., parse dates robustly and format to ISO, remove '$', ',' for numbers, trim/lowercase strings). Handle parsing errors for individual values.
            *   *Modify the data directly in the array fetched via the callback.* **This modifies the state managed by `AgentStateManager` for the current turn.**
            *   Count how many values were successfully cleaned/modified.
            *   Return `{ status: 'success', result: { cleaned_count: number, column_name: string, target_format: string } }` or `{ status: 'error', error: '...' }`.
        *   Export `createToolWrapper('clean_column_format', clean_column_format_logic);`.

    3.  **Create `features/chat/tools/handle_missing_values.js`:**
        *   Import `createToolWrapper`, `logger`, `Types`.
        *   Define `handle_missing_values_logic(args, context)` async function.
        *   `args`: `{ dataset_id: string, column_name: string, strategy: string }` (e.g., `strategy: 'fill_mean'/'fill_median'/'fill_zero'/'drop_rows'`).
        *   `context`: `{ getParsedDataCallback, userId, sessionId, stateManager }`. Pass `stateManager`.
        *   **Logic:**
            *   Fetch parsed data.
            *   Implement the chosen strategy:
                *   `fill_...`: Calculate mean/median (numeric only), then iterate and replace `null`/`undefined`/empty strings in `column_name` with the calculated value or 0.
                *   `drop_rows`: Filter the `parsedData` array *in memory*, removing rows where `column_name` is missing/null/empty.
            *   *Modify the data array directly in the state.*
            *   Count rows affected or values filled.
            *   Return `{ status: 'success', result: { strategy_used: string, rows_affected: number } }` or `{ status: 'error', error: '...' }`.
        *   Export `createToolWrapper('handle_missing_values', handle_missing_values_logic);`.

    4.  **`features/chat/tools/tool.definitions.js`:**
        *   Add definitions for `clean_column_format` and `handle_missing_values`. Clearly state they modify the in-memory data for the *current turn only*.

    5.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   Update `_buildToolDefinitions()`.
        *   Update `_buildWorkflowGuidance()`: Add guidance on using these tools (e.g., "If analysis reveals inconsistent formats or missing values that hinder calculation, use `clean_column_format` or `handle_missing_values` on the *parsed data* before retrying the analysis tool."). Emphasize that these tools modify the data *only for the current analysis turn*.

    6.  **`features/chat/agent/ToolExecutor.js`:**
        *   Modify `execute()`:
            *   When preparing `executionContext` for the tool call, add the `stateManager` instance itself: `executionContext.stateManager = this.stateManager;` (where `this` refers to the `AgentRunner` instance, assuming `ToolExecutor` is called from it. Adjust if structure differs, the goal is to pass the *current turn's state manager* to the tool). *Correction:* It's better if the `AgentRunner` passes the `stateManager` *into* the `ToolExecutor.execute` call, rather than `ToolExecutor` knowing about `AgentRunner`.
            *   *Revised `AgentRunner.js` Tool Execution Step:*
                ```javascript
                // Inside AgentRunner.run loop, after getting llmAction
                // ...
                const executionContext = {
                    userId: this.userId,
                    teamId: this.teamId,
                    sessionId: this.sessionId,
                    stateManager: this.stateManager, // Pass the state manager instance
                    // ... other context items like callbacks, analysisResult, schemas
                    getParsedDataCallback: async (datasetId) => {
                        // Modified: Get data directly from state manager's intermediate results
                        const data = this.stateManager.getIntermediateResult('parsedData', datasetId);
                        if (!data) logger.warn(`[getParsedDataCallback] Parsed data for dataset ${datasetId} not found in state.`);
                        return data; // Return the potentially modified data
                    },
                 };
                toolResult = await this.toolExecutor.execute(toolName, finalToolArgs, executionContext);
                // ...
                ```
            *   Verify new tools load correctly.

*   **Testing:**
    *   Use a dataset with mixed date formats, currency symbols ($ ,), and missing values.
    *   Query: "Clean the 'Transaction Amount' column in dataset X to be standard numbers." Verify `clean_column_format` is called and subsequent analysis tools use the cleaned data *within the same turn*.
    *   Query: "Fill missing values in the 'Revenue' column of dataset X with the mean." Verify `handle_missing_values` runs and subsequent analysis uses the filled data.
    *   Query: "Drop rows with missing 'CustomerID' in dataset X." Verify `handle_missing_values` runs with `drop_rows` and subsequent analysis uses the filtered data.
    *   Verify that asking for the *original* data again in a *new turn* uses the un-modified data (confirming changes are turn-specific).
    *   Test error cases (e.g., trying to calculate mean on a non-numeric column).

---

**Phase 4: Robust Tool I/O Validation (JSON Schema)**

*   **Objective:** Add JSON Schema validation for arguments passed *to* tools and results returned *from* tools to improve reliability and catch LLM hallucination/errors early.
*   **Rationale:** Ensures tools receive expected data structures and return consistent outputs, making the agent less prone to errors caused by malformed LLM requests or unexpected tool behavior.
*   **Packages Required:** `npm install ajv`
*   **New Files:**
    *   `features/chat/tools/tool.schemas.js` (or potentially define schemas within each tool file or definition)
*   **Files to Edit:**
    *   `features/chat/tools/BaseToolWrapper.js`
    *   `features/chat/tools/tool.definitions.js` (Potentially, to link definitions to schemas)
    *   Individual tool files (if schemas defined there)

*   **Specific Instructions:**

    1.  **Install `ajv`:**
        ```bash
        npm install ajv
        ```

    2.  **Create `features/chat/tools/tool.schemas.js`:**
        *   Import `Ajv` from 'ajv'. `const ajv = new Ajv();`
        *   Define JSON schemas for the `args` of *each* tool.
            *   *Example for `get_dataset_schema`:*
                ```javascript
                const getDatasetSchemaArgsSchema = {
                    type: 'object',
                    properties: {
                        dataset_id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } // MongoDB ObjectId pattern
                    },
                    required: ['dataset_id'],
                    additionalProperties: false // Disallow extra args
                };
                export const validateGetDatasetSchemaArgs = ajv.compile(getDatasetSchemaArgsSchema);
                ```
        *   Define JSON schemas for the *successful* `result` object of *each* tool (validate the `result` property within the standard `{ status: 'success', result: {...} }` structure).
            *   *Example for `get_dataset_schema`:*
                ```javascript
                const getDatasetSchemaResultSchema = {
                    type: 'object',
                    properties: {
                        schemaInfo: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: { name: { type: 'string' }, type: { type: 'string' } },
                                required: ['name'], // Type might be optional initially
                                additionalProperties: true // Allow other potential schema props
                            }
                        },
                        rowCount: { type: ['number', 'null'], minimum: 0 } // Allow null or number >= 0
                    },
                    required: ['schemaInfo'], // rowCount might be optional
                    additionalProperties: true // Allow other potential result props
                };
                 export const validateGetDatasetSchemaResult = ajv.compile(getDatasetSchemaResultSchema);
                ```
        *   Export compiled validation functions for each tool's args and results.

    3.  **`features/chat/tools/BaseToolWrapper.js`:**
        *   Import the validation functions from `tool.schemas.js`. Create a map or switch statement to access the correct validators based on `toolName`.
            ```javascript
            // At the top
            import * as toolValidators from './tool.schemas.js';

            // Inside createToolWrapper, before calling handlerFn
            const argsValidator = toolValidators[`validate${toolName.replace(/_(\w)/g, (match, p1) => p1.toUpperCase())}Args`]; // Convert snake_case to CamelCase for validator name lookup

            if (argsValidator) {
                const validArgs = argsValidator(args);
                if (!validArgs) {
                    const errorMsg = `Invalid arguments for tool ${toolName}: ${ajv.errorsText(argsValidator.errors)}`;
                    logger.warn(`[ToolWrapper:${toolName}] ${errorMsg}`);
                    return { status: 'error', error: errorMsg, args };
                }
                 logger.debug(`[ToolWrapper:${toolName}] Args validated successfully.`);
            } else {
                logger.warn(`[ToolWrapper:${toolName}] No argument schema found. Skipping validation.`);
            }

            // Inside createToolWrapper, after getting result from handlerFn, before returning
            if (result.status === 'success') {
                 const resultValidator = toolValidators[`validate${toolName.replace(/_(\w)/g, (match, p1) => p1.toUpperCase())}Result`];
                 if (resultValidator) {
                     const validResult = resultValidator(result.result); // Validate the nested 'result' object
                     if (!validResult) {
                         const errorMsg = `Tool ${toolName} returned invalid result structure: ${ajv.errorsText(resultValidator.errors)}`;
                         logger.error(`[ToolWrapper:${toolName}] ${errorMsg}`, { returnedResult: result.result });
                         // Return error, but include the original (invalid) result for debugging if needed, or just the error.
                         return { status: 'error', error: errorMsg, args, invalidResult: result.result };
                     }
                      logger.debug(`[ToolWrapper:${toolName}] Result validated successfully.`);
                 } else {
                      logger.warn(`[ToolWrapper:${toolName}] No result schema found. Skipping validation.`);
                 }
            }
            // Return the validated result (or original if no validator)
            return { ...result, args }; // Pass original args back
            ```

*   **Testing:**
    *   Provide malformed arguments in a manual test (or unit test `ToolExecutor`) and verify the `BaseToolWrapper` catches the error via Ajv before the tool logic runs.
    *   Modify a tool temporarily to return an invalid result structure (e.g., missing a required field) and verify the `BaseToolWrapper` catches it.
    *   Test all existing tool flows to ensure validation passes for correct inputs/outputs.

---

**Phase 5: Agent Control Flow - Explicit Planning Step**

*   **Objective:** Modify the agent interaction to include an explicit planning step where the LLM first outlines its intended sequence of actions before executing the first one.
*   **Rationale:** Makes the agent's strategy clearer, allows for potential plan validation/modification, and can improve complex task handling by forcing forethought.
*   **Packages Required:** None.
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agent/LLMOrchestrator.js`
    *   `features/chat/agent/AgentRunner.js`
    *   `features/chat/agent/AgentEventEmitter.js`

*   **Specific Instructions:**

    1.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   **Modify `_buildCoreInstructions()` or add a new Planning section:**
            *   Add: "Your first response in any turn *must* include a plan outline within `<plan>...</plan>` XML tags. This plan should be a numbered list of the high-level steps (tool calls or final answer) you intend to take to address the user's request. After the plan, provide your reasoning in `<thinking>` tags, and then EITHER the JSON for the *first* tool call in your plan OR the `_answerUserTool` call if the plan is just to answer directly."
            *   Update the tool call format instruction: "After your `<plan>` and `<thinking>` blocks, if the first step of your plan is to use a tool, output ONLY the single JSON object for that first tool call..."
            *   Update final answer instruction: "If your plan is simply to answer the user directly, provide the `<plan>` and `<thinking>` blocks, then use the `_answerUserTool`."

    2.  **`features/chat/agent/LLMOrchestrator.js`:**
        *   **Modify `_parseCompleteLLMResponse()`:**
            *   Add logic to extract text content within `<plan>...</plan>` tags *before* the `<thinking>` tags. Use a regex like `/<plan>([\s\S]*?)<\/plan>/`.
            *   Store the extracted `planText`.
            *   Modify the thinking/JSON parsing logic to look for `<thinking>` *after* `</plan>`.
            *   Return the extracted `planText` along with the other parts. *New return structure:* `{ tool, args, isFinalAnswer, textResponse, thinkingText, planText }`.
            *   Update default/fallback return object to include `planText: null`.
        *   **Modify `getNextActionFromLLM()`:**
            *   Receive the new structure `{ ..., planText }` from `_parseCompleteLLMResponse`.
            *   *Log* the `planText` for debugging.
            *   Emit the `planText` via the `streamCallback` using a *new* event type, e.g., `agent:plan`.
            *   Return the rest of the parsed action (`{ tool, args, isFinalAnswer, textResponse, thinkingText }`) as before. *Note: We only execute the first step here. The plan itself isn't directly used by the runner logic in this phase, but it guides the LLM.*

    3.  **`features/chat/agent/AgentEventEmitter.js`:**
        *   Add a new method `emitPlan(planText)`:
            ```javascript
            emitPlan(planText) {
                this._emit('agent:plan', { plan: planText });
            }
            ```

    4.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()` loop:**
            *   After calling `getNextActionFromLLM`, check if `planText` was returned in the `llmAction` object.
            *   If `planText` exists, call `this.eventEmitter.emitPlan(llmAction.planText);`.
            *   Proceed with emitting `thinkingText` and processing the first action (`tool`, `args`) as implemented in Phase 1. The loop structure itself doesn't change fundamentally in this phase; the LLM is just guided to provide the plan first.

*   **Testing:**
    *   Verify that for new queries, the agent's first LLM response includes `<plan>...</plan>` followed by `<thinking>...</thinking>` and then the first tool call JSON (or `_answerUserTool`). Check logs.
    *   (Manual Frontend Test) Verify that if the frontend listens for `agent:plan` SSE events, it receives the plan text.
    *   Ensure the agent still correctly executes the *first* step of its plan.
    *   Test multi-step queries (e.g., "Analyze dataset X and then generate a report"). Verify the plan outlines both steps, but only the first tool (likely `parse_csv_data` or similar) is executed in the first iteration. The subsequent iterations should follow the plan implicitly based on the prompt instructions.

---

**Phase 6: Agent Control Flow - Self-Correction on Tool Failure**

*   **Objective:** Enable the agent to recognize when a tool fails (after retries) and prompt the LLM to reconsider its plan based on the error.
*   **Rationale:** Improves robustness by allowing the agent to potentially recover from errors using alternative tools or approaches instead of immediately giving up.
*   **Packages Required:** None.
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agent/AgentRunner.js`
    *   `features/chat/agent/LLMOrchestrator.js` (Minor change for context)

*   **Specific Instructions:**

    1.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   **Enhance `_buildErrorHandling()`:** Make the self-correction instruction more explicit:
            ```
            **ERROR HANDLING & SELF-CORRECTION:** If the *last step* in 'Current Turn Progress' shows a tool call resulted in an 'Error:' **after all retries have failed**, you MUST:
            1. Acknowledge the specific tool that failed and the error message in your `<thinking>` block.
            2. Analyze *why* it might have failed based on the error and previous steps.
            3. **Re-evaluate your original plan.** Decide on a *new course of action*. This might involve:
               a. Trying a *different* tool to achieve the goal.
               b. Using the *same* tool but with significantly *different arguments*.
               c. Asking the user for clarification using `_answerUserTool` if the request seems impossible or ambiguous given the error.
               d. Abandoning the specific failed sub-task and trying to answer the user based on information gathered so far, using `_answerUserTool`.
            4. Explain your new proposed action in the `<thinking>` block.
            5. Output the JSON for the *next* tool call based on your revised plan, or use `_answerUserTool`.
            **DO NOT simply repeat the exact same failed tool call with the same arguments.**
            ```

    2.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()` loop, after tool execution:**
            *   Inside the `do...while` loop for tool retries, check if `currentAttempt > MAX_TOOL_RETRIES` AND `toolResult.error`.
            *   If both are true (tool failed definitively after retries):
                *   Log this critical failure: `logger.error(\`[AgentRunner ${this.sessionId}] Tool ${toolName} failed PERMANENTLY after ${MAX_TOOL_RETRIES} retries: ${toolResult.error}\`);`
                *   **DO NOT** break the main `while` loop or set the final error state *yet*.
                *   **DO** ensure the failed step with its error is recorded correctly by `this.stateManager.updateLastStep(resultSummary, toolResult.error);`
                *   The loop will naturally continue to the next iteration (`iterations++`). The LLM will see the permanent error in the `currentTurnSteps` context prepared by `getContextForLLM` and should (based on the updated system prompt) attempt to self-correct in the next `getNextActionFromLLM` call.
            *   Modify the existing critical error handling for `execute_analysis_code` (added in Phase 5): Remove the part that immediately sets the final error state (`this.stateManager.setError`). Let the self-correction mechanism handle it first. Only if the LLM fails to correct after *that* should we potentially error out (or rely on MAX_ITERATIONS).

    3.  **`features/chat/agent/LLMOrchestrator.js`:**
        *   **Modify `getNextActionFromLLM()`:** Ensure the `currentTurnSteps` passed within `llmContext` accurately reflects the final error status of a failed tool (including the error message) so the LLM has the necessary information for self-correction. (This should already be handled by `AgentStateManager` and `AgentRunner`'s `updateLastStep`). No major code change likely needed here, just verification.

*   **Testing:**
    *   Simulate a tool failure that persists beyond retries (e.g., modify `parse_csv_data` to always throw an error after 1 attempt if `dataset_id` is a specific test ID).
    *   Observe the agent's behavior:
        *   Does it log the permanent tool failure?
        *   In the *next* LLM call, does the `<thinking>` block acknowledge the error and propose a different strategy (e.g., trying a different tool, asking the user)?
        *   Does it avoid immediately calling the *same* failed tool with the *same* arguments?
    *   Test with different types of tool failures (e.g., invalid args detected by schema vs. runtime error within the tool).
    *   Verify the agent eventually either recovers using a different path or informs the user via `_answerUserTool` if it cannot proceed.

---

**Phase 7: Code Generation - Static Analysis & Iterative Refinement**

*   **Objective:** Improve the reliability of generated code (`generate_analysis_code`) by adding basic static analysis (linting) and allowing the agent to attempt fixes based on execution errors.
*   **Rationale:** Reduces the chance of the sandbox (`vm`) failing due to simple syntax errors or disallowed constructs in AI-generated code. Allows the agent to learn from execution failures.
*   **Packages Required:** `npm install eslint` (Install ESLint locally for programmatic use).
*   **New Files:**
    *   `features/chat/agent/codeAnalyzer.js` (Or integrate into `codeExecution.service.js`)
    *   `.eslintrc.sandbox.js` (A specific ESLint config for the sandbox rules)
*   **Files to Edit:**
    *   `features/chat/agent/ToolExecutor.js`
    *   `features/chat/tools/execute_analysis_code.js` (Wrapper already handles errors, but logic flow changes)
    *   `features/chat/agent/AgentRunner.js`
    *   `features/chat/agent/SystemPromptBuilder.js`

*   **Specific Instructions:**

    1.  **Install ESLint:**
        ```bash
        npm install eslint --save-dev
        # Note: Might need specific parsers depending on JS features used, but start basic.
        ```

    2.  **Create `.eslintrc.sandbox.js` (in `backend/` root or near `codeAnalyzer.js`):**
        *   Configure ESLint rules specifically for the sandbox environment.
        *   *Key rules:*
            *   `no-restricted-globals`: Disallow `require`, `process`, `fs`, `path`, etc.
            *   `no-restricted-syntax`: Disallow `require()` calls.
            *   `no-undef`: Ensure variables like `inputData`, `sendResult` are not flagged if not explicitly declared (or configure globals).
            *   Basic syntax rules (`no-unused-vars`, etc.).
            ```javascript
            // .eslintrc.sandbox.js Example
            module.exports = {
                root: true,
                parserOptions: { ecmaVersion: 2020, sourceType: 'script' }, // Script context
                env: { es6: true, // Allow modern JS syntax
                       // DO NOT add 'node: true' or 'browser: true'
                     },
                globals: {
                    inputData: 'readonly', // Make sandbox globals known
                    sendResult: 'readonly',
                    console: 'readonly',
                    // Add other allowed globals like Math, JSON, Date etc. if needed,
                    // but it's often better to rely on standard JS env.
                 },
                 rules: {
                    'no-restricted-globals': ['error', 'require', 'process', 'fs', 'path', /* add others */ ],
                    'no-restricted-syntax': [
                        'error',
                        { selector: 'CallExpression[callee.name="require"]', message: '`require` is not allowed in the sandbox.' },
                        { selector: 'ImportDeclaration', message: '`import` is not allowed in the sandbox.' },
                        { selector: 'ImportExpression', message: 'Dynamic `import()` is not allowed.' },
                     ],
                    // Add other standard JS rules as desired (no-undef, no-unused-vars etc.)
                     'no-undef': 'error',
                     'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }], // Warn on unused vars
                 },
            };
            ```

    3.  **Create `features/chat/agent/codeAnalyzer.js`:**
        *   Import `ESLint` from 'eslint'.
        *   Define an async function `analyzeCode(codeString)`:
            *   Instantiate ESLint: `const eslint = new ESLint({ overrideConfigFile: './path/to/.eslintrc.sandbox.js', useEslintrc: false });` (Adjust path).
            *   Lint the code: `const results = await eslint.lintText(codeString);`.
            *   Format the results: `const formatter = await eslint.loadFormatter('compact'); const resultText = formatter.format(results);`.
            *   Return an object: `{ isValid: results[0]?.errorCount === 0, errors: resultText, errorCount: results[0]?.errorCount || 0 }`. Handle potential ESLint errors.

    4.  **`features/chat/agent/ToolExecutor.js`:**
        *   Import `analyzeCode` from `codeAnalyzer.js`.
        *   **Modify the `execute` method for `generate_analysis_code`:**
            *   After the `generate_analysis_code` tool function returns successfully:
            *   Call `analyzeCode(toolResult.result.code)`.
            *   If `analyzeResult.isValid` is `false`:
                *   Log the linting errors.
                *   Return an *error* result from the *wrapper* for `generate_analysis_code`: `{ status: 'error', error: 'Generated code failed static analysis.', details: analyzeResult.errors, args }`. **Do not proceed to execution.**
            *   If valid, return the original success result `{ status: 'success', result: { code: cleanedCode }, args }`.

    5.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify the `run` loop logic for handling `execute_analysis_code` failures:**
            *   Introduce a *code refinement loop* specifically around `generate_analysis_code` and `execute_analysis_code`.
            *   *State:* Need to track the last execution error message. Add `lastCodeExecutionError: null` to `AgentStateManager.context.intermediateResults`.
            *   *Loop Logic:*
                1.  LLM calls `generate_analysis_code`. Store the generated code in `stateManager`.
                2.  LLM calls `execute_analysis_code`.
                3.  If `execute_analysis_code` *succeeds*: Store result, clear `lastCodeExecutionError`, break refinement loop, continue main agent loop.
                4.  If `execute_analysis_code` *fails*:
                    *   Store the error message in `stateManager.context.intermediateResults.lastCodeExecutionError`.
                    *   Check refinement attempt count (add `codeRefinementAttempts: 0` to state). If > MAX_REFINEMENT_ATTEMPTS (e.g., 1), break refinement loop and report persistent error to main loop (let self-correction handle it).
                    *   Increment attempt count.
                    *   **Force the *next* LLM call to be `generate_analysis_code` again.** *How:* Manipulate the context passed to `getNextActionFromLLM`. Add a flag or specifically modify the prompt generation in `SystemPromptBuilder` to request code generation *with the error context*.
                    *   Go back to step 1 of the refinement loop.
        *   **Modify `stateManager.getContextForLLM()`:** Add `lastCodeExecutionError` to the context object passed to the prompt builder.

    6.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   Add a section or modify instructions for `generate_analysis_code`: "If `lastCodeExecutionError` is present in the context, it means the previously generated code failed during execution. Analyze the error message (`lastCodeExecutionError`) and the previous code attempt (you may need to store the previous code attempt in context as well, or infer it). Generate a *corrected* version of the code to fix the error. Pay close attention to the error message and sandbox constraints."
        *   Make sure to conditionally include the `lastCodeExecutionError` in the built prompt string only when it exists.

*   **Testing:**
    *   Manually provide code with syntax errors or disallowed `require` statements to `execute_analysis_code` tool (via testing or modifying `generate_analysis_code` temporarily). Verify static analysis catches it and returns an error *before* execution.
    *   Provide a prompt that is likely to generate code with runtime errors (e.g., accessing properties of null, incorrect data manipulation).
    *   Verify that `execute_analysis_code` fails.
    *   Verify the `AgentRunner` catches the execution error.
    *   Verify the *next* call to the LLM is for `generate_analysis_code` and the system prompt includes the execution error message.
    *   Verify if the LLM successfully generates corrected code.
    *   Verify the agent then attempts `execute_analysis_code` again with the *new* code.
    *   Test the refinement loop limit.

---

**Phase 8: Context Management - LLM-Based History Summarization**

*   **Objective:** Implement dynamic summarization of older chat messages using an LLM when the conversation history exceeds a token threshold.
*   **Rationale:** Prevents overly long prompts, reduces token costs, and maintains relevant context from extended conversations.
*   **Packages Required:** `npm install tiktoken` (or another token counting library).
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agentContext.service.js`
    *   `features/chat/prompt.service.js` (May need a dedicated summarization function).

*   **Specific Instructions:**

    1.  **Install `tiktoken`:**
        ```bash
        npm install tiktoken
        ```

    2.  **`features/chat/prompt.service.js` (or a new `summarization.service.js`):**
        *   Create a new async function `summarizeConversation(messagesToSummarize, userId)`:
            *   Accepts an array of message objects (`{ role, content }`).
            *   Constructs a prompt for the LLM (use a cheaper model like Claude Haiku or equivalent): "Summarize the key points, questions asked, data analyzed, and conclusions reached in the following conversation history excerpt. Be concise and retain essential context for an ongoing financial analysis chat." Include the `messagesToSummarize` in the prompt.
            *   Call the LLM provider's `generateContent` method.
            *   Return the summarized text string. Handle errors.

    3.  **`features/chat/agentContext.service.js`:**
        *   Import the `summarizeConversation` function and a token counter (e.g., `tiktoken`).
        *   **Modify `prepareChatHistoryAndArtifacts()`:**
            *   Define a `MAX_HISTORY_TOKENS` constant (e.g., 3000).
            *   Fetch the *full* relevant history (maybe increase the `HISTORY_FETCH_LIMIT`).
            *   Iterate through the fetched messages *from newest to oldest*.
            *   Use `tiktoken` to count the tokens for each message's content.
            *   Keep adding messages to a `contextMessages` array until the estimated total token count approaches `MAX_HISTORY_TOKENS`.
            *   If there are remaining older messages (`olderMessages`), call `summarizeConversation(olderMessages, this.userId)`.
            *   Prepend the summary to the `contextMessages` array as a 'system' or 'assistant' message (e.g., `{ role: 'system', content: `Previous conversation summary: ${summaryText}` }`).
            *   Update the logic for finding `previousAnalysisResult` and `previousGeneratedCode` to search the *full* history *before* summarization, ensuring the latest artifacts aren't lost in the summary.
            *   Return the potentially summarized `contextMessages` as `fullChatHistory`.

*   **Testing:**
    *   Create a long chat session (manually or programmatically).
    *   Set `MAX_HISTORY_TOKENS` to a low value for testing.
    *   Send a new message.
    *   Verify in the logs that:
        *   Token counting occurs.
        *   `summarizeConversation` is called when the threshold is exceeded.
        *   The prompt sent to the main reasoning LLM includes the summary message prepended to the recent messages.
    *   Verify the agent can still function correctly using the summarized context. Check if it retains key information from the summarized portion.

---

**Phase 9: Context Management - Selective Dataset Context Injection**

*   **Objective:** Modify the agent to fetch and include schema/sample context *only* for datasets it deems relevant based on the user query and conversation history, instead of preloading all session datasets.
*   **Rationale:** Significantly reduces prompt size and cost, especially in sessions with many associated datasets, and makes the agent more dynamic by focusing context.
*   **Packages Required:** None.
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agentContext.service.js`
    *   `features/chat/agent/AgentRunner.js`
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/tools/tool.definitions.js` (Potentially revise `list_datasets` output)
    *   `features/chat/tools/list_datasets.js` (Potentially revise output)

*   **Specific Instructions:**

    1.  **`features/chat/tools/tool.definitions.js` & `features/chat/tools/list_datasets.js`:**
        *   Ensure the `list_datasets` tool's output (`result`) includes `_id`, `name`, and a concise `description` for each dataset. This is crucial for the LLM to decide relevance.

    2.  **`features/chat/agentContext.service.js`:**
        *   **Remove `preloadDatasetContext()` function.**
        *   The responsibility of fetching schema/samples now shifts to the agent loop itself using tools.

    3.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   **Remove the `_buildDatasetInfo()` section** that lists all schemas/samples.
        *   **Modify `_buildWorkflowGuidance()` or `_buildCoreInstructions()`:**
            *   Add: "You have access to the user's datasets via the `list_datasets` tool."
            *   Add: "Before attempting analysis or answering questions about specific data, you **MUST first identify the relevant dataset(s)** based on the user query and conversation history."
            *   Add: "If you are unsure which dataset to use, use `list_datasets` to see the available options (names, descriptions, IDs)."
            *   Add: "Once you identify a potentially relevant dataset ID, you **MUST use `get_dataset_schema`** with that ID to understand its structure *before* attempting to parse or analyze it."
            *   Add: "Only after reviewing the schema should you use `parse_csv_data`, `generate_analysis_code`, etc., using the correct dataset ID."

    4.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()`:**
            *   Remove the call to `this.contextService.preloadDatasetContext()`.
            *   Remove the setting of schemas/samples in the `stateManager` during initial context prep.
        *   **Modify Tool Execution Context:** The `executionContext` passed to `ToolExecutor` will no longer contain preloaded `datasetSchemas`. Tools like `generate_analysis_code` or `generate_report_code` that *need* schema context will now rely on the LLM having called `get_dataset_schema` in a *previous step* of the *same turn*, and the result being stored in the `stateManager`'s intermediate results (e.g., under `intermediateResults.datasetSchemas[datasetId]`).
            *   *Update `AgentStateManager.setIntermediateResult`*: Add a case for `get_dataset_schema` to store the fetched schema: `this.context.intermediateResults.datasetSchemas[args.dataset_id] = resultData;`
            *   *Update `executionContext` preparation:* When calling tools that need schema (like `generate_analysis_code`), retrieve it from `this.stateManager.getIntermediateResult('datasetSchemas', datasetIdFromArgs)`. Pass it if found.
                ```javascript
                 // Inside AgentRunner.run loop, preparing executionContext
                 const datasetIdForTool = finalToolArgs.dataset_id; // ID needed by the tool
                 const schemaForTool = this.stateManager.getIntermediateResult('datasetSchemas', datasetIdForTool);

                 const executionContext = {
                     // ... other context
                     // Pass schema ONLY if it was fetched and the tool might need it
                     datasetSchema: schemaForTool, // Pass the potentially fetched schema
                     // ... getParsedDataCallback etc.
                  };
                 // ... call toolExecutor.execute
                ```

*   **Testing:**
    *   Start a new chat session with several datasets associated.
    *   Query: "What columns are in dataset A?" Verify the agent calls `get_dataset_schema` with the correct ID for dataset A.
    *   Query: "Compare revenue from dataset A and dataset B." Verify the agent first calls `get_dataset_schema` for A, then for B (or lists datasets if unsure), then likely `parse_csv_data` for both, then analysis code generation/execution.
    *   Verify context passed to `generate_analysis_code` *only* contains the schema for the dataset specified in its `args`.
    *   Monitor prompt token counts (via logging added later or manually) to confirm they are lower when not all schemas/samples are included.

---

**Phase 10: UX - Granular Status Updates via Fragments**

*   **Objective:** Provide more detailed, user-friendly status updates during tool execution by refining the `messageFragments` structure and the information emitted by the agent.
*   **Rationale:** Improves the user experience by giving clearer insight into what the agent is doing, especially during multi-step processes.
*   **Packages Required:** None.
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agent/AgentRunner.js`
    *   `features/chat/agent/AgentStateManager.js`
    *   `features/chat/agent/AgentEventEmitter.js` (Modify existing events)
    *   `features/chat/prompt.model.js` (Verify `messageFragments` schema)
    *   Frontend: `features/dashboard/components/MessageBubble.jsx` (Update rendering logic)

*   **Specific Instructions:**

    1.  **`features/chat/agent/AgentStateManager.js`:**
        *   **Modify `addStep()`:**
            *   When adding a 'step' fragment, use more descriptive initial text based on the tool name (e.g., "Loading data...", "Preparing analysis...", "Generating report...").
            *   Ensure the initial status is 'running'.
        *   **Modify `updateLastStep()`:**
            *   When updating the step fragment upon completion/error, ensure the `resultSummary` is user-friendly (use `summarizeToolResult`) and the `status` is set to 'completed' or 'error'.

    2.  **`features/chat/agent/AgentEventEmitter.js`:**
        *   **Modify Event Payloads:**
            *   `emitUsingTool`: Payload could include a `userFriendlyText` field (e.g., "Loading data...") alongside `toolName` and `args`.
            *   `emitToolResult`: Payload should already include `resultSummary` and `error`.
        *   **Consider New Events (Optional):** Add events for sub-steps if tools are very long (e.g., `agent:parsing:progress`, `agent:execution:running`). This adds complexity. *Decision: Stick to refining existing events for now.*

    3.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()` loop:**
            *   When calling `this.eventEmitter.emitUsingTool`, generate the `userFriendlyText` based on the `toolName` (using a map similar to `toolDisplayMap`).
            *   When calling `this.eventEmitter.emitToolResult`, ensure the `summary` passed is the user-friendly one from `summarizeToolResult`.

    4.  **Frontend: `features/dashboard/components/MessageBubble.jsx`:**
        *   **Modify `renderContent()`:**
            *   When iterating through `message.fragments`:
            *   If `fragment.type === 'step'`, render it using the `fragment.status`, `fragment.tool`, and `fragment.resultSummary`/`fragment.error`. Use icons and styling to indicate running/completed/error states clearly. Use the user-friendly text derived from the tool name (you might need a similar map on the frontend or pass it in the fragment).
            *   Ensure smooth transitions between fragments (text -> step -> text).

*   **Testing:**
    *   Run multi-step queries (parse, analyze, report).
    *   Observe the AI message bubble in the frontend UI.
    *   Verify that distinct, user-friendly status updates appear for each tool execution step (e.g., "Loading data [Spinner]", then "Loading data [Check]", then "Analyzing data [Spinner]", etc.).
    *   Verify error states for steps are clearly indicated.
    *   Ensure text fragments intersperse correctly with step fragments.

---

**Phase 11: UX - Agent Clarification Tool**

*   **Objective:** Allow the agent to explicitly ask the user for clarification when needed.
*   **Rationale:** Makes the agent more robust when faced with ambiguity or missing information, improving the chances of a successful outcome instead of failing or hallucinating. Requires frontend interaction changes.
*   **Packages Required:** None.
*   **New Files:**
    *   `features/chat/tools/ask_user_for_clarification.js`
*   **Files to Edit:**
    *   `features/chat/tools/tool.definitions.js`
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agent/ToolExecutor.js` (Verify loading)
    *   `features/chat/agent/AgentRunner.js`
    *   Frontend: `features/dashboard/context/ChatContext.jsx` (Handle clarification state)
    *   Frontend: `features/dashboard/components/PromptInput.jsx` (Adapt UI for clarification)

*   **Specific Instructions:**

    1.  **Create `features/chat/tools/ask_user_for_clarification.js`:**
        *   Import `createToolWrapper`, `logger`.
        *   Define `ask_user_for_clarification_logic(args, context)` function.
        *   `args`: `{ question_to_user: string }`.
        *   **Logic:** This tool doesn't perform a backend action. Its *invocation* signals the need for clarification. It should simply return success.
        *   Return `{ status: 'success', result: { question: args.question_to_user } }`.
        *   Export `createToolWrapper('ask_user_for_clarification', ask_user_for_clarification_logic);`.

    2.  **`features/chat/tools/tool.definitions.js`:**
        *   Add the definition for `ask_user_for_clarification`. Description: "Asks the user a specific question to clarify their request or provide missing information when you cannot proceed otherwise. Use this SPARINGLY, only when essential information is missing or the request is highly ambiguous." Output: "Signals that the agent needs user input. The 'question' will be presented to the user."

    3.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   Update `_buildToolDefinitions()`.
        *   Update `_buildCoreInstructions()` or `_buildErrorHandling()`: Add guidance: "If the user's request is ambiguous, required information is missing (e.g., which dataset or column to use after listing options), or a tool fails due to unclear input, use the `ask_user_for_clarification` tool to ask a specific question. Formulate a clear, concise question in the `question_to_user` argument."

    4.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()` loop:**
            *   After parsing the LLM action, if `llmAction.tool === 'ask_user_for_clarification'`:
                *   Extract the `question_to_user` from `llmAction.args`.
                *   Set a specific final state indicating clarification is needed. *How:* Add a new property to the state manager context, e.g., `this.stateManager.context.needsClarification = true; this.stateManager.context.clarificationQuestion = question_to_user;`.
                *   Set the `finalAnswer` to the `question_to_user` so it's displayed.
                *   Record the step `this.stateManager.addStep({ tool: toolName, args: llmAction.args, resultSummary: 'Asking user for clarification.', attempt: 1 });`.
                *   Emit an event: `this.eventEmitter.emitClarificationNeeded(question_to_user);` (Add `emitClarificationNeeded` to `AgentEventEmitter`).
                *   **Break the loop.** The agent's turn ends here, waiting for the user's response.

    5.  **Frontend: `features/dashboard/context/ChatContext.jsx`:**
        *   Add state to track if clarification is needed: `const [needsClarification, setNeedsClarification] = useState(false);` and `const [clarificationQuestion, setClarificationQuestion] = useState('');`. Add these to the context value.
        *   Modify the `sendStreamingMessage` (and `sendMessage`) function:
            *   If `needsClarification` is true, prepend the user's new `promptText` with context like "Regarding your question: '[clarificationQuestion]', my answer is: ". Reset `needsClarification` to `false` before sending.
        *   Modify the SSE/WebSocket listener for the AI's response (`onAgentFinalAnswer` or `chat:message:completed`): If the AI message indicates it was asking for clarification (e.g., check for a specific marker or analyze the `steps`), set `needsClarification` to `true` and store the `clarificationQuestion`.

    6.  **Frontend: `features/dashboard/components/PromptInput.jsx`:**
        *   Consume `needsClarification` and `clarificationQuestion` from `useChat()`.
        *   Conditionally change the placeholder text or add a visual indicator above the input when `needsClarification` is true, displaying the `clarificationQuestion`.

*   **Testing:**
    *   Provide an ambiguous query: "Analyze my data." Verify the agent uses `ask_user_for_clarification` tool, asking "Which dataset would you like me to analyze?".
    *   Verify the agent stops processing and waits for user input.
    *   Verify the frontend UI updates to show the clarification question.
    *   Respond to the clarification (e.g., "Use dataset X"). Verify the *next* message sent by the frontend includes the context and the agent proceeds correctly.
    *   Test tool failures that might trigger clarification.

---

**Phase 12: UX - Interactive Report Modification**

*   **Objective:** Allow users to ask the agent to modify the *last generated report* (e.g., change chart type, filter data shown) without re-running the full analysis if possible.
*   **Rationale:** Provides a more interactive and iterative analysis experience.
*   **Packages Required:** None.
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agent/SystemPromptBuilder.js`
    *   `features/chat/agentContext.service.js` (Ensure previous code/data is loaded)
    *   `features/chat/prompt.service.js` (`generateReportCode` needs to handle modification context)
    *   `features/chat/tools/generate_report_code.js` (Pass modification context)
    *   `features/chat/agent/AgentRunner.js` (Identify modification requests)

*   **Specific Instructions:**

    1.  **`features/chat/agentContext.service.js`:**
        *   Ensure `prepareChatHistoryAndArtifacts` correctly retrieves `previousAnalysisResult` and `previousGeneratedCode` from the *immediately preceding* completed AI report message.

    2.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   Add/Enhance the **Modification Handling** section:
            ```
            **Modification Handling:** If the user's request clearly asks to *modify the previously generated report* (e.g., "change the chart to line", "remove expenses", "add title 'Q1 Results'") AND you have `Previous Turn Artifacts` (both analysis result summary and generated code exist):
            1. Confirm in `<thinking>` that this is a modification request and you have the previous context.
            2. **Determine if the modification requires re-running the analysis.**
               a. **If NO (most UI/styling changes):** Your primary action should be to call `generate_report_code`. In the `analysis_summary` argument, clearly state the requested modification (e.g., "Modify previous report: Change bar chart to line chart."). Provide the relevant `dataset_id`. The system will automatically use the *previous* analysis results. **DO NOT** call `parse_csv_data` or `execute_analysis_code`.
               b. **If YES (e.g., "filter by region X", "calculate a new metric"):** You must follow the full analysis workflow: `parse_csv_data` -> `generate_analysis_code` (with the *new* goal) -> `execute_analysis_code` -> `generate_report_code`. Explain this necessity in your `<thinking>` block.
            3. If you are unsure whether re-analysis is needed, it's generally safer to assume it IS required, or ask the user for clarification.
            ```

    3.  **`features/chat/prompt.service.js`:**
        *   Modify `generateReportCode`: It currently takes `userId`, `analysisSummary`, `dataJson`. It *might* need the `previousGeneratedCode` as well to effectively modify it.
        *   *Decision:* For simplicity initially, let's assume the LLM can generate the *new* code based on the *original data* (`dataJson` which comes from `analysisResult`) and the `analysis_summary` describing the modification. It doesn't *edit* the old code, it regenerates. Add the previous code to the prompt for context.
        *   *Revised `generateReportCode` call:* Add `previousCode` as an optional parameter.
        *   *Revised System Prompt (inside `generateReportCode`):* Conditionally add: "You are modifying a previous report. The previous code was: ```javascript\n${previousCode}\n```. The original analysis data is provided. Apply the requested modification: ${analysisSummary}."

    4.  **`features/chat/tools/generate_report_code.js`:**
        *   Modify `generate_report_code_logic`:
            *   Accept `previousGeneratedCode` from the `context` (passed by `AgentRunner`).
            *   Pass `previousCode: previousGeneratedCode` to the `promptService.generateReportCode` call.

    5.  **`features/chat/agent/AgentRunner.js`:**
        *   **Modify `run()` loop:**
            *   When preparing `llmContext` for `getNextActionFromLLM`, ensure `previousGeneratedCode` (from the state manager) is included if available.
            *   When preparing `executionContext` for the `generate_report_code` tool, retrieve `previousGeneratedCode` from the state manager and include it: `executionContext.previousGeneratedCode = this.stateManager.getIntermediateResult('generatedReportCode');`

*   **Testing:**
    *   Generate a report (e.g., "Show revenue by month for dataset X").
    *   In the *next* turn, ask: "Change the title to 'Monthly Revenue'." Verify the agent calls `generate_report_code` directly, passing the modification instruction in the summary, and *doesn't* re-run analysis tools. Verify the new report code reflects the title change.
    *   Ask: "Now show it as a line chart." Verify `generate_report_code` is called again.
    *   Ask: "Only show data for Q1." Verify the agent recognizes this needs re-analysis and calls `generate_analysis_code` -> `execute_analysis_code` -> `generate_report_code`.

---

**Phase 13: Token Monitoring & Few-Shot Examples**

*   **Objective:** Add basic token usage logging and include few-shot examples in the system prompt to potentially improve LLM adherence to instructions.
*   **Rationale:** Provides visibility into costs and potential prompt length issues. Few-shot examples can sometimes improve performance for complex instructions.
*   **Packages Required:** `tiktoken` (already installed in Phase 8).
*   **New Files:** None.
*   **Files to Edit:**
    *   `features/chat/agent/LLMOrchestrator.js`
    *   `features/chat/agent/SystemPromptBuilder.js`

*   **Specific Instructions:**

    1.  **`features/chat/agent/LLMOrchestrator.js`:**
        *   Import `tiktoken` encoder (e.g., `get_encoding("cl100k_base")`).
        *   **Modify `getNextActionFromLLM()`:**
            *   Before calling `streamLLMReasoningResponse`, estimate the prompt tokens:
                *   `const systemTokens = encoding.encode(systemPrompt).length;`
                *   `const historyTokens = encoding.encode(JSON.stringify(apiOptions.messages)).length;` // Approximation
                *   `const totalEstimatedTokens = systemTokens + historyTokens;`
            *   Log the estimate: `logger.info(\`[LLM Orchestrator] Estimated prompt tokens for model ${modelToUse}: ${totalEstimatedTokens} (System: ${systemTokens}, History/Query: ${historyTokens})\`);`
            *   (Optional) Add a warning if `totalEstimatedTokens` exceeds a threshold (e.g., 80% of the model's context limit).
        *   Modify the stream handling loop or the parsing logic:
            *   Count tokens in the *response* `fullLLMResponseText`.
            *   Log the response token count upon completion: `logger.info(\`[LLM Orchestrator] Response tokens received: ${responseTokens}\`);`

    2.  **`features/chat/agent/SystemPromptBuilder.js`:**
        *   **Add a new private method `_buildFewShotExamples()`:**
            *   Create 1 or 2 concise examples demonstrating the desired interaction flow (Plan -> Thinking -> Tool Call JSON). Use simple, generic tool calls.
            *   *Example Text:*
                ```
                **Examples:**

                *Example 1: User asks "List my datasets"*
                <plan>
                1. Call list_datasets tool.
                2. Answer user with the list.
                </plan>
                <thinking>The user wants to see their datasets. I have the `list_datasets` tool for this. I will call it now.</thinking>
                ```json
                {
                  "tool": "list_datasets",
                  "args": {}
                }
                ```

                *Example 2: User asks "What's the schema for dataset 'abc'?"*
                <plan>
                1. Call get_dataset_schema with ID 'abc'.
                2. Answer user with the schema details.
                </plan>
                <thinking>The user is asking for the structure of a specific dataset 'abc'. I need to use the `get_dataset_schema` tool and provide the dataset_id 'abc'.</thinking>
                ```json
                {
                  "tool": "get_dataset_schema",
                  "args": { "dataset_id": "abc" }
                }
                ```
                ```
        *   **Modify `build()`:** Insert the output of `_buildFewShotExamples()` into the prompt structure, perhaps after the tool definitions but before the core instructions.

*   **Testing:**
    *   Check logs to verify estimated prompt token counts and actual response token counts are being logged for LLM calls.
    *   Manually inspect the system prompt being generated (via logs or debugging) to ensure the few-shot examples are included correctly.
    *   Run standard queries and observe if the LLM's output format (Plan -> Thinking -> Action) is more consistently followed (though this can be hard to guarantee). Check if it helps reduce malformed JSON outputs.

---

This detailed, phased plan provides a roadmap for incrementally enhancing your AI agent. Remember to adapt specific code details based on your exact implementation nuances and to test thoroughly after each phase. Good luck!