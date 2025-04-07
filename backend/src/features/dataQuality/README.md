# backend/src/features/dataQuality/README.md

## Feature: Data Quality Audit

This feature slice provides functionality for running AI-enhanced data quality audits on uploaded datasets. It performs programmatic analysis, leverages the Anthropic Claude API for interpretation and synthesis, and utilizes Google Cloud Tasks for asynchronous processing of the potentially long-running audit task.

### Core Flow (Async via Cloud Tasks)

1.  **Initiation (`POST /datasets/{id}/quality-audit`)**:
    *   A user (via frontend) triggers an audit for a specific `datasetId`.
    *   **Controller (`initiateAudit`)**: Validates the `datasetId` format. Calls the service. Handles specific errors returned by the service (e.g., missing context, permissions, already running) with appropriate HTTP status codes (400, 403, 404, 409).
    *   **Service (`initiateQualityAudit`)**:
        *   Fetches the `Dataset` by ID.
        *   Performs permission checks: User must be the dataset owner OR an admin of the team owning the dataset (requires `TeamMember` model).
        *   Validates prerequisites: Checks if `dataset.description` and all `dataset.columnDescriptions` (based on `dataset.schemaInfo`) are present. Throws specific errors if missing.
        *   Checks `dataset.qualityStatus`: Throws errors if status is `processing`, `ok`, `warning`, or `error` (preventing re-runs without reset).
        *   Updates `Dataset`: Sets `qualityStatus` to `processing`, sets `qualityAuditRequestedAt`, clears previous report/timestamps. Saves the dataset.
        *   Creates Cloud Task: Constructs a task payload (`{ datasetId, userId }`), configures an HTTP request targeting the internal worker endpoint (`/internal/quality-audit-worker`) with an OIDC token for authentication, and enqueues the task using the `@google-cloud/tasks` client.
    *   **Response (202 Accepted)**: Controller returns `{ status: 'success', data: { status: 'processing' } }` immediately to the user, indicating the task is queued.

2.  **Worker Processing (`POST /internal/quality-audit-worker`)**:
    *   **Cloud Tasks**: Invokes the internal HTTP endpoint.
    *   **Middleware (`validateCloudTaskToken`)**: Verifies the OIDC token attached by Cloud Tasks.
    *   **Controller (`handleWorkerRequest`)**:
        *   Validates the basic payload from the task body (`datasetId`, `userId`).
        *   **Returns 200 OK immediately** to Cloud Tasks to acknowledge receipt and prevent retries due to processing time.
        *   Calls `dataQualityService.workerHandler(payload)` asynchronously in the background (without `await`). Logs errors from this background execution but doesn't influence the immediate 200 response to Cloud Tasks.
    *   **Service (`workerHandler`)**:
        *   Entry point for the background task. Calls `performFullAudit`.
        *   **Error Handling**: If `performFullAudit` throws an error, it attempts to fetch the `Dataset`, update its `qualityStatus` to `error`, set `qualityAuditCompletedAt`, and store the error message in `qualityReport.error`.
    *   **Service (`performFullAudit`)**: Orchestrates the multi-step audit:
        *   Fetches `Dataset` and related context (owner/team AI context from settings).
        *   **(B2) Programmatic Analysis**: Calls `analyzeProgrammatically`.
        *   **(B3) AI Interpretation**: Calls `performAiInterpretations`.
        *   **(B4) AI Synthesis**: Calls `generateAiFinalReport`.
        *   **(B5) Finalize**: Calls `determineOverallStatus` based on the report. Updates the `Dataset` with the final `qualityStatus`, `qualityAuditCompletedAt`, and the complete `qualityReport` object. Saves the dataset.

3.  **Status Checking (`GET /datasets/{id}/quality-audit/status`)**:
    *   User (via frontend) polls this endpoint.
    *   **Controller (`getAuditStatus`)**: Validates ID, performs access check (owner or team member using `TeamMember`), fetches `Dataset`, and returns current `qualityStatus`, `requestedAt`, and `completedAt` fields.

