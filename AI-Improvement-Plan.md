# NeuroLedger Financial Agent: Implementation Plan

**Last Updated:** (Current Date)

## 1. Introduction: The Vision for NeuroLedger AI

Imagine interacting with NeuroLedger not just as a tool, but as a **dedicated, expert financial analyst** sitting right beside you. That's the vision driving this major upgrade. We're moving beyond the current chat feature – which is already helpful for generating code snippets – into a realm where the AI becomes a **true reasoning engine and proactive assistant** for your financial data exploration and analysis needs.

Think of it like this: right now, our AI is like a calculator. You give it a specific task (a prompt), and it gives you a direct output (text or code). We want to transform it into a seasoned **FP&A analyst or data scientist**. When you ask this new **NeuroLedger Financial Agent** a question, like "What were the main drivers of margin changes last quarter?", it won't just give a canned response. Instead, it will:

1.  **Understand Your Goal:** Figure out what you *really* need to know.
2.  **Think and Plan:** Determine the steps needed to answer your question. Does it need data? Which dataset? What kind of analysis is required?
3.  **Use Its Tools:** Just like a human analyst uses software, spreadsheets, or BI tools, our AI Agent will have its own toolkit. It will be able to:
    *   *See* what datasets you have available.
    *   *Read* the descriptions and understand the structure (schema) of those datasets.
    *   **Crucially, *access and process the actual numbers*** by intelligently generating and safely executing code snippets behind the scenes to extract the relevant information.
    *   Decide on the *best way* to present the findings – maybe a quick text summary, a few key figures, insightful charts, or even a structured mini-report.
4.  **Deliver Insight:** Provide you with an accurate, data-driven answer, grounded in your actual financial information.

To the user, this complex process should feel **magical and seamless**. While the Agent is working, you'll see subtle cues that it's "thinking" or "analyzing data," building trust and managing expectations for potentially complex queries. The better the context you provide – through clear dataset names, detailed descriptions, and well-defined schemas – the smarter and more helpful your personal NeuroLedger Financial Agent will become.

This document lays out the technical implementation plan to bring this vision to life. It details the phased approach, the new backend architecture, the frontend enhancements, and the specific "tools" we will build to empower our AI, transforming NeuroLedger into an indispensable partner for financial intelligence.

## 2. Core Concepts

*   **Agent Loop:** Instead of a single LLM call per user message, the backend will orchestrate a loop:
    1.  **Reason/Plan:** LLM analyzes the user query, chat history, and current state to decide the next step (use a tool or answer the user).
    2.  **Act:** If a tool is chosen, the backend executes the corresponding function.
    3.  **Observe:** The result of the tool execution is captured.
    4.  **(Repeat):** The loop continues with the new information until the LLM decides to `answer_user`.
*   **Tools:** Defined backend functions the LLM can request to execute (e.g., list datasets, get schema, run code). The LLM will be instructed to output a specific JSON format to request tool usage.
*   **Transparency:** The frontend will display the agent's current status (thinking, using a specific tool) to manage user expectations and build trust.

## 3. Phase 1: Agent Foundation & Data Awareness (Read-Only)

**Goal:** Establish the agent orchestration loop, enable basic data discovery tools, and update the frontend to show the agent's status.

**3.1. Backend Implementation (`backend/src`)**

