# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** April 16, 2025

## 1. Base API URL

`/api/v1` (Default Dev: `http://localhost:5001/api/v1`)

## 2. Authentication & Authorization

*   **Authentication:** Most routes require a valid Firebase ID token sent in the `Authorization: Bearer <ID Token>` header. This is verified by the `protect` middleware on the backend, which also attaches the corresponding application user object to `req.user`.
*   **Session Initialization:** The frontend should initiate a session by calling `POST /auth/session` after obtaining a Firebase token upon user login/signup.
*   **Subscription Check:** Many features (e.g., Datasets, Prompts, Data Quality) additionally require the user to have an active subscription. This is enforced by the `requireActiveSubscription` middleware, which checks the `req.user.subscriptionInfo` status. Requests will fail with a `403 Forbidden` (Code: `SUBSCRIPTION_INACTIVE` or `TRIAL_EXPIRED`) if the subscription is not active.
*   **Team Roles:** Specific actions within the `teams` feature require the user to be a member (`isTeamMember` middleware) or an admin (`isTeamAdmin` middleware) of the relevant team. Access control for team-related resources (like Datasets) also relies on team membership or admin status.

## 3. Standard Responses

*   **Success (2xx):** `{ "status": "success", "data": <Payload> | null }`
    *   `200 OK`: Standard success.
    *   `201 Created`: Resource successfully created.
    *   `202 Accepted`: Request accepted for processing (e.g., async task started).
*   **Error (4xx/5xx):** `{ "status": "error", "message": string, "code"?: string }`
    *   The `code` field may provide specific reasons for errors (e.g., `TOKEN_EXPIRED`, `SUBSCRIPTION_INACTIVE`, `AUDIT_IN_PROGRESS`, `MISSING_CONTEXT`, `NO_AUDIT`).
    *   `400 Bad Request`: Invalid input, missing parameters, validation error.
    *   `401 Unauthorized`: Authentication token missing, invalid, or expired.
    *   `403 Forbidden`: User authenticated but lacks permission (e.g., inactive subscription, insufficient team role).
    *   `404 Not Found`: Resource (e.g., dataset, team, user) not found or user lacks access.
    *   `409 Conflict`: Action cannot be performed due to current state (e.g., audit already running).
    *   `500 Internal Server Error`: Unexpected backend error.

## 4. Endpoint Specifications

---

### Feature: Authentication

*   **`POST /api/v1/auth/session`**
    *   **Description:** Verifies the Firebase ID token from the header, finds or creates the corresponding application user in the database, and returns the user data.
    *   **Auth:** Firebase ID Token in Header (implicitly handled by `apiClient`).
    *   **Request:** None.
    *   **Success (200 OK):** `{ status: 'success', data: User }`
    *   **Errors:**
        *   `401 Unauthorized`: Token missing/invalid (`No token provided.`, `Invalid authentication token.`). User not found in DB (`User not found.`).
        *   `500 Internal Server Error`: (`Could not process user information.`).

---

### Feature: Chat Streaming

*   **`GET /api/v1/chats/{sessionId}/stream`**
    *   **Description:** Streams chat responses in real-time using Server-Sent Events (SSE). The connection remains open while the AI generates a response, with updates sent as events.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Query Params:** 
        * `promptText` (string, required): The user's message text.
        * `selectedDatasetIds` (string, optional): Comma-separated list of dataset IDs to use for context (required for first message in a session).
    *   **Server-Sent Event Types:**
        * `start`: Initial event when streaming begins.
          * Payload: `{}`
        * `user_message_created`: Confirms user message has been saved with its ID.
          * Payload: `{ messageId: string, status: 'completed' }`
        * `ai_message_created`: Provides the AI message placeholder ID.
          * Payload: `{ messageId: string, status: 'processing' }`
        * `token`: Contains a chunk of generated text being streamed.
          * Payload: `{ content: string }`
        * `agent:thinking`: Indicates the agent is thinking/reasoning.
          * Payload: `{ messageId: string, sessionId: string }`
        * `agent:using_tool`: Indicates a tool is being called.
          * Payload: `{ messageId: string, sessionId: string, toolName: string, args: object }`
        * `agent:tool_result`: Provides the result from a tool call.
          * Payload: `{ messageId: string, sessionId: string, toolName: string, resultSummary: string, error?: string }`
        * `agent:final_answer`: Contains the final answer text and potential code.
          * Payload: `{ messageId: string, sessionId: string, text: string, aiGeneratedCode?: string, analysisResult?: object }`
        * `agent:error`: Indicates an error during agent processing.
          * Payload: `{ messageId: string, sessionId: string, error: string }`
        * `error`: Contains error information if something went wrong.
          * Payload: `{ message: string }`
        * `end`: Final event before the connection closes.
          * Payload: `{ status: 'completed'|'error' }`
    *   **Errors:** 
        * Standard HTTP errors (`400`, `401`, `403`, `404`, `500`) for initial connection issues.
        * SSE `error` events for problems during streaming.
    *   **Notes:**
        * The frontend should handle reconnection for network interruptions.
        * For clients that don't support EventSource with Auth headers, the Auth token should be included in URL params.
        * See `frontend/src/features/dashboard/services/chat.api.js` for a reference implementation.

