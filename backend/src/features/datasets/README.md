# backend/src/features/datasets/README.md
# ** UPDATED FILE **

## Feature: Datasets

This feature slice handles the management of user-uploaded datasets, including upload initiation, metadata storage, and listing.

### Core Flow (Phase 3 MVP)

1.  **Upload Initiation (`GET /upload-url`):**
    *   Frontend requests a secure URL to upload a file directly to Google Cloud Storage (GCS).
    *   `dataset.controller.getUploadUrl` takes the `originalFilename` and the exact `fileSize` (in bytes) as query parameters. **The `fileSize` is mandatory.**
    *   `dataset.service.generateUploadUrl` creates a unique GCS path. It uses the `@google-cloud/storage` client to generate a **v4 signed URL** with 'write' permission, a short expiry, and **crucially, a `contentLengthRange` option set to the exact `fileSize` provided.** This ensures the signature is valid only for a file of that specific size.
    *   The signed URL and the final `gcsPath` are returned to the frontend.
2.  **File Upload (Frontend):**
    *   The frontend uses the received signed URL to perform a `PUT` request directly to GCS, uploading the file content. Axios automatically includes the `Content-Length` header, which now matches the range specified during signing.
3.  **Metadata Creation (`POST /`):**
    *   After a successful GCS upload, the frontend sends a request to this endpoint.
    *   Request body includes `gcsPath`, `originalFilename`, optional `name`, and `fileSizeBytes`.
    *   `dataset.controller.createDataset` calls `dataset.service.createDatasetMetadata`.
    *   **Header Parsing:** The service function `parseHeadersFromGCS` reads the first chunk of the file directly from GCS using its `gcsPath`. It attempts to parse headers for CSV/Excel files.
    *   The service creates a new `Dataset` document in MongoDB, storing metadata, owner ID, GCS path, and parsed `schemaInfo`.
    *   The newly created dataset document is returned.
4.  **Listing Datasets (`GET /`):**
    *   Frontend requests the list of datasets for the current user.
    *   `dataset.controller.listDatasets` calls `dataset.service.listDatasetsByUser`.
    *   The service finds all `Dataset` documents owned by the user.
    *   The list of datasets (excluding detailed `schemaInfo`) is returned, sorted by creation date.

### Files

*   **`dataset.model.js`**: Mongoose schema for the `datasets` collection.
*   **`dataset.service.js`**: Business logic for generating signed URLs (using `contentLengthRange`), parsing headers, creating metadata, and listing datasets.
*   **`dataset.controller.js`**: Express route handlers validating requests (including `fileSize` for upload URL) and calling service functions.
*   **`dataset.routes.js`**: Defines API routes (`/upload-url`, `/`, `POST /`) and applies `protect` and `requireActiveSubscription` middleware.
*   **`README.md`**: This file.

### Related Files

*   `shared/external_apis/gcs.client.js`: Initializes the GCS client.
*   `shared/config`: Provides `GCS_BUCKET_NAME`.
*   `shared/middleware/auth.middleware.js` & `subscription.guard.js`: Used to protect routes.

### Dependencies

*   `@google-cloud/storage`
*   `uuid`
*   `papaparse`
*   `xlsx`
*   `mongoose`

### API Endpoints (Phase 3)

*   **`GET /api/v1/datasets/upload-url`**
    *   **Description:** Generates a v4 signed URL for direct GCS file upload, requiring the exact file size for signature validity.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Query Params:**
        *   `filename` (string, required): The original name of the file.
        *   `fileSize` (number, required): The exact size of the file in bytes.
    *   **Success Response (200):** `{ status: 'success', data: { signedUrl: string, gcsPath: string } }`
    *   **Error Responses:** `400` (Missing or invalid `filename`/`fileSize`), `401`, `403`, `500`.
*   **`POST /api/v1/datasets`**
    *   **Description:** Creates dataset metadata in the database after file upload to GCS. Parses headers.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Request Body:** `{ "gcsPath": string, "originalFilename": string, "name"?: string, "fileSizeBytes"?: number }`
    *   **Success Response (201 Created):** `{ status: 'success', data: Dataset }`
    *   **Error Responses:** `400` (Missing required fields), `401`, `403`, `500`.
*   **`GET /api/v1/datasets`**
    *   **Description:** Lists all datasets owned by the authenticated user.
    *   **Auth:** Required (Login + Active Subscription).
    *   **Success Response (200):** `{ status: 'success', data: Dataset[] }`
    *   **Error Responses:** `401`, `403`, `500`.