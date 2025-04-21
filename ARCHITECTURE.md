# NeuroLedger Application Architecture

**Last Updated:** April 17, 2025

## 1. Overview

NeuroLedger is a web application designed for AI-powered financial analysis. It comprises a React frontend and a Node.js/Express backend, interacting via a RESTful API and Server-Sent Events (SSE) for real-time chat updates. The architecture emphasizes modularity through a Vertical Slice Architecture (VSA) pattern implemented in both the frontend and backend codebases.

*   **Frontend:** React (using Vite), Tailwind CSS, React Router, Axios, Firebase JS SDK, `@microsoft/fetch-event-source`.
*   **Backend:** Node.js, Express, MongoDB (with Mongoose), Firebase Admin SDK, Google Cloud Storage (GCS), Google Cloud Tasks, Multiple LLM Providers (Anthropic Claude, Google Gemini, OpenAI via ProviderFactory), Node.js `vm` module for sandboxed code execution.
*   **Core Pattern:** Vertical Slice Architecture (VSA).

## 2. High-Level Structure

The project is divided into two main packages:

*   **`frontend/`**: Contains the React single-page application (SPA). See `frontend/README.md` for setup and structure details.
*   **`backend/`**: Contains the Node.js/Express API server. See `backend/README.md` for setup and structure details.

Interaction between these two parts is defined by the API contract (`FE_BE_INTERACTION_README.md`) and real-time communication via Server-Sent Events (SSE) for chat.

## 3. Backend Architecture (`backend/`)

The backend follows a VSA pattern, organizing code by feature slices. The `chat` feature implements an advanced AI agent orchestration system.

```mermaid
graph TD
    A[Client Request] --> B(Express App);
    B --> C{Middleware Chain};
    C -- CORS, JSON, Logging --> D{Auth Middleware};
    D -- /api/v1/** --> E{Subscription Middleware};
    E -- /api/v1/** --> F(Feature Router);

    subgraph Feature Slice (./src/features/chat)
        F -- /api/v1/chats/... --> G_Chat[chat.controller];
        G_Chat -- GET /stream --> H_Chat_Stream(chat.service - handleStreamingChatRequest);
        G_Chat -- POST /messages --> H_Chat_Task(chat.service - addMessage);
        H_Chat_Task --> T(Cloud Tasks);

        H_Chat_Stream --> RunAgent("agent.service (runAgent)");
        TaskHandler --> RunAgent;

        subgraph Agent System (agent.service, agent/, tools/)
            RunAgent --> AR(AgentRunner);
            AR --> ACS(agentContext.service);
            AR --> ASM(AgentStateManager);
            AR --> AEE(AgentEventEmitter);
            AR --> LLMO(LLMOrchestrator);
            AR --> TE(ToolExecutor);

            ACS --> I{Database (MongoDB)};
            ACS --> DSvc(dataset.service);
            ACS --> PS(prompt.service);

            LLMO --> SPB(SystemPromptBuilder);
            LLMO --> PS;

            TE --> ToolWrapper(BaseToolWrapper);
            ToolWrapper --> ToolSchemas(tool.schemas.js);
            ToolWrapper --> ToolImpl("tools/*.js");

            ToolImpl --> PS;
            ToolImpl --> DSvc;
            ToolImpl --> CodeExec(codeExecution.service);

            AEE -- SSE Callback --> H_Chat_Stream;
        end

        PS --> LLMProviders("Claude/Gemini/OpenAI Clients");
        CodeExec --> VM(Node.js vm Module);

        G_Chat --> I; // Session/Message CRUD via chat.service
        ASM --> I; // AgentRunner updates PromptHistory via StateManager
    end

    subgraph Other Features (./src/features/*)
        F -- /api/v1/datasets --> Datasets(datasets.controller);
        Datasets --> DSvc;
        DSvc --> GCS(Google Cloud Storage);
        DSvc --> I;
        F -- /api/v1/teams --> Teams(teams.controller);
        Teams --> TeamSvc(teams.service);
        TeamSvc --> I;
        F -- /api/v1/users --> Users(users.controller);
        Users --> I;
        %% ... other feature routes ...
    end

    subgraph Background Task Handling
        T -- Triggers --> BE_Worker(POST /internal/chat-ai-worker);
        BE_Worker --> TaskAuth(CloudTask Middleware);
        TaskAuth --> TaskHandler(chat.taskHandler);
    end

    subgraph Shared Infrastructure (./src/shared, ./src)
        I
        LLMProviders
        T
        GCS
        VM
        L(Error Handler)
    end

    %% Connections
    G_Chat --> F;
    F --> E;
    E --> D;
    D --> C;
    C --> B;
    B --> K[Client Response / SSE Stream];

    %% Error Flow
    G_Chat -- Error --> L;
    H_Chat_Stream -- Error --> L;
    TaskHandler -- Error --> L;
    RunAgent -- Error --> L;
    F -- Error --> L;
    E -- Error --> L;
    D -- Error --> L;
    C -- Error --> L;
    L --> B;

```
Entry Point: backend/src/server.js initializes DB, Socket.IO (though primarily using SSE now), and Express server (app.js).