*   **New Service (`features/chat/agent.service.js`):**
    *   Create `AgentOrchestrator` class or set of functions.
    *   `runAgentLoop(userId, teamId, sessionId, userMessage, aiMessagePlaceholder)`: Main entry point called by `chat.taskHandler.js`.
        *   Initializes state: `turnContext` (stores original query, history summary, steps taken this turn, intermediate results).
        *   Enters loop (with max iteration limit):
            *   Prepares context for LLM (history, `turnContext`, available tools description).
            *   Calls `prompt.service.js` -> `getLLMReasoningResponse(context)`.
            *   Parses LLM response: Is it a tool call or a final answer?
            *   If tool call:
                *   Emits `agent:using_tool` WebSocket event.
                *   Calls internal `toolDispatcher(toolName, args)`.
                *   Updates `turnContext` with tool result (or error).
                *   Emits `agent:tool_result` WebSocket event.
            *   If `answer_user` tool:
                *   Extracts final text response.
                *   Breaks loop.
            *   If error/max iterations:
                *   Formulate error response.
                *   Break loop.
        *   Updates the `aiMessagePlaceholder` (`PromptHistory`) record in DB with final status (`completed` or `error`) and `aiResponseText`.
        *   Returns final status/result to `chat.taskHandler.js`.
    *   `toolDispatcher(toolName, args)`:
        *   Validates `toolName` and `args`.
        *   Calls the corresponding tool implementation function (e.g., `_listDatasetsTool()`, `_getDatasetSchemaTool()`).
        *   Returns tool result (JSON or error object).
    *   Implement Tool Functions (initially):
        *   `_listDatasetsTool(userId, teamId)`: Calls `dataset.service.js` to get accessible datasets (personal + team), formats as clean JSON list (ID, name, description).
        *   `_getDatasetSchemaTool(datasetId, userId, teamId)`: Calls `dataset.service.js` to get schema/column descriptions for a specific dataset, ensuring access control. Formats as JSON.
        *   `_answerUserTool(textResponse)`: Simple function that returns the `textResponse` to signal loop completion.
*   **LLM Prompting (`features/chat/system-prompt-template.js` & `prompt.service.js`):**
    *   **System Prompt:** Completely redesign. Must:
        *   Define the role: "You are NeuroLedger AI, an expert Financial Analyst agent."
        *   Explain the goal: "Your goal is to answer the user's questions accurately and insightfully using the available data and tools."
        *   Describe the Agent Loop: "Think step-by-step. Decide if you need more information using a tool, or if you can answer the user directly."
        *   **Define Tools (Crucial):** Provide a clear, structured description of available tools (see Section 7). Emphasize the required JSON output format for tool calls: `{"tool": "<tool_name>", "args": {"<arg_name>": "<value>", ...}}`.
        *   Include user/team context (`aiContext` from settings).
    *   **`prompt.service.js`:**
        *   Modify/Create `getLLMReasoningResponse(context)`: Takes the prepared context (history, turn state, tool descriptions) and calls the LLM API.
        *   Add robust parsing logic for the LLM response to identify tool calls vs. final answers. Handle potential JSON parsing errors.
*   **Task Handler (`features/chat/chat.taskHandler.js`):**
    *   Modify `handleChatAiTask`:
        *   Instead of directly calling `prompt.service.js` for a single generation, instantiate and call `agent.service.js -> runAgentLoop()`.
        *   Pass necessary IDs (`userId`, `sessionId`, etc.) and the placeholder AI message ID.
        *   Handle the final success/error result from `runAgentLoop` to update the `PromptHistory` and emit final `chat:message:completed` / `chat:message:error` events.
*   **WebSocket Integration (`shared/sockets/socket.handler.js` or similar):**
    *   Ensure the agent service can access the socket emitter.
    *   Define and emit new events (see Section 8) from `agent.service.js` at appropriate points in the loop.
*   **Models (`features/chat/prompt.model.js`):**
    *   Consider adding optional fields to `PromptHistory` for agent state tracking if needed (e.g., `agentSteps: [{tool: string, args: object, result: object}]`). Initially, manage state within the `runAgentLoop` context.

**3.2. Frontend Implementation (`frontend/src`)**

*   **Context/Hooks (`features/dashboard/context/ChatContext.jsx`, `features/dashboard/hooks/useSocket.js`):**
    *   **`useSocket.js`:** Add listeners for the new `agent:*` events (`agent:thinking`, `agent:using_tool`, `agent:tool_result`, `agent:error`). When received, call corresponding update functions in `ChatContext`.
    *   **`ChatContext.jsx`:**
        *   Add new state variables, e.g., `agentStatus: 'idle' | 'thinking' | 'using_tool' | 'error'`, `currentToolName: string | null`, `agentError: string | null`.
        *   Implement update functions triggered by socket listeners (e.g., `updateAgentStatus`, `setAgentError`). These functions should update the state for the *specific* AI message being processed (identified by `messageId` likely passed in the socket event payload).
