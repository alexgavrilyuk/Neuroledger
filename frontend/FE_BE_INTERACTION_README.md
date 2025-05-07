Okay, this is a crucial document to keep accurate. Here is the complete, updated `FE_BE_INTERACTION_README.md` reflecting the agent architecture and changes up to Phase 12.

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services, including REST API endpoints and Server-Sent Events (SSE) for real-time chat interactions.

**Last Updated:** April 17, 2025

## 1. Base API URL

`/api/v1` (Default Dev: `http://localhost:5001/api/v1`)

## 2. Authentication & Authorization

*   **Authentication:** Most routes require a valid Firebase ID token sent in the `Authorization: Bearer <ID Token>` header. This is verified by the `protect` middleware on the backend, which also attaches the corresponding application user object to `req.user`.
*   **Session Initialization:** The frontend should initiate a session by calling `POST /auth/session` after obtaining a Firebase token upon user login/signup.
*   **Subscription Check:** Many features (e.g., Datasets, Chat, Data Quality) additionally require the user to have an active subscription. This is enforced by the `requireActiveSubscription` middleware, which checks the `req.user.subscriptionInfo` status. Requests will fail with a `403 Forbidden` (Code: `SUBSCRIPTION_INACTIVE` or `TRIAL_EXPIRED`) if the subscription is not active.
*   **Team Roles:** Specific actions within the `teams` feature require the user to be a member (`isTeamMember` middleware) or an admin (`isTeamAdmin` middleware) of the relevant team. Access control for team-related resources (like Datasets) also relies on team membership or admin status.

## 3. Standard Responses

*   **Success (2xx):** `{ "status": "success", "data": <Payload> | null | string }`
    *   `200 OK`: Standard success.
    *   `201 Created`: Resource successfully created.
    *   `202 Accepted`: Request accepted for processing (e.g., async task started).
*   **Error (4xx/5xx):** `{ "status": "error", "message": string, "code"?: string }`
    *   The `code` field may provide specific reasons for errors (e.g., `TOKEN_EXPIRED`, `SUBSCRIPTION_INACTIVE`, `AUDIT_IN_PROGRESS`, `MISSING_CONTEXT`, `NO_AUDIT`, `INVALID_ARGUMENT`, `TOOL_EXECUTION_ERROR`, `MAX_ITERATIONS_REACHED`).
    *   `400 Bad Request`: Invalid input, missing parameters, validation error.
    *   `401 Unauthorized`: Authentication token missing, invalid, or expired.
    *   `403 Forbidden`: User authenticated but lacks permission (e.g., inactive subscription, insufficient team role).
    *   `404 Not Found`: Resource (e.g., dataset, team, user, session) not found or user lacks access.
    *   `409 Conflict`: Action cannot be performed due to current state (e.g., audit already running).
    *   `500 Internal Server Error`: Unexpected backend error.

## 4. Endpoint Specifications

---

### Feature: Authentication

*   **`POST /api/v1/auth/session`**
    *   **Description:** Verifies the Firebase ID token from the header, finds or creates the corresponding application user in the database, and returns the user data.
    *   **Auth:** Firebase ID Token in Header.
    *   **Request:** None.
    *   **Success (200 OK):** `{ status: 'success', data: User }`
    *   **Errors:** `401`, `500`.

---

### Feature: Subscriptions (Dummy)

*   **`GET /api/v1/subscriptions/status`**
    *   **Description:** Gets the current subscription status for the authenticated user.
    *   **Auth:** Required (`protect`).
    *   **Success (200 OK):** `{ status: 'success', data: SubscriptionInfo }`
    *   **Errors:** `401`, `500`.

