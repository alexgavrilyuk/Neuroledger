# backend/src/shared/external_apis/README.md

## Shared: External API Clients

This directory contains initialized clients and wrappers for interacting with third-party APIs.

### Files (Phase 1)

*   **`firebase.client.js`**:
    *   Initializes the Firebase Admin SDK using `firebase-admin`.
    *   Loads the service account key (`firebase-service-account.json`) from the **backend root directory**.
    *   Uses the `FIREBASE_PROJECT_ID` from the shared config.
    *   Includes error handling for initialization failure.
    *   Exports the initialized `admin` instance.

### Future Files

*   `gcs.client.js`: For Google Cloud Storage interaction.
*   `claude.client.js`: For Anthropic Claude API interaction.
*   `email.service.js`: Wrapper for an email sending service (e.g., SendGrid).
*   `stripe.client.js`: For Stripe API interaction.

### Usage

Import the specific client needed in service files.

```javascript
// Example usage in auth.service.js
const admin = require('../../shared/external_apis/firebase.client');

// Use the admin SDK
admin.auth().verifyIdToken(token);

```

Dependencies:

firebase-admin

path

shared/config

shared/utils/logger