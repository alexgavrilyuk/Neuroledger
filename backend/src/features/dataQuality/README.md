# backend/src/features/dataQuality/README.md

## Feature: Data Quality Audit

This feature slice provides functionality for running AI-enhanced data quality audits on uploaded datasets. It leverages Google Cloud Tasks for asynchronous processing of potentially long-running audits.

### Core Flow

1. **Initiation**: User triggers an audit from the frontend. Backend validates context completeness, creates a Cloud Task, and sets dataset status to 'processing'.
2. **Worker Processing**: Cloud Task calls the internal worker endpoint, which performs:
   - Programmatic analysis (streaming CSV, checking types, missing values, etc.)
   - AI interpretation of specific issues using Claude
   - AI synthesis into a comprehensive report
3. **Status Checking**: Frontend polls for status during processing
4. **Report Access**: User views the completed report with insights and recommendations

### Files

* **`dataQuality.service.js`**: Business logic for initiating audits, performing analysis, and AI processing.
* **`dataQuality.controller.js`**: Express route handlers for quality audit endpoints.
* **`dataQuality.routes.js`**: Defines API routes and applies middleware.
* **`README.md`**: This file.

### Related Files

* `shared/middleware/cloudTask.middleware.js`: Validates Cloud Tasks tokens
* `shared/config`: Configuration values for Cloud Tasks
* Existing middleware (`protect`, `requireActiveSubscription`)

### Dependencies

* `@google-cloud/tasks`, `google-auth-library`, `@anthropic-ai/sdk`, `papaparse`

### Google Cloud Tasks Setup

1. **Enable API**: `gcloud services enable cloudtasks.googleapis.com`
2. **Create Queue**: `gcloud tasks queues create neuroledger-quality-audit-queue --location=us-central1`
3. **IAM Setup**:  Service account needs Cloud Tasks Enqueuer and Cloud Tasks Service Agent roles
gcloud projects add-iam-policy-binding [PROJECT_ID]
--member="serviceAccount:[SERVICE_ACCOUNT]"
--role="roles/cloudtasks.enqueuer"
gcloud projects add-iam-policy-binding [PROJECT_ID]
--member="serviceAccount:[SERVICE_ACCOUNT]"
--role="roles/iam.serviceAccountTokenCreator"

### API Endpoints

* **`POST /api/v1/datasets/{id}/quality-audit`**
* **Auth**: Required (Login + Sub)
* **Description**: Initiates a quality audit for the specified dataset
* **Success (202)**: `{ status: 'success', data: { status: 'processing' } }`
* **Errors**: `400` (Missing context), `403` (No permission), `404` (Not found), `409` (Already running/complete)

* **`GET /api/v1/datasets/{id}/quality-audit/status`**
* **Auth**: Required (Login + Sub)
* **Description**: Gets current status of an audit
* **Success (200)**: `{ status: 'success', data: { qualityStatus, requestedAt, completedAt } }`
* **Errors**: `400` (Bad ID), `404` (Not found)

* **`GET /api/v1/datasets/{id}/quality-audit`**
* **Auth**: Required (Login + Sub)
* **Description**: Gets the complete audit report
* **Success (200)**: `{ status: 'success', data: { qualityStatus, requestedAt, completedAt, report } }`
* **Success (202)**: If still processing: `{ status: 'success', data: { qualityStatus: 'processing', requestedAt } }`
* **Errors**: `400` (Bad ID), `404` (Not found/No audit)

* **`DELETE /api/v1/datasets/{id}/quality-audit`**
* **Auth**: Required (Login + Sub)
* **Description**: Resets an audit to allow running a new one
* **Success (200)**: `{ status: 'success', data: { qualityStatus: 'not_run', message } }`
* **Errors**: `400` (Bad ID), `404` (Not found), `409` (In progress)

* **`POST /api/v1/internal/quality-audit-worker`**
* **Auth**: Cloud Tasks OIDC token validation
* **Description**: Internal worker endpoint that processes quality audits
* **Not for direct frontend use**