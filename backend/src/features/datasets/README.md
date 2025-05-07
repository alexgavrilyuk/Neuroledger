# backend/src/features/datasets/README.md
# ** UPDATED FILE - Asynchronous Parsing Workflow **

## Feature: Datasets

This feature slice manages user-uploaded datasets, encompassing metadata storage (including schema and descriptions), ownership, team sharing, file handling via Google Cloud Storage (GCS), and access control. It supports two primary upload mechanisms: direct-to-GCS via signed URLs and backend-proxied upload.

### Core Functionality & Flows

1.  **Dataset Model (`dataset.model.js`)**:
    *   Defines the Mongoose schema for the `datasets` collection.
    *   Fields include: `name`, `description`, `gcsPath` (unique path in GCS), `originalFilename`, `fileSizeBytes`, `ownerId` (User ref), `teamId` (Team ref, optional), `schemaInfo` (array of {name, type}), `columnDescriptions` (Map), timestamps, and **NEW PARSING-RELATED FIELDS**:
        - `parsedDataStatus`: Tracks parsing state ('not_parsed', 'queued', 'processing', 'completed', 'error')
        - `parsedDataGridFSId`: References the GridFS document ID of parsed data
        - `parsedDataError`: Stores parsing error messages
        - **Existing** `qualityStatus`/`qualityReport` fields managed by the `dataQuality` feature.

2.  **Upload Methods**:
    *   **A) Direct Upload (Client -> GCS)**:
        *   `GET /upload-url`: Frontend requests a short-lived GCS v4 signed URL (`PUT` method) for a specific file size (`datasetService.generateUploadUrl`). Backend requires `fileSize` for `contentLengthRange`.
        *   Frontend uploads the file directly to the returned `signedUrl`.
        *   `POST /`: Frontend notifies the backend after successful GCS upload, providing `gcsPath`, `originalFilename`, optional `name`, `fileSizeBytes`, and optional `teamId`.
        *   **NEW**: Backend creates dataset metadata with `parsedDataStatus: 'not_parsed'` and **immediately enqueues a Cloud Task for asynchronous parsing**.

    *   **B) Proxied Upload (Client -> Backend -> GCS)**:
        *   `POST /proxy-upload`: Frontend sends the file (max 50MB via `multer`) in a FormData request, optionally including `teamId`.
        *   **Controller (`proxyUpload`)**:
            *   Receives file via `multer` memory storage.
            *   Generates unique `gcsPath` (`<userId>/<uuid>-<filename>`).
            *   Gets GCS bucket reference (`shared/external_apis/gcs.client.js`).
            *   Creates a GCS write stream (`blob.createWriteStream`).
            *   Pipes the file buffer (`req.file.buffer`) to the GCS stream.
            *   **NEW**: On stream 'finish', creates dataset metadata and **immediately enqueues a Cloud Task for asynchronous parsing**.
        *   **Service (`createDatasetMetadata`)**:
            *   **(Permission Check)** If `teamId` is provided, verifies the `userId` is an **admin** of that `teamId` using the `TeamMember` model. Throws 403 if not member or not admin.
            *   **NEW**: Parsing of headers is NOW DEFERRED to background task
            *   Creates and saves the new `Dataset` document with `ownerId`, `teamId` (if applicable), initial empty `schemaInfo`, `parsedDataStatus: 'not_parsed'`

3.  **Asynchronous Parsing Workflow**:
    *   **Cloud Tasks Parser**:
        *   Triggered immediately after dataset metadata creation
        *   Implemented in `dataset.parser.service.js`
        *   Performs three key steps:
            1. Download original file from GCS
            2. Parse file content (CSV/XLSX)
            3. Store parsed data in GridFS
    *   **Parsing Status Management**:
        *   Status transitions:
            - Initial: `'not_parsed'`
            - After task queued: `'queued'`
            - During parsing: `'processing'`
            - On success: `'completed'`
            - On failure: `'error'`
        *   Stores parsing results/errors for later retrieval

    *   **GridFS Integration**:
        *   Stores parsed JSON data separately from metadata
        *   Allows efficient, streamable storage of large datasets
        *   Metadata includes original dataset reference and GCS path

4.  **Listing Datasets (`GET /`)**:
    *   **Controller (`listDatasets`)**: Calls service.
    *   **Service (`listDatasetsByUser`)**:
        *   Finds all `TeamMember` records for the `userId` to get their `teamIds`.
        *   Finds all datasets where `ownerId` matches `userId` AND `teamId` is `null` (personal datasets).
        *   Finds all datasets where `teamId` is in the user's `teamIds`. Populates `teamId.name`.
        *   Merges results, adding `isTeamDataset` (boolean) and `teamName` (string|null) fields.
        *   Sorts combined list by `createdAt` descending.
        *   Returns the combined list.