Application Core (backend/src/app.js): Configures Express, middleware, API router (./routes.js), error handler.

Routing (backend/src/routes.js): Mounts feature routers (e.g., /auth, /datasets, /chat).

Middleware (backend/src/shared/middleware/): Includes auth, subscription, cloudTask, error handlers.

Features (backend/src/features/): Contains feature logic.

auth: Session management via Firebase tokens.

chat: Handles persistent chat sessions and AI agent interactions.

chat.controller.js: Handles session CRUD, message retrieval, streaming endpoint (/stream), non-streaming message submission (/messages), and internal worker endpoint (/internal/chat-ai-worker).

chat.service.js: Manages chat session logic, initiates agent runs (handleStreamingChatRequest), handles non-streaming message queuing (addMessage), and provides SSE streaming helpers.

chat.taskHandler.js: Processes background tasks from Cloud Tasks for non-streaming agent runs, calling agent.service.runAgent.

agent.service.js: Exports the main runAgent function which instantiates and runs the AgentRunner.

agent/ directory: Contains the core agent components:

AgentRunner.js: Orchestrates the agent's Reason-Act-Observe loop, manages state, calls tools, handles refinement, and interacts with other agent components.

AgentStateManager.js: Manages the state for a single agent turn (context, steps, intermediate results, fragments, final answer/error).

ToolExecutor.js: Dynamically loads and executes tools via BaseToolWrapper.

LLMOrchestrator.js: Manages interaction with the LLM provider for reasoning, including prompt building and response parsing (thinking, explanation, action).

SystemPromptBuilder.js: Constructs the detailed system prompt for the LLM, assembling context, history, tool definitions, examples, and instructions.

AgentEventEmitter.js: Emits agent status events (thinking, explanation, tool usage/result, final answer, error, clarification) via the SSE callback.

AgentContextService.js: Fetches and prepares context (user/team info, dataset schemas/samples, chat history with summarization, previous artifacts).

prompt.service.js: Interacts with the selected LLM provider (via ProviderFactory) for reasoning, code generation (analysis/report), and history summarization.

agent.utils.js: Helper utilities (result summarization, formatting for LLM context).

tools/ directory: Contains modular AI tool implementations (list_datasets, parse_csv_data, generate_analysis_code, execute_analysis_code, generate_report_code, get_dataset_schema, calculate_financial_ratios, ask_user_for_clarification, _answerUserTool) along with definitions (tool.definitions.js), argument schemas (tool.schemas.js), and the BaseToolWrapper for validation and standardization.

chatSession.model.js & prompt.model.js: Data models for sessions and messages (including agent steps/fragments).

dataQuality: Async dataset audits via Cloud Tasks.

datasets: Metadata management, GCS interaction, provides data access/context for agent tools.

export: PDF generation service (using Puppeteer).

notifications: User notifications (e.g., for team invites).

subscriptions: (Dummy) Subscription management and access control.

teams: Team creation, membership, invites, permissions.

users: User profile, settings (including preferred AI model).

Shared Modules (backend/src/shared/): Common infrastructure.

services: Includes codeExecution.service.js for sandboxed vm execution, cloudTasks.service.js.

llm_providers: Contains the abstraction layer (BaseLLMProvider, ProviderFactory) and specific clients (ClaudeProvider, GeminiProvider, OpenAIProvider) for interacting with different LLMs.

external_apis: Other external clients (Firebase Admin, GCS).

config, db, utils: Supporting infrastructure.

