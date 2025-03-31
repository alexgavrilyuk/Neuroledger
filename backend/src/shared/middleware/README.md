# backend/src/shared/middleware/README.md

## Shared: Middleware

This directory contains reusable Express middleware functions.

### Files

*   **`auth.middleware.js`**:
    *   Defines the `protect` middleware function.
    *   Verifies the Firebase ID token from the `Authorization` header using the Firebase Admin SDK.
    *   Fetches the corresponding MongoDB user document.
    *   Attaches the user document (as a plain object) to `req.user`.
    *   Handles token validation errors (401 Unauthorized).
*   **`error.handler.js`**:
    *   Defines a global Express error handling middleware.
    *   Logs errors and sends a standardized JSON error response. Must be the last middleware added.
*   **`subscription.guard.js`**: (New in Phase 2)
    *   Defines the `requireActiveSubscription` middleware.
    *   **Assumes `protect` middleware has already run** and `req.user` is available.
    *   Checks `req.user.subscriptionInfo.status` and `trialEndsAt` to determine if the user has active access rights.
    *   Calls `next()` if access is permitted.
    *   Returns a `403 Forbidden` response with a specific `code` ('SUBSCRIPTION_INACTIVE', 'TRIAL_EXPIRED') if access is denied due to subscription status.

### Future Files

*   `validation.middleware.js`: For request body validation.
*   `rateLimit.middleware.js`: For API rate limiting.

### Usage

Middleware functions are applied globally in `app.js` or selectively on specific routes/routers.

```javascript
// Example usage in app.js (Error Handler)
const errorHandler = require('./shared/middleware/error.handler');
// ...
app.use(errorHandler);

// Example usage in a feature route file (Protecting all routes in a feature)
const { protect } = require('../shared/middleware/auth.middleware');
router.use(protect);

// Example usage in a specific feature route (Subscription Guard)
const { requireActiveSubscription } = require('../shared/middleware/subscription.guard.js');
// Assuming 'protect' already ran on the router or earlier
router.post('/create-report', requireActiveSubscription, reportController.create);