### Feature: Subscriptions (Dummy)

*   **`GET /api/v1/subscriptions/status`**
    *   **Description:** Gets the current subscription status for the authenticated user, automatically checking for expired trials and updating status if needed.
    *   **Auth:** Required (`protect`).
    *   **Request:** None.
    *   **Success (200 OK):** `{ status: 'success', data: SubscriptionInfo }`
    *   **Errors:** `401`, `500` (User not found).

*   **`POST /api/v1/subscriptions/select`**
    *   **Description:** Selects a dummy subscription plan (`trial` or `plus`) for the authenticated user, updating their `subscriptionInfo`.
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "planId": string }` (e.g., "trial", "plus")
    *   **Success (200 OK):** `{ status: 'success', data: User }` (Returns the **full updated User object**)
    *   **Errors:** `400` (Missing/invalid `planId`), `401`, `500` (User not found).

---

### Feature: Users

*   **`GET /api/v1/users/me`**
    *   **Description:** Retrieves the complete profile information for the currently authenticated user.
    *   **Auth:** Required (`protect`).
    *   **Request:** None.
    *   **Success (200 OK):** `{ status: 'success', data: User }`
    *   **Errors:** `401`, `404` (User not found), `500`.

*   **`PUT /api/v1/users/me/settings`**
    *   **Description:** Updates the settings (currency, dateFormat, aiContext, preferredAiModel) for the currently authenticated user. Only provided fields are updated.
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "currency"?: string, "dateFormat"?: string, "aiContext"?: string, "preferredAiModel"?: string }`
    *   **Success (200 OK):** `{ status: 'success', data: User }` (Full updated User object)
    *   **Errors:** `401`, `404` (User not found), `500`.

---

### Feature: Datasets

*   **`GET /api/v1/datasets/upload-url`**
    *   **Description:** Generates a short-lived GCS v4 signed URL for direct client-to-GCS PUT upload.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Query Params:** `filename` (string, required), `fileSize` (number, required).
    *   **Success (200 OK):** `{ status: 'success', data: { signedUrl: string, gcsPath: string } }`
    *   **Errors:** `400` (Missing/invalid params), `401`, `403`, `500`.

*   **`POST /api/v1/datasets/proxy-upload`**
    *   **Description:** Uploads file via backend proxy. Backend streams to GCS, parses headers, creates dataset metadata. **User must be admin of the team if `teamId` is provided.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request:** `multipart/form-data` with `file` field (File, max 50MB) and optional `teamId` field (string, ObjectId).
    *   **Success (201 Created):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (No file), `401`, `403` (Subscription inactive; Not team admin if `teamId` provided), `500` (GCS upload error, metadata creation error).

*   **`POST /api/v1/datasets`**
    *   **Description:** Creates dataset metadata AFTER successful direct client-to-GCS upload. Used with the `upload-url` flow. **User must be admin of the team if `teamId` is provided.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ gcsPath: string, originalFilename: string, name?: string, fileSizeBytes?: number, teamId?: string }`
    *   **Success (201 Created):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Missing required fields), `401`, `403` (Subscription inactive; Not team admin if `teamId` provided), `500` (DB error, GCS file not found during header parse).

*   **`GET /api/v1/datasets`**
    *   **Description:** Lists datasets accessible to the user (personal + teams user is member of). Includes `isTeamDataset` and `teamName` in each dataset object. Sorted by creation date descending.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request:** None.
    *   **Success (200 OK):** `{ status: 'success', data: [Dataset & { isTeamDataset: boolean, teamName: string|null }] }`
    *   **Errors:** `401`, `403`, `500`.

*   **`GET /api/v1/datasets/{id}`**
    *   **Description:** Gets details for a single dataset. **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Not owner/member), `404` (Not found or inaccessible), `500`.

*   **`GET /api/v1/datasets/{id}/schema`**
    *   **Description:** Gets schema info (`schemaInfo`, `columnDescriptions`, `description`). **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { schemaInfo: Array<{ name: string, type: string }>, columnDescriptions: Object, description: string } }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Not owner/member), `404` (Not found or inaccessible), `500`.

*   **`GET /api/v1/datasets/{id}/read-url`**
    *   **Description:** Generates a short-lived signed URL for reading dataset content from GCS. **NOTE: Backend currently only checks for dataset owner, not team membership.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive), `404` (Dataset not found or not accessible by owner; GCS file missing), `500` (URL generation failed).

*   **`PUT /api/v1/datasets/{id}`**
    *   **Description:** Updates dataset `description` and/or `columnDescriptions`. **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Request Body:** `{ description?: string, columnDescriptions?: Object }`
    *   **Success (200 OK):** `{ status: 'success', data: Dataset }` (Updated dataset)
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Not owner/member), `404` (Not found or inaccessible), `500`.

*   **`DELETE /api/v1/datasets/{id}`**
    *   **Description:** Deletes dataset metadata from DB and associated file from GCS. **User must be owner OR admin of the team the dataset belongs to.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Params:** `id` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', message: 'Dataset deleted successfully' }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Permission denied for team dataset), `404` (Not found or inaccessible), `500`.

---

### Feature: Data Quality Audit

*   **`POST /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Description:** Initiates an asynchronous quality audit for the specified dataset. Requires dataset description and column descriptions to be set. Fails if an audit is already running or completed.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Permission:** User must be dataset owner OR a team admin if it's a team dataset.
    *   **Request Params:** `datasetId` (MongoDB ObjectId).
    *   **Request Body:** None.
    *   **Success (202 Accepted):** `{ status: 'success', data: { status: 'processing' } }`
    *   **Errors:**
        *   `400`: Invalid `datasetId`; Missing context (`code: 'MISSING_CONTEXT'`) or incomplete column descriptions (`code: 'MISSING_COLUMN_DESCRIPTIONS'`).
        *   `401`, `403` (Subscription inactive; Not owner/team admin).
        *   `404`: Dataset not found.
        *   `409 Conflict`: Audit already running (`code: 'AUDIT_IN_PROGRESS'`) or completed (`code: 'AUDIT_ALREADY_COMPLETE'`).
        *   `500`.

*   **`GET /api/v1/datasets/{datasetId}/quality-audit/status`**
    *   **Description:** Gets the current status (`not_run`, `processing`, `ok`, `warning`, `error`) and timestamps for a quality audit.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Permission:** User must be dataset owner OR any team member if it's a team dataset.
    *   **Request Params:** `datasetId` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { qualityStatus: string, requestedAt: Date|null, completedAt: Date|null } }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Not owner/member), `404` (Not found or inaccessible), `500`.
    *   **Frontend Usage:** This endpoint should be polled every 5 seconds during audit processing until status changes from `processing`. A timeout of 10 minutes is recommended.

*   **`GET /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Description:** Gets the complete audit report if available.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Permission:** User must be dataset owner OR any team member if it's a team dataset.
    *   **Request Params:** `datasetId` (MongoDB ObjectId).
    *   **Success (200 OK - Completed):** `{ status: 'success', data: { qualityStatus: 'ok'|'warning'|'error', requestedAt: Date, completedAt: Date, report: Object } }`
    *   **Success (202 Accepted - Processing):** `{ status: 'success', data: { qualityStatus: 'processing', requestedAt: Date, message: 'Quality audit is still processing.' } }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Not owner/member), `404` (Not found or inaccessible; No audit run yet - `code: 'NO_AUDIT'`), `500`.

*   **`DELETE /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Description:** Resets a completed or failed audit on the dataset. Cannot reset while processing.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Permission:** User must be dataset owner OR any team member if it's a team dataset.
    *   **Request Params:** `datasetId` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { qualityStatus: 'not_run', message: 'Quality audit has been reset successfully' } }`
    *   **Errors:** `400` (Invalid ID), `401`, `403` (Subscription inactive; Not owner/member), `404` (Not found or inaccessible), `409 Conflict` (Audit in progress - `code: 'AUDIT_IN_PROGRESS'`), `500`.

*   **`POST /api/v1/internal/quality-audit-worker`**
    *   **Description:** Internal worker endpoint invoked by Cloud Tasks to process quality audits asynchronously. **Not for direct frontend use.**
    *   **Auth:** Internal - Validated via Cloud Tasks OIDC Token (`validateCloudTaskToken` middleware).
    *   **Request Body:** `{ "datasetId": string, "userId": string }`
    *   **Success (200 OK):** `{ status: 'success', message: 'Task received and processing started' }` (Returned immediately, actual processing happens in background).
    *   **Errors:** `400` (Invalid payload), `401`/`403` (Invalid/Missing OIDC token).
    *   **Note:** The worker immediately returns 200 OK to Cloud Tasks and processes the audit asynchronously, updating the dataset status upon completion or failure.