5.  **Accessing Single Dataset (`GET /:id`)**:
    *   **Controller (`getDataset`)**: Validates ID format. Finds user's `teamIds`. Finds `Dataset` where `_id` matches AND (`ownerId` matches `userId` OR `teamId` is in user's `teamIds`). Returns 404 if not found/accessible. Returns full dataset object.

6.  **Accessing Schema (`GET /:id/schema`)**:
    *   **Controller (`getSchema`)**: Same permission logic as `GET /:id`. Returns `{ schemaInfo, columnDescriptions, description }`.

7.  **Updating Dataset (`PUT /:id`)**:
    *   **Controller (`updateDataset`)**: Same permission logic as `GET /:id`. Updates `description` and/or `columnDescriptions` provided in the request body. Saves the dataset. Returns the updated dataset object.

8.  **Deleting Dataset (`DELETE /:id`)**:
    *   **Controller (`deleteDataset`)**: Validates ID format. Calls service. Handles specific not found/permission errors from service.
    *   **Service (`deleteDatasetById`)**:
        *   Finds the `Dataset`.
        *   **(Permission Check)** Verifies `userId` is the `ownerId` OR (if `teamId` exists) the `userId` is an **admin** of the `teamId`. Throws 403/404 if permission denied.
        *   **NEW**: Deletes the corresponding parsed data from GridFS (if exists)
        *   Deletes the corresponding file from GCS (`bucket.file(gcsPath).delete()`). Continues even if GCS deletion fails (logs warning).
        *   Deletes the `Dataset` document from MongoDB.

9.  **Read URL Generation (`GET /:id/read-url`)**:
    *   **Controller (`getReadUrl`)**: Validates ID format. **Checks `ownerId` only** (potential inconsistency/bug if teams should also grant read access via this URL). Finds dataset. Calls service.
    *   **Service (`getSignedUrlForDataset`)**: Checks if GCS file exists first. Generates a short-lived (5 min) GCS v4 signed URL (`GET` method). Returns the URL.

### File Responsibilities

*   **`dataset.model.js`**: Defines the Mongoose schema for the `datasets` collection. Includes core metadata, ownership/team info, schema, and quality audit fields.
*   **`dataset.controller.js`**: Handles HTTP requests/responses for all dataset endpoints. Performs request validation (IDs, query params). Manages access control logic directly for GET/PUT requests by querying `Dataset` and `TeamMember`. Orchestrates calls to the service layer. Handles the GCS upload stream logic specifically for the `proxyUpload` endpoint. Formats responses and errors.
*   **`dataset.service.js`**: Contains business logic reused by controllers or involving external services (GCS).
    *   `generateUploadUrl`: Creates GCS signed PUT URLs.
    *   `getSignedUrlForDataset`: Creates GCS signed GET URLs (checks file existence).
    *   `parseHeadersFromGCS`: Reads initial bytes from GCS file and parses headers (CSV/Excel).
    *   `createDatasetMetadata`: **Validates team admin permissions** for team uploads, calls header parsing, saves new `Dataset` document.
    *   `listDatasetsByUser`: Implements logic to retrieve both personal and accessible team datasets, populating team names.
    *   `deleteDatasetById`: **Validates owner/team admin permissions**, deletes file from GCS, deletes `Dataset` document.
*   **`dataset.parser.service.js`** (NEW):
    *   Handles asynchronous file parsing from GCS
    *   Downloads original file
    *   Parses file content (CSV/XLSX)
    *   Streams parsed data to GridFS
    *   Updates dataset parsing status and schema
*   **`dataset.taskHandler.js`** (NEW):
    *   Manages Cloud Tasks worker requests
    *   Coordinates parsing task execution
    *   Handles task payload processing
    *   Ensures graceful task handling
*   **`dataset.routes.js`**: Defines Express routes, applies global `protect` and `requireActiveSubscription` middleware, applies `multer` middleware specifically for `/proxy-upload`. Maps routes to controller functions.
*   **`README.md`**: This file.

### Data Model Interaction

*   **Primary:** `Dataset` model (CRUD operations).
*   **Supporting:**
    *   `TeamMember` model (from `features/teams/team-member.model.js`): Read for permission checks (listing, access, creation, deletion).
    *   `Team` model (from `features/teams/team.model.js`): Read via Mongoose populate in `listDatasetsByUser` to get `teamName`.
    *   `User` model (implicitly via `req.user` from `protect` middleware).
*   **NEW:** MongoDB GridFS (for parsed dataset storage)
    *   `fs.files`: Metadata for stored files
    *   `fs.chunks`: Actual file content chunks

### External Service Interactions

*   **Google Cloud Storage (GCS)**:
    *   Generating Signed URLs (PUT/GET).
    *   Streaming uploads (in `proxyUpload` controller).
    *   Reading file headers (`parseHeadersFromGCS` service).
    *   Deleting files (`deleteDatasetById` service).
