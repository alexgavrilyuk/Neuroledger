# Chat Feature (Agent Architecture - Phase 3 + Refinements)

This feature implements persistent, contextual chat history powered by an AI agent capable of reasoning, **summarizing conversations**, using tools to access data context, executing generated code for analysis, and **generating React code for report visualization**.

## Overview (Phase 3)

The chat feature allows users to:
- Create and manage chat sessions.
- Send messages.
- Receive AI-generated responses orchestrated by the agent.
- Observe agent status (thinking, using tools, generating/executing code, **generating report**) via WebSockets.
- Leverage the agent's ability to:
  - Access data context.
  - Generate and execute sandboxed Node.js code.
  - **Generate React component code for visualizing analysis results.**
- **View generated reports in a modal.**
- View past conversations.

## Models

### ChatSession
Represents a persistent conversation thread owned by a user or associated with a team.

```javascript
{
  userId: ObjectId, // References User
  teamId: ObjectId?, // Optional, references Team
  title: String,
  associatedDatasetIds: [ObjectId], // IDs of datasets associated with this session (set on first message)
  createdAt: Date,
  lastActivityAt: Date // Renamed from updatedAt for clarity
}
```

### PromptHistory
Stores messages, agent steps, and potentially generated React code.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  teamId: ObjectId?,
  chatSessionId: ObjectId,
  promptText: String?,
  messageType: enum('user', 'ai_report'),
  aiResponseText: String?, // Final text summary
  aiGeneratedCode: String?, // Stores generated React code for the report
  status: enum('processing', 'completed', 'error'),
  errorMessage: String?,
  agentSteps: [ 
    {
      tool: String, // Includes Phase 3 tool: 'generate_report_code'
      args: Object,
      resultSummary: String, // e.g., 'Generated React report code'
    }
  ],
  createdAt: Date
}
```

## Key Components (Agent Architecture)

### API Endpoints (`chat.routes.js`)

*   **Chat Session Management:** (No changes anticipated in Phase 3)
    *   `POST /chats`
    *   `GET /chats`
    *   `GET /chats/:sessionId`
    *   `PATCH /chats/:sessionId`
    *   `DELETE /chats/:sessionId`
*   **Chat Messages:** (No functional change to POST, GET remains similar)
    *   `POST /chats/:sessionId/messages` - Sends user message, queues agent task.
    *   `GET /chats/:sessionId/messages` - Lists messages (user and final AI responses).
    *   `GET /chats/:sessionId/messages/:messageId` - Get a specific message.
*   **Code Generation:**
    *   `POST /prompts` - (Likely deprecated or refactored later in favor of agent)
*   **Asynchronous Processing:**
    *   `POST /internal/chat-ai-worker` - Internal endpoint for Cloud Tasks worker, now triggers the Agent Orchestrator.

### Controllers (`chat.controller.js`, `prompt.controller.js`)
*   `chat.controller.js`: Handles HTTP requests for chat sessions and messages. `addMessage` initiates the agent task.
*   `prompt.controller.js`: (May become less relevant).

### Services
*   `chat.service.js`: Business logic for chat sessions (CRUD).
*   **`agent.service.js`:** Core of the agent architecture.
    *   Contains `AgentOrchestrator` class.
    *   `runAgentLoop`: Manages the Reason -> Act -> Observe loop.
    *   Calls `prompt.service.js` for LLM reasoning.
    *   Parses LLM responses (tool calls vs. final answers).
    *   `toolDispatcher`: Executes requested tools.
    *   Manages agent turn state (`turnContext`).
    *   Updates `PromptHistory` with final status, response, and `agentSteps`.
    *   Emits detailed `agent:*` WebSocket events for frontend status updates.
    *   **Includes implementations for Phase 1 tools (`_listDatasetsTool`, `_getDatasetSchemaTool`, `_answerUserTool`).**
    *   **Includes implementations for Phase 2 tools:**
        *   `_generateDataExtractionCodeTool`: Calls `promptService.generateSandboxedCode`.
        *   `_executeBackendCodeTool`: Calls `codeExecutionService.executeSandboxedCode`.
    *   **Added `_generateReportCodeTool`:** Calls `promptService.generateReportCode`.
    *   `_updatePromptHistoryRecord`: Now saves `aiGeneratedCode` if present.
    *   **`_prepareChatHistory`:** Fetches recent messages and **calls `promptService.summarizeChatHistory` if history is long.**
*   `prompt.service.js`: Refactored for agent support.
    *   `getLLMReasoningResponse`: Calls the LLM with context prepared by the agent, returns raw response.
    *   `assembleContext`: (Kept for potential context gathering).
    *   **Added `generateSandboxedCode`:** Uses a dedicated prompt template to generate Node.js code suitable for the restricted `vm` environment, instructing the AI on available context (`datasetContent`, `sendResult`) and limitations.
    *   **Added `generateReportCode`:** Uses a dedicated prompt template to generate React component code (using `React.createElement`) suitable for the `ReportViewer`.
    *   **Added `summarizeChatHistory`:** Uses an LLM call to generate a concise summary of provided chat messages.
*   **`codeExecution.service.js` (from `shared/services`):** Executes sandboxed code.
    *   `executeSandboxedCode`: Fetches dataset content (via `dataset.service.js`), prepares the minimal sandbox context, runs code using `vm`, captures results/errors, enforces timeout.
*   `dataset.service.js`: Added data fetching capability.
    *   Added `getRawDatasetContent`: Securely fetches raw dataset content string from GCS for the code execution service.

### System Prompt Template (`system-prompt-template.js`)
*   Exports `generateAgentSystemPrompt`.
*   Provides detailed instructions to the LLM about its role as a financial analyst agent.
*   Defines the agent loop (Reason, Act, Observe).
*   Describes available tools (Phase 1 & Phase 2) and the required JSON format for tool calls.
*   Includes conversation history summary, current turn steps, and user/team context.
*   **Includes usage instructions** for the new tools (`generate_data_extraction_code`, `execute_backend_code`, `generate_report_code`).
*   Emphasizes the need to use tools sequentially (generate then execute) and highlights sandbox restrictions.

### Task Handler (`chat.taskHandler.js`)
*   Refactored significantly from original non-agent implementation.
*   Handles Cloud Tasks worker requests (`POST /internal/chat-ai-worker`).
*   **Instantiates and calls `AgentOrchestrator.runAgentLoop()`**.
*   Fetches the final AI message state after the agent loop completes.
*   Emits the final `chat:message:completed` or `chat:message:error` WebSocket event based on the agent's result.
*   No longer handles intermediate status updates or data fetching directly.

## Workflow (Agent Architecture - Phase 3)

1.  User creates/selects a chat session.
2.  User sends a message (`POST /chats/:sessionId/messages`):
    *   User message saved (`PromptHistory`).
    *   If first message, `selectedDatasetIds` associated with `ChatSession`.
    *   AI response placeholder (`PromptHistory`) created (status='processing').
    *   Cloud Task queued (`/internal/chat-ai-worker` target) with payload (`userId`, `sessionId`, `aiMessageId`, `sessionDatasetIds` etc.).
3.  Cloud Task worker (`chat.taskHandler.js`) receives the request:
    *   Validates payload.
    *   Fetches user message text and session details.
    *   Instantiates `AgentOrchestrator(userId, teamId, sessionId, aiMessageId)`.
    *   Calls `agentOrchestrator.runAgentLoop(userMessageText)`. **Agent loop begins.**
4.  **Inside `runAgentLoop` (`agent.service.js`):**
    *   a. Emit `agent:thinking`.
    *   b. **Prepare LLM context (includes fetching and potentially summarizing history via `_prepareChatHistory`).**
    *   c. Call `prompt.service.getLLMReasoningResponse` -> LLM decides next action.
    *   d. Parse LLM response.
    *   e. **If Tool Call:**
        *   **`list_datasets` / `get_dataset_schema`:** (As in Phase 1) -> Emit events, execute, summarize, loop back to 4b.
        *   **`generate_data_extraction_code`:**
            *   Emit `agent:using_tool`.
            *   Execute `_generateDataExtractionCodeTool` (calls `promptService.generateSandboxedCode`).
            *   Receive result `{ code: "..." }` or error.
            *   Summarize result (e.g., "Generated code snippet").
            *   Update steps, emit `agent:tool_result`.
            *   Loop back to 4b.
        *   **`execute_backend_code`:**
            *   Emit `agent:using_tool`.
            *   Execute `_executeBackendCodeTool` (calls `codeExecutionService.executeSandboxedCode` with code and `datasetId`).
            *   `codeExecutionService` fetches data via `datasetService.getRawDatasetContent`.
            *   `codeExecutionService` runs code in `vm` sandbox.
            *   Receive result `{ result: ... }` or `{ error: ... }` from sandbox.
            *   Summarize result (may include actual data if small, or just success/error type).
            *   Update steps, emit `agent:tool_result`.
            *   Loop back to 4b.
        *   **`generate_report_code`:**
            *   Emit `agent:using_tool`.
            *   Execute `_generateReportCodeTool` (calls `promptService.generateReportCode` with analysis summary and data from previous step).
            *   Receive result `{ react_code: "..." }` or error.
            *   Store `react_code` in `turnContext.generatedReportCode`.
            *   Summarize result (e.g., "Generated React report code").
            *   Update steps, emit `agent:tool_result`.
            *   Loop back to 4b.
        *   **`_answerUserTool`:**
            *   Extract final `textResponse`.
            *   Break loop.
    *   f. **If Error / Max Iterations:** (As in Phase 1)
5.  **Agent loop finishes** (returns `{status: 'completed', aiResponseText: ...}` or `{status: 'error', error: ...}`).
6.  `chat.taskHandler.js` resumes:
    *   Fetches the final `PromptHistory` record (Agent service saved `aiResponseText` and `aiGeneratedCode` via `_updatePromptHistoryRecord`).
    *   If agent result was `completed`:
        *   Update `ChatSession.lastActivityAt`.
        *   Emit `chat:message:completed` with the final `PromptHistory` object (containing `aiGeneratedCode` if created).
    *   If agent result was `error`:
        *   Emit `chat:message:error` with `messageId`, `sessionId`, and `error` message.
7.  Frontend receives `agent:*` events during processing for status updates and the final `chat:message:completed`/`error` event to display the result.
8.  **If `chat:message:completed` payload contains `aiGeneratedCode`:**
    *   Frontend (`ChatMessage`/`MessageBubble`) displays a "View Report" button.
    *   User clicks button -> `ChatContext.openReportModal` called with code and datasets.
    *   `ReportViewerModal` displays, rendering the code via `ReportViewer`.

## Data Model Interaction

*   **Primary Models (Read/Write):**
    *   `PromptHistory` - Stores messages, final AI response, agent steps.
    *   `ChatSession` - Manages conversations, associated datasets.
*   **Supporting Models (Read-only within Agent/Tools):**
    *   `User` - For user settings context.
    *   `Dataset` - For listing datasets, getting schema via tools.
    *   `Team` - For team settings context.
    *   `TeamMember` - To determine team context/access.

## Dependencies

- `cloudTasks.service.js` - For async task queueing.
- `socket.js` - For real-time agent status and final message updates.
- Anthropic Claude API - For LLM reasoning steps.
- `dataset.service.js` - Used by agent tools.
- **`codeExecution.service.js`**

## Security

- Standard API auth, subscription checks remain.
- Agent tools must respect user/team permissions when accessing data (e.g., `dataset.service` calls must include `userId`).
- `internal/chat-ai-worker` endpoint protected by Cloud Tasks OIDC token validation.
- Prompt Injection remains a consideration for LLM interactions.
- **Code Execution (`execute_backend_code`)**: Uses Node.js `vm` which is **NOT a true sandbox**. Mitigation relies on strict context control, timeouts, and careful code generation prompts. Robust sandboxing is deferred to Phase 4.

## Phase 3 Scope
- Agent can generate React code for reports.
- Frontend displays a button to view generated reports.
- Report rendering uses existing sandboxed `ReportViewer` infrastructure.

## Phase 4 Refinements Implemented

- **Context Management:** Basic history summarization implemented using LLM call when history exceeds a threshold.
- **Error Handling:** Basic tool retry logic added. Fallback responses added for max iterations and unexpected loop end. 