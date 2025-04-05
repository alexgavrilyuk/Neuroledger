# FE_BE_INTERACTION_README.md
# ** UPDATED FILE - Added Dataset Deletion Endpoint **

# NeuroLedger: Frontend / Backend API Interaction

This document defines the contract for communication between the NeuroLedger frontend (React) and backend (Node.js/Express) services.

**Last Updated:** [Date - After Context Enhancements]

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

### Feature: Users (New)

*   **`GET /api/v1/users/me`**
    *   Gets current user's profile information.
    *   **Auth:** Required.
    *   **Success (200):** `{ status: 'success', data: User }`
    *   **Errors:** `401` (Unauthorized), `404` (User not found), `500`.
*   **`PUT /api/v1/users/me/settings`**
    *   Updates user settings, including business context.
    *   **Auth:** Required.
    *   **Request:** `{ currency?: string, dateFormat?: string, aiContext?: string }`
    *   **Success (200):** `{ status: 'success', data: User }`
    *   **Errors:** `401` (Unauthorized), `404` (User not found), `500`.

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
    *   **Request:** `{ gcsPath, originalFilename, name?, fileSizeBytes?, teamId? }`
    *   **Success (201):** `{ data: Dataset }`
*   **`GET /api/v1/datasets`**
    *   Lists user's datasets.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ data: Dataset[] }` (Note: Should include `_id` and `gcsPath`)
*   **`GET /api/v1/datasets/{id}/read-url`**
    *   Generates a signed URL for reading the dataset content (used by frontend before sending to worker).
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`GET /api/v1/datasets/{id}`** (New)
    *   Gets a single dataset with details.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`GET /api/v1/datasets/{id}/schema`** (New)
    *   Gets dataset schema information and column descriptions.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: { schemaInfo: Array, columnDescriptions: Object, description: string } }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`PUT /api/v1/datasets/{id}`** (New)
    *   Updates dataset information (context and column descriptions).
    *   **Auth:** Required (Login + Sub).
    *   **Request:** `{ description?: string, columnDescriptions?: Object }`
    *   **Success (200):** `{ status: 'success', data: Dataset }`
    *   **Errors:** `400` (Invalid ID), `404` (Dataset not found/accessible), `500`.

*   **`DELETE /api/v1/datasets/{id}`** (New)
    *   Deletes a dataset and its associated file in GCS.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', message: 'Dataset deleted successfully' }`
    *   **Errors:** `400` (Invalid ID), `403` (Not allowed for team datasets), `404` (Dataset not found/accessible), `500`.

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

### User with Added Settings

```typescript
interface User {
  _id: string;
  firebaseUid: string;
  email: string;
  name?: string;
  createdAt: string;
  settings: {
    currency: string;        // "USD", "EUR", etc.
    dateFormat: string;      // "YYYY-MM-DD", "MM/DD/YYYY", etc.
    aiContext?: string;      // Business context for Claude
  };
  subscriptionInfo: SubscriptionInfo;
  onboardingCompleted: boolean;
  teams?: string[];          // Array of Team IDs
}

```

Dataset with Added Context Fields

```typescript
interface Dataset {
  _id: string;
  name: string;
  description?: string;      // Overall dataset context
  gcsPath: string;
  originalFilename: string;
  fileSizeBytes?: number;
  ownerId: string;
  teamId?: string;
  schemaInfo: Array<{        // Column information
    name: string;
    type: string;            // "string", "number", "date", etc.
  }>;
  columnDescriptions: {      // Column descriptions for context
    [columnName: string]: string;
  };
  isIgnored: boolean;
  createdAt: string;
  lastUpdatedAt: string;
}
```

Schema Response
```
interface SchemaResponse {
  schemaInfo: Array<{
    name: string;
    type: string;
  }>;
  columnDescriptions: {
    [columnName: string]: string;
  };
  description: string;
}
```

Prompt Generation Response Data (POST /prompts - Phase 5 Client-Side Exec)
```
interface PromptGenResponseData {
    aiGeneratedCode: string | null; // Null if generation failed
    promptId: string;
}
```