*   **`POST /api/v1/subscriptions/select`**
    *   **Description:** Selects a dummy subscription plan for the authenticated user.
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "planId": string }`
    *   **Success (200 OK):** `{ status: 'success', data: User }` (Full updated User object)
    *   **Errors:** `400`, `401`, `500`.

---

### Feature: Users

*   **`GET /api/v1/users/me`**
    *   **Description:** Retrieves the complete profile information for the authenticated user.
    *   **Auth:** Required (`protect`).
    *   **Success (200 OK):** `{ status: 'success', data: User }`
    *   **Errors:** `401`, `404`, `500`.

*   **`PUT /api/v1/users/me/settings`**
    *   **Description:** Updates user settings (currency, dateFormat, aiContext, preferredAiModel).
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "currency"?: string, "dateFormat"?: string, "aiContext"?: string, "preferredAiModel"?: string }`
    *   **Success (200 OK):** `{ status: 'success', data: User }` (Full updated User object)
    *   **Errors:** `400` (Invalid preferredAiModel), `401`, `404`, `500`.

---

### Feature: Datasets

*   **`GET /api/v1/datasets/upload-url`**
    *   **Description:** Generates a signed URL for direct client-to-GCS PUT upload.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Query Params:** `filename` (string, required), `fileSize` (number, required).
    *   **Success (200 OK):** `{ status: 'success', data: { signedUrl: string, gcsPath: string } }`
    *   **Errors:** `400`, `401`, `403`, `500`.

*   **`POST /api/v1/datasets/proxy-upload`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Request**: `multipart/form-data` with `file` field (File, max 50MB) and optional `teamId` field (string, ObjectId)
    *   **Description**: Uploads file via backend proxy. **IMPORTANT: Triggers an asynchronous background parsing task. Initial `parsedDataStatus` will be 'not_parsed', then transition to 'queued'.**
    *   **Success (201 Created)**: `{ status: 'success', data: Dataset }` (Immediate response, parsing occurs in background)
    *   **Errors**: `400` (No file), `403` (Not team member/admin if `teamId` provided), `500` (Upload/metadata error)

*   **`POST /api/v1/datasets`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Request Body**: `{ gcsPath: string, originalFilename: string, name?: string, fileSizeBytes?: number, teamId?: string }`
    *   **Description**: Creates dataset metadata AFTER successful direct client-to-GCS upload. **IMPORTANT: Triggers an asynchronous background parsing task. Initial `parsedDataStatus` will be 'not_parsed', then transition to 'queued'.**
    *   **Success (201 Created)**: `{ status: 'success', data: Dataset }` (Immediate response, parsing occurs in background)
    *   **Errors**: `400` (Missing required fields), `403` (Not team admin if `teamId` provided), `500` (DB error)


*   **`GET /api/v1/datasets`**
    *   **Description:** Lists datasets accessible to the user (personal + teams user is member of). Includes `isTeamDataset` and `teamName`.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (200 OK):** `{ status: 'success', data: ListedDataset[] }`
    *   **Errors:** `401`, `403`, `500`.

*   **`GET /api/v1/datasets/{id}`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Description**: Gets details for a single dataset. **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Request Params**: `id` (MongoDB ObjectId)
    *   **Success (200 OK)**: `{ status: 'success', data: Dataset }`
        *   **NEW Fields in Response**:
            - `parsedDataStatus`: Indicates current parsing state
            - `parsedDataGridFSId`: Reference to GridFS document (if parsing completed)
            - `parsedDataError`: Error message (if parsing failed)
    *   **Errors**: `400` (Invalid ID), `404` (Not found or not accessible)