4.  **Report Access (`GET /datasets/{id}/quality-audit`)**:
    *   User (via frontend) requests the final report.
    *   **Controller (`getAuditReport`)**: Validates ID, performs access check, fetches `Dataset`. Returns:
        *   `404` if `qualityStatus` is `not_run`.
        *   `202` with status `processing` if `qualityStatus` is `processing`.
        *   `200` with the full `qualityReport` object (and status/timestamps) if `qualityStatus` is `ok`, `warning`, or `error`.

5.  **Reset (`DELETE /datasets/{id}/quality-audit`)**:
    *   User (via frontend) can reset a completed/failed audit to allow a new one.
    *   **Controller (`resetAudit`)**: Validates ID, performs access check. Checks status is not `processing` (409 error if it is). Resets `qualityStatus` to `not_run` and clears `qualityReport` and timestamp fields on the `Dataset`. Saves the dataset. Returns 200 OK.

### File Responsibilities

*   **`dataQuality.controller.js`**:
    *   Handles HTTP requests/responses for the five quality audit endpoints.
    *   Performs request input validation (ID formats, worker payload).
    *   Orchestrates calls to the `dataQualityService`.
    *   Handles **access control** for `GET`/`DELETE` endpoints directly by querying `Dataset` and `TeamMember` models.
    *   Manages specific HTTP error responses based on service exceptions or status checks.
    *   Handles the immediate response and background initiation pattern for the worker endpoint.
*   **`dataQuality.service.js`**:
    *   Acts as the main orchestrator for the audit process.
    *   `performFullAudit`: Orchestrates the multi-step audit logic by calling functions from `dataAnalysis`, `aiInterpretation`, and `reportGeneration`. Saves the final report and status to the `Dataset`.
    *   Re-exports core functions from the specialized modules (`cloudTaskHandler`, `dataAnalysis`, `aiInterpretation`, `reportGeneration`) for use by the controller.
*   **`cloudTaskHandler.js`**:
    *   `initiateQualityAudit`: Handles permission checks, context validation, dataset state updates, and Cloud Task creation using `@google-cloud/tasks`.
    *   `workerHandler`: Entry point for Cloud Task execution, delegates to `dataQualityService.performFullAudit`, handles top-level errors during background processing by updating dataset status.
*   **`dataAnalysis.js`**:
    *   `analyzeProgrammatically`: Reads CSV data from GCS using `papaparse` stream, computes detailed column statistics (types, missing, cardinality, etc.), and identifies basic issues (ragged rows, high missing). Returns a detailed statistics object.
*   **`aiInterpretation.js`**:
    *   `performAiInterpretations`: Selects high-priority columns based on programmatic analysis, calls `getColumnInsights` and `getOverallInsights`.
    *   `getColumnInsights`: Constructs specific prompts for Claude (Haiku model) based on column type/issues, calls the Claude API via `shared/external_apis/claude.client.js`, parses the JSON response.
    *   `getOverallInsights`: Constructs a summary prompt for Claude (Haiku model), calls the Claude API, parses the JSON response.
*   **`reportGeneration.js`**:
    *   `generateAiFinalReport`: Constructs the final synthesis prompt for Claude (Sonnet model), calls the Claude API, parses the potentially complex JSON response (handling markdown fences), adds metadata, and provides a fallback error structure if parsing fails.
    *   `determineOverallStatus`: Calculates the final `qualityStatus` (`ok`, `warning`, `error`) based on the `qualityScore` within the generated AI report.
*   **`dataQuality.routes.js`**:
    *   Defines the Express routes for both public-facing endpoints (mounted under `/datasets/:datasetId/`) and the internal worker endpoint (`/internal/quality-audit-worker`).
    *   Applies necessary middleware: `protect`, `requireActiveSubscription` for user routes; `validateCloudTaskToken` for the internal worker route.
    *   Exports two routers (`router` and `internalRouter`) for mounting in `src/routes.js`.