---

### Feature: Teams

*   **`POST /api/v1/teams`**
    *   **Description:** Create a new team. The creator becomes the owner and an admin.
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "name": string, "settings"?: { "currency"?: string, "dateFormat"?: string, "aiContext"?: string } }`
    *   **Success (201 Created):** `{ status: 'success', data: Team }`
    *   **Errors:** `400` (Missing name), `401`, `500`.

*   **`GET /api/v1/teams`**
    *   **Description:** List all teams the current user is a member of. Includes the user's role (`userRole`) in each team object.
    *   **Auth:** Required (`protect`).
    *   **Success (200 OK):** `{ status: 'success', data: [Team & { userRole: 'admin'|'member' }] }`
    *   **Errors:** `401`, `500`.

*   **`GET /api/v1/teams/{teamId}`**
    *   **Description:** Get team details, including a list of members with their roles.
    *   **Auth:** Required (`protect`) + Team Membership (`isTeamMember`).
    *   **Request Params:** `teamId` (ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: Team & { members: TeamMember[] } }`
    *   **Errors:** `401`, `403` (Not member), `404` (Team not found), `500`.

*   **`PUT /api/v1/teams/{teamId}/settings`**
    *   **Description:** Update team settings (currency, dateFormat, aiContext).
    *   **Auth:** Required (`protect`) + Team Admin Role (`isTeamAdmin`).
    *   **Request Params:** `teamId` (ObjectId).
    *   **Request Body:** `{ "settings": { "currency"?: string, "dateFormat"?: string, "aiContext"?: string } }` (Requires `settings` object).
    *   **Success (200 OK):** `{ status: 'success', data: Team }` (Updated team)
    *   **Errors:** `400` (Missing settings), `401`, `403` (Not admin), `404` (Team not found), `500`.

*   **`GET /api/v1/teams/{teamId}/datasets`**
    *   **Description:** Get all datasets associated with this specific team.
    *   **Auth:** Required (`protect`) + Team Membership (`isTeamMember`).
    *   **Request Params:** `teamId` (ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: Dataset[] }`
    *   **Errors:** `401`, `403` (Not member), `404` (Team not found), `500`.

*   **`POST /api/v1/teams/{teamId}/invites`**
    *   **Description:** Invite a user (by email) to join the team. Creates `TeamInvite` record + notification.
    *   **Auth:** Required (`protect`) + Team Admin Role (`isTeamAdmin`).
    *   **Request Params:** `teamId` (ObjectId).
    *   **Request Body:** `{ "email": string, "role"?: "admin" | "member" }` (Role defaults to 'member').
    *   **Success (201 Created):** `{ status: 'success', data: TeamInvite }`
    *   **Errors:** `400` (Missing email; User already member/invited), `401`, `403` (Not admin), `404` (Team not found), `500`.

*   **`GET /api/v1/teams/invites/pending`**
    *   **Description:** Get pending, non-expired invites for the current authenticated user (by email).
    *   **Auth:** Required (`protect`).
    *   **Success (200 OK):** `{ status: 'success', data: [FormattedTeamInvite] }` (Includes `teamName`, `invitedBy.name`, etc.)
    *   **Errors:** `401`, `500`.

*   **`POST /api/v1/teams/invites/{inviteId}/accept`**
    *   **Description:** Accept a team invitation. Creates `TeamMember` record, updates invite status, creates notification.
    *   **Auth:** Required (`protect`).
    *   **Request Params:** `inviteId` (ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { teamId: string, role: string } }`
    *   **Errors:** `400` (Invite not found/processed/expired; Email mismatch; Already member), `401`, `404` (User not found), `500`.

*   **`POST /api/v1/teams/invites/{inviteId}/reject`**
    *   **Description:** Reject a team invitation. Updates invite status.
    *   **Auth:** Required (`protect`).
    *   **Request Params:** `inviteId` (ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { success: true } }`
    *   **Errors:** `400` (Invite not found/processed; Email mismatch), `401`, `404` (User not found), `500`.

*   **`PUT /api/v1/teams/{teamId}/members/{memberId}/role`**
    *   **Description:** Update a team member's role. Cannot demote last admin. Creates notification.
    *   **Auth:** Required (`protect`) + Team Admin Role (`isTeamAdmin`).
    *   **Request Params:** `teamId` (ObjectId), `memberId` (User ObjectId).
    *   **Request Body:** `{ "role": "admin" | "member" }` (Required).
    *   **Success (200 OK):** `{ status: 'success', data: TeamMember }` (Updated member record)
    *   **Errors:** `400` (Invalid role; Member not found; Cannot demote last admin), `401`, `403` (Not admin), `404` (Team not found), `500`.

*   **`DELETE /api/v1/teams/{teamId}/members/{memberId}`**
    *   **Description:** Remove a member from the team. Cannot remove last admin. Creates notification.
    *   **Auth:** Required (`protect`) + Team Admin Role (`isTeamAdmin`).
    *   **Request Params:** `teamId` (ObjectId), `memberId` (User ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { success: true } }`
    *   **Errors:** `400` (Member not found; Cannot remove last admin), `401`, `403` (Not admin), `404` (Team not found), `500`.