*   **`GET /api/v1/datasets/{id}/schema`**
    *   **Description:** Gets schema info (`schemaInfo`, `columnDescriptions`, `description`). Accessible if user is owner OR member of the team.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (200 OK):** `{ status: 'success', data: SchemaResponseData }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`GET /api/v1/datasets/{id}/read-url`**
    *   **Description:** Generates a short-lived signed URL for reading dataset content from GCS. **NOTE: Backend currently only checks for dataset owner, not team membership.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`PUT /api/v1/datasets/{id}`**
    *   **Description:** Updates dataset `description`, `columnDescriptions`, and/or `schemaInfo`. Accessible if user is owner OR member of the team.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Request Body:** `{ description?: string, columnDescriptions?: Object, schemaInfo?: Array<{name: string, type: string}> }`
    *   **Success (200 OK):** `{ status: 'success', data: Dataset }` (Updated dataset)
    *   **Errors:** `400` (Invalid ID or schemaInfo format), `401`, `403`, `404`, `500`.

*   **`DELETE /api/v1/datasets/{id}`**
    *   **Description:** Deletes dataset metadata and GCS file. User must be owner OR admin of the team.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', message: 'Dataset deleted successfully' }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`POST /api/v1/internal/datasets/parse-worker`**
    *   **Auth**: Protected by Cloud Tasks OIDC Token Validation
    *   **Description**: INTERNAL endpoint triggered by Cloud Tasks for asynchronous dataset parsing.
    *   **Request Body**: `{ datasetId: string }`
    *   **Purpose**: Processes background parsing task for a specific dataset
    *   **Success (200 OK)**: `{ status: 'success', message: 'Task received for parsing.' }`
    *   **Errors**: `401` (Invalid token), `400` (Invalid payload)

---

### Feature: Data Quality Audit

*   **`POST /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Description:** Initiates an asynchronous quality audit. Requires dataset description and column descriptions. User must be owner OR team admin.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (202 Accepted):** `{ status: 'success', data: { status: 'processing' } }`
    *   **Errors:** `400` (`MISSING_CONTEXT`, `MISSING_COLUMN_DESCRIPTIONS`), `401`, `403`, `404`, `409` (`AUDIT_IN_PROGRESS`, `AUDIT_ALREADY_COMPLETE`), `500`.

*   **`GET /api/v1/datasets/{datasetId}/quality-audit/status`**
    *   **Description:** Gets the current audit status. Accessible if user is owner OR any team member.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (200 OK):** `{ status: 'success', data: { qualityStatus: string, requestedAt: Date|null, completedAt: Date|null } }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`GET /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Description:** Gets the complete audit report if available. Accessible if user is owner OR any team member.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (200 OK - Completed):** `{ status: 'success', data: { qualityStatus: 'ok'|'warning'|'error', ..., report: Object } }`
    *   **Success (202 Accepted - Processing):** `{ status: 'success', data: { qualityStatus: 'processing', ... } }`
    *   **Errors:** `400`, `401`, `403`, `404` (`NO_AUDIT`), `500`.

*   **`DELETE /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Description:** Resets a completed or failed audit. Accessible if user is owner OR any team member.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (200 OK):** `{ status: 'success', data: { qualityStatus: 'not_run', ... } }`
    *   **Errors:** `400`, `401`, `403`, `404`, `409` (`AUDIT_IN_PROGRESS`), `500`.

*   **`POST /api/v1/internal/quality-audit-worker`**
    *   **Description:** Internal worker endpoint invoked by Cloud Tasks. **Not for direct frontend use.**
    *   **Auth:** Internal (Cloud Tasks OIDC Token).
    *   **Success (200 OK):** `{ status: 'success', message: 'Task received' }` (Returned immediately).

---

### Feature: Teams

*   **`POST /api/v1/teams`**: Create team.
*   **`GET /api/v1/teams`**: List user's teams.
*   **`GET /api/v1/teams/{teamId}`**: Get team details (requires membership).
*   **`PUT /api/v1/teams/{teamId}/settings`**: Update settings (requires admin).
*   **`GET /api/v1/teams/{teamId}/datasets`**: Get team datasets (requires membership).
*   **`POST /api/v1/teams/{teamId}/invites`**: Invite user (requires admin).
*   **`GET /api/v1/teams/invites/pending`**: Get user's pending invites.
*   **`POST /api/v1/teams/invites/{inviteId}/accept`**: Accept invite.
*   **`POST /api/v1/teams/invites/{inviteId}/reject`**: Reject invite.
*   **`PUT /api/v1/teams/{teamId}/members/{memberId}/role`**: Update member role (requires admin).
*   **`DELETE /api/v1/teams/{teamId}/members/{memberId}`**: Remove member (requires admin).
    *   *(See `features/teams/README.md` for detailed request/response structures)*

---

### Feature: Notifications

*   **`GET /api/v1/notifications`**: Get user's notifications (paginated).
*   **`GET /api/v1/notifications/unread-count`**: Get unread count.
*   **`PUT /api/v1/notifications/mark-read`**: Mark notifications as read (specific IDs or all).
*   **`DELETE /api/v1/notifications/{notificationId}`**: Delete a notification.
    *   *(See `features/notifications/README.md` for detailed request/response structures)*

---

### Feature: Export

*   **`POST /api/export/pdf`**
    *   **Description:** Generates a PDF from provided HTML content.
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "htmlContent": string, "themeName"?: "light" | "dark" }`
    *   **Success (200 OK):** PDF file stream (`Content-Type: application/pdf`).
    *   **Errors:** `400` (Missing `htmlContent`), `401`, `500` (Puppeteer error).

