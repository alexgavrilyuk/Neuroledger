# FE_BE_INTERACTION_README.md

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** [Date - Update on significant changes]

## 1. Base API URL

All backend API routes are prefixed with:

`/api/v1`

The full base URL depends on the environment (development, production).
*   **Development (Default):** `http://localhost:5001/api/v1` (Configured in `frontend/.env` via `VITE_API_BASE_URL`)

## 2. Authentication

*   **Method:** JSON Web Tokens (JWT) issued by Firebase Authentication. The frontend obtains an ID token from Firebase upon user login/signup.
*   **Header:** For all **protected** backend endpoints, the frontend **must** include the Firebase ID token in the `Authorization` header:
    ```
    Authorization: Bearer <Firebase ID Token>
    ```
*   **Implementation:**
    *   **Frontend:** The `shared/services/apiClient.js` Axios instance uses an interceptor to automatically attach this header to outgoing requests if a user is logged in via Firebase.
    *   **Backend:** The `shared/middleware/auth.middleware.js` (`protect` function) verifies this token using the Firebase Admin SDK on protected routes.
*   **Session Initialization:** The frontend calls `POST /api/v1/auth/session` immediately after a Firebase login/state change to verify the token with the backend and retrieve the application user data.

## 3. Standard Responses

Backend endpoints should adhere to the following response structures where possible:

*   **Success (Typically 200 OK, 201 Created):**
    ```json
    {
      "status": "success",
      "data": <Response Payload (Object or Array)> | null
    }
    ```
*   **Client Error (Typically 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found):**
    ```json
    {
      "status": "error",
      "message": "A descriptive error message for the client/user.",
      "code": "OPTIONAL_ERROR_CODE", // e.g., "TOKEN_EXPIRED", "VALIDATION_FAILED"
      "details": {} // Optional: More specific error details, e.g., validation errors
    }
    ```
*   **Server Error (Typically 500 Internal Server Error):**
    ```json
    {
      "status": "error",
      "message": "An internal server error occurred." // Generic message for production
      // Development mode might include stack trace via error handler
    }
    ```

## 4. Endpoint Specifications (Phase 1)

---

### Feature: Authentication

*   **Endpoint:** `POST /api/v1/auth/session`
*   **Description:** Verifies the provided Firebase ID token. If valid, finds the corresponding user in the application database or creates a new user record if it's their first time. Returns the application user data.
*   **Auth:** Required (implicit, token is the subject of verification).
*   **Request:**
    *   Headers: `Authorization: Bearer <Firebase ID Token>`
    *   Body: None
*   **Success Response (200 OK):**
    *   Status Code: `200`
    *   Body:
        ```json
        {
          "status": "success",
          "data": {
            "_id": "mongodb_object_id",
            "firebaseUid": "firebase_user_uid",
            "email": "user@example.com",
            "name": "User Name",
            "createdAt": "iso_timestamp",
            "subscriptionInfo": { /* Placeholder object */ },
            "settings": { /* Placeholder object */ },
            "teams": [ /* Placeholder array */ ]
            // ... other User model fields
          }
        }
        ```
*   **Error Responses:**
    *   `401 Unauthorized`: Token missing, invalid signature, expired, or malformed. Body: `{ status: 'error', message: '...', code?: '...' }`
    *   `500 Internal Server Error`: Database error or other unexpected server issue during user lookup/creation. Body: `{ status: 'error', message: '...' }`

---

*(Add specifications for endpoints from future phases here as they are implemented)*

## 5. Key Data Models (Exchanged Objects)

*(This section will grow significantly in later phases)*

### User (Returned by `POST /auth/session`)

```typescript
interface User {
  _id: string; // MongoDB ObjectId as string
  firebaseUid: string;
  email: string;
  name?: string;
  createdAt: string; // ISO 8601 Date string
  subscriptionInfo: object; // Structure defined later
  settings: object; // Structure defined later
  teams: string[]; // Array of Team ObjectIds (as strings) - defined later
}