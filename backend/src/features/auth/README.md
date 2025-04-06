# backend/src/features/auth/README.md

## Feature: Authentication

This feature slice handles user authentication verification based on Firebase ID tokens and establishes the user's session context within the application.

### Core Flow

1.  **Frontend:** Obtains a Firebase ID token after a successful login/signup via the Firebase JS SDK.
2.  **Frontend Request:** Sends this token in the `Authorization: Bearer <token>` header when calling `POST /api/v1/auth/session` to initialize the session.
3.  **Routing:** The request is directed to `auth.routes.js`, which maps it to `auth.controller.js`.
4.  **Controller (`auth.controller.js`):**
    *   Extracts the ID token from the `Authorization` header.
    *   Calls `authService.verifyFirebaseToken`.
    *   If verification is successful, calls `authService.getOrCreateUser` with the decoded token.
    *   Sends a success response (200) with the user data or handles errors. It specifically differentiates between 401 errors for invalid tokens and other potential errors, passing the latter to the global error handler.
5.  **Service (`auth.service.js`):**
    *   `verifyFirebaseToken`: Uses the Firebase Admin SDK (via `shared/external_apis/firebase.client.js`) to verify the token's validity and signature. Throws an error if invalid.
    *   `getOrCreateUser`:
        *   Uses the decoded token's `uid` to query the `User` model (from the `users` feature slice) in MongoDB.
        *   **If user exists:** Returns the existing user document. Ensures default values for `subscriptionInfo` and `onboardingCompleted` are set if they were missing (for backward compatibility).
        *   **If user does not exist:** Creates a new `User` record with:
            *   `firebaseUid`, `email`, `name` (defaulting to email prefix).
            *   Default `subscriptionInfo`: `{ tier: 'free', status: 'inactive' }`.
            *   Default `onboardingCompleted`: `false`.
        *   Saves the new user to the database.
        *   Returns the newly created or found user data as a plain JavaScript object.
6.  **Response:** The user data (from MongoDB) is returned to the frontend.

**(Note:** For subsequent requests to protected endpoints, the `shared/middleware/auth.middleware.js` performs token verification (similar to steps 4-5a) on each request and attaches the user object (`req.user`) to the request if valid.)

### Files

*   **`auth.controller.js`**: Handles incoming HTTP requests for `/session`. Parses requests, orchestrates calls to the service layer, and formats responses/errors.
    *   `handleSessionLogin`: The specific controller function for `POST /session`.
*   **`auth.service.js`**: Contains the core business logic for verifying tokens and managing user persistence based on authentication details.
    *   `verifyFirebaseToken`: Verifies the Firebase ID token.
    *   `getOrCreateUser`: Finds or creates the user in the DB.
*   **`auth.routes.js`**: Defines the Express route `POST /session` and maps it to `authController.handleSessionLogin`.
*   **`README.md`**: This file.

### Exports

*   The `auth.routes.js` file exports the Express router for this feature, which is mounted in `backend/src/routes.js` under the `/auth` path.

### Dependencies & Interactions

*   **Shared Modules:**
    *   `shared/external_apis/firebase.client.js`: Provides the initialized Firebase Admin SDK instance.
    *   `shared/utils/logger.js`: For logging information and errors.
*   **Other Features:**
    *   `features/users/user.model.js`: Directly depends on the `User` Mongoose model defined in the `users` feature slice to read and write user data.
*   **External Services:**
    *   Firebase Authentication (via Admin SDK): For verifying ID tokens.
*   **Middleware:**
    *   Implicitly relies on the global error handler (`shared/middleware/error.handler.js`) for non-401 errors passed via `next(error)`.
    *   Works in concert with the `protect` middleware (`shared/middleware/auth.middleware.js`) which handles token verification for other protected routes.

### API Endpoints

*   **`POST /api/v1/auth/session`**
    *   **Description:** Verifies the provided Firebase ID token and returns the corresponding application user data. Creates the user record if it's their first login, setting default subscription and onboarding statuses.
    *   **Request:**
        *   Headers: `Authorization: Bearer <Firebase ID Token>` (Required)
        *   Body: None
    *   **Success Response (200 OK):**
        ```json
        {
          "status": "success",
          "data": {
            "_id": "string",
            "firebaseUid": "string",
            "email": "string",
            "name": "string",
            "createdAt": "string",
            "settings": { ... },
            "subscriptionInfo": {
                "tier": "free",
                "status": "inactive", // Or current status if user exists
                "trialEndsAt": null,
                "subscriptionEndsAt": null
             },
            "onboardingCompleted": false // Or current status if user exists
            // ... other User model fields
          }
        }
        ```
    *   **Error Responses:**
        *   `401 Unauthorized`: If the token is missing, invalid, malformed, or expired (`{ status: 'error', message: 'No token provided.' }` or `{ status: 'error', message: 'Invalid authentication token.' }`).
        *   `500 Internal Server Error`: If database interaction fails or another unexpected server error occurs during user processing (handled by the global error handler, typically `{ status: 'error', message: 'Internal Server Error' }` or a more specific message like 'Could not process user information.').