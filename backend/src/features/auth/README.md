# backend/src/features/auth/README.md

## Feature: Authentication

This feature slice handles user authentication verification and session management.

### Core Flow

1.  The frontend obtains a Firebase ID token after a successful login/signup via the Firebase JS SDK.
2.  The frontend sends this token in the `Authorization: Bearer <token>` header to the backend.
3.  For session initialization/verification, the frontend calls `POST /api/v1/auth/session`.
4.  The `auth.controller` receives the request.
5.  The `auth.service` (`verifyFirebaseToken`) uses the Firebase Admin SDK to verify the token's validity and signature.
6.  If valid, the `auth.service` (`getOrCreateUser`) uses the decoded token's `uid` to find an existing user in the MongoDB database (`User` model) or creates a new user record if one doesn't exist.
7.  The user data (from MongoDB) is returned to the frontend.
8.  For subsequent requests to protected endpoints, the `shared/middleware/auth.middleware.js` performs steps 3-5 to verify the token on each request and attaches the corresponding user object from the database (`req.user`) to the request for use by downstream handlers.

### Files

*   **`auth.controller.js`**: Handles incoming HTTP requests for authentication endpoints. Parses requests, calls the service layer, and formats responses.
    *   `handleSessionLogin`: Controller for the `POST /session` endpoint.
*   **`auth.service.js`**: Contains the core business logic for authentication.
    *   `verifyFirebaseToken`: Verifies the Firebase ID token using `firebase-admin`.
    *   `getOrCreateUser`: Finds a user in the DB by `firebaseUid` or creates a new one based on the decoded token.
*   **`auth.routes.js`**: Defines the Express routes for this feature (e.g., `/session`) and maps them to controller functions.
*   **`README.md`**: This file.

### Exports

*   The `auth.routes.js` file exports the Express router for this feature, which is mounted in `backend/src/routes.js`.

### Dependencies

*   `firebase-admin` (via `shared/external_apis/firebase.client.js`)
*   `User` model (from `features/users/user.model.js`)
*   `logger` (from `shared/utils/logger.js`)
*   `express`

### API Endpoints

*   **`POST /api/v1/auth/session`**
    *   **Description:** Verifies the provided Firebase ID token and returns the corresponding application user data. Creates the user record if it's their first login.
    *   **Request:**
        *   Headers: `Authorization: Bearer <Firebase ID Token>`
        *   Body: None
    *   **Success Response (200):** `{ status: 'success', data: User }` (User object shape defined in `user.model.js`)
    *   **Error Responses:**
        *   `401 Unauthorized`: If token is missing, invalid, or expired.
        *   `500 Internal Server Error`: If database interaction or other unexpected errors occur.