Real-time: Primarily uses Server-Sent Events (SSE) via chat.service and AgentEventEmitter for streaming agent responses. Socket.IO is initialized but less central to the chat flow now.

Asynchronous Tasks: Google Cloud Tasks triggers /internal/chat-ai-worker for non-streaming agent runs.

4. Frontend Architecture (frontend/)

The frontend is a React SPA built with Vite, styled with Tailwind CSS, following VSA principles where applicable.

graph LR
    A[User Interaction] --> B(React Components);
    B --> C{Routing (React Router)};
    C --> D[Layout Components - AppLayout, CenteredLayout];
    D --> E(Page Components - DashboardPage, Account Pages, etc.);
    B --> F(State Management);
    F -- Global --> G[Context API - AuthContext, ThemeContext];
    F -- Feature --> I[Custom Hooks/Context - ChatContext, useDatasets, useTeams];
    I --> ReportModal(ReportViewerModal) // ChatContext renders modal
    B --> J{API Calls};
    J --> K(apiClient - Axios);
    K -- Request Interceptor --> L(Add Auth Token);
    L --> M[Backend API];
    M --> K;
    K -- Response Interceptor --> J;
    J --> F;
    J --> B;

    subgraph Real-time Updates
       BE_API[Backend API] -- SSE Stream --> SSE_Client(fetchEventSource Hook in ChatContext)
       SSE_Client --> I; %% ChatContext updates state from SSE
       I --> B; %% Trigger UI re-render
       I -- controls --> ReportModal; // Context controls modal visibility/data
    end

    subgraph Core Structure (./src)
        C
        D
        G
        K
    end

    subgraph Features (./src/features)
        E
        I
        %% Specific Components like PromptInput, MessageBubble, ReportViewer
    end

    subgraph Shared (./src/shared)
       %% Shared Components like Sidebar
       %% Shared Hooks like useAuth, useTheme
       %% UI Elements like Button, Card, Modal
    end
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Mermaid
IGNORE_WHEN_COPYING_END

Build Tool: Vite (frontend/vite.config.js).

Entry Point: frontend/index.html, frontend/src/main.jsx.

Root Component (frontend/src/App.jsx): Sets up global context providers (AuthProvider, ThemeProvider, ChatProvider). Renders AppRouter.

Routing (frontend/src/routes.jsx): Uses react-router-dom v6. Implements ProtectedRoute (checks auth & subscription) and PublicOnlyRoute. Uses layout components (AppLayout, CenteredLayout, AccountLayout). Lazy loads pages.

Layouts (frontend/src/shared/layouts/): Provide overall page structure.

State Management:

Global: React Context API (AuthContext, ThemeContext).

Chat: Managed centrally via ChatContext (features/dashboard/context/ChatContext.jsx). Handles sessions, messages, loading states, and integrates SSE streaming via @microsoft/fetch-event-source. Provides useChat hook.

Other Features: Managed within feature-specific custom hooks (e.g., useDatasets, useTeams, useTeamInvites).

Local UI State: useState, useReducer.

API Interaction (frontend/src/shared/services/apiClient.js): Configured axios instance with interceptors for auth tokens and basic error logging.

Real-Time Communication: Server-Sent Events (SSE) managed within ChatContext for streaming chat responses and agent status updates.

Styling: Tailwind CSS (frontend/tailwind.config.js, frontend/src/index.css). Dark mode via class strategy managed by ThemeContext. Base UI components in frontend/src/shared/ui/.

Features (frontend/src/features/): Contain feature-specific pages, components, and hooks (e.g., dashboard, dataset_management, team_management, report_display).

Report Rendering (frontend/src/features/report_display/):

Uses a sandboxed iframe approach (ReportViewer.jsx, public/iframe-bootstrapper.html).

Code (reportInfo.code) and analysis data (reportInfo.analysisData) are passed into the iframe using postMessage.

iframe-bootstrapper.html loads libraries (React, Recharts) via CDN, executes the received code, renders the component, and sends status back via postMessage.

