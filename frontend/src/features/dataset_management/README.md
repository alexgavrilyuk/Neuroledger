# frontend/src/features/dataset_management/README.md
# ** UPDATED FILE **

## Feature: Frontend Dataset Management

This feature slice provides the UI and logic for managing datasets within the NeuroLedger application, starting with uploading and listing in Phase 3. It resides within the "Account" section.

### Core Flow (Phase 3 MVP)

1.  **Routing:** Routes under `/account/datasets` use the `AccountLayout`. Access requires auth + active subscription.
2.  **Page (`pages/AccountDatasetsPage.jsx`):**
    *   Renders `DatasetUpload` and `DatasetList`.
    *   Passes `refetch` from `useDatasets` to `DatasetUpload`.
3.  **Upload Component (`components/DatasetUpload.jsx`):**
    *   Provides file input / drag-and-drop area (`react-dropzone`).
    *   Uses the `useDatasetUpload` hook to handle the upload process.
    *   Displays upload progress and errors.
    *   Calls `onUploadComplete` callback prop on success.
4.  **List Component (`components/DatasetList.jsx`):**
    *   Uses `useDatasets` hook to fetch and display the dataset list.
    *   Shows loading/error states.
    *   Displays datasets in a table.
    *   Includes a "Refresh List" button.
5.  **Hooks (`hooks/`):**
    *   **`useDatasetUpload.js`:**
        *   Provides `uploadFile` function.
        *   Handles the multi-step upload:
            1.  Calls backend `GET /api/v1/datasets/upload-url`, **passing both `filename` and `fileSize` as query parameters.**
            2.  Performs `PUT` request to the GCS signed URL using `axios`, tracking progress. (`Content-Length` is added automatically by Axios and now matches the signed URL constraints).
            3.  Calls backend `POST /api/v1/datasets` to create metadata after successful GCS upload.
        *   Manages `isUploading`, `uploadProgress`, `uploadError` states.
        *   Accepts `onUploadSuccess` callback.
    *   **`useDatasets.js`:**
        *   Fetches dataset list from `GET /api/v1/datasets`.
        *   Manages `datasets`, `isLoading`, `error` states.
        *   Provides `refetch` function.

### Files

*   **`components/`**: `DatasetUpload.jsx`, `DatasetList.jsx`
*   **`hooks/`**: `useDatasetUpload.js`, `useDatasets.js`
*   **`pages/`** (`features/account_management/pages/`): `AccountDatasetsPage.jsx`
*   **`README.md`**: This file.

### Dependencies

*   `react-dropzone`
*   `axios`
*   `shared/ui/*`
*   `@heroicons/react`
*   `shared/hooks/useAuth`
*   `shared/services/apiClient`
*   `features/account_management/layouts/AccountLayout`

### State Management

*   Local state in `DatasetUpload` for `file`.
*   State managed by `useDatasetUpload` hook.
*   State managed by `useDatasets` hook.