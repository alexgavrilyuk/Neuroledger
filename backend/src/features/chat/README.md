# Chat Feature (Agent Architecture)

This feature implements persistent, contextual chat history powered by an AI agent capable of reasoning, summarizing conversations, using tools to access data context, executing generated code for analysis, and generating React code for report visualization.

## Overview

The chat feature allows users to:
- Create and manage chat sessions
- Send messages with dataset context
- Receive AI-generated responses orchestrated by the agent
- Stream AI responses in real-time with Server-Sent Events (SSE)
- Observe agent status (thinking, using tools, generating code, executing code, generating report)
- Leverage the agent's ability to:
  - Access dataset context through tools
  - Parse CSV data
  - Generate and execute sandboxed Node.js code for data extraction and analysis
  - Generate React component code for visualizing analysis results
- View generated reports in a modal
- View past conversations with history summaries for context preservation

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
Stores messages, agent steps, intermediate fragments, and potentially generated React code.

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
  steps: [ // Used to track the agent's actions
    {
      tool: String,
      args: Object,
      resultSummary: String,
      error: String?,
      attempt: Number // For tracking retries
    }
  ],
  messageFragments: [ // Used to store interleaved text/step fragments for display
    { type: 'text', content: String } | { type: 'step', tool: String, resultSummary: String, error: String?, status: String }
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
  * `GET /chats/:sessionId/stream` - Stream chat responses in real-time using Server-Sent Events (SSE)
  * `GET /chats/:sessionId/messages` - List messages (user and final AI responses)
  * `GET /chats/:sessionId/messages/:messageId` - Get specific message

* **Prompt Generation:**
  * `POST /prompts` - Standalone code generation (may be deprecated)

* **Asynchronous Processing:**
  * `POST /internal/chat-ai-worker` - Internal endpoint for Cloud Tasks worker, triggers the Agent Executor

### Controllers

* `chat.controller.js`:
  * `createSession`, `getSessions`, `getSession`, `updateSession`, `deleteSession` - Basic session CRUD
  * `sendMessage` - Creates user message, queues agent task
  * `streamMessage` - Handles streaming chat responses via SSE
  * `getMessages`, `getMessage` - Retrieves message history
  * `handleWorkerRequest` - Receives Cloud Tasks webhook, delegates to taskHandler

* `prompt.controller.js`:
  * `generateAndExecuteReport` - Simple code generation endpoint

### Services

* `chat.service.js`:
  * Core business logic for chat sessions (CRUD)
  * `addMessage` - Creates user message, AI placeholder, queues Cloud Task
  * `getChatMessages` - Fetches messages with proper selection of aiGeneratedCode
  * `handleStreamingChatRequest` - Handles streaming chat responses via SSE
  * `sendStreamEvent` - Helper to send SSE events

* `agent.service.js`:
  * `runAgent` - Main exported function that orchestrates AI agent processing
  * `AgentExecutor` class - Core implementation of the agent reasoning loop
    * `runAgentLoopWithStreaming` - Manages the Reason → Act → Observe loop with streaming
    * `_prepareLLMContextForStream` - Prepares context for LLM calls
    * `_parseCompleteLLMResponse` - Extracts tool calls or final answers from LLM responses
    * `_executeTool` - Dynamically loads and executes tool implementations
    * `_storeIntermediateResult` - Manages temporary data between agent steps
    * `_updatePromptHistoryRecord` - Updates database with results
    * `_emitAgentStatus`, `_sendStreamEvent` - Sends events for frontend status updates

* `agent.utils.js`:
  * `summarizeToolResult` - Generates readable summaries from tool results
  * `parseLLMResponse` - Extracts tool calls from raw LLM output
  * `formatToolResultForLLM` - Formats results for inclusion in next LLM context

* `agentContext.service.js`:
  * `getInitialUserTeamContext` - Fetches user/team settings
  * `preloadDatasetContext` - Pre-fetches dataset schemas and samples
  * `prepareChatHistoryAndArtifacts` - Fetches previous conversations and artifacts

* `prompt.service.js`:
  * `getLLMReasoningResponse` - Calls LLM with context for agent reasoning
  * `streamLLMReasoningResponse` - Streaming version that yields chunks as they arrive
  * `assembleContext` - Gathers user/team context
  * `generateAnalysisCode` - Generates Node.js code for data analysis
  * `generateReportCode` - Generates React code for visualization
  * `getUserModelPreference` - Selects LLM provider (Claude, Gemini, OpenAI) based on user preference

* `chat.taskHandler.js`:
  * `workerHandler` - Receives Cloud Tasks webhook
  * Initializes agent with context
  * Handles final WebSocket event emission

### Tool System

The agent uses a modular tool system defined in the `tools/` directory:

* `tool.definitions.js` - Declares available tools and their interfaces
* Individual tool implementations:
  * `list_datasets.js` - Lists available datasets
  * `get_dataset_schema.js` - Gets schema for a dataset
  * `parse_csv_data.js` - Parses CSV data from a dataset
  * `generate_analysis_code.js` - Generates Node.js analysis code
  * `execute_analysis_code.js` - Executes analysis code on parsed data
  * `generate_report_code.js` - Generates React component code
  * `answer_user.js` - Signals final text response

Tools are dynamically loaded in `agent.service.js` and executed based on the LLM's reasoning.

### System Prompt Template (`system-prompt-template.js`)
* Exports `generateAgentSystemPrompt`
* Structures detailed instructions to the LLM about:
  * Agent loop (Reason, Act, Observe)
  * Available tools and their usage
  * Formatting of tool calls and results
  * Current turn context and progress
  * Analysis result formatting
  * Error handling guidelines

## Workflows

### Standard Message Flow

1. **Session Initialization:**
   * User creates/selects chat session
   * Session stored in `ChatSession` collection

2. **Message Submission:**
   * Frontend submits via `POST /chats/:sessionId/messages`
   * User message saved in `PromptHistory` (status='completed')
   * AI placeholder created in `PromptHistory` (status='processing')
   * If first message, selectedDatasetIds associated with session
   * Cloud Task queued targeting `/internal/chat-ai-worker`

3. **Asynchronous Processing:**
   * Cloud Task triggers `chat.controller.handleWorkerRequest`
   * Controller delegates to `chat.taskHandler.workerHandler`
   * TaskHandler initializes AgentExecutor with context

4. **Agent Loop:**
   * Agent emits `agent:thinking` WebSocket event
   * Agent prepares context (via `agentContext.service.js`)
   * Agent enters loop of:
     * Call `prompt.service.getLLMReasoningResponse` for next action
     * Parse LLM response for tool calls
     * Execute tools as needed
     * Emit status via WebSocket events
     * Continue until final answer or max iterations

5. **Response Completion:**
   * Agent updates `PromptHistory` record with final response
   * TaskHandler emits `chat:message:completed` or `chat:message:error`
   * Frontend receives events and updates UI

### Streaming Message Flow

1. **Session Initialization:**
   * Same as Standard Flow

2. **Message Submission:**
   * Frontend connects to `GET /chats/:sessionId/stream?promptText=...`
   * User message saved in `PromptHistory` (status='completed')
   * AI placeholder created in `PromptHistory` (status='processing')
   * If first message, selectedDatasetIds associated with session
   * SSE connection remains open

3. **Streaming Processing:**
   * `streamMessage` controller calls `handleStreamingChatRequest`
   * Service initializes `runAgent` with streaming callback
   * Agent loop starts and sends streaming events

4. **Event Streaming:**
   * Backend streams events in real-time via SSE:
     * `user_message_created` - Confirms user message creation
     * `ai_message_created` - Provides AI message placeholder ID
     * `token` - Contains a chunk of generated text
     * `agent:thinking` - Indicates reasoning in progress
     * `agent:using_tool` - Shows tool execution with details
     * `agent:tool_result` - Returns tool execution results
     * `agent:final_answer` - Provides final text and results

5. **Response Completion:**
   * Agent updates `PromptHistory` record with final state
   * Agent sends final `end` event and closes the SSE connection
   * Frontend has already been incrementally updating the UI

### Tool Execution Flow

The agent orchestrates a multi-step pipeline:

1. **Dataset Context:**
   * Uses `list_datasets` to discover available datasets
   * Uses `get_dataset_schema` to understand data structure

2. **Data Parsing:**
   * Uses `parse_csv_data` to convert CSV content to structured data
   * Stores parsed data in intermediate context

3. **Analysis:**
   * Uses `generate_analysis_code` to create code for data analysis
   * Uses `execute_analysis_code` to run code on parsed data
   * Stores analysis results in intermediate context

4. **Visualization:**
   * Uses `generate_report_code` to create React components
   * Stores generated code in `PromptHistory.aiGeneratedCode`

5. **Final Response:**
   * Uses `_answerUserTool` to provide final text response
   * Update `PromptHistory` record with complete status
   * Frontend handles displaying both text and report visualization

## Event Streams

### Server-Sent Events (SSE)

The streaming endpoint emits events to the client via SSE:

* **`start`**
  * Initial event when streaming begins

* **`user_message_created`**
  * Confirms user message has been saved
  * Payload: `{ messageId: string, status: 'completed' }`

* **`ai_message_created`**
  * Provides the AI message placeholder ID
  * Payload: `{ messageId: string, status: 'processing' }`

* **`token`**
  * Contains a chunk of generated text being streamed
  * Payload: `{ content: string }`

* **`agent:thinking`**
  * Indicates the agent is thinking/reasoning
  * Payload: `{ messageId: string, sessionId: string }`

* **`agent:using_tool`**
  * Indicates a tool is being called
  * Payload: `{ messageId: string, sessionId: string, toolName: string, args: object }`

* **`agent:tool_result`**
  * Provides the result or error from a tool call
  * Payload: `{ messageId: string, sessionId: string, toolName: string, resultSummary: string, error?: string }`

* **`agent:final_answer`**
  * Provides the final answer text and any generated code
  * Payload: `{ messageId: string, sessionId: string, text: string, aiGeneratedCode?: string, analysisResult?: object }`

* **`agent:error`**
  * Indicates an error during agent processing
  * Payload: `{ messageId: string, sessionId: string, error: string }`

* **`error`**
  * Contains error information for stream-level errors
  * Payload: `{ message: string }`

* **`end`**
  * Final event before the connection closes
  * Payload: `{ status: 'completed'|'error' }`

### WebSocket Events

For backward compatibility, the agent also emits events to the WebSocket room `user:{userId}`:

* **`chat:message:completed`**
  * Emitted when processing completes successfully
  * Payload: `{ message: PromptHistory, sessionId: string }`

* **`chat:message:error`**
  * Emitted on final error
  * Payload: `{ messageId: string, sessionId: string, error: string }`

## Advanced Features

### Multi-Provider LLM Support

The agent supports multiple LLM providers:
- Claude (Anthropic)
- Gemini (Google)
- OpenAI

User preferences are stored in `User.settings.preferredAiModel` and retrieved via `getUserModelPreference()`.

### History Summarization

When chat history exceeds a threshold, the agent uses the LLM to create a concise summary of previous messages, maintaining context while reducing token usage.

### Dynamic Tool Loading

Tools are implemented as separate module files in the `tools/` directory and dynamically loaded at runtime by the `AgentExecutor`. This allows for easy extension of the agent's capabilities.

### Tool Retry Logic

The agent implements retry logic for tool failures:
- Tracks `toolErrorCounts` for each turn
- Attempts to recover from transient errors up to `MAX_TOOL_RETRIES` times
- Falls back gracefully if retries are exhausted

### Context & Artifact Preservation

Previous analysis results and generated code are preserved between turns:
- `agentContext.service.js` fetches previous results via `prepareChatHistoryAndArtifacts()`
- This allows the agent to reference or modify previous work without re-running analysis
- Frontend can display report visualizations for any message with `aiGeneratedCode`

### Message Fragments

The agent now stores detailed message fragments for UI rendering:
- `messageFragments` array in `PromptHistory` model
- Contains interleaved `text` and `step` fragments
- Allows for rich, conversational displays showing the agent's work

## Dependencies

* `cloudTasks.service.js` - Async task queueing
* `socket.js` - WebSocket for real-time updates
* Anthropic Claude API / Gemini API / OpenAI API - LLM reasoning/code generation
* `dataset.service.js` - Dataset access
* `codeExecution.service.js` - Sandboxed code execution

## Security Considerations

* Standard API auth and subscription checks
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
* SSE/WebSocket events provide real-time error feedback
* Graceful fallbacks for agent failure scenarios
* Comprehensive error logging at all stages