5. Key Interaction Flows
Authentication Flow
sequenceDiagram
    participant FE as Frontend (React)
    participant FB as Firebase Auth SDK
    participant BE as Backend API
    participant CTX as AuthContext

    FE->>FB: signInWithEmailAndPassword(email, pass)
    FB-->>FE: User Credential (Success)
    FE->>CTX: onAuthStateChanged Listener Fires (user present)
    CTX->>BE: POST /auth/session (with Token via apiClient)
    Note over BE: Verifies Token, Gets/Creates DB User
    BE-->>CTX: { status: 'success', data: AppUser }
    CTX->>FE: Updates context state (user=AppUser, loading=false)
    FE->>FE: Renders Authenticated UI (e.g., Redirect to /dashboard)
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Mermaid
IGNORE_WHEN_COPYING_END
Dataset Proxy Upload Flow
sequenceDiagram
    participant FE as Frontend (React)
    participant BE as Backend API
    participant GCS as Google Cloud Storage

    FE->>FE: User selects file (+ optional teamId)
    FE->>BE: POST /datasets/proxy-upload (FormData: file, teamId?)
    Note over BE: Handles File (Multer)
    Note over BE: Checks Auth/Sub/Team Admin Role
    BE->>GCS: Streams file upload
    GCS-->>BE: Upload Success
    Note over BE: Parses Headers from GCS File
    Note over BE: Creates Dataset Metadata in DB
    BE-->>FE: 201 { status: 'success', data: Dataset }
    FE->>FE: Updates UI (e.g., refetch dataset list)
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Mermaid
IGNORE_WHEN_COPYING_END
Chat Interaction - Streaming Flow (SSE)
sequenceDiagram
    participant FE_UI as Frontend UI (DashboardPage)
    participant FE_CTX as ChatContext
    participant FE_SSE as fetchEventSource (in ChatContext)
    participant BE_API as Backend API (chat.controller)
    participant BE_SVC as Backend Service (chat.service)
    participant Agent as AgentRunner (via agent.service)
    participant LLM as LLM Provider

    FE_UI->>FE_CTX: sendStreamingMessage(promptText, datasetIds)
    FE_CTX->>BE_API: GET /chats/{id}/stream?promptText=... (via fetchEventSource)
    Note over BE_API: Sets up SSE stream
    BE_API->>BE_SVC: handleStreamingChatRequest(...)
    BE_SVC->>BE_SVC: Create User Message (DB)
    BE_SVC->>BE_SVC: Create AI Placeholder (DB)
    BE_SVC->>FE_SSE: SSE: user_message_created event
    BE_SVC->>FE_SSE: SSE: ai_message_created event
    BE_SVC->>Agent: runAgent(..., sseCallback)

    loop Agent Loop (Reason -> Act -> Observe)
        Agent->>LLM: Call for reasoning/action (via LLMOrchestrator)
        LLM-->>Agent: Stream response chunks...
        Agent->>FE_SSE: SSE: token event (for raw text stream - less used now)
        Agent->>FE_SSE: SSE: agent:explanation event (user-facing status)

        alt Tool Usage
            Agent->>Agent: Parse tool call from LLM response
            Agent->>FE_SSE: SSE: agent:using_tool event
            Agent->>Agent: Execute tool (e.g., parse_csv_data, execute_analysis_code)
            Agent->>FE_SSE: SSE: agent:tool_result event
        else Final Answer
            Agent->>Agent: Parse final answer from LLM response
            Agent->>FE_SSE: SSE: agent:final_answer event (with text, code, analysis data)
            Agent->>Agent: Update PromptHistory (DB)
            Agent->>FE_SSE: SSE: end event (status: completed)
            Agent->>BE_SVC: Return final status
            BE_SVC->>BE_API: Close SSE stream
        else Error
            Agent->>Agent: Handle error
            Agent->>FE_SSE: SSE: agent:error event
            Agent->>Agent: Update PromptHistory (DB)
            Agent->>FE_SSE: SSE: end event (status: error)
            Agent->>BE_SVC: Return error status
            BE_SVC->>BE_API: Close SSE stream
        end
    end

    FE_SSE->>FE_CTX: Process SSE events (update messages state)
    FE_CTX->>FE_UI: Update display incrementally

    alt Generated Report Code
        FE_UI->>FE_UI: Show "View Report" button based on message state
        FE_UI->>FE_UI: Open ReportViewer Modal on click, passing code & analysisData
    end
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Mermaid
IGNORE_WHEN_COPYING_END
Data Quality Audit Flow

(No significant changes from previous version)