---

### Feature: Prompts

*   **`POST /api/v1/prompts`**
    *   **Description:** Takes prompt/datasets context, triggers AI code generation, returns the generated JS React component code string. Execution happens client-side.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds": string[] }`
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": {
            "aiGeneratedCode": "string",
            "promptId": "string"
          }
        }
        ```
    *   **Error Response (e.g., 500, 400):**
        ```json
        {
          "status": "error",
          "message": "Error generating AI code: <Details>",
          "data": { "promptId": "string" } // ID if history record created before failure
        }
        ```
    *   **Other Errors:** `400` (Bad request), `401`, `403` (Subscription inactive).
    *   **Note:** This endpoint is implemented in the Chat feature's routes.

---

### Feature: Chat (Agent Architecture)

*   **`POST /api/v1/chats`**
    *   **Description:** Creates a new chat session for the authenticated user.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Body:** `{ "teamId"?: string, "title"?: string }` (Both optional).
    *   **Success (201 Created):** `{ status: 'success', data: ChatSession }`
    *   **Errors:** `400` (Validation errors), `401`, `403`, `500`.

*   **`GET /api/v1/chats`**
    *   **Description:** Lists chat sessions accessible to the user (personal + teams user is member of), sorted by last activity descending.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Query Params:** `limit` (number, default 10), `skip` (number, default 0).
    *   **Success (200 OK):** `{ status: 'success', data: [ChatSession] }`
    *   **Errors:** `401`, `403`, `500`.

*   **`GET /api/v1/chats/{sessionId}`**
    *   **Description:** Gets details for a single chat session. Accessible if user is owner or member of the team the session belongs to.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: ChatSession }`
    *   **Errors:** `400` (Invalid ID), `401`, `403`, `404` (Not found or inaccessible), `500`.

*   **`PATCH /api/v1/chats/{sessionId}`**
    *   **Description:** Updates the title of a chat session. Accessible if user is owner or member of the team the session belongs to.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Request Body:** `{ "title": string }` (Required).
    *   **Success (200 OK):** `{ status: 'success', data: ChatSession }` (Updated session)
    *   **Errors:** `400` (Invalid ID, Missing title), `401`, `403`, `404` (Not found or inaccessible), `500`.

*   **`DELETE /api/v1/chats/{sessionId}`**
    *   **Description:** Deletes a chat session. Accessible if user is owner or member of the team the session belongs to.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', message: 'Chat session deleted successfully' }`
    *   **Errors:** `400` (Invalid ID), `401`, `403`, `404` (Not found or inaccessible), `500`.

*   **`POST /api/v1/chats/{sessionId}/messages`**
    *   **Description:** Sends a user message, creates AI message placeholder, and queues agent processing.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds"?: string[] }` (`promptText` required, `selectedDatasetIds` required only for the first message).
    *   **Success (202 Accepted):** `{ status: 'success', data: { userMessage: PromptHistory, aiMessage: PromptHistory, updatedSession: ChatSession } }` (Returns the created user message, the placeholder AI message, and the updated session which now includes `associatedDatasetIds` if it was the first message).
    *   **Errors:** `400` (Invalid ID, Missing `promptText`, Missing `selectedDatasetIds` on first message), `401`, `403`, `404` (Session not found or inaccessible), `500`.

*   **`GET /api/v1/chats/{sessionId}/messages`**
    *   **Description:** Gets messages (user messages and final AI agent responses). AI responses may include generated React code (`aiGeneratedCode`) for visualization and message fragments (`messageFragments`) for UI rendering.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Query Params:** `limit` (number, default 50), `skip` (number, default 0).
    *   **Success (200 OK):** `{ status: 'success', data: [PromptHistory] }` including `aiGeneratedCode` and `messageFragments` if present.
    *   **Errors:** `400` (Invalid ID), `401`, `403`, `404` (Session not found or inaccessible), `500`.