---

### Feature: Chat (Agent Architecture)

*   **`POST /api/v1/chats`**
    *   **Description:** Creates a new chat session.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Body:** `{ "teamId"?: string, "title"?: string }`.
    *   **Success (201 Created):** `{ status: 'success', data: ChatSession }`
    *   **Errors:** `400`, `401`, `403`, `500`.

*   **`GET /api/v1/chats`**
    *   **Description:** Lists user's chat sessions (personal + team), sorted by last activity.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Query Params:** `limit`, `skip`.
    *   **Success (200 OK):** `{ status: 'success', data: [ChatSession] }`
    *   **Errors:** `401`, `403`, `500`.

*   **`GET /api/v1/chats/{sessionId}`**
    *   **Description:** Gets details for a single chat session. Accessible if user is owner or team member.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Success (200 OK):** `{ status: 'success', data: ChatSession }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`PATCH /api/v1/chats/{sessionId}`**
    *   **Description:** Updates chat session title. Accessible if user is owner or team member.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Body:** `{ "title": string }`.
    *   **Success (200 OK):** `{ status: 'success', data: ChatSession }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`DELETE /api/v1/chats/{sessionId}`**
    *   **Description:** Deletes chat session and associated messages. Accessible if user is owner or team member.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Success (200 OK):** `{ status: 'success', message: 'Chat session deleted successfully' }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`POST /api/v1/chats/{sessionId}/messages`**
    *   **Description:** Sends a user message, creates AI message placeholder, and queues agent processing via Cloud Tasks (Non-streaming flow).
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds"?: string[] }` (`selectedDatasetIds` required for first message).
    *   **Success (202 Accepted):** `{ status: 'success', data: { userMessage: PromptHistory, aiMessage: PromptHistory, updatedSession: ChatSession } }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`GET /api/v1/chats/{sessionId}/messages`**
    *   **Description:** Gets messages (user and AI). AI messages include `aiGeneratedCode`, `reportAnalysisData`, `steps`, `messageFragments`.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Query Params:** `limit`, `skip`.
    *   **Success (200 OK):** `{ status: 'success', data: [PromptHistory] }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`GET /api/v1/chats/{sessionId}/messages/{messageId}`**
    *   **Description:** Gets a single message.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Success (200 OK):** `{ status: 'success', data: PromptHistory }`
    *   **Errors:** `400`, `401`, `403`, `404`, `500`.

*   **`GET /api/v1/chats/{sessionId}/stream`**
    *   **Description:** Initiates a streaming chat response using Server-Sent Events (SSE). Backend runs the AI agent and streams events back.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Query Params:** `promptText` (string, required), `selectedDatasetIds` (string, optional comma-separated).
    *   **Response:** `Content-Type: text/event-stream`. Streams events as defined in section 6.
    *   **Errors:** Standard HTTP errors for initial connection; SSE `error` events during streaming.