*   **`README.md`**: This file.

### Data Model Interaction

*   **Primary:** `Dataset` model (from `features/datasets/dataset.model.js`)
    *   **Read:** Fetches datasets by ID, reads `ownerId`, `teamId`, `description`, `columnDescriptions`, `schemaInfo`, `gcsPath`, `name`.
    *   **Write:** Updates `qualityStatus` (enum: `not_run`, `processing`, `ok`, `warning`, `error`), `qualityAuditRequestedAt` (Date), `qualityAuditCompletedAt` (Date), `qualityReport` (Mixed/Object - stores the complex JSON report from AI).
*   **Supporting:**
    *   `User` model (from `features/users/user.model.js`): Read for user context (`settings.aiContext`).
    *   `Team` model (from `features/teams/team.model.js`): Read for team context (`settings.aiContext`).
    *   `TeamMember` model (from `features/teams/team-member.model.js`): Read for permission checks (finding user's teams, checking admin role).

### External Service Interactions

*   **Google Cloud Storage (GCS)**: Reads dataset file content via stream (`analyzeProgrammatically` using `shared/external_apis/gcs.client.js`).
*   **Google Cloud Tasks**: Creates tasks (`initiateQualityAudit`) to trigger asynchronous processing. Requires queue setup and IAM permissions.
*   **Anthropic Claude API**: Makes multiple calls (`getColumnInsights`, `getOverallInsights`, `generateAiFinalReport`) using different models (Haiku, Sonnet) via `shared/external_apis/claude.client.js`. Requires API key configured.

### Dependencies

*   **Internal Features:**
    *   `datasets` (for `Dataset` model)
    *   `users` (for `User` model)
    *   `teams` (for `Team` and `TeamMember` models)
*   **Shared Modules:**
    *   `shared/middleware/auth.middleware.js` (`protect`)
    *   `shared/middleware/subscription.guard.js` (`requireActiveSubscription`)
    *   `shared/middleware/cloudTask.middleware.js` (`validateCloudTaskToken`)
    *   `shared/external_apis/gcs.client.js`
    *   `shared/external_apis/claude.client.js`
    *   `shared/external_apis/firebase.client.js` (implicitly, via `protect` middleware)
    *   `shared/config` (for Cloud Tasks queue name, location, service URL, service account email)
    *   `shared/utils/logger.js`
*   **External Libraries:**
    *   `@google-cloud/tasks`
    *   `google-auth-library` (implicitly for OIDC token generation/validation)
    *   `@anthropic-ai/sdk`
    *   `papaparse` (for CSV streaming/parsing)
    *   `express`
    *   `mongoose`

### Google Cloud Tasks Setup (Required)

*Follow these steps if not already done:*

1.  **Enable API**: `gcloud services enable cloudtasks.googleapis.com --project=[PROJECT_ID]`
2.  **Create Queue**: `gcloud tasks queues create [QUEUE_NAME] --location=[LOCATION] --project=[PROJECT_ID]` (e.g., `neuroledger-quality-audit-queue` in `us-central1`)
3.  **IAM Permissions**: The service account running the backend (or specified in `config.cloudTasksServiceAccount`) needs roles to enqueue tasks and create OIDC tokens for invocation:
    *   `roles/cloudtasks.enqueuer`
    *   `roles/iam.serviceAccountTokenCreator` (needed for OIDC token generation)
    *   The invoking service account (used by Cloud Tasks to call your service) needs appropriate permissions if your endpoint requires authentication beyond the OIDC token itself (e.g., `roles/run.invoker` if deployed on Cloud Run). The `validateCloudTaskToken` middleware handles the OIDC validation.

### API Endpoints

*   **`POST /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Description**: Initiates an asynchronous quality audit for the specified dataset. Requires dataset description and column descriptions to be set. Fails if an audit is already running or completed (use DELETE to reset).
    *   **Request Params**: `datasetId` (MongoDB ObjectId)
    *   **Success (202 Accepted)**: `{ status: 'success', data: { status: 'processing' } }`
    *   **Errors**:
        *   `400 Bad Request`: Invalid `datasetId` format; Missing context (`dataset.description` or `dataset.columnDescriptions`), includes `code: 'MISSING_CONTEXT'` or `code: 'MISSING_COLUMN_DESCRIPTIONS'`. 
        *   `403 Forbidden`: User does not have permission (not owner or team admin).
        *   `404 Not Found`: Dataset with the given ID not found.
        *   `409 Conflict`: Audit already in progress (`code: 'AUDIT_IN_PROGRESS'`) or completed (`code: 'AUDIT_ALREADY_COMPLETE'`).

*   **`GET /api/v1/datasets/{datasetId}/quality-audit/status`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Description**: Gets the current status (`not_run`, `processing`, `ok`, `warning`, `error`) and timestamps for a quality audit.
    *   **Request Params**: `datasetId` (MongoDB ObjectId)
    *   **Success (200 OK)**: `{ status: 'success', data: { qualityStatus: string, requestedAt: Date|null, completedAt: Date|null } }`
    *   **Errors**:
        *   `400 Bad Request`: Invalid `datasetId` format.
        *   `404 Not Found`: Dataset not found or user lacks access.

*   **`GET /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Description**: Gets the complete audit report if available.
    *   **Request Params**: `datasetId` (MongoDB ObjectId)
    *   **Success (200 OK - Completed)**: `{ status: 'success', data: { qualityStatus: 'ok'|'warning'|'error', requestedAt: Date, completedAt: Date, report: Object } }` (where `report` is the detailed JSON structure from AI synthesis).
    *   **Success (202 Accepted - Processing)**: `{ status: 'success', data: { qualityStatus: 'processing', requestedAt: Date, message: 'Quality audit is still processing.' } }`
    *   **Errors**:
        *   `400 Bad Request`: Invalid `datasetId` format.
        *   `404 Not Found`: Dataset not found or user lacks access; No audit run yet (`code: 'NO_AUDIT'`).

*   **`DELETE /api/v1/datasets/{datasetId}/quality-audit`**
    *   **Auth**: Required (Login + Active Subscription)
    *   **Description**: Resets a completed or failed audit, clearing the status and report fields on the dataset to allow running a new audit.
    *   **Request Params**: `datasetId` (MongoDB ObjectId)
    *   **Success (200 OK)**: `{ status: 'success', data: { qualityStatus: 'not_run', message: 'Quality audit has been reset...' } }`
    *   **Errors**:
        *   `400 Bad Request`: Invalid `datasetId` format.
        *   `404 Not Found`: Dataset not found or user lacks access.
        *   `409 Conflict`: Cannot reset while audit is `processing` (`code: 'AUDIT_IN_PROGRESS'`).

*   **`POST /api/v1/internal/quality-audit-worker`**
    *   **Auth**: Internal - Validated via Cloud Tasks OIDC Token (`validateCloudTaskToken` middleware). **Not for direct frontend use.**
    *   **Description**: Internal worker endpoint invoked by Cloud Tasks to process quality audits asynchronously.
    *   **Request Body**: `{ datasetId: string, userId: string }`
    *   **Success (200 OK)**: `{ status: 'success', message: 'Task received and processing started' }` (Returned immediately). Actual processing happens in background.
    *   **Errors**:
        *   `400 Bad Request`: Invalid payload from Cloud Task.
        *   `401/403`: Invalid/Missing OIDC token (handled by middleware).
        *   *(Note: Background processing errors are logged and attempt to update dataset status, but the endpoint itself usually returns 200 to prevent Cloud Task retries).*