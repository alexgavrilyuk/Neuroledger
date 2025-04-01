# FE_BE_INTERACTION_README.md
# ** UPDATED FILE - Update Prompts Endpoint Response **

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** [Date - After Phase 5 Implementation]

## 1. Base API URL

`/api/v1` (Default Dev: `http://localhost:5001/api/v1`)

## 2. Authentication

`Authorization: Bearer <Firebase ID Token>` on protected routes. Verified by `protect` middleware. Session init via `POST /auth/session`.

## 3. Standard Responses

*   **Success:** `{ "status": "success", "data": <Payload> | null }`
*   **Error:** `{ "status": "error", "message": string, "code"?: string, "details"?: any }`

## 4. Endpoint Specifications

---

### Feature: Authentication

*   **`POST /api/v1/auth/session`**
    *   Verifies token, gets/creates user.
    *   **Success (200):** `{ status: 'success', data: User }`

---

### Feature: Subscriptions (Dummy)

*   **`GET /api/v1/subscriptions/status`**
    *   Gets current status, checks trial expiry.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: SubscriptionInfo }`
*   **`POST /api/v1/subscriptions/select`**
    *   Selects dummy plan.
    *   **Auth:** Required.
    *   **Request:** `{ "planId": string }`
    *   **Success (200):** `{ status: 'success', data: User }`

---

### Feature: Datasets

*   **`GET /api/v1/datasets/upload-url`**
    *   Generates GCS signed URL for PUT upload.
    *   **Auth:** Required (Login + Sub).
    *   **Query:** `filename` (req), `fileSize` (req).
    *   **Success (200):** `{ data: { signedUrl, gcsPath } }`
*   **`POST /api/v1/datasets`**
    *   Creates dataset metadata after GCS upload.
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ gcsPath, originalFilename, name?, fileSizeBytes? }`
    *   **Success (201):** `{ data: Dataset }`
*   **`GET /api/v1/datasets`**
    *   Lists user's datasets.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ data: Dataset[] }`

---

### Feature: Prompts (Phase 5 - Code Gen & Execution)

*   **`POST /api/v1/prompts`**
    *   **Description:** Takes prompt/datasets, triggers AI code gen, executes code securely on backend, returns rendered output or error.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds": string[] }`
    *   **Success Response (200):**
        ```json
        {
          "status": "success",
          "data": {
            "executionOutput": "<string>", // Rendered HTML string OR error message string
            "executionStatus": "completed" | "error_executing" | "error_generating", // Status from backend execution/generation
            "promptId": "<string>" // MongoDB ObjectId of the PromptHistory record
          }
        }
        ```
    *   **Error Responses:** `400`, `401`, `403`, `500` (e.g., Claude API error, Context error, Uncaught execution error).

---

## 5. Key Data Models (Exchanged Objects)

*(User, SubscriptionInfo, Dataset models remain the same)*

### Prompt Execution Response Data (POST /prompts - Phase 5)

```typescript
interface PromptExecutionResponseData {
    executionOutput: string; // Can be HTML string on success, or error message string on failure.
    executionStatus: 'completed' | 'error_executing' | 'error_generating';
    promptId: string;        // The MongoDB ObjectId (as string) of the saved PromptHistory record
}

```