*   **UI Components (`features/dashboard/components/ChatInterface.jsx`, `Message.jsx`):**
    *   Modify the component displaying AI messages (`Message.jsx` or similar).
    *   When rendering an AI message with `status === 'processing'`, check the `agentStatus` from `ChatContext` for that message ID.
    *   Display dynamic status messages:
        *   If `agentStatus === 'thinking'`, show "Thinking...".
        *   If `agentStatus === 'using_tool'`, show `Checking dataset list...` or `Getting schema for '${currentToolName}'...` (map tool names to user-friendly text).
        *   If `agentStatus === 'error'`, display the `agentError` message.
        *   Show a subtle loading indicator alongside the status text.

## 4. Phase 2: Internal Data Extraction & Processing

**Goal:** Enable the agent to generate and execute backend code using Node.js's `vm` module to fetch and process data, feeding the results back into its reasoning loop.

**4.1. Backend Implementation (`backend/src`)**

*   **New Service (`shared/services/codeExecution.service.js`):**
    *   Create `CodeExecutionService`.
    *   `executeSandboxedCode(code, datasetId, userId)`:
        *   **Data Fetching:** Securely get dataset content stream/path from GCS via `dataset.service.js` (check permissions via `userId`). Read the content into memory (e.g., as a string or buffer).
        *   **Sandbox Implementation (Use Node.js `vm` Module):**
            1.  Import Node.js's built-in `vm` module.
            2.  **Prepare Context:** Create a `context` object for the sandbox. This object **MUST be minimal**. Inject only the fetched dataset content (e.g., `context.datasetContent = fileContentString;`) and potentially *very simple, safe* utility functions if absolutely necessary (e.g., basic JSON parsing). **CRITICAL: DO NOT expose `require`, `process`, `fs`, `child_process`, network modules, global objects, or any other potentially harmful Node.js APIs or environment variables into this context.**
            3.  **Execute Code:** Use `vm.runInNewContext(code, context, { timeout: <SHORT_TIMEOUT_MS>, displayErrors: true })`. Set a strict, short timeout (e.g., 5000ms) to prevent runaway scripts.
            4.  **Capture Output:** Instruct the LLM (in the code generation prompt - see below) to output its final result by calling a specific function injected into the context (e.g., `context.sendResult(jsonData)`), or by logging JSON to the console (`console.log(JSON.stringify(result))`). If using console logging, wrap the `vm.runInNewContext` call in code that temporarily overrides `console.log` within the execution scope to capture the output.
            5.  **Error Handling:** Catch errors from `vm.runInNewContext` (including timeouts) and format them into a structured error object.
        *   **Return:** Return the captured JSON output (from `sendResult` or captured log) or the structured error object.
*   **Agent Service (`features/chat/agent.service.js`):**
    *   Add new Tool implementation functions:
        *   `_generateDataExtractionCodeTool(datasetId, columnsNeeded, filters, analysisGoal)`: Calls `prompt.service.js -> getLLMCodeGenerationResponse` to generate **Node.js code compatible with the restricted `vm` environment**. Ensure the prompt specifies the available context (`datasetContent`, `sendResult` function or `console.log` expectation).
        *   `_executeBackendCodeTool(code, datasetId, userId)`: Calls the `codeExecution.service.js -> executeSandboxedCode`. Handles the returned data or error. **Crucially, summarize large data results before adding to `turnContext` to avoid exceeding LLM context limits.**
    *   Update `toolDispatcher` to route to these new functions.
*   **LLM Prompting (`features/chat/system-prompt-template.js` & `prompt.service.js`):**
    *   **System Prompt:** Add `generate_data_extraction_code` and `execute_backend_code` to the tool descriptions. Explain their purpose and arguments clearly.
    *   **Reasoning Prompt:** Guide the LLM on how to use these tools sequentially (generate code -> execute code -> analyze result).
    *   **Code Generation Prompt (`prompt.service.js -> getLLMCodeGenerationResponse`):** Create a specific prompt template focused *only* on generating data processing Node.js code for the `vm` sandbox.
        *   **Crucially Instruct:** Tell the LLM it is running in a **highly restricted environment**. It **cannot** use `require` or access filesystem/network. It only has access to standard JavaScript built-ins and the provided `datasetContent` variable.
        *   Specify the exact method for returning data (e.g., "Call `sendResult(yourJsonObject)` with the final JSON result" or "Output the final result using `console.log(JSON.stringify(yourJsonObject))`").
*   **Dataset Service (`features/datasets/dataset.service.js`):**
    *   Ensure a function exists to securely provide the raw content (as a string or buffer) of a dataset given its ID and user permission check.

**4.2. Frontend Implementation (`frontend/src`)**

*   **UI Components (`features/dashboard/components/ChatInterface.jsx`, `Message.jsx`):**
    *   Add user-friendly status messages for the new tool states: "Generating data extraction code...", "Analyzing data from '{datasetName}'...".

## 5. Phase 3: Frontend Visualization & Reporting

**Goal:** Allow the agent to generate React code for visualization when appropriate and integrate it with the existing `report_display` feature.

**5.1. Backend Implementation (`backend/src`)**

*   **Agent Service (`features/chat/agent.service.js`):**
    *   Add new Tool implementation function:
        *   `_generateReportCodeTool(analysisSummary, dataJson)`: Calls `prompt.service.js -> getLLMReportGenerationResponse` to generate React component code based on the agent's summary and the processed data.
    *   **Modify `_answerUserTool(textResponse, reactReportCode = null)`:** Update the function to accept an optional `reactReportCode`.
    *   Update `toolDispatcher`.
*   **LLM Prompting (`features/chat/system-prompt-template.js` & `prompt.service.js`):**
    *   **System Prompt:** Add `generate_report_code` to the tool descriptions.
    *   **Reasoning Prompt:** Guide the LLM on deciding *when* a visual report is more effective than text alone. Instruct it to use `generate_report_code` *before* calling `answer_user` if a report is needed.
    *   **Report Generation Prompt (`prompt.service.js -> getLLMReportGenerationResponse`):** Create a specific prompt template for generating React code.
        *   Instruct it to use available libraries (React, Recharts, Tailwind classes used in the project).
        *   Provide the analysis summary and the structured JSON data (`dataJson`) as input.
        *   Specify the expected output: a single, self-contained React functional component code string.
*   **Task Handler (`features/chat/chat.taskHandler.js`):**
    *   When handling the final result from `runAgentLoop`, check if the `_answerUserTool` included `reactReportCode`. If so, save this code to the `aiGeneratedCode` field of the `PromptHistory` record being updated.
*   **Models (`features/chat/prompt.model.js`):**
    *   Confirm `aiGeneratedCode` field exists and can store the potentially larger React code string.

**5.2. Frontend Implementation (`frontend/src`)**

*   **UI Components (`features/dashboard/components/ChatInterface.jsx`, `Message.jsx`):**
    *   When the `chat:message:completed` event updates a message, check if the final `PromptHistory` object now contains `aiGeneratedCode`.
    *   If `aiGeneratedCode` exists, display a "View Report" button alongside the `aiResponseText`.
    *   Clicking "View Report" should open a modal containing the `ReportViewer` component (from `features/report_display`), passing the `aiGeneratedCode` and potentially `reportDatasets` (if fetched and included in the final AI message payload) as props.
*   **Report Display (`features/report_display/components/ReportViewer.jsx`):**
    *   No major changes anticipated, assuming it already accepts `code` (string) and `datasets` (object/array) props and uses the iframe sandboxing mechanism. Ensure it handles the data format provided by the agent.

## 6. Phase 4: Refinement & Advanced Capabilities

*   **Goal:** Enhance robustness, intelligence, and user experience. Address technical debt introduced for speed.
*   **Areas:**
    *   **Error Handling:** Implement more sophisticated error recovery in the agent loop (e.g., retry tool, ask user for clarification if code fails).
    *   **Prompt Engineering:** Iteratively refine all prompts based on testing and user feedback. Use techniques like few-shot examples.
    *   **Context Management:** Improve summarization of chat history and tool results to stay within LLM limits.
    *   **Advanced Tools:** Add more complex analysis tools, external API integrations (e.g., financial data APIs).
    *   **Security Hardening (Deferred from Phase 2):** **CRITICAL POST-MVP TASK:** Replace the `vm`-based code execution with a genuinely secure sandboxing solution (e.g., Docker containers, gVisor, Firecracker, or a well-maintained third-party library specifically designed for untrusted code execution). This is essential before any broader rollout.
    *   **Cost/Performance Monitoring:** Track token usage and execution times.
    *   **User Feedback:** Implement mechanisms for users to rate agent responses.