*   **`GET /api/v1/chats/{sessionId}/messages/{messageId}`**
    *   **Description:** Gets a single message by its ID within a specific chat session.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId), `messageId` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: PromptHistory }`
    *   **Errors:** `400` (Invalid IDs), `401`, `403`, `404` (Message/Session not found or inaccessible), `500`.

*   **`GET /api/v1/chats/{sessionId}/stream`**
    *   **Description:** Streams chat responses in real-time using Server-Sent Events (SSE). Same functionality as described in the Chat Streaming section.
    *   **Auth:** Required (`protect`, `requireActiveSubscription`).
    *   **Request Params:** `sessionId` (MongoDB ObjectId).
    *   **Query Params:**
        * `promptText` (string, required): The user's message text.
        * `selectedDatasetIds` (string, optional): Comma-separated list of dataset IDs.
    *   **Server-Sent Events:** As described in the Chat Streaming section.
    *   **Errors:** As described in the Chat Streaming section.

*   **`POST /api/v1/internal/chat-ai-worker`**
    *   **Description:** Internal worker endpoint invoking the Agent Executor. Agent performs history summarization and has access to dataset tools, code generation, code execution, and report generation.
    *   **Auth:** Internal - Validated via Cloud Tasks OIDC Token (`validateCloudTaskToken` middleware).
    *   **Request Body:** `{ "sessionId": string, "userId": string, "userMessageId": string, "aiMessageId": string, "sessionDatasetIds": string[] }` (Payload from the task queue, including the dataset IDs associated with the session).
    *   **Success (200 OK):** `{ status: 'success', message: 'Task received' }` (Returned immediately, actual processing happens in background).
    *   **Errors:** `400` (Invalid payload), `401`/`403` (Invalid/Missing OIDC token).

---

### Feature: Notifications

*   **`GET /api/v1/notifications`**
    *   **Description:** Retrieves notifications for the current user, sorted by creation date descending, with pagination.
    *   **Auth:** Required (`protect`).
    *   **Query Params:** `limit` (number, optional, default: 20), `skip` (number, optional, default: 0).
    *   **Success (200 OK):** `{ status: 'success', data: { notifications: Notification[], total: number, hasMore: boolean } }`
    *   **Errors:** `401`, `500`.

*   **`GET /api/v1/notifications/unread-count`**
    *   **Description:** Gets the count of unread notifications for the current user.
    *   **Auth:** Required (`protect`).
    *   **Success (200 OK):** `{ status: 'success', data: { count: number } }`
    *   **Errors:** `401`, `500`.

*   **`PUT /api/v1/notifications/mark-read`**
    *   **Description:** Marks notifications as read for the current user.
    *   **Auth:** Required (`protect`).
    *   **Request Body:** `{ "notificationIds"?: [string] }` (If null/empty, marks all as read).
    *   **Success (200 OK):** `{ status: 'success', data: { modifiedCount: number } }`
    *   **Errors:** `401`, `500`.

*   **`DELETE /api/v1/notifications/:notificationId`**
    *   **Description:** Deletes a specific notification belonging to the current user.
    *   **Auth:** Required (`protect`).
    *   **Request Params:** `notificationId` (MongoDB ObjectId).
    *   **Success (200 OK):** `{ status: 'success', data: { success: true } }`
    *   **Errors:** `400` (Invalid ID), `401`, `404` (Not found or not owned), `500`.

---

## 5. Key Data Models (Typescript Interfaces)

*(Note: These interfaces represent the shape of data exchanged via the API/WebSockets/SSE. Backend models may have additional methods or virtuals.)*

### SubscriptionInfo (Part of User)
```typescript
interface SubscriptionInfo {
  tier: 'free' | 'trial' | 'plus' | 'pro';
  status: 'active' | 'inactive' | 'trialing' | 'past_due' | 'canceled';
  trialEndsAt?: string | null; // ISO Date string
  subscriptionEndsAt?: string | null; // ISO Date string
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}
```

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
    preferredAiModel?: string; // 'claude', 'gemini', or 'openai'
  };
  subscriptionInfo: SubscriptionInfo;
  onboardingCompleted: boolean;
  teams?: string[]; // Array of Team ObjectIds
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
  schemaInfo: Array<{
    name: string;
    type: string; // e.g., "string", "number", "date", "unknown"
  }>;
  columnDescriptions: { // Object representation of Map<String, String>
    [columnName: string]: string;
  };
  isIgnored: boolean;
  createdAt: string; // ISO Date string
  lastUpdatedAt: string; // ISO Date string
  // Quality Audit Fields
  qualityStatus: 'not_run' | 'processing' | 'ok' | 'warning' | 'error';
  qualityAuditRequestedAt?: string | null; // ISO Date string
  qualityAuditCompletedAt?: string | null; // ISO Date string
  qualityReport?: object | null; // Stores the detailed JSON report
}

// Note: GET /datasets returns an array of this type, with additional fields:
interface ListedDataset extends Dataset {
  isTeamDataset: boolean;
  teamName: string | null;
}
```