*   **`POST /api/v1/internal/chat-ai-worker`**
    *   **Description:** Internal worker endpoint invoked by Cloud Tasks for non-streaming agent runs. **Not for direct frontend use.**
    *   **Auth:** Internal (Cloud Tasks OIDC Token).
    *   **Request Body:** `{ "sessionId": string, "userId": string, "userMessageId": string, "aiMessageId": string, "sessionDatasetIds": string[] }`.
    *   **Success (200 OK):** `{ status: 'success', message: 'Task received' }` (Returned immediately).

---

## 5. Key Data Models (API/SSE Payloads)

*(Interfaces representing the shape of data exchanged)*

### User
```typescript
interface User {
  _id: string;
  firebaseUid: string;
  email: string;
  name?: string;
  createdAt: string; // ISO Date string
  settings: {
    currency: string;
    dateFormat: string;
    aiContext?: string;
    preferredAiModel?: 'claude' | 'gemini' | 'openai';
  };
  subscriptionInfo: SubscriptionInfo;
  onboardingCompleted: boolean;
  teams?: string[]; // Array of Team ObjectIds
}
```

### SubscriptionInfo (Part of User)
```typescript
interface SubscriptionInfo {
  tier: 'free' | 'trial' | 'plus' | 'pro';
  status: 'active' | 'inactive' | 'trialing' | 'past_due' | 'canceled';
  trialEndsAt?: string | null; // ISO Date string
  subscriptionEndsAt?: string | null; // ISO Date string
}
```

### Dataset
```typescript
interface Dataset {
  _id: string;
  name: string;
  description?: string;
  gcsPath: string;
  originalFilename: string;
  fileSizeBytes?: number;
  ownerId: string; // User ObjectId
  teamId?: string | null; // Team ObjectId or null
  schemaInfo: Array<{ name: string; type: string; }>;
  columnDescriptions: { [columnName: string]: string; };
  createdAt: string; // ISO Date string
  lastUpdatedAt: string; // ISO Date string
  qualityStatus: 'not_run' | 'processing' | 'ok' | 'warning' | 'error';
  // Other quality fields omitted for brevity
  parsedDataStatus: 'not_parsed' | 'queued' | 'processing' | 'completed' | 'error';
  parsedDataGridFSId?: string | null;
  parsedDataError?: string | null;
}

interface ListedDataset extends Dataset {
  isTeamDataset: boolean;
  teamName: string | null;
}
```

### ChatSession
```typescript
interface ChatSession {
  _id: string;
  userId: string;
  teamId?: string | null;
  title: string;
  associatedDatasetIds?: string[];
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string (used as lastActivityAt)
}
```

### PromptHistory (Chat Message)
```typescript
interface PromptHistory {
  _id: string;
  userId: string;
  teamId?: string | null;
  chatSessionId: string;
  promptText?: string; // Present for user messages
  messageType: 'user' | 'ai_report' | 'ai_error' | 'system';
  selectedDatasetIds: string[];
  aiResponseText?: string; // Final textual response/summary from the agent
  aiGeneratedCode?: string; // Generated React code for reports
  reportAnalysisData?: any; // Processed JSON data from analysis code execution
  status: 'pending' | 'processing' | 'completed' | 'error' | 'awaiting_user_input'; // Simplified status for listing
  errorMessage?: string;
  errorCode?: string; // Specific error code if status is 'error'
  // Agent details for rendering/debugging:
  steps?: Array<{
    tool: string;
    args: object;
    resultSummary: string;
    error?: string;
    errorCode?: string;
    attempt: number;
  }>;
  messageFragments?: Array< // Interleaved content for UI
    { type: 'text', content: string } |
    { type: 'step', tool: string, resultSummary: string, error?: string, errorCode?: string, status: 'running' | 'completed' | 'error' } |
    { type: 'error', content: string, errorCode?: string }
  >;
  createdAt: string; // ISO Date string
  completedAt?: string | null; // ISO Date string
  isStreaming?: boolean; // Transient flag used by frontend context
}
```

