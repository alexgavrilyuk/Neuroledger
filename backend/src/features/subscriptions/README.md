# backend/src/features/subscriptions/README.md
# ** NEW FILE **

## Feature: Subscriptions

This feature slice manages user subscription status and plan selection. In Phase 2, it implements **dummy logic** for selecting plans and checking status, intended to be replaced later with a real payment provider integration (e.g., Stripe).

### Core Flow (Phase 2 - Dummy Logic)

1.  **Data Model:** The `User` model (`features/users/user.model.js`) includes a `subscriptionInfo` object containing `tier`, `status`, `trialEndsAt`, etc. New users default to `status: 'inactive'`.
2.  **Status Check (`GET /status`):**
    *   The `subscription.controller.getStatus` calls `subscription.service.getSubscriptionStatus`.
    *   The service retrieves the user's current `subscriptionInfo`.
    *   It includes logic to check if a `'trialing'` status has expired based on `trialEndsAt` and updates the status to `'inactive'` if necessary before returning.
3.  **Plan Selection (`POST /select`):**
    *   The frontend sends a `planId` (e.g., 'trial', 'plus').
    *   The `subscription.controller.selectPlan` calls `subscription.service.selectDummyPlan`.
    *   The service updates the user's `subscriptionInfo` based on the selected dummy plan (sets status to 'trialing' with an end date, or 'active' for paid plans).
    *   The controller returns the **entire updated user object** to ensure the frontend's `AuthContext` is refreshed with the new subscription status.
4.  **Access Control (`requireActiveSubscription` middleware):**
    *   This middleware (`shared/middleware/subscription.guard.js`) is applied to routes requiring an active subscription (e.g., prompt generation endpoint in later phases).
    *   It checks `req.user.subscriptionInfo.status` and `trialEndsAt` (if applicable).
    *   If the subscription is not considered active, it returns a `403 Forbidden` error with a specific code (`SUBSCRIPTION_INACTIVE` or `TRIAL_EXPIRED`).

### Files

*   **`subscription.service.js`**: Contains dummy logic for updating subscription status and checking expiry. Defines dummy plan details.
*   **`subscription.controller.js`**: Handles HTTP requests for getting status and selecting plans. Calls the service layer.
*   **`subscription.routes.js`**: Defines the Express routes (`/status`, `/select`) and applies the `protect` middleware.
*   **`README.md`**: This file.

### Related Files

*   `features/users/user.model.js`: Defines the `subscriptionInfo` schema within the User model. Includes `hasActiveSubscription` helper method.
*   `shared/middleware/subscription.guard.js`: Middleware used to protect routes based on subscription status.

### Exports

*   `subscription.routes.js` exports the Express router, mounted in `backend/src/routes.js`.

### API Endpoints

*   **`GET /api/v1/subscriptions/status`**
    *   **Description:** Gets the current subscription status for the authenticated user, checking for expired trials.
    *   **Auth:** Required (`protect` middleware).
    *   **Request:** None.
    *   **Success Response (200):** `{ status: 'success', data: SubscriptionInfo }` (Shape matching `subscriptionInfo` in `user.model.js`)
    *   **Error Responses:** `401` (Unauthorized), `500`.
*   **`POST /api/v1/subscriptions/select`**
    *   **Description:** Selects a dummy subscription plan for the authenticated user.
    *   **Auth:** Required (`protect` middleware).
    *   **Request Body:** `{ "planId": "trial" | "plus" | ... }`
    *   **Success Response (200):** `{ status: 'success', data: User }` (Returns the **full updated User object**)
    *   **Error Responses:** `400` (Bad Request - missing/invalid `planId`), `401` (Unauthorized), `500`.