*   **NEW: MongoDB GridFS**:
    *   Storing parsed dataset JSON
    *   Supporting large dataset storage
    *   Streaming file retrieval/storage

### Dependencies

*   **Internal Features:**
    *   `teams` (for `Team`, `TeamMember` models)
*   **Shared Modules:**
    *   `shared/middleware/auth.middleware.js` (`protect`)
    *   `shared/middleware/subscription.guard.js` (`requireActiveSubscription`)
    *   `shared/external_apis/gcs.client.js`
    *   `shared/utils/logger.js`
*   **External Libraries:**
    *   `@google-cloud/storage`
    *   `uuid`
    *   `papaparse`
    *   `xlsx`
    *   `multer` (for proxy upload)
    *   `express`
    *   `mongoose`

### API Endpoints

*   **`GET /api/v1/datasets/upload-url`**
    *   **Auth**: Required (Login + Sub)
    *   **Query Params**: `filename` (string, required), `fileSize` (number, required)
    *   **Description**: Generates a signed URL for direct client-to-GCS PUT upload.
    *   **Success (200 OK)**: `{ status: 'success', data: { signedUrl: string, gcsPath: string } }`
    *   **Errors**: `400` (Missing/invalid params)

*   **`POST /api/v1/datasets/proxy-upload`**
    *   **Auth**: Required (Login + Sub)
    *   **Request**: `multipart/form-data` with `file` field (File, max 50MB) and optional `teamId` field (string, ObjectId).
    *   **Description**: Uploads file via backend proxy. Backend streams to GCS, enqueues async parsing task. **User must be admin of the team if `teamId` is provided.**
    *   **Success (201 Created)**: `{ status: 'success', data: Dataset }` (Full dataset object with `parsedDataStatus: 'not_parsed'`)
    *   **Errors**: `400` (No file), `403` (Not team member/admin if `teamId` provided), `500` (GCS upload error, metadata creation error)

*   **`POST /api/v1/datasets`**
    *   **Auth**: Required (Login + Sub)
    *   **Request Body**: `{ gcsPath: string, originalFilename: string, name?: string, fileSizeBytes?: number, teamId?: string }`
    *   **Description**: Creates dataset metadata AFTER successful direct client-to-GCS upload. Enqueues async parsing task. **User must be admin of the team if `teamId` is provided.**
    *   **Success (201 Created)**: `{ status: 'success', data: Dataset }` (With `parsedDataStatus: 'not_parsed'`)
    *   **Errors**: `400` (Missing required fields), `403` (Not team admin if `teamId` provided), `500` (DB error, GCS file not found during header parse)

*   **`GET /api/v1/datasets`**
    *   **Auth**: Required (Login + Sub)
    *   **Description**: Lists datasets accessible to the user (personal + teams user is member of). Includes `isTeamDataset` and `teamName`. Sorted by creation date descending.
    *   **Success (200 OK)**: `{ status: 'success', data: Dataset[] }`

*   **`GET /api/v1/datasets/{id}`**
    *   **Auth**: Required (Login + Sub)
    *   **Description**: Gets details for a single dataset. **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Request Params**: `id` (MongoDB ObjectId)
    *   **Success (200 OK)**: `{ status: 'success', data: Dataset }` (Includes new parsing status fields)
    *   **Errors**: `400` (Invalid ID), `404` (Not found or not accessible)

*   **`GET /api/v1/datasets/{id}/schema`**
    *   **Auth**: Required (Login + Sub)
    *   **Description**: Gets schema info (`schemaInfo`, `columnDescriptions`, `description`). **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Request Params**: `id` (MongoDB ObjectId)
    *   **Success (200 OK)**: `{ status: 'success', data: { schemaInfo: Array, columnDescriptions: Map, description: string } }`
    *   **Errors**: `400` (Invalid ID), `404` (Not found or not accessible)

*   **`GET /api/v1/datasets/{id}/read-url`**
    *   **Auth**: Required (Login + Sub)
    *   **Description**: Generates a short-lived signed URL for reading dataset content from GCS. **Currently only checks for dataset owner, not team membership.**
    *   **Request Params**: `id` (MongoDB ObjectId)
    *   **Success (200 OK)**: `{ status: 'success', data: { signedUrl: string } }`
    *   **Errors**: `400` (Invalid ID), `404` (Dataset not found or not accessible by owner; GCS file missing), `500` (URL generation failed)

*   **`PUT /api/v1/datasets/{id}`**
    *   **Auth**: Required (Login + Sub)
    *   **Description**: Updates dataset `description` and/or `columnDescriptions`. **Accessible if user is owner OR member of the team the dataset belongs to.**
    *   **Request Params**: `id` (MongoDB ObjectId)
    *   **Request Body**: `{ description?: