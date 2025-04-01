# backend/src/features/datasets/README.md
# ** UPDATED FILE - Mention exported helper **

## Feature: Datasets

This feature slice handles the management of user-uploaded datasets, including upload initiation, metadata storage, and listing.

### Core Flow (Phase 3 MVP)

1.  **Upload Initiation (`GET /upload-url`):** Frontend requests a v4 signed URL for PUT upload to GCS, providing `filename` and `fileSize`. Backend generates URL with `contentLengthRange`.
2.  **File Upload (Frontend):** Frontend performs `PUT` to GCS signed URL.
3.  **Metadata Creation (`POST /`):** Frontend notifies backend after GCS upload. Backend parses headers from GCS file using `parseHeadersFromGCS`, creates `Dataset` document in MongoDB.
4.  **Listing Datasets (`GET /`):** Frontend requests list. Backend finds datasets owned by user.

### Files

*   **`dataset.model.js`**: Mongoose schema for the `datasets` collection.
*   **`dataset.service.js`**: Business logic for generating signed URLs (upload and read), parsing headers, creating metadata, and listing datasets. **Exports `getSignedUrlForDataset` helper for potential use by the code execution service.**
*   **`dataset.controller.js`**: Express route handlers.
*   **`dataset.routes.js`**: Defines API routes and applies middleware.
*   **`README.md`**: This file.

### Related Files

*   `shared/external_apis/gcs.client.js`
*   `shared/config`
*   Middleware (`protect`, `requireActiveSubscription`)

### Dependencies

*   `@google-cloud/storage`, `uuid`, `papaparse`, `xlsx`, `mongoose`

### API Endpoints (Phase 3)

*   **`GET /api/v1/datasets/upload-url`** (Params: `filename`, `fileSize`) -> `{ signedUrl, gcsPath }`
*   **`POST /api/v1/datasets`** (Body: `{ gcsPath, originalFilename, name?, fileSizeBytes? }`) -> `{ Dataset }`
*   **`GET /api/v1/datasets`** -> `{ Dataset[] }`