# FE_BE_INTERACTION_README.md
# ** UPDATED FILE - Add Prompts Endpoint **

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** [Date - After Phase 4 Implementation]

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
*   **Implementation:** Frontend (`apiClient.js` interceptor), Backend (`protect` middleware).
*   **Session Initialization:** `POST /api/v1/auth/session` verifies token, gets/creates application user.

## 3. Standard Responses

*   **Success (Typically 200 OK, 201 Created):** `{ "status": "success", "data": <Payload> | null }`
*   **Client Error (Typically 4xx):** `{ "status": "error", "message": string, "code"?: string, "details"?: any }`
*   **Server Error (Typically 500):** `{ "status": "error", "message": "Internal error message." }`

## 4. Endpoint Specifications

---

### Feature: Authentication

*   **`POST /api/v1/auth/session`**
    *   **Description:** Verifies Firebase token, gets/creates application user.
    *   **Auth:** Implicit (Token provided).
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
    *   **Errors:** `400`, `401`, `500`.

---

### Feature: Datasets (Phase 3 MVP)

*   **`GET /api/v1/datasets/upload-url`**
    *   **Description:** Generates v4 signed URL for GCS upload (requires `fileSize`).
    *   **Auth:** Required (Login + Active Subscription).
    *   **Query Params:** `filename` (req), `fileSize` (req).
    *   **Success (200):** `{ status: 'success', data: { signedUrl: string, gcsPath: string } }`
    *   **Errors:** `400`, `401`, `403`, `500`.
*   **`POST /api/v1/datasets`**
    *   **Description:** Creates dataset metadata in DB after GCS upload. Parses headers.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "gcsPath": string, "originalFilename": string, "name"?: string, "fileSizeBytes"?: number }`
    *   **Success (201):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400`, `401`, `403`, `500`.
*   **`GET /api/v1/datasets`**
    *   **Description:** Lists datasets owned by the user.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success (200):** `{ status: 'success', data: Dataset[] }`
    *   **Errors:** `401`, `403`, `500`.

---

### Feature: Prompts (Phase 4 - Textual Analysis)

*   **`POST /api/v1/prompts`**
    *   **Description:** Takes a user prompt and selected dataset IDs, generates a textual analysis using Claude, saves the interaction, and returns the AI response.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds": string[] }`
    *   **Success Response (200):** `{ status: 'success', data: { aiResponse: string, promptId: string } }`
    *   **Error Responses:** `400` (Bad Request - missing fields, no datasets selected), `401` (Unauthorized), `403` (Subscription Inactive), `500` (e.g., Claude API error, DB error).

---

*(Add specifications for endpoints from future phases here)*

## 5. Key Data Models (Exchanged Objects)

*(User, SubscriptionInfo, Dataset models remain the same as previously defined)*

### Prompt Response Data (POST /prompts - Phase 4)

```typescript
interface PromptResponseData {
    aiResponse: string; // The textual analysis from Claude
    promptId: string;   // The MongoDB ObjectId (as string) of the saved PromptHistory record
}