sequenceDiagram
    participant FE as Frontend (Dataset Detail Page)
    participant BE_API as Backend API
    participant CloudTask as Google Cloud Tasks
    participant BE_Worker as BE Worker Endpoint
    participant GCS as Google Cloud Storage
    participant LLM as LLM Provider (Claude/Gemini/OpenAI)

    FE->>BE_API: POST /datasets/{id}/quality-audit
    Note over BE_API: Checks Auth/Sub/Permissions/Context
    Note over BE_API: Updates Dataset status to 'processing'
    BE_API->>CloudTask: Create Task (target=BE_Worker, payload={datasetId, userId})
    CloudTask-->>BE_API: Task Created Confirmation
    BE_API-->>FE: 202 Accepted { data: { status: 'processing' } }
    FE->>FE: Start Polling (fetchAuditStatus)

    loop Poll Status (e.g., every 5s)
        FE->>BE_API: GET /datasets/{id}/quality-audit/status
        BE_API-->>FE: 200 { data: { qualityStatus: 'processing', ... } }
    end

    CloudTask->>BE_Worker: POST /internal/quality-audit-worker (with OIDC Token)
    Note over BE_Worker: Validates Token
    BE_Worker-->>CloudTask: 200 OK (Acknowledge Receipt)
    Note over BE_Worker: Starts background processing (performFullAudit)
    BE_Worker->>GCS: Read Dataset File
    Note over BE_Worker: Performs Programmatic Analysis
    BE_Worker->>LLM: Get Column/Overall Insights
    LLM-->>BE_Worker: AI Insights (JSON)
    BE_Worker->>LLM: Generate Final Report (Synthesize)
    LLM-->>BE_Worker: Final Report (JSON)
    Note over BE_Worker: Updates Dataset in DB (status='ok'/'warning'/'error', report=JSON)

    loop Poll Status (After Worker Completes)
        FE->>BE_API: GET /datasets/{id}/quality-audit/status
        BE_API-->>FE: 200 { data: { qualityStatus: 'ok', ... } }
    end
    FE->>FE: Stop Polling
    FE->>BE_API: GET /datasets/{id}/quality-audit
    BE_API-->>FE: 200 { data: { report: ReportObject, ... } }
    FE->>FE: Renders DataQualityReportDisplay component
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Mermaid
IGNORE_WHEN_COPYING_END


6. Environment & Configuration

Both frontend and backend rely on environment variables (.env files for local dev).

Frontend variables prefixed with VITE_.

Backend configuration loaded via backend/src/shared/config/index.js.

Backend requires service account JSON files (firebase-service-account.json, gcs-service-account.json) in backend/ root for local dev.

7. Multi-Provider LLM Support

Backend supports Anthropic Claude, Google Gemini, and OpenAI models.

User preference stored in User.settings.preferredAiModel.

ProviderFactory (shared/llm_providers/ProviderFactory.js) selects the appropriate client based on preference and available API keys (from config), with fallback logic.

Specific models used for different tasks (reasoning, code generation, summarization) are configured within prompt.service.js.

8. Security Considerations

Authentication: Firebase Authentication with JWT verification (protect middleware).

Authorization: Role-based access control for teams (isTeamMember, isTeamAdmin) and subscription checks (requireActiveSubscription).

Secure Code Execution:

Backend uses Node.js vm module with restricted context and timeouts. This is NOT a fully secure sandbox and is vulnerable to sophisticated attacks. A more robust solution (Docker, Wasm, microservice) is recommended for production.

Frontend uses sandboxed iframes (sandbox="allow-scripts") for rendering AI-generated React code, preventing access to parent origin. postMessage origin checks are used.

API Protection: Input validation (basic, Ajv for tool args), rate limiting (potential future), CORS restriction.

Internal Endpoints: Protected by Cloud Tasks OIDC token validation.

Prompt Injection: System prompts designed with specific instructions and formatting requirements to minimize risks. Input sanitization may be added.

9. Performance Considerations

Streaming Responses: Chat responses and agent steps stream in real-time via SSE.

Background Processing: Asynchronous processing via Cloud Tasks for non-streaming chat and data quality audits.

Frontend Optimizations: Code splitting (React.lazy), memoization.

Backend Optimizations: Database indexes, pagination, query optimization, history summarization to manage LLM context size.

IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END