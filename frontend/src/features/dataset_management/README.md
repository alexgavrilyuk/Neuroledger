# frontend/src/features/dataset_management/README.md
# ** UPDATED FILE - Mention usage in Dashboard **

## Feature: Frontend Dataset Management

This feature slice provides the UI components, pages, and hooks for managing datasets within NeuroLedger. This includes uploading new datasets, listing accessible datasets, viewing dataset details, editing dataset context and column descriptions, and interacting with the data quality audit feature.

### Core Components & Pages

*   **`pages/DatasetDetailPage.jsx`**:
    *   **Purpose:** Displays detailed information about a single dataset, allows editing of context, and manages the Data Quality Audit lifecycle for that dataset. Accessed via `/account/datasets/:datasetId`.
    *   **Functionality:**
        *   Fetches dataset details (`GET /datasets/:id`) on load.
        *   Displays dataset overview (name, filename, dates, size, type).
        *   Integrates the `ColumnDescriptionsEditor` component for viewing/editing dataset description and column descriptions.
        *   Integrates Data Quality Audit components:
            *   Fetches audit status/report (`GET .../quality-audit/status`, `GET .../quality-audit`) and polls during processing.
            *   Renders `DataQualityProgressIndicator` (from `features/dataQuality`) when `auditStatus` is 'processing'.
            *   Renders `DataQualityReportDisplay` (from `features/dataQuality`) when audit is complete, passing the report data and a `handleResetAudit` callback.
            *   Provides a button to initiate the audit (`POST .../quality-audit`), checking for required context first and showing a modal if context is missing.
            *   `handleResetAudit` calls `DELETE .../quality-audit` to reset the audit status.
        *   Handles loading and error states for dataset fetching and audit interactions.

*   **`components/DatasetUpload.jsx`**:
    *   **Purpose:** Provides the UI (file input/drag-and-drop using `react-dropzone`) for uploading new dataset files. Typically used within `AccountDatasetsPage`.
    *   **Functionality:**
        *   Uses the `useDatasetUpload` hook to handle the upload process (proxy method).
        *   Allows selecting a team to associate the dataset with (passes `teamId` to hook).
        *   Displays upload progress and errors from the hook.
        *   Calls an `onUploadComplete` callback prop (passed from parent) on success.

*   **`components/DatasetList.jsx`**:
    *   **Purpose:** Displays a list of datasets accessible to the user. Typically used within `AccountDatasetsPage`.
    *   **Functionality:**
        *   Uses the `useDatasets` hook to fetch and display the dataset list (`datasets`, `isLoading`, `error`).
        *   Displays datasets in a table, showing name, team (if applicable), upload date, and quality status.
        *   Provides links to the `DatasetDetailPage` for each dataset.
        *   Includes buttons for refreshing the list (calls `refetch` from hook) and potentially deleting datasets (calls `deleteDataset` from hook).

*   **`components/ColumnDescriptionsEditor.jsx`**:
    *   **Purpose:** Provides UI for viewing and editing the main dataset description and individual column descriptions. Used within `DatasetDetailPage`.
    *   **Functionality:**
        *   Fetches initial schema and descriptions (`GET /datasets/:id/schema`).
        *   Allows inline editing for the main description and each column.
        *   Tracks unsaved changes.
        *   Provides a "Save All Changes" button that calls `PUT /datasets/:id` with updated `description` and `columnDescriptions`.
        *   Calls an `onSaveSuccess` callback prop with the updated dataset data on successful save.

### Hooks

*   **`hooks/useDatasetUpload.js`**:
    *   **Purpose:** Encapsulates the logic for uploading a dataset file using the **backend proxy method**.
    *   **Functionality:**
        *   Provides an `uploadFile(file, teamId?)` function.
        *   Creates `FormData` and calls `POST /api/v1/datasets/proxy-upload`.
        *   Tracks upload state (`isUploading`, `uploadProgress`, `uploadError`).
        *   Uses `axios` `onUploadProgress` for progress tracking.
        *   Calls an `onComplete` callback (passed during hook initialization) with the newly created dataset data on success.
        *   Provides a `resetUpload` function.

*   **`hooks/useDatasets.js`**:
    *   **Purpose:** Fetches and manages the list of datasets accessible to the user.
    *   **Functionality:**
        *   Calls `GET /api/v1/datasets` on mount and when the authenticated user changes.
        *   Provides state: `datasets` (array), `isLoading`, `error`.
        *   Provides a `refetch` function to manually trigger a list refresh.
        *   Provides a `deleteDataset(datasetId)` function that calls `DELETE /api/v1/datasets/:id` and removes the dataset from the local state on success.

### Related Features

*   **`account_management`**: The `AccountDatasetsPage.jsx` (within `account_management`) uses `DatasetUpload` and `DatasetList`. The `AccountLayout` provides navigation.
*   **`dataQuality`**: The `DatasetDetailPage` uses `DataQualityProgressIndicator` and `DataQualityReportDisplay` from this feature.
*   **`dashboard`**: The `PromptInput` component likely uses the `useDatasets` hook to fetch datasets for selection.

### State Management

*   Server state (dataset list, dataset details, schema, audit status/report) is primarily fetched and managed via API calls within the page (`DatasetDetailPage`) or hooks (`useDatasets`).
*   Local UI state is managed within components (e.g., editing state in `ColumnDescriptionsEditor`, file state in `DatasetUpload`).
*   Upload state is managed within the `useDatasetUpload` hook.

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