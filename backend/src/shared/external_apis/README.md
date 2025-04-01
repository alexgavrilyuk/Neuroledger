// backend/src/shared/external_apis/README.md
// ** UPDATED FILE - Add Claude Client **
# backend/src/shared/external_apis/README.md

## Shared: External API Clients

This directory contains initialized clients and wrappers for interacting with third-party APIs.

### Files

*   **`firebase.client.js`**:
    *   Initializes the Firebase Admin SDK using `firebase-admin`.
    *   Loads `firebase-service-account.json` from the backend root.
    *   Exports the initialized `admin` instance.
*   **`gcs.client.js`**:
    *   Initializes the Google Cloud Storage client (`@google-cloud/storage`).
    *   Loads `gcs-service-account.json` from the backend root.
    *   Exports the `storage` instance and a `getBucket` helper function.
*   **`claude.client.js`**: (New in Phase 4)
    *   Initializes the Anthropic Claude client (`@anthropic-ai/sdk`).
    *   Loads the `CLAUDE_API_KEY` from the shared config.
    *   Exports an initialized `anthropic` client instance.

### Future Files

*   `email.service.js`: Wrapper for an email sending service.
*   `stripe.client.js`: For Stripe API interaction.

### Usage

Import the specific client or helper needed in service files.

```javascript
// Example usage in prompt.service.js
const anthropic = require('../../shared/external_apis/claude.client');

const response = await anthropic.messages.create({ /* ... Claude API params ... */ });

```