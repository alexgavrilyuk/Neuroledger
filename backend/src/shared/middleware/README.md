# backend/src/shared/middleware/README.md

## Shared: Middleware

This directory contains reusable Express middleware functions applied globally or to specific routes/features to handle common cross-cutting concerns like authentication, authorization, error handling, and request validation.

### Files

*   **`auth.middleware.js`**:
    *   Exports `protect`.
    *   **Purpose:** Verifies user authentication based on a Firebase ID token provided in the `Authorization: Bearer <token>` header.
    *   **Functionality:**
        *   Uses `firebase-admin` (via `shared/external_apis/firebase.client.js`) to verify the token.
        *   Fetches the corresponding `User` document from the database using the `firebaseUid` from the decoded token.
        *   Attaches the full Mongoose `User` document (as a plain object using `.toObject()`) to `req.user`.
        *   Handles missing tokens, invalid/expired tokens (returning 401 with specific messages/codes), and cases where the user isn't found in the DB.

*   **`error.handler.js`**:
    *   Exports `errorHandler`.
    *   **Purpose:** Global error handling middleware. **Must be the last middleware added** in `app.js`.
    *   **Functionality:**
        *   Catches errors passed via `next(error)`.
        *   Logs the full error using the shared logger.
        *   Sends a standardized JSON error response: `{ status: 'error', message: string, stack?: string }`.
        *   Sets appropriate HTTP status code (defaults to 500 if not already set).
        *   Includes the error stack trace only in the `development` environment.

*   **`subscription.guard.js`**:
    *   Exports `requireActiveSubscription`.
    *   **Purpose:** Enforces subscription-based access control for specific features/endpoints. **Requires `protect` middleware to have run previously.**
    *   **Functionality:**
        *   Checks the `subscriptionInfo` on the `req.user` object (attached by `protect`).
        *   Uses the `user.hasActiveSubscription()` helper method (defined in `user.model.js`) or falls back to checking status (`active` or `trialing`).
        *   Specifically checks for trial expiry (`trialEndsAt`) if status is `trialing`.
        *   Calls `next()` if the subscription is considered active.
        *   Returns a `403 Forbidden` response with a specific `code` (`SUBSCRIPTION_INACTIVE` or `TRIAL_EXPIRED`) if access is denied.

*   **`cloudTask.middleware.js`**:
    *   Exports `validateCloudTaskToken`.
    *   **Purpose:** Authenticates requests coming from Google Cloud Tasks to internal worker endpoints (like the data quality audit worker).
    *   **Functionality:**
        *   Expects an OIDC token in the `Authorization: Bearer <token>` header (sent automatically by Cloud Tasks when configured with OIDC).
        *   Uses `google-auth-library` to verify the token's signature and claims.
        *   Validates the token's `audience` claim against the expected worker endpoint URL (from `shared/config`).
        *   Validates the token's `email` claim against the expected Cloud Tasks service account email (from `shared/config` or default).
        *   Attaches the verified token payload to `req.cloudTaskPayload` for potential downstream use.
        *   Returns `401 Unauthorized` or `403 Forbidden` if validation fails.

### Future Files

*   `validation.middleware.js`: For request body validation.
*   `rateLimit.middleware.js`: For API rate limiting.

### Usage

Middleware functions are typically applied in `app.js` (for global middleware like `errorHandler`) or within specific feature route files (`*.routes.js`) using `router.use()` for router-level middleware or directly on individual routes.

```javascript
// Example: Global error handler in app.js
const errorHandler = require('./shared/middleware/error.handler.js');
// ... (other app setup)
app.use(errorHandler); // Must be last

// Example: Protecting all routes in teams.routes.js
const { protect } = require('../../shared/middleware/auth.middleware');
router.use(protect);

// Example: Route requiring subscription in prompts.routes.js
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard.js');
// Assumes 'protect' already ran via router.use(protect)
router.post('/', requireActiveSubscription, promptController.generateAndExecuteReport);

// Example: Protecting internal worker route in dataQuality.routes.js
const { validateCloudTaskToken } = require('../../shared/middleware/cloudTask.middleware.js');
internalRouter.post('/internal/quality-audit-worker', validateCloudTaskToken, dataQualityController.handleWorkerRequest);