### Team
```typescript
interface Team {
  _id: string;
  name: string;
  settings: {
    currency: string;
    dateFormat: string;
    aiContext?: string;
  };
  ownerId: string; // User ObjectId
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

// Note: GET /teams returns array of Team & { userRole: 'admin'|'member' }
// Note: GET /teams/:id returns Team & { members: TeamMember[] }
```

### TeamMember
```typescript
interface TeamMember {
  _id: string; // User ObjectId
  name: string; // Populated from User
  email: string; // Populated from User
  role: 'admin' | 'member';
  joinedAt: string; // ISO Date string
}
```

### TeamInvite
```typescript
interface TeamInvite {
  _id: string;
  teamId: string; // Team ObjectId
  invitedByUserId: string; // User ObjectId
  inviteeEmail: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: string; // ISO Date string
  expiresAt: string; // ISO Date string
}

// Note: GET /teams/invites/pending returns array of this type, formatted with:
interface FormattedTeamInvite extends Omit<TeamInvite, 'teamId' | 'invitedByUserId'> {
  teamId: string; // Kept as string
  teamName: string; // Populated
  invitedBy: {
    name: string;
    email: string;
  };
}
```

### Notification
```typescript
interface Notification {
  _id: string;
  userId: string; // User ObjectId
  type: 'team_invite' | 'team_join' | 'team_role_change' | 'system';
  title: string;
  message: string;
  data?: { // Contextual data, e.g., inviteId, teamId
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: string; // ISO Date string
}
```

### SchemaResponseData (GET /datasets/:id/schema)
```typescript
interface SchemaResponseData {
  schemaInfo: Array<{
    name: string;
    type: string;
  }>;
  columnDescriptions: {
    [columnName: string]: string;
  };
  description: string;
}
```

### PromptGenResponseData (POST /prompts)
```typescript
interface PromptGenResponseData {
  aiGeneratedCode: string | null; // Null if generation failed
  promptId: string; // ObjectId of PromptHistory record
}
```

### ChatSession
```typescript
interface ChatSession {
  _id: string;
  userId: string; // User ObjectId
  teamId?: string | null; // Team ObjectId or null
  title: string; // User-defined or default title
  associatedDatasetIds?: string[]; // Datasets used for context in this session (set by first message)
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string (updated on new message or agent completion)
  lastActivityAt: string; // ISO Date string (used for sorting)
}
```

### PromptHistory (Chat Message - User or AI Agent Response)
```typescript
interface PromptHistory {
  _id: string;
  userId: string; 
  teamId?: string | null;
  chatSessionId: string; 
  promptText?: string; 
  messageType: 'user' | 'ai_report' | 'ai_error' | 'system';
  selectedDatasetIds: string[]; // Datasets used for context
  contextSent?: string; // Info sent in prompt for debugging
  aiResponseText?: string; // Final textual response/summary from the agent
  aiGeneratedCode?: string; // Contains generated React code if a report was created
  status: 'pending' | 'processing' | 'generating_code' | 'fetching_data' |
          'execution_pending' | 'executing_code' | 'completed' |
          'error_generating' | 'error_fetching_data' | 'error_executing' | 'error';
  errorMessage?: string;
  executionResult?: string;
  durationMs?: number;
  claudeModelUsed?: string;
  // Reports
  reportAnalysisData?: any; // Stores the processed JSON from analysis
  reportDatasets?: Array<{
    name: string,
    content: string | null,
    error: string | null
  }>;
  // Agent details
  steps?: Array<{
    tool: string;
    args: object;
    resultSummary: string;
    error?: string;
    attempt: number;
  }>;
  messageFragments?: Array<
    { type: 'text', content: string } |
    { type: 'step', tool: string, resultSummary: string, error?: string, status: string }
  >;
  createdAt: string; // ISO Date string
}
```

## 6. Event Streams

### Server-Sent Events (SSE)

The streaming endpoint (`GET /api/v1/chats/{sessionId}/stream`) emits events to the client via Server-Sent Events:

* **`start`**
  * Initial event when streaming begins
  * Payload: `{}`

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
  * Contains error information if something went wrong
  * Payload: `{ message: string }`

* **`end`**
  * Final event before the connection closes
  * Payload: `{ status: 'completed'|'error' }`

### WebSocket Events

For backward compatibility, the agent and task handler also emit events to the WebSocket room `user:{userId}`:

