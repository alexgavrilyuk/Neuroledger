# backend/src/shared/config/README.md

## Shared: Configuration

This directory centralizes the loading, validation, and exporting of application configuration values, primarily sourced from environment variables.

### Files

*   **`index.js`**:
    *   Loads environment variables from a `.env` file (during development) using `dotenv`. **Must be required early in the application startup process.**
    *   Defines a list of **required** environment variables:
        *   `PORT`: The port the backend server will listen on.
        *   `MONGODB_URI`: Connection string for the MongoDB database.
        *   `FIREBASE_PROJECT_ID`: Google Cloud Project ID associated with Firebase.
        *   `GCS_BUCKET_NAME`: Name of the Google Cloud Storage bucket for dataset uploads.
        *   `CLAUDE_API_KEY`: API key for accessing the Anthropic Claude API.
    *   Validates the presence of these required variables at startup. If any are missing, it logs an error to the console and **exits the process** (`process.exit(1)`).
    *   Exports a configuration object containing these values, plus defaults or additional variables for other services:
        *   `port`
        *   `mongoURI`
        *   `firebaseProjectId`
        *   `gcsBucketName`
        *   `claudeApiKey`
        *   **Cloud Tasks Config:**
            *   `projectId`: Google Cloud Project ID (defaults to `FIREBASE_PROJECT_ID`).
            *   `cloudTasksLocation`: Region for the Cloud Tasks queue (defaults to `us-central1`).
            *   `qualityAuditQueueName`: Name of the queue used for data quality audits (defaults to `neuroledger-quality-audit-queue`).
            *   `chatAiQueueName`: Name of the queue used for AI chat processing (defaults to `neuroledger-chat-ai-queue`).
            *   **NEW:** `datasetParserQueueName`: Name of the queue used for dataset parsing tasks (defaults to `neuroledger-dataset-parser-queue`).
            *   `cloudTasksServiceAccount`: Email of the service account used for OIDC token generation (optional).
            *   `serviceUrl`: Base URL of the deployed service where the task handler resides (required for Cloud Tasks HTTP targets).

### Usage

Import the configuration object anywhere in the backend where access to these settings is needed.

```javascript
// Import the configuration object
const config = require('./shared/config'); // Adjust path as necessary

// Access configuration values
const port = config.port;
const mongoURI = config.mongoURI;
const bucketName = config.gcsBucketName;
const queueName = config.datasetParserQueueName; // NEW: Access dataset parser queue name
// etc.
```

### Environment Setup

Ensure that a `.env` file exists in the `backend/` root directory during local development, containing all the required variables listed above. For production deployments, these variables should be set directly in the environment.