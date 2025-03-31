# FE_BE_INTERACTION_README.md

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** [Date - After Phase 3 Implementation]

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

## 4. Endpoint Specifications

---

### Feature: Authentication

*   **`POST /api/v1/auth/session`**
    *   **Description:** Verifies Firebase token, gets/creates application user.
    *   **Auth:** Implicit (Token provided for verification).
    *   **Request:** Headers: `Authorization: Bearer <Token>`. Body: None.
    *   **Success (200):** `{ status: 'success', data: User }`
    *   **Errors:** `401`, `500`.

---

### Feature: Subscriptions (Phase 2 - Dummy)

*   **`GET /api/v1/subscriptions/status`**
    *   **Description:** Gets current subscription status, checks trial expiry.
    *   **Auth:** Required (Login).
    *   **Success (200):** `{ status: 'success', data: SubscriptionInfo }`
    *   **Errors:** `401`, `500`.
*   **`POST /api/v1/subscriptions/select`**
    *   **Description:** Selects a dummy plan for the user.
    *   **Auth:** Required (Login).
    *   **Request Body:** `{ "planId": string }`
    *   **Success (200):** `{ status: 'success', data: User }` (Returns full updated user object).
    *   **Errors:** `400` (Invalid planId), `401`, `500`.

---

### Feature: Datasets (Phase 3 MVP)

*   **`GET /api/v1/datasets/upload-url`**
    *   **Description:** Generates a v4 signed URL for direct GCS file upload, requiring the exact file size for signature validity.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Query Params:**
        *   `filename` (string, required): The original name of the file.
        *   `fileSize` (number, required): The exact size of the file in bytes.
    *   **Success Response (200):** `{ status: 'success', data: { signedUrl: string, gcsPath: string } }`
    *   **Error Responses:** `400` (Missing or invalid `filename`/`fileSize`), `401`, `403`, `500`.
*   **`POST /api/v1/datasets`**
    *   **Description:** Creates dataset metadata in DB after GCS upload. Parses file headers.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "gcsPath": string, "originalFilename": string, "name"?: string, "fileSizeBytes"?: number }`
    *   **Success Response (201 Created):** `{ status: 'success', data: Dataset }` (Includes parsed `schemaInfo`).
    *   **Error Responses:** `400` (Missing required fields), `401`, `403`, `500`.
*   **`GET /api/v1/datasets`**
    *   **Description:** Lists datasets owned by the user.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success Response (200):** `{ status: 'success', data: Dataset[] }` (Excludes `schemaInfo` by default).
    *   **Error Responses:** `401`, `403`, `500`.

---

*(Add specifications for endpoints from future phases here)*

## 5. Key Data Models (Exchanged Objects)

### User (From `POST /auth/session`, `POST /subscriptions/select`)

```typescript
interface User {
  _id: string; // MongoDB ObjectId as string
  firebaseUid: string;
  email: string;
  name?: string;
  createdAt: string; // ISO 8601 Date string
  onboardingCompleted: boolean;
  subscriptionInfo: SubscriptionInfo;
  settings: object; // Placeholder
  teams: string[]; // Placeholder: Array of Team ObjectIds (as strings)
}

interface SubscriptionInfo {
    tier: 'free' | 'trial' | 'plus' | 'pro';
    status: 'active' | 'inactive' | 'trialing' | 'past_due' | 'canceled';
    trialEndsAt?: string | null; // ISO 8601 Date string or null
    subscriptionEndsAt?: string | null; // ISO 8601 Date string or null
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
}

```

### Dataset (From POST /datasets, GET /datasets)

```typescript

interface ColumnSchemaInfo {
    name: string; // Header name
    type: string; // Basic inferred type (e.g., 'string')
}

interface Dataset {
  _id: string; // MongoDB ObjectId as string
  name: string;
  description?: string;
  gcsPath: string;
  originalFilename: string;
  fileSizeBytes?: number;
  ownerId: string; // User ObjectId as string
  teamId?: string | null; // Team ObjectId as string
  schemaInfo?: ColumnSchemaInfo[]; // Array of column info (present on POST, excluded on GET list by default)
  columnDescriptions?: Record<string, string>; // Map of headerName -> description (Phase 8)
  isIgnored: boolean;
  createdAt: string; // ISO 8601 Date string
  lastUpdatedAt: string; // ISO 8601 Date string
}

```

### Upload URL Response Data (GET /datasets/upload-url)

```typescript
interface UploadUrlData {
    signedUrl: string; // The v4 signed URL for PUT request
    gcsPath: string;   // The destination path in GCS for the file
}

```