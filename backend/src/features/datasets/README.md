# backend/src/features/datasets/README.md
# ** UPDATED FILE - Add read URL endpoint **

## Feature: Datasets

This feature slice handles the management of user-uploaded datasets, including upload initiation, metadata storage, listing, and providing secure read access URLs.

### Core Flow

1.  **Upload Initiation (`GET /upload-url`):** Frontend requests a v4 signed URL for PUT upload to GCS, providing `filename` and `fileSize`. Backend generates URL with `contentLengthRange`.
2.  **File Upload (Frontend):** Frontend performs `PUT` to GCS signed URL.
3.  **Metadata Creation (`POST /`):** Frontend notifies backend after GCS upload. Backend parses headers from GCS file using `parseHeadersFromGCS`, creates `Dataset` document in MongoDB.
4.  **Listing Datasets (`GET /`):** Frontend requests list. Backend finds datasets owned by user.
5.  **Read URL Generation (`GET /{id}/read-url`):** Frontend requests a short-lived signed URL to read a specific dataset's content directly from GCS. Used before sending data to the client-side Web Worker.

### Files

*   **`dataset.model.js`**: Mongoose schema for the `datasets` collection.
*   **`dataset.service.js`**: Business logic for generating signed URLs (upload and **read**), parsing headers, creating metadata, and listing datasets.
*   **`dataset.controller.js`**: Express route handlers, including `getReadUrl`.
*   **`dataset.routes.js`**: Defines API routes and applies middleware.
*   **`README.md`**: This file.

### Related Files

*   `shared/external_apis/gcs.client.js`
*   `shared/config`
*   Middleware (`protect`, `requireActiveSubscription`)

### Dependencies

*   `@google-cloud/storage`, `uuid`, `papaparse`, `xlsx`, `mongoose`

### API Endpoints

*   **`GET /api/v1/datasets/upload-url`** (Params: `filename`, `fileSize`) -> `{ signedUrl, gcsPath }`
*   **`POST /api/v1/datasets`** (Body: `{ gcsPath, originalFilename, name?, fileSizeBytes? }`) -> `{ Dataset }`
*   **`GET /api/v1/datasets`** -> `{ Dataset[] }`
*   **`GET /api/v1/datasets/{id}/read-url`**
    *   **Description:** Generates a signed URL for reading the dataset content.
    *   **Auth:** Required (Login + Sub).
    *   **Success (200):** `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors:** `404` (Dataset not found/accessible), `500`.