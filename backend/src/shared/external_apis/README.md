# backend/src/shared/external_apis/README.md
# ** UPDATED FILE **

## Shared: External API Clients

This directory contains initialized clients and wrappers for interacting with third-party APIs.

### Files

*   **`firebase.client.js`**:
    *   Initializes the Firebase Admin SDK using `firebase-admin`.
    *   Loads `firebase-service-account.json` from the backend root.
    *   Exports the initialized `admin` instance.
*   **`gcs.client.js`**: (New in Phase 3)
    *   Initializes the Google Cloud Storage client (`@google-cloud/storage`).
    *   Loads `gcs-service-account.json` from the backend root.
    *   Exports the `storage` instance and a `getBucket` helper function to retrieve the configured bucket instance based on `GCS_BUCKET_NAME` from config.

### Future Files

*   `claude.client.js`: For Anthropic Claude API interaction.
*   `email.service.js`: Wrapper for an email sending service.
*   `stripe.client.js`: For Stripe API interaction.

### Usage

Import the specific client or helper needed in service files.

```javascript
// Example usage in dataset.service.js
const { getBucket } = require('../../shared/external_apis/gcs.client');
const bucket = getBucket();
const [url] = await bucket.file(gcsPath).getSignedUrl(options);
```