### SchemaResponseData (GET /datasets/:id/schema)
```typescript
interface SchemaResponseData {
  schemaInfo: Array<{ name: string; type: string; }>;
  columnDescriptions: { [columnName: string]: string; };
  description: string;
}
```

*(Other models like Team, TeamMember, Notification are omitted for brevity but follow standard structures)*

## 6. Real-time Event Streams (SSE)

The primary mechanism for real-time chat updates is Server-Sent Events (SSE) via the `GET /api/v1/chats/{sessionId}/stream` endpoint.

### SSE Event Types & Payloads

*(Payloads always include `userId`, `sessionId`, `messageId` implicitly from `AgentEventEmitter`)*

*   **`user_message_created`**: Confirms user message saved.
    *   Payload: `{ status: 'completed' }` *(Note: `messageId` in context refers to the user message ID here)*
*   **`ai_message_created`**: Provides AI message placeholder ID.
    *   Payload: `{ status: 'processing' }` *(Note: `messageId` in context refers to the AI message ID from here on)*
*   **`agent:explanation`**: User-facing explanation of the agent's current action/plan.
    *   Payload: `{ explanation: string }`
*   **`agent:using_tool`**: Indicates a tool is being called.
    *   Payload: `{ toolName: string, args: object }` *(Args may be sanitized/truncated)*
*   **`agent:tool_result`**: Provides the result or error from a tool call.
    *   Payload: `{ toolName: string, resultSummary: string, error?: string, errorCode?: string }`
*   **`token`**: Contains a chunk of generated text being streamed (less critical now with fragments).
    *   Payload: `{ content: string }`
*   **`agent:final_answer`**: Provides the final answer text and any generated code/data.
    *   Payload: `{ text: string, aiGeneratedCode?: string, analysisResult?: object }`
*   **`agent:error`**: Indicates an error during agent processing.
    *   Payload: `{ error: string, errorCode?: string }`
*   **`agent:needs_clarification`**: Agent requires user input.
    *   Payload: `{ question: string }`
*   **`error`**: Contains error information for stream-level errors (connection, setup).
    *   Payload: `{ message: string }`
*   **`end`**: Final event before the connection closes.
    *   Payload: `{ status: 'completed' | 'error' | 'closed' }`

### 7. Background Task Queues

*   **`DATASET_PARSER_QUEUE`**:
    *   **Purpose**: Asynchronous parsing of uploaded datasets
    *   **Trigger**: Immediately after dataset metadata creation
    *   **Flow**:
        1. Download original file from GCS
        2. Parse file content (CSV/XLSX)
        3. Store parsed data in GridFS
        4. Update dataset parsing status

### Frontend Handling

The frontend (`ChatContext`) uses `@microsoft/fetch-event-source` to connect to the stream, handle authentication headers, and process incoming events. It updates the `messages` state, specifically the `messageFragments` array of the relevant AI message, based on the received events (`agent:explanation`, `agent:using_tool`, `agent:tool_result`, `agent:error`, `agent:needs_clarification`). The final text and report data are set via `agent:final_answer`.

## 8. WebSocket Events (Fallback/Legacy)

WebSocket events (via Socket.IO) are still emitted by the *non-streaming* task handler (`chat.taskHandler.js`) upon final completion or error, primarily for backward compatibility or simpler non-streaming UI updates.

*   **`chat:message:completed`**: Emitted when non-streaming processing completes successfully.
    *   Payload: `{ message: PromptHistory, sessionId: string }`
*   **`chat:message:error`**: Emitted on final error during non-streaming processing.
    *   Payload: `{ messageId: string, sessionId: string, error: string }`

*(Note: Agent step events like `agent:thinking`, `agent:using_tool`, `agent:tool_result` are generally NOT sent via WebSocket in the current architecture; SSE is preferred for these granular updates.)*