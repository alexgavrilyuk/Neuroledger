// backend/src/shared/external_apis/README.md
// ** UPDATED FILE - Add Claude Client **
# backend/src/shared/external_apis/README.md

## Shared: External API Clients

This directory initializes and exports configured clients for interacting with essential third-party APIs used by the NeuroLedger backend.

### Initialization Approach

Each client file attempts to initialize its respective SDK upon application startup. If initialization fails due to missing credentials or other critical errors, it logs a detailed error message and **terminates the backend process** (`process.exit(1)`) to prevent unexpected runtime failures in features relying on these APIs.

### Files

*   **`firebase.client.js`**:
    *   **Purpose:** Initializes the Firebase Admin SDK using `firebase-admin`. Used primarily for ID token verification (`protect` middleware) and potentially other Firebase services.
    *   **Credentials:** Requires `firebase-service-account.json` to be present in the **root `backend/` directory**. Reads `projectId` from `shared/config`.
    *   **Exports:** The initialized `admin` instance (`require('firebase-admin')`).

*   **`gcs.client.js`**:
    *   **Purpose:** Initializes the Google Cloud Storage client (`@google-cloud/storage`). Used for uploading, reading, and deleting dataset files.
    *   **Credentials:** Requires `gcs-service-account.json` to be present in the **root `backend/` directory**. Reads `projectId` and `gcsBucketName` from `shared/config`.
    *   **Exports:**
        *   `storage`: The raw initialized `Storage` instance.
        *   `getBucket`: A helper function that returns an initialized reference to the specific GCS bucket defined in `config.gcsBucketName`. **This is the preferred way to access the bucket.**

*   **`claude.client.js`**:
    *   **Purpose:** Initializes the Anthropic Claude client (`@anthropic-ai/sdk`). Used for all AI interactions (code generation, data quality analysis).
    *   **Credentials:** Requires the `CLAUDE_API_KEY` environment variable to be set (loaded via `shared/config`).
    *   **Exports:** The initialized `anthropic` client instance.

### Future Files

*   `email.service.js`: Wrapper for an email sending service.
*   `stripe.client.js`: For Stripe API interaction.

### Usage

Import the required client instance or helper function directly into service files where interaction with the external API is needed.

```javascript
// Example: Using GCS bucket helper in dataset.service.js
const { getBucket } = require('../../shared/external_apis/gcs.client');
const bucket = getBucket();
const file = bucket.file(gcsPath);
await file.delete();

// Example: Using Claude client in prompt.service.js
const anthropic = require('../../shared/external_apis/claude.client');
if (anthropic) { // Good practice to check if client initialized successfully
  const response = await anthropic.messages.create({ /* ... */ });
}

// Example: Using Firebase Admin in auth.middleware.js (or auth.service.js)
const admin = require('../../shared/external_apis/firebase.client');
const decodedToken = await admin.auth().verifyIdToken(idToken);
```

### Security Note on Service Accounts

Currently, the Firebase and GCS clients load credentials from JSON files expected in the `backend/` root directory. While `.gitignore` should prevent committing these files, consider migrating to loading credentials directly from environment variables or a dedicated secret management service for improved security and alignment with standard deployment practices.