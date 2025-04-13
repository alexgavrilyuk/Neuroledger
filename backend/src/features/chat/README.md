# Chat Feature (Agent Architecture)

This feature implements persistent, contextual chat history powered by an AI agent capable of reasoning, summarizing conversations, using tools to access data context, executing generated code for analysis, and generating React code for report visualization.

## Overview

The chat feature allows users to:
- Create and manage chat sessions
- Send messages with dataset context
- Receive AI-generated responses orchestrated by the agent
- Observe agent status (thinking, using tools, generating code, executing code, generating report) via WebSockets
- Leverage the agent's ability to:
  - Access dataset context through tools
  - Parse CSV data
  - Generate and execute sandboxed Node.js code for data extraction and analysis
  - Generate React component code for visualizing analysis results
- View generated reports in a modal
- View past conversations

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
  updatedAt: Date // Used as lastActivityAt
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
  promptText: String?, // Required if messageType is 'user'
  selectedDatasetIds: [ObjectId], // Datasets used for this message context
  messageType: enum('user', 'ai_report', 'ai_error', 'system'),
  aiResponseText: String?, // Final text summary
  aiGeneratedCode: String?, // Stores generated React code for visualization
  reportAnalysisData: Mixed?, // Stores processed analysis results for report rendering
  reportDatasets: [{ // Deprecated but still available
    name: String,
    content: String,
    error: String
  }],
  status: enum('pending', 'processing', 'generating_code', 'fetching_data', 
              'execution_pending', 'executing_code', 'completed', 
              'error_generating', 'error_fetching_data', 'error_executing', 'error'),
  errorMessage: String?,
  agentSteps: [ 
    {
      tool: String,
      args: Object,
      resultSummary: String,
      attempt: Number, // Tracking retries
      isForced: Boolean // Whether step was forced by system logic
    }
  ],
  createdAt: Date
}
```

## Key Components

### API Endpoints (`chat.routes.js`)

* **Chat Session Management:**
  * `POST /chats` - Create new chat session
  * `GET /chats` - List user's chat sessions
  * `GET /chats/:sessionId` - Get session details
  * `PATCH /chats/:sessionId` - Update session (title)
  * `DELETE /chats/:sessionId` - Delete session and messages

* **Chat Messages:**
  * `POST /chats/:sessionId/messages` - Send user message, queue agent task
  * `GET /chats/:sessionId/messages` - List messages (user and final AI responses)
  * `GET /chats/:sessionId/messages/:messageId` - Get specific message

* **Prompt Generation:**
  * `POST /prompts` - Simple code generation (may be deprecated)

* **Asynchronous Processing:**
  * `POST /internal/chat-ai-worker` - Internal endpoint for Cloud Tasks worker, triggers the Agent Orchestrator

### Controllers

* `chat.controller.js`:
  * `createSession`, `getSessions`, `getSession`, `updateSession`, `deleteSession` - Basic session CRUD
  * `sendMessage` - Creates user message, queues agent task
  * `getMessages`, `getMessage` - Retrieves message history
  * `handleWorkerRequest` - Receives Cloud Tasks webhook, delegates to taskHandler

* `prompt.controller.js`:
  * `generatePrompt` - Simple code generation endpoint

### Services

* `chat.service.js`:
  * Core business logic for chat sessions (CRUD)
  * `addMessage` - Creates user message, AI placeholder, queues Cloud Task
  * `getChatMessages` - Fetches messages with proper selection of aiGeneratedCode

* `agent.service.js`:
  * Core of the agent architecture - `AgentOrchestrator` class
  * `runAgentLoop` - Manages the Reason → Act → Observe loop
  * `_prepareChatHistory` - Fetches and potentially summarizes history
  * `_emitAgentStatus` - Sends WebSocket events for frontend status updates
  * `toolDispatcher` - Routes tool calls to implementations
  * Tool implementations:
    * `_listDatasetsTool` - Lists available datasets
    * `_getDatasetSchemaTool` - Gets schema for a dataset
    * `_parseCsvDataTool` - Parses CSV data from a dataset
    * `_generateDataExtractionCodeTool` - Generates parser code
    * `_executeBackendCodeTool` - Executes parser code on dataset
    * `_generateAnalysisCodeTool` - Generates analysis code
    * `_executeAnalysisCodeTool` - Executes analysis code on parsed data
    * `_generateReportCodeTool` - Generates React code for visualization
    * `_answerUserTool` - Formats final text response

* `prompt.service.js`:
  * `getLLMReasoningResponse` - Calls LLM with context for agent reasoning
  * `assembleContext` - Gathers user/team context
  * `generateSandboxedCode` - Generates Node.js code for data extraction/analysis
  * `generateReportCode` - Generates React code for visualization
  * `summarizeChatHistory` - Condenses long conversation histories

* `chat.taskHandler.js`:
  * `workerHandler` - Receives Cloud Tasks webhook
  * Instantiates `AgentOrchestrator` with context
  * Handles final WebSocket event emission

### System Prompt Template (`system-prompt-template.js`)
* Exports `generateAgentSystemPrompt`
* Structures detailed instructions to Claude about:
  * Agent loop (Reason, Act, Observe)
  * Available tools and their usage
  * Formatting of tool calls and results
  * Current turn context and progress
  * Analysis result formatting
  * Error handling guidelines

## Workflow

1. **Session Initialization:**
   * User creates/selects chat session (`POST /chats` or frontend UI)
   * Session stored in `ChatSession` collection

2. **Message Submission:**
   * User sends message (`POST /chats/:sessionId/messages`)
   * `chat.controller.sendMessage` calls `chat.service.addMessage`
   * User message saved in `PromptHistory` (status='completed')
   * AI placeholder created in `PromptHistory` (status='processing')
   * If first message, selectedDatasetIds associated with session
   * Cloud Task queued targeting `/internal/chat-ai-worker`

3. **Asynchronous Processing:**
   * Cloud Task triggers `chat.controller.handleWorkerRequest`
   * Controller delegates to `chat.taskHandler.workerHandler`
   * TaskHandler initializes `AgentOrchestrator` with context

4. **Agent Loop:**
   * Agent emits `agent:thinking` WebSocket event
   * Agent prepares context (including history summarization if needed)
   * Agent enters loop of:
     * Call LLM for reasoning/next action
     * Parse LLM response for tool calls
     * Execute tools as needed
     * Emit status via WebSocket events
     * Continue until final answer or max iterations

5. **Tool Execution Flow:**
   * **Data Context:** `list_datasets` → `get_dataset_schema`
   * **Data Extraction:** `parse_csv_data` OR `generate_data_extraction_code` → `execute_backend_code`
   * **Analysis:** `generate_analysis_code` → `execute_analysis_code`
   * **Visualization:** `generate_report_code` (If user requested visualization)
   * **Final Answer:** `_answerUserTool`

6. **Response Completion:**
   * Agent updates `PromptHistory` record with final response
   * TaskHandler emits `chat:message:completed` or `chat:message:error`
   * Frontend receives events and updates UI

7. **Report Viewing:**
   * If `aiGeneratedCode` present, frontend shows "View Report" button
   * User clicks button → Frontend displays report in modal using sandboxed iframe

## WebSocket Events

The agent and task handler emit events to `user:{userId}` room:

* **`agent:thinking`**
  * Emitted when agent starts processing
  * Payload: `{ messageId, sessionId }`

* **`agent:using_tool`**
  * Emitted before tool execution
  * Payload: `{ messageId, sessionId, toolName, args }`

* **`agent:tool_result`**
  * Emitted after tool execution
  * Payload: `{ messageId, sessionId, toolName, resultSummary }`

* **`agent:error`**
  * Emitted on agent error
  * Payload: `{ messageId, sessionId, error }`

* **`chat:message:completed`**
  * Emitted when processing completes successfully
  * Payload: `{ message: PromptHistory, sessionId }`

* **`chat:message:error`**
  * Emitted on final error
  * Payload: `{ messageId, sessionId, error }`

## Advanced Features

### History Summarization
When chat history exceeds `HISTORY_SUMMARIZATION_THRESHOLD` (10 messages), the agent uses the LLM to create a concise summary of previous messages to maintain context while reducing token usage.

### Tool Retry Logic
The agent implements retry logic for tool failures, attempting to recover from transient errors up to `MAX_TOOL_RETRIES` (1) times before failing.

### Multi-Step Analysis Pipeline
The agent orchestrates a multi-step analysis pipeline:
1. Dataset parsing (extract CSV data)
2. Analysis code generation (create code to analyze parsed data)
3. Analysis execution (run code on parsed data)
4. Report code generation (create visualization of analysis results)

### Context Preservation
Previous analysis results and generated code can be referenced in subsequent turns, enabling modifications to reports without re-running analysis.

## Dependencies

* `cloudTasks.service.js` - Async task queueing
* `socket.js` - Real-time agent status updates
* Claude API - LLM reasoning/code generation
* `dataset.service.js` - Dataset access
* `codeExecution.service.js` - Sandboxed code execution

## Security Considerations

* Standard API auth and subscription checks for all endpoints
* `internal/chat-ai-worker` endpoint protected by Cloud Tasks OIDC token validation
* Code execution runs in Node.js `vm` module with strict context control
  * Limited execution time (timeout)
  * Restricted context (only essential objects)
  * No filesystem/network access
* Prompt injection risks mitigated through careful system prompt design
* Report rendering in frontend uses sandboxed iframe

## Error Handling

* Tool execution errors handled with potential retry
* Maximum iterations safeguard prevents infinite loops
* WebSocket events provide real-time error feedback
* Graceful fallbacks for agent failure scenarios

## Future Enhancements

* Enhanced context management for even longer conversations
* More sophisticated code execution sandboxing
* Improved error recovery strategies
* Support for more data formats beyond CSV
* Multi-dataset analysis in a single query 