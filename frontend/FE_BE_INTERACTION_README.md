# FE_BE_INTERACTION_README.md
# ** UPDATED FILE - Prompt response + Dataset Read URL **

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** [Date - After Phase 5 Shift to Client-Side Execution]

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
    *   **Success (200):** `{ data: Dataset[] }` (Note: Should include `_id` and `gcsPath`)
*   **`GET /api/v1/datasets/{id}/read-url`**
    *   **Description:** Generates a signed URL for reading the dataset content (used by frontend before sending to worker).
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

---

### Feature: Prompts (Phase 5 - Client-Side Execution)

*   **`POST /api/v1/prompts`**
    *   **Description:** Takes prompt/datasets context, triggers AI code generation, returns the generated code string. **Execution now happens client-side.**
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "promptText": string, "selectedDatasetIds": string[] }`
    *   **Success Response (200):**
        ```json
        {
          "status": "success",
          "data": {
            "aiGeneratedCode": "<string>", // The raw JS code string from Claude
            "promptId": "<string>" // MongoDB ObjectId of the PromptHistory record
          }
        }
        ```
     * **Error Response (e.g., 500, 400):**
         ```json
         {
             "status": "error",
             "message": "Error generating AI code: <Claude/Service Error Details>",
             "data": {
                "promptId": "<string>" // ID if history record was created
             }
         }
         ```
    *   **Other Errors:** `401`, `403`.

---

## 5. Key Data Models (Exchanged Objects)

*(User, SubscriptionInfo, Dataset models remain mostly the same, ensure Dataset list includes `gcsPath`)*

### Prompt Generation Response Data (POST /prompts - Phase 5 Client-Side Exec)

```typescript
interface PromptGenResponseData {
    aiGeneratedCode: string | null; // Null if generation failed
    promptId: string;
}
```