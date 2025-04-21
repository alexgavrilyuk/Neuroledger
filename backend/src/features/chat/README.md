# Feature: Chat & AI Agent

**Last Updated:** April 17, 2025

This feature slice implements the core user-facing chat functionality, powered by a sophisticated AI agent architecture. It handles persistent chat sessions, message history, real-time streaming responses, and orchestrates complex AI interactions involving reasoning, tool usage, code generation, and sandboxed code execution for financial analysis.

## Overview

The chat feature allows users to engage in conversations with an AI assistant specialized in financial analysis. Users can associate datasets with a chat session, and the AI agent leverages this context, along with the conversation history, to answer questions, perform calculations, generate insights, and create visualizations.

Key capabilities include:

*   **Persistent Chat Sessions:** Conversations are stored and can be resumed later.
*   **Contextual Understanding:** The agent uses chat history (with summarization for long conversations) and selected dataset context (schemas, samples, descriptions).
*   **Real-time Streaming:** AI responses, including thought processes and tool usage steps, are streamed to the frontend via Server-Sent Events (SSE).
*   **Agent Orchestration:** A dedicated agent (`AgentRunner`) manages the interaction flow using a Reason-Act-Observe loop.
*   **Modular Tool System:** The agent utilizes a defined set of tools to interact with data, generate code, execute analysis, and format responses.
*   **Sandboxed Code Execution:** AI-generated analysis code runs within a restricted Node.js `vm` environment.
*   **Iterative Code Refinement:** The agent can attempt to automatically fix errors in generated analysis code.
*   **Report Generation:** The agent can generate React component code to visualize analysis results.
*   **User Clarification:** The agent can pause and ask the user for clarification if a request is ambiguous.
*   **Multi-Provider LLM Support:** Leverages the shared LLM provider factory (`shared/llm_providers/`) to interact with Claude, Gemini, or OpenAI based on user preference.

## Core Architecture & Flow

The chat feature employs an asynchronous, agent-driven architecture:

1.  **Request Initiation:**
    *   **Streaming:** Frontend connects to `GET /chats/:sessionId/stream` with the user's prompt and selected dataset IDs. `chat.controller.streamMessage` calls `chat.service.handleStreamingChatRequest`.
    *   **Non-Streaming (Legacy/Fallback):** Frontend sends `POST /chats/:sessionId/messages`. `chat.controller.sendMessage` calls `chat.service.addMessage`, which creates messages and queues a Cloud Task targeting `/internal/chat-ai-worker`.
2.  **Agent Invocation:**
    *   **Streaming:** `chat.service.handleStreamingChatRequest` directly calls `agent.service.runAgent`, providing an SSE callback function.
    *   **Non-Streaming:** Cloud Task triggers `chat.controller.handleWorkerRequest`, which delegates to `chat.taskHandler.workerHandler`. The task handler calls `agent.service.runAgent` (without an SSE callback).
3.  **Agent Execution (`agent.service.runAgent` & `AgentRunner`):**
    *   `AgentRunner` is instantiated.
    *   **Context Preparation:** `AgentContextService` fetches chat history (potentially summarizing it), dataset schemas/samples, user/team context, and previous turn artifacts.
    *   **Reason-Act Loop:** `AgentRunner` enters a loop (max iterations):
        *   **Reason:** Calls `LLMOrchestrator.getNextActionFromLLM`. This builds a detailed system prompt (via `SystemPromptBuilder`) including history, context, tools, and current steps, then calls the selected LLM provider (via `prompt.service.streamLLMReasoningResponse`). The LLM response includes `<thinking>` and `<user_explanation>` blocks, followed by a tool call JSON or final answer JSON.
        *   **Act:**
            *   If a tool call is requested, `AgentRunner` uses `ToolExecutor` to execute the appropriate tool function from the `tools/` directory. Tools interact with services (`dataset.service`, `prompt.service`, `codeExecution.service`). `BaseToolWrapper` validates arguments against `tool.schemas.js`.
            *   If `execute_analysis_code` fails, `AgentRunner` may inject a `generate_analysis_code` action with error context for refinement (Phase 8).
            *   If `ask_user_for_clarification` is called, the loop breaks, setting the status to `awaiting_user_input` (Phase 9).
            *   If `_answerUserTool` is called or the LLM provides final text, the loop breaks.
        *   **Observe:** The result (or error) from the tool execution is formatted (via `agent.utils.formatToolResultForLLM`) and stored as an observation in the `AgentStateManager`. This observation becomes part of the context for the *next* reasoning step.
    *   **Streaming Updates:** Throughout the loop, `AgentEventEmitter` uses the provided SSE callback (if any) to send real-time events (`agent:explanation`, `agent:using_tool`, `agent:tool_result`, `token`, etc.) to the frontend.
4.  **Completion:**
    *   `AgentRunner` finalizes the turn, updating the `PromptHistory` record in the database with the final status, steps, fragments, response text, generated code, analysis data, and errors.
    *   **Streaming:** The `end` event is sent via SSE.
    *   **Non-Streaming:** `chat.taskHandler` emits a final WebSocket event (`chat:message:completed` or `chat:message:error`).

## File Breakdown

### Core Chat Management

*   **`chat.controller.js`**: Handles HTTP requests for session CRUD, message sending (non-streaming), message retrieval, and the streaming endpoint (`/stream`). Also handles the internal Cloud Task worker endpoint (`/internal/chat-ai-worker`). Delegates logic to `chat.service.js` and `chat.taskHandler.js`.
*   **`chat.service.js`**: Implements business logic for chat sessions (CRUD), adding messages, fetching message history, and orchestrating the streaming response flow (`handleStreamingChatRequest`). Contains the `sendStreamEvent` helper for SSE.
*   **`chat.routes.js`**: Defines API routes for chat sessions and messages (public and internal worker endpoints). Applies `protect`, `requireActiveSubscription`, and `validateCloudTaskToken` middleware.
*   **`chat.taskHandler.js`**: Handles the payload from the Cloud Task queue for non-streaming requests. Validates the payload and invokes the agent service (`agent.service.runAgent`). Emits final WebSocket events upon agent completion/error.
*   **`chatSession.model.js`**: Mongoose schema definition for the `ChatSession` collection, storing session metadata and associated dataset IDs.
*   **`prompt.model.js`**: Mongoose schema definition for the `PromptHistory` collection. Stores individual user messages and AI responses within a session. Crucially includes fields for `messageType`, `status`, `aiGeneratedCode`, `reportAnalysisData`, `steps` (agent actions), and `messageFragments` (UI display).

### Agent Core (`agent/` subdirectory)

*   **`AgentRunner.js`**: The heart of the agent. Orchestrates the main Reason-Act loop, manages iterations, handles tool execution calls (including code refinement logic), interacts with the State Manager, Context Service, Tool Executor, and Event Emitter. Implements the core agent lifecycle for a single turn.
*   **`AgentStateManager.js`**: Manages the state (`turnContext`) for a single agent turn. Holds chat history, dataset context, intermediate tool results (like parsed data, generated code, analysis results), steps taken, UI message fragments, and the final outcome (answer or error). Provides methods to update and retrieve state.
*   **`ToolExecutor.js`**: Dynamically loads tool implementations from the `tools/` directory. Provides a unified `execute` method that invokes the appropriate wrapped tool function.
*   **`LLMOrchestrator.js`**: Responsible for interacting with the LLM provider (via `prompt.service`). Builds the final prompt using `SystemPromptBuilder`, handles the streaming API call, and parses the complete LLM response to extract thinking, user explanation, and the next action (tool call or final answer).
*   **`SystemPromptBuilder.js`**: Constructs the detailed system prompt sent to the LLM for reasoning. Assembles various context sections (introduction, instructions, warnings, history, current progress, artifacts, dataset info, tool definitions, examples, workflow guidance, error handling, etc.).
*   **`AgentEventEmitter.js`**: Centralizes the emission of agent status events (thinking, using tool, tool result, final answer, error, clarification needed) via the provided callback (typically for SSE streaming). Also passes through LLM token stream events.

### Agent Context & Prompting

*   **`agent.service.js`**: Exports the main `runAgent` function, which acts as the entry point to instantiate and run the `AgentRunner`.
*   **`agentContext.service.js`**: Fetches and prepares all necessary context for the agent run, including user/team settings, dataset schemas/samples, chat history (with summarization logic using `tiktoken` and `prompt.service.getHistorySummary`), and previous turn artifacts (analysis results, generated code).
*   **`prompt.service.js`**: Handles direct interactions with the LLM providers (via `ProviderFactory`). Provides functions for:
    *   `streamLLMReasoningResponse`: Streaming LLM calls for the agent loop.
    *   `generateAnalysisCode`: Generating sandboxed Node.js analysis code. Includes logic to incorporate error feedback (Phase 8).
    *   `generateReportCode`: Generating React report component code. Includes logic to incorporate optional arguments (Phase 10).
    *   `getHistorySummary`: Summarizing chat history using an LLM.
    *   `assembleContext`: Fetching user/team context strings.
    *   `getUserModelPreference`: Determining which LLM provider/model to use.
*   **`agent.utils.js`**: Contains helper functions:
    *   `summarizeToolResult`: Creates human-readable summaries of tool outputs for logging/steps.
    *   `formatToolResultForLLM`: Formats tool results (including errors and summaries) into a JSON string suitable for the LLM's "Observation" context.

### Tool System (`tools/` subdirectory)

*   **`tool.definitions.js`**: An array defining the `name`, `description`, and `output` format for each available tool. Used by `SystemPromptBuilder`.
*   **`tool.schemas.js`**: Defines JSON Schemas (using Ajv format) for the expected arguments (`args`) of each tool. Used for validation. Includes schemas for optional arguments added in later phases.
*   **`BaseToolWrapper.js`**: A higher-order function that wraps individual tool logic. It performs:
    *   Logging of tool calls.
    *   Argument validation against the corresponding schema in `tool.schemas.js` using Ajv.
    *   Merging of LLM-provided arguments and system-substituted arguments (like code).
    *   Standardized error handling and result formatting (including `errorCode`).
*   **Individual Tool Files (`*.js`)**: Each file implements the specific logic for a single tool (e.g., `list_datasets.js`, `parse_csv_data.js`, `generate_analysis_code.js`, `execute_analysis_code.js`, `generate_report_code.js`, `get_dataset_schema.js`, `calculate_financial_ratios.js`, `ask_user_for_clarification.js`, `answer_user.js`). Each exports a function wrapped by `createToolWrapper`.

## Dependencies

*   **Internal Features:** `datasets`, `users`, `teams` (for models and services).
*   **Shared Modules:** `config`, `db`, `external_apis` (LLM clients), `middleware`, `services` (`codeExecution.service`, `cloudTasks.service`), `utils` (`logger`), `socket.js`.
*   **External Libraries:** `mongoose`, `express`, `@google-cloud/tasks`, `@anthropic-ai/sdk`, `@google/generative-ai`, `openai`, `papaparse`, `ajv`, `tiktoken`, `uuid`.

## Security Considerations

*   **Code Execution Sandbox:** Analysis code generated by the AI is executed using the Node.js `vm` module. **This is NOT a secure sandbox.** It relies on a restricted context and timeouts. A more robust solution (Docker, Wasm, microservice) is recommended for production environments handling untrusted code.
*   **Prompt Injection:** The system prompt is designed with instructions to mitigate prompt injection risks, but vigilance is required.
*   **Access Control:** Tool implementations and context fetching rely on `userId` (and potentially `teamId`) for access control checks via `dataset.service` and `TeamMember` lookups.
*   **Internal Endpoint:** The `/internal/chat-ai-worker` endpoint is protected by Cloud Tasks OIDC token validation.

## Configuration

*   Requires API keys for configured LLM providers (`CLAUDE_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) in `.env`.
*   Requires Cloud Tasks configuration (`CHAT_AI_QUEUE_NAME`, `CLOUD_TASKS_LOCATION`, `SERVICE_URL`, etc.) if using the non-streaming flow.

This agent-based architecture provides a flexible and extensible foundation for complex AI-driven chat interactions within NeuroLedger.