## 7. Tool Definitions Summary

| Tool Name                       | Description                                                                                                | Arguments                                                                 | Output (JSON)                                                                                             | Phase |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------- | :---- |
| `list_datasets`                 | Lists available datasets (IDs, names, descriptions) accessible to the user/team.                             | None                                                                      | `{ "datasets": [{ "id": "...", "name": "...", "description": "..." }, ...] }`                              | 1     |
| `get_dataset_schema`            | Gets detailed schema (column names, types) and column descriptions for a specific dataset ID.                | `dataset_id`: string                                                      | `{ "schema": [{ "name": "...", "type": "..." }, ...], "columnDescriptions": {"colA": "desc", ...} }`     | 1     |
| `generate_data_extraction_code` | Generates backend-executable code (e.g., Node.js) to extract specific data from a dataset.                   | `dataset_id`: string, `columns_needed`: string[], `filters`: object, `analysis_goal`: string | `{ "code": "..." }`                                                                                       | 2     |
| `execute_backend_code`          | Executes the provided backend code in a secure sandbox with access to the specified dataset's content.       | `code`: string, `dataset_id`: string                                      | `{ "result": <JSON_output_from_code> }` or `{ "error": "..." }`                                           | 2     |
| `generate_report_code`          | Generates React component code for visualizing analysis results using provided data.                       | `analysis_summary`: string, `data_json`: object                           | `{ "react_code": "..." }`                                                                                 | 3     |
| `answer_user`                   | Provides the final textual answer to the user, optionally including generated React code for a report.       | `text_response`: string, `react_report_code?`: string (optional)          | Signals loop end. Data passed internally to update PromptHistory.                                         | 1 (modified in 3) |

## 8. WebSocket Events Summary

| Event Name              | Payload                                          | Description                                                        | Emitter            | Phase |
| :---------------------- | :----------------------------------------------- | :----------------------------------------------------------------- | :----------------- | :---- |
| `agent:thinking`        | `{ messageId: string, sessionId: string }`       | Agent loop started, LLM is reasoning/planning.                     | `agent.service.js` | 1     |
| `agent:using_tool`      | `{ messageId: string, sessionId: string, toolName: string, args: object }` | Agent is about to execute a specific tool.                 | `agent.service.js` | 1     |
| `agent:tool_result`     | `{ messageId: string, sessionId: string, toolName: string, resultSummary: string }` | Agent received a result/error from a tool (summary only). | `agent.service.js` | 1     |
| `agent:error`           | `{ messageId: string, sessionId: string, error: string }` | An error occurred during the agent loop.                       | `agent.service.js` | 1     |
| `chat:message:completed`| `{ message: PromptHistory }`                     | Final AI message (potentially including report code) is ready.     | `chat.taskHandler.js` | (Existing, payload updated) |
| `chat:message:error`    | `{ messageId: string, sessionId: string, error: string }` | Final processing failed for the AI message.                  | `chat.taskHandler.js` | (Existing) |

## 9. Security Considerations

*   **Backend Code Execution (`execute_backend_code`) is the HIGHEST RISK area.**
    *   **The chosen approach for Phase 2 uses Node.js's built-in `vm` module for speed of implementation.** This module is **NOT a true security sandbox** and is vulnerable if the context is not meticulously controlled.
    *   **Strict adherence to the implementation details in Phase 2 (minimal context, no `require`/`process`/globals, strict timeouts) is mandatory** to mitigate immediate risks during initial development.
    *   **Treat any code generated by the LLM as potentially malicious.**
    *   **Deferral of Proper Sandboxing:** Recognize that using `vm` is a temporary measure. **Implementing a robust sandboxing mechanism (as outlined in Phase 4 - Security Hardening) is a non-negotiable requirement before considering this feature production-ready or exposing it widely.**
    *   Log all code execution attempts, inputs, outputs, successes, and failures diligently.
*   **Prompt Injection:** While context isolation in `vm` is the main focus, remain vigilant about potential prompt injection affecting LLM instructions or generated code. Sanitize inputs where feasible.
*   **Data Access:** Ensure all tool implementations rigorously enforce user/team permissions before accessing datasets or schemas (`dataset.service.js` must handle this).

This plan provides a detailed roadmap. Each step, especially involving security or LLM interaction, will require careful design, implementation, and thorough testing.

## 10. Implementation Status & Next Steps (As of Current Date)

**Progress Summary:**

*   **Phase 1 (Agent Foundation & Data Awareness): COMPLETE**
    *   Backend agent orchestration loop (`agent.service.js`) established.
    *   Basic data awareness tools (`list_datasets`, `get_dataset_schema`) implemented.
    *   Agent-specific system prompts created.
    *   Task handler (`chat.taskHandler.js`) refactored to use the agent service.
    *   Agent status WebSocket events (`agent:thinking`, `agent:using_tool`, etc.) implemented.
    *   Frontend `ChatContext` and `MessageBubble` updated to listen for and display agent statuses.
*   **Phase 2 (Internal Data Extraction & Processing): COMPLETE**
    *   Code execution service (`codeExecution.service.js`) created using Node.js `vm` (with noted security caveats).
    *   Dataset service updated to provide raw content (`getRawDatasetContent`).
    *   Agent service enhanced with `generate_data_extraction_code` and `execute_backend_code` tools.
    *   Prompt service updated with sandboxed code generation capability (`generateSandboxedCode`).
    *   System prompts updated to include instructions for code generation/execution tools.
    *   Frontend `MessageBubble` updated with status text/icons for new tools.
*   **Phase 3 (Frontend Visualization & Reporting): COMPLETE**
    *   Agent service enhanced with `generate_report_code` tool.
    *   Prompt service updated with report code generation capability (`generateReportCode`).
    *   System prompts updated to guide report generation.
    *   Frontend `ChatContext` updated to manage report modal state.
    *   Frontend `MessageBubble` updated to display "View Report" button conditionally.
    *   Frontend `ReportViewer` integrated into a modal launched from the chat interface.
*   **Phase 4 (Refinement & Advanced Capabilities): PARTIALLY IMPLEMENTED**
    *   **Error Handling:** Basic tool retry logic added to `agent.service.js`. Fallback responses for max iterations/unexpected errors implemented.
    *   **Context Management:** Basic history summarization logic added (`_prepareChatHistory` calling `promptService.summarizeChatHistory`) when history length exceeds a threshold.

**Immediate Next Steps / Priorities:**

1.  **Security Hardening (CRITICAL):**
    *   **Replace `vm` Sandbox:** Design and implement a truly secure sandboxing solution for `execute_backend_code`. Options include:
        *   **Docker Containers:** Spin up ephemeral Docker containers to execute the code. Provides strong isolation but higher overhead.
        *   **MicroVMs (Firecracker):** Lighter weight than full VMs, good isolation. More complex setup.
        *   **gVisor:** Application kernel providing container isolation without full virtualization.
        *   **Third-Party Libraries:** Evaluate maintained libraries specifically designed for untrusted code execution (e.g., `isolated-vm` - investigate its current status and security posture).
    *   **Resource Limiting:** Ensure the chosen solution enforces strict limits on CPU time, memory usage, and network access.
2.  **Testing & Prompt Engineering:**
    *   Conduct thorough testing of the agent's reasoning, tool usage, code generation, and error handling across various scenarios and datasets.
    *   Iteratively refine all system prompts (`agent reasoning`, `sandboxed code gen`, `report code gen`, `summarization`) based on observed performance, failures, and desired output quality. Use few-shot examples where helpful.
3.  **Advanced Context Management:**
    *   Implement more sophisticated history summarization, potentially using a dedicated LLM call or more intelligent context window management techniques.
    *   Improve summarization of tool results, especially for large data returned from code execution.

**Future Refinements (Post-Security Hardening):**

*   **Advanced Error Recovery:** Enable the agent LLM to analyze tool errors and potentially retry with modified arguments or ask the user for clarification.
*   **Advanced Tools:** Implement integrations with external financial data APIs or add more complex built-in analysis functions as tools.
*   **Cost/Performance Monitoring:** Implement tracking for LLM token usage per turn/session and tool execution times.
*   **User Feedback Mechanism:** Add UI elements for users to rate agent responses (thumbs up/down) and provide qualitative feedback to inform prompt tuning and identify issues.
*   **UI/UX Polish:** Refine the display of agent statuses, error messages, and report viewing experience based on user testing.