* **`agent:thinking`**
  * Emitted when agent starts processing
  * Payload: `{ messageId: string, sessionId: string }`

* **`agent:using_tool`**
  * Emitted before tool execution
  * Payload: `{ messageId: string, sessionId: string, toolName: string, args: object }`

* **`agent:tool_result`**
  * Emitted after tool execution
  * Payload: `{ messageId: string, sessionId: string, toolName: string, resultSummary: string, error?: string }`

* **`agent:error`**
  * Emitted on agent error
  * Payload: `{ messageId: string, sessionId: string, error: string }`

* **`chat:message:completed`**
  * Emitted when processing completes successfully
  * Payload: `{ message: PromptHistory, sessionId: string }`

* **`chat:message:error`**
  * Emitted on final error
  * Payload: `{ messageId: string, sessionId: string, error: string }`

## 7. Dataset File Upload Flow

### Dataset Upload - Proxy Method (Recommended)
1.  Frontend creates `FormData` with the `file` and optional `teamId`.
2.  Frontend sends `POST` request to `/api/v1/datasets/proxy-upload` with `Content-Type: multipart/form-data`. (Requires Login + Active Sub).
3.  Backend receives file, validates permissions (user must be team admin if `teamId` provided), streams file to GCS.
4.  On successful GCS upload, backend parses headers, creates `Dataset` metadata in DB.
5.  Backend responds with `201 Created` and the new `Dataset` object.

### Dataset Upload - Direct Method (Alternative)
1.  Frontend requests signed URL: `GET /api/v1/datasets/upload-url?filename=...&fileSize=...` (Requires Login + Active Sub).
2.  Backend responds with `{ signedUrl, gcsPath }`.
3.  Frontend uploads file directly to GCS `signedUrl` using `PUT` method (with correct Content-Length header).
4.  After successful GCS upload, frontend notifies backend: `POST /api/v1/datasets` with body `{ gcsPath, originalFilename, name?, fileSizeBytes?, teamId? }` (Requires Login + Active Sub). Backend validates permissions (user must be team admin if `teamId` provided).
5.  Backend parses headers from GCS, creates `Dataset` metadata in DB.
6.  Backend responds with `201 Created` and the new `Dataset` object.

## 8. Chat Interaction Flows

### Standard Message Flow

1. **Session Initialization:**
   * User creates/selects chat session via `POST /chats` or `GET /chats`.
   * Session stored in `ChatSession` collection.

2. **Message Submission:**
   * Frontend submits via `POST /chats/:sessionId/messages`.
   * User message saved in `PromptHistory` (status='completed').
   * AI placeholder created in `PromptHistory` (status='processing').
   * If first message, selectedDatasetIds associated with session.
   * Cloud Task queued targeting `/internal/chat-ai-worker`.

3. **Asynchronous Processing:**
   * Cloud Task triggers `chat.controller.handleWorkerRequest`.
   * Controller delegates to `chat.taskHandler.workerHandler`.
   * TaskHandler initializes Agent with context.

4. **Agent Loop:**
   * Agent executes tool calls as needed.
   * Emit status via WebSocket events.
   * Updates `PromptHistory` record with final response.

5. **Response Retrieval:**
   * Frontend polls or receives WebSocket events.
   * Displays final AI message with visualization if code was generated.

### Streaming Message Flow

1. **Message Submission:**
   * Frontend connects to `GET /chats/:sessionId/stream?promptText=...`.
   * Backend creates user message and AI placeholder.
   * If first message, selectedDatasetIds associated with session.
   * SSE connection remains open.

2. **Real-Time Processing:**
   * Backend streams events in real-time via SSE.
   * Frontend receives token-by-token text updates.
   * Frontend receives tool usage and results updates.
   * Agent simultaneously updates `PromptHistory` record.

3. **Completion:**
   * Agent sends final `agent:final_answer` and `end` events.
   * SSE connection closes.
   * Frontend has the complete message and any generated code.

## 9. Multi-Provider LLM Support

The backend now supports multiple LLM providers. User preferences are stored in the `preferredAiModel` field:

```typescript
settings: {
  // Other settings...
  preferredAiModel?: string; // 'claude', 'gemini', or 'openai'
}
```

Model selection is handled by `getUserModelPreference()` in `prompt.service.js`, which returns provider-specific details:

```javascript
{ provider: 'claude', model: 'claude-3-7-sonnet-20250219' } // Default model
// OR
{ provider: 'gemini', model: 'gemini-2.5-pro-preview-03-25' }
// OR
{ provider: 'openai', model: 'o3-mini-2025-01-31' }
```

If the preferred provider is unavailable, the